import { ipcMain, app, dialog } from 'electron'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'

function getUserDataPath() {
  return app.getPath('userData')
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

// ─── Session Log ────────────────────────────────────────────────────────────

function getSessionsPath() {
  return join(getUserDataPath(), 'atenttion-sessions.md')
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

// Markdown log header + a formatted row for one session — shared by the async and sync writers.
const SESSIONS_MD_HEADER = `# Atenttion — Session Log\n\n| Date | Time | Duration | Blinks | BPM | Away | Phone |\n|------|------|----------|--------|-----|------|-------|\n`

function sessionMdRow(session) {
  const date = new Date(session.date)
  const dateStr = date.toLocaleDateString('en-CA')
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const duration = formatDuration(session.duration)
  const away = session.awaySeconds > 0 ? formatDuration(session.awaySeconds) : '—'
  const bpm = session.blinkRate || 0
  const blinks = session.blinkCount || 0
  const phone = session.phonePickups > 0 ? `${session.phonePickups}×` : '—'
  return `| ${dateStr} | ${timeStr} | ${duration} | ${blinks} | ${bpm} | ${away} | ${phone} |\n`
}

async function appendSession(session) {
  const filePath = getSessionsPath()
  await ensureDir(getUserDataPath())
  let current = ''
  try { current = await readFile(filePath, 'utf-8') } catch {}
  await writeFile(filePath, (current || SESSIONS_MD_HEADER) + sessionMdRow(session), 'utf-8')
}

// Synchronous twin of appendSession + appendSessionJson, for the `beforeunload` save-on-close path.
function appendSessionSync(session) {
  const dir = getUserDataPath()
  mkdirSync(dir, { recursive: true })

  const mdPath = getSessionsPath()
  let currentMd = ''
  try { currentMd = readFileSync(mdPath, 'utf-8') } catch {}
  writeFileSync(mdPath, (currentMd || SESSIONS_MD_HEADER) + sessionMdRow(session), 'utf-8')

  const jsonPath = getSessionsJsonPath()
  let sessions = []
  try {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    if (Array.isArray(raw)) sessions = raw
  } catch {}
  sessions.push(session)
  if (sessions.length > 1000) sessions = sessions.slice(-1000)
  writeFileSync(jsonPath, JSON.stringify(sessions), 'utf-8')
}

// ─── Preferences ────────────────────────────────────────────────────────────

function getPrefsPath() {
  return join(getUserDataPath(), 'atenttion-preferences.json')
}

function getLegacyPrefsPath() {
  return join(getUserDataPath(), 'atenttion-preferences.md')
}

async function writePreferences(prefs) {
  await ensureDir(getUserDataPath())
  // Merge over whatever is already on disk so a caller that omits a field (e.g. a save
  // that doesn't know about baselineBpm) never silently resets it to default on next load.
  let existing = {}
  try { existing = JSON.parse(await readFile(getPrefsPath(), 'utf-8')) } catch {}
  const merged = { ...existing, ...prefs }
  await writeFile(getPrefsPath(), JSON.stringify(merged, null, 2), 'utf-8')
}

function parseLegacyYaml(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const result = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    const val = rest.join(':').trim()
    if (!key || val === '') continue
    const k = key.trim()
    if (val === 'true')       result[k] = true
    else if (val === 'false') result[k] = false
    else {
      const num = Number(val)
      result[k] = isNaN(num) ? val : num
    }
  }
  return result
}

async function readPreferences() {
  // Try new JSON format first
  try {
    return JSON.parse(await readFile(getPrefsPath(), 'utf-8'))
  } catch {}

  // One-time migration from old YAML frontmatter .md file
  try {
    const raw = await readFile(getLegacyPrefsPath(), 'utf-8')
    const prefs = parseLegacyYaml(raw)
    if (!prefs) return null
    await writePreferences(prefs)
    try { await unlink(getLegacyPrefsPath()) } catch {}
    return prefs
  } catch {
    return null
  }
}

// ─── Session JSON (machine-readable, full fidelity) ─────────────────────

function getSessionsJsonPath() {
  return join(getUserDataPath(), 'atenttion-sessions.json')
}

function isValidSession(s) {
  return s !== null && typeof s === 'object' && 'date' in s && 'duration' in s && 'blinkCount' in s
}

function validateSessions(raw) {
  if (!Array.isArray(raw)) {
    console.warn('[persistence] sessions file is not an array — resetting')
    return []
  }
  const valid = raw.filter((s) => {
    if (isValidSession(s)) return true
    console.warn('[persistence] skipping malformed session:', JSON.stringify(s).slice(0, 80))
    return false
  })
  if (valid.length < raw.length) {
    console.warn(`[persistence] loaded ${valid.length}/${raw.length} sessions (${raw.length - valid.length} skipped)`)
  }
  return valid
}

async function parseSessionsFile(filePath) {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf-8'))
    return validateSessions(raw)
  } catch {
    return []
  }
}

async function appendSessionJson(session) {
  const filePath = getSessionsJsonPath()
  await ensureDir(getUserDataPath())
  let sessions = await parseSessionsFile(filePath)
  sessions.push(session)
  if (sessions.length > 1000) sessions = sessions.slice(-1000)
  await writeFile(filePath, JSON.stringify(sessions), 'utf-8')
}

async function loadSessionsFromJson() {
  return parseSessionsFile(getSessionsJsonPath())
}

// ─── App usage JSON ───────────────────────────────────────────────────────

function getAppUsagePath() {
  return join(getUserDataPath(), 'atenttion-app-usage.json')
}

async function saveAppUsage(data) {
  await ensureDir(getUserDataPath())
  const today = new Date().toLocaleDateString('en-CA')
  await writeFile(
    getAppUsagePath(),
    JSON.stringify({ date: today, focus: data.focus || {}, break: data.break || {} }),
    'utf-8'
  )
}

async function loadAppUsage() {
  try {
    const data = JSON.parse(await readFile(getAppUsagePath(), 'utf-8'))
    const today = new Date().toLocaleDateString('en-CA')
    if (data.date !== today) return null
    return data
  } catch {
    return null
  }
}

// ─── Session stats summary ────────────────────────────────────────────────

async function getSessionCount() {
  try {
    const content = await readFile(getSessionsPath(), 'utf-8')
    return content.split('\n').filter((l) => l.startsWith('|') && !l.includes('Date') && !l.includes('---')).length
  } catch {
    return 0
  }
}

// ─── IPC Setup ──────────────────────────────────────────────────────────────

export function setupPersistenceIPC() {
  ipcMain.handle('data:saveSession', async (_, session) => {
    try {
      await appendSession(session)
      await appendSessionJson(session)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Synchronous save — used by the renderer's `beforeunload` to flush a running Free Rider
  // session before the window closes (async IPC would not complete in time).
  ipcMain.on('data:saveSessionSync', (e, session) => {
    try {
      appendSessionSync(session)
      e.returnValue = { success: true }
    } catch (err) {
      e.returnValue = { success: false, error: err.message }
    }
  })

  ipcMain.handle('data:loadSessions', async () => {
    try {
      return { success: true, sessions: await loadSessionsFromJson() }
    } catch (e) {
      return { success: false, sessions: [] }
    }
  })

  ipcMain.handle('data:saveAppUsage', async (_, data) => {
    try {
      await saveAppUsage(data)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('data:loadAppUsage', async () => {
    try {
      return { success: true, usage: await loadAppUsage() }
    } catch (e) {
      return { success: false, usage: null }
    }
  })

  ipcMain.handle('data:savePreferences', async (_, prefs) => {
    try {
      await writePreferences(prefs)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('data:loadPreferences', async () => {
    try {
      const prefs = await readPreferences()
      return { success: true, prefs }
    } catch (e) {
      return { success: false, prefs: null }
    }
  })

  ipcMain.handle('data:getSessionsPath', async () => getSessionsPath())
  ipcMain.handle('data:getPrefsPath', async () => getPrefsPath())
  ipcMain.handle('data:getSessionCount', async () => getSessionCount())

  ipcMain.handle('data:exportCsv', async (_, sessions) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Export Sessions',
        defaultPath: join(app.getPath('documents'), 'atenttion-sessions.xlsx'),
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      const MOOD   = { 1: 'Tired', 2: 'Bored', 3: 'Neutral', 4: 'Motivated', 5: 'Energized' }
      const OUTCOME = { 1: 'Scattered', 2: 'Focused', 3: 'Flow' }
      const RHYTHM = (cv) => cv == null ? '—' : cv < 0.40 ? 'Regular' : cv < 0.70 ? 'Variable' : 'Irregular'

      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Atenttion'
      workbook.created = new Date()

      const sheet = workbook.addWorksheet('Sessions', {
        views: [{ state: 'frozen', ySplit: 1 }]
      })

      sheet.columns = [
        { key: 'date',        width: 22 },
        { key: 'duration',    width: 12 },
        { key: 'focusScore',  width: 13 },
        { key: 'bpm',         width: 8  },
        { key: 'rhythm',      width: 14 },
        { key: 'blinks',      width: 10 },
        { key: 'away',        width: 10 },
        { key: 'phone',       width: 14 },
        { key: 'mood',        width: 14 },
        { key: 'outcome',     width: 12 },
        { key: 'goal',        width: 40 },
      ]

      // Header row
      const headers = ['Date', 'Duration', 'Focus Score', 'BPM', 'Rhythm',
        'Blinks', 'Away', 'Phone Pickups', 'Mood Before', 'Outcome', 'Goal']
      const headerRow = sheet.addRow(headers)
      headerRow.height = 26
      headerRow.eachCell((cell) => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1333' } }
        cell.font   = { bold: true, color: { argb: 'FFA78BFA' }, size: 11 }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF4C1D95' } } }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })

      // Data rows
      sessions.forEach((s, i) => {
        const durationMin = s.duration != null ? Math.round(s.duration / 60) : null
        const awayMin     = s.awaySeconds > 0 ? `${Math.round(s.awaySeconds)}s` : '—'
        const row = sheet.addRow({
          date:       s.date ? new Date(s.date).toLocaleString() : '—',
          duration:   durationMin != null ? `${durationMin}m` : '—',
          focusScore: s.focusScore ?? '—',
          bpm:        s.blinkRate  ?? '—',
          rhythm:     RHYTHM(s.blinkVariability),
          blinks:     s.blinkCount ?? '—',
          away:       awayMin,
          phone:      s.phonePickups ?? 0,
          mood:       MOOD[s.moodBefore]    ?? '—',
          outcome:    OUTCOME[s.outcomeRating] ?? '—',
          goal:       s.goal || '—',
        })
        row.height = 20

        const rowBg = i % 2 === 0 ? 'FF12111A' : 'FF0E0D16'
        row.eachCell((cell) => {
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
          cell.font      = { color: { argb: 'FFD4D4D8' }, size: 10 }
          cell.alignment = { vertical: 'middle' }
        })

        // Focus score — color by performance
        if (s.focusScore != null) {
          const scoreColor = s.focusScore >= 80 ? 'FF34D399' : s.focusScore >= 50 ? 'FFFBBF24' : 'FFF87171'
          const cell = row.getCell('focusScore')
          cell.font = { color: { argb: scoreColor }, bold: true, size: 10 }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        }

        // Outcome — color by state
        if (s.outcomeRating != null) {
          const outcomeColor = s.outcomeRating === 3 ? 'FFA78BFA' : s.outcomeRating === 2 ? 'FFFBBF24' : 'FFF87171'
          const cell = row.getCell('outcome')
          cell.font = { color: { argb: outcomeColor }, bold: true, size: 10 }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        }

        // Mood — subtle violet tint
        if (s.moodBefore != null) {
          const cell = row.getCell('mood')
          cell.font = { color: { argb: 'FFC4B5FD' }, size: 10 }
        }

        // Goal — italic
        if (s.goal) {
          const cell = row.getCell('goal')
          cell.font = { color: { argb: 'FF8B8B9E' }, italic: true, size: 10 }
        }
      })

      await workbook.xlsx.writeFile(filePath)
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}
