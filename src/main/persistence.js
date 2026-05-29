import { ipcMain, app, dialog } from 'electron'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'

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

async function appendSession(session) {
  const filePath = getSessionsPath()
  await ensureDir(getUserDataPath())

  const header = `# Atenttion — Session Log\n\n| Date | Time | Duration | Blinks | BPM | Away |\n|------|------|----------|--------|-----|------|\n`

  const date = new Date(session.date)
  const dateStr = date.toLocaleDateString('en-CA')
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const duration = formatDuration(session.duration)
  const away = session.awaySeconds > 0 ? formatDuration(session.awaySeconds) : '—'
  const bpm = session.blinkRate || 0
  const blinks = session.blinkCount || 0

  const row = `| ${dateStr} | ${timeStr} | ${duration} | ${blinks} | ${bpm} | ${away} |\n`

  let current = ''
  try { current = await readFile(filePath, 'utf-8') } catch {}
  await writeFile(filePath, current ? current + row : header + row, 'utf-8')
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
  await writeFile(getPrefsPath(), JSON.stringify(prefs, null, 2), 'utf-8')
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
        defaultPath: join(app.getPath('documents'), 'atenttion-sessions.csv'),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      const SEP = ';'
      const csvEscape = (v) => {
        if (v == null || v === '') return ''
        const s = String(v)
        return s.includes(SEP) || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s
      }
      const header = ['date', 'duration_minutes', 'focus_score', 'blink_count', 'blink_rate',
        'blink_variability', 'away_seconds', 'ritual', 'goal', 'mood_before', 'outcome_rating'].join(SEP)
      const rows = sessions.map((s) => [
        s.date ? new Date(s.date).toISOString() : '',
        s.duration != null ? (s.duration / 60).toFixed(2) : '',
        s.focusScore != null ? s.focusScore : '',
        s.blinkCount != null ? s.blinkCount : '',
        s.blinkRate != null ? s.blinkRate : '',
        s.blinkVariability != null ? s.blinkVariability : '',
        s.awaySeconds != null ? s.awaySeconds : '',
        s.ritual ? 'true' : 'false',
        csvEscape(s.goal),
        s.moodBefore != null ? s.moodBefore : '',
        s.outcomeRating != null ? s.outcomeRating : ''
      ].join(SEP))

      await writeFile(filePath, [header, ...rows].join('\n'), 'utf8')
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}
