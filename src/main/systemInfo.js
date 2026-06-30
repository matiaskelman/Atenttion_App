import { ipcMain, app } from 'electron'
import { execSync, spawn } from 'child_process'
import { deflateSync } from 'zlib'
import fs from 'fs'
import path from 'path'

// Windows: persistent PowerShell loop that reports the foreground app every 2s.
// This compiles Add-Type once instead of recompiling on every poll.
let currentActiveApp = 'Unknown'
let monitorProc = null
let appIsQuitting = false
const appExePaths = new Map() // processName → exe path, populated by monitor

function startWindowsAppMonitor() {
  if (process.platform !== 'win32' || monitorProc) return

  // Outputs "processName|exePath" every 2s — exe path captured once per process name
  const script = [
    "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;",
    "public class FGWHelper{",
    "[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();",
    "[DllImport(\"user32.dll\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}';",
    "while($true){",
    "$h=[FGWHelper]::GetForegroundWindow();$p=0;",
    "[FGWHelper]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null;",
    "$proc=Get-Process -Id $p -EA SilentlyContinue;",
    "if($proc){$exe='';try{$exe=$proc.MainModule.FileName}catch{};",
    "Write-Host \"$($proc.ProcessName)|$exe\"",
    "}else{Write-Host 'Unknown|'};",
    "[System.Threading.Thread]::Sleep(2000)}"
  ].join('')

  monitorProc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore']
  })

  let buf = ''
  monitorProc.stdout.on('data', (data) => {
    buf += data.toString()
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const pipeIdx = trimmed.indexOf('|')
      const name = pipeIdx >= 0 ? trimmed.slice(0, pipeIdx) : trimmed
      const exePath = pipeIdx >= 0 ? trimmed.slice(pipeIdx + 1) : ''
      if (name) currentActiveApp = name
      if (name && name !== 'Unknown' && exePath && !appExePaths.has(name)) {
        appExePaths.set(name, exePath)
      }
    }
  })

  monitorProc.on('close', () => {
    monitorProc = null
    if (!appIsQuitting) setTimeout(startWindowsAppMonitor, 3000)
  })
}

function stopWindowsAppMonitor() {
  appIsQuitting = true
  if (monitorProc) {
    monitorProc.kill()
    monitorProc = null
  }
}

// System-wide input idle time (ms since last keyboard/mouse event), cross-platform.
// A persistent child process emits idle ms every ~400ms; the handler extrapolates between samples.
// Used to veto phone-detection false positives while the user is actively typing/mousing.
let lastIdleMs = Infinity
let lastIdleAt = Date.now()
let idleProc = null

function startIdleMonitor() {
  if (idleProc) return
  let cmd, args
  if (process.platform === 'win32') {
    // GetLastInputInfo P/Invoke loop — Idle() = (uint)TickCount - dwTime, printed every 400ms
    const script = [
      "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;",
      "public class IdleHelper{",
      "[StructLayout(LayoutKind.Sequential)]public struct LASTINPUTINFO{public uint cbSize;public uint dwTime;}",
      "[DllImport(\"user32.dll\")]public static extern bool GetLastInputInfo(ref LASTINPUTINFO p);",
      "public static uint Idle(){LASTINPUTINFO l=new LASTINPUTINFO();l.cbSize=8;GetLastInputInfo(ref l);return (uint)Environment.TickCount - l.dwTime;}}';",
      "while($true){[IdleHelper]::Idle();[System.Threading.Thread]::Sleep(400)}"
    ].join('')
    cmd = 'powershell'
    args = ['-NoProfile', '-NonInteractive', '-Command', script]
  } else if (process.platform === 'darwin') {
    // HIDIdleTime (nanoseconds) from IOHIDSystem — system-wide HID idle, no special permission needed
    const script = "while true; do ioreg -c IOHIDSystem | awk '/HIDIdleTime/{print int($NF/1000000); exit}'; sleep 0.4; done"
    cmd = 'sh'
    args = ['-c', script]
  } else {
    return
  }

  idleProc = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })

  let buf = ''
  idleProc.stdout.on('data', (data) => {
    buf += data.toString()
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const n = parseInt(line.trim(), 10)
      if (!isNaN(n)) { lastIdleMs = n; lastIdleAt = Date.now() }
    }
  })

  idleProc.on('close', () => {
    idleProc = null
    if (!appIsQuitting) setTimeout(startIdleMonitor, 3000)
  })
}

function stopIdleMonitor() {
  appIsQuitting = true
  if (idleProc) {
    idleProc.kill()
    idleProc = null
  }
}

function getActiveWindowName() {
  try {
    if (process.platform === 'win32') {
      // Return the value kept up-to-date by the background monitor process
      return currentActiveApp
    } else if (process.platform === 'darwin') {
      const result = execSync(
        'osascript -e "tell application \\"System Events\\" to get name of first process whose frontmost is true"',
        { timeout: 3000 }
      )
        .toString()
        .trim()
      return result || 'Unknown'
    }
  } catch {
    return 'Unknown'
  }
  return 'Unknown'
}

function getCurrentWallpaper() {
  try {
    if (process.platform === 'win32') {
      const result = execSync(
        "powershell -NoProfile -NonInteractive -Command \"(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name Wallpaper).Wallpaper\"",
        { timeout: 3000, windowsHide: true }
      )
        .toString()
        .trim()
      return result
    } else if (process.platform === 'darwin') {
      const result = execSync(
        'osascript -e "tell app \\"Finder\\" to get posix path of (desktop picture as alias)"',
        { timeout: 3000 }
      )
        .toString()
        .trim()
      return result
    }
  } catch {
    return null
  }
  return null
}

function makeBlackPng() {
  const width = 1920, height = 1080
  const rawRow = Buffer.alloc(1 + width * 3, 0) // filter byte + 3 bytes per RGB pixel
  const rows = []
  for (let i = 0; i < height; i++) rows.push(rawRow)
  const raw = Buffer.concat(rows)
  const compressed = deflateSync(raw)

  const crcTable = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c >>> 0
    }
    return t
  })()
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return ((c ^ 0xffffffff) >>> 0)
  }
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
  const chunk = (type, data) => {
    const t = Buffer.from(type)
    return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))])
  }

  const ihdr = Buffer.concat([u32(width), u32(height), Buffer.from([8, 2, 0, 0, 0])]) // color type 2 = RGB truecolor
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ─── Focus wallpaper crash-safety ──────────────────────────────────────────
// The focus feature swaps the desktop to a generated black PNG during work and
// restores the user's original afterwards. A force-kill mid-session used to leave
// the desktop black permanently — and on next launch the app would read the black
// PNG back from the registry and save *that* as the new "original", destroying the
// real wallpaper. To prevent that we (1) persist the captured original to disk,
// (2) never capture the black PNG itself as the original, and (3) restore the
// original on next startup or before quit if the black PNG is still active.

let focusWallpaperActive = false

function focusWallpaperPath() {
  return path.join(app.getPath('userData'), 'focus-wallpaper.png')
}

function originalWallpaperStorePath() {
  return path.join(app.getPath('userData'), 'original-wallpaper.json')
}

function isFocusWallpaper(p) {
  if (!p) return false
  const norm = (s) => path.normalize(s).replace(/[\\/]+$/, '').toLowerCase()
  return norm(p) === norm(focusWallpaperPath())
}

function readSavedOriginalWallpaper() {
  try {
    return JSON.parse(fs.readFileSync(originalWallpaperStorePath(), 'utf-8')).path || null
  } catch {
    return null
  }
}

function writeSavedOriginalWallpaper(p) {
  try {
    fs.writeFileSync(originalWallpaperStorePath(), JSON.stringify({ path: p }), 'utf-8')
  } catch {}
}

function applyWallpaper(imagePath) {
  if (process.platform === 'win32') {
    const safePath = imagePath.replace(/\\/g, '\\\\').replace(/'/g, "''")
    execSync(
      `powershell -NoProfile -NonInteractive -Command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\",CharSet=CharSet.Auto)]public static extern int SystemParametersInfo(int a,int b,string c,int d);}';[W]::SystemParametersInfo(20,0,'${safePath}',3)"`,
      { timeout: 5000, windowsHide: true }
    )
  } else if (process.platform === 'darwin') {
    const safePath = imagePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    execSync(
      `osascript -e "tell application \\"Finder\\" to set desktop picture to POSIX file \\"${safePath}\\""`,
      { timeout: 5000 }
    )
  }
}

// If the desktop is still our black focus PNG (e.g. the app was force-killed
// mid-session) restore the persisted original. Safe to call repeatedly.
function restoreOriginalIfFocusActive() {
  try {
    if (!isFocusWallpaper(getCurrentWallpaper())) return
    const original = readSavedOriginalWallpaper()
    if (original && !isFocusWallpaper(original)) {
      applyWallpaper(original)
      focusWallpaperActive = false
    }
  } catch {}
}

export function setupSystemIPC() {
  startWindowsAppMonitor()
  startIdleMonitor()
  app.on('before-quit', stopWindowsAppMonitor)
  app.on('before-quit', stopIdleMonitor)

  // Recover from a prior crash that left the desktop on the black focus PNG.
  // Deferred so the synchronous wallpaper query never delays first paint.
  setTimeout(restoreOriginalIfFocusActive, 1500)

  // Backstop for a graceful quit if the renderer's unmount restore didn't run.
  // Cheap: only does work when the focus wallpaper is still active this session.
  app.on('before-quit', () => {
    if (!focusWallpaperActive) return
    const original = readSavedOriginalWallpaper()
    if (original && !isFocusWallpaper(original)) {
      try { applyWallpaper(original); focusWallpaperActive = false } catch {}
    }
  })

  // ms since last system-wide keyboard/mouse input (extrapolated between samples).
  // Returns a large finite value when the source is unavailable → callers treat it as "idle" (no veto).
  ipcMain.handle('system:getIdleMs', async () => {
    const v = lastIdleMs + (Date.now() - lastIdleAt)
    return Number.isFinite(v) ? v : 1e9
  })

  ipcMain.handle('system:getActiveApp', async () => getActiveWindowName())

  ipcMain.handle('system:getAppIcon', async (_, processName) => {
    const exePath = appExePaths.get(processName)
    if (!exePath) return null
    try {
      const icon = await app.getFileIcon(exePath, { size: 'normal' })
      return icon.toDataURL()
    } catch {
      return null
    }
  })

  ipcMain.handle('system:getCurrentWallpaper', async () => getCurrentWallpaper())

  // Safely capture the user's real wallpaper as the "original" to restore later.
  // Never returns the focus PNG (which would clobber the real original after a
  // crash); persists the captured path to disk so it survives restarts.
  ipcMain.handle('system:captureOriginalWallpaper', async () => {
    const current = getCurrentWallpaper()
    if (current && !isFocusWallpaper(current)) {
      writeSavedOriginalWallpaper(current)
      return current
    }
    return readSavedOriginalWallpaper()
  })

  ipcMain.handle('system:createFocusWallpaper', async () => {
    try {
      const filePath = path.join(app.getPath('userData'), 'focus-wallpaper.png')
      await fs.promises.writeFile(filePath, makeBlackPng())
      return { success: true, path: filePath }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system:setWallpaper', async (_, imagePath) => {
    try {
      applyWallpaper(imagePath)
      // Track whether the black focus PNG is the live desktop so the before-quit
      // backstop knows whether it needs to restore the original.
      focusWallpaperActive = isFocusWallpaper(imagePath)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}
