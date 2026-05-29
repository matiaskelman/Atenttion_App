import { ipcMain, app } from 'electron'
import { execSync, spawn } from 'child_process'
import { deflateSync } from 'zlib'
import os from 'os'
import fs from 'fs'
import path from 'path'

let cpuLastMeasure = null

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

function getCPUUsage() {
  const cpus = os.cpus()
  let idle = 0, total = 0
  cpus.forEach((cpu) => {
    for (const type in cpu.times) total += cpu.times[type]
    idle += cpu.times.idle
  })
  if (!cpuLastMeasure) {
    cpuLastMeasure = { idle, total }
    return 0
  }
  const idleDiff = idle - cpuLastMeasure.idle
  const totalDiff = total - cpuLastMeasure.total
  cpuLastMeasure = { idle, total }
  return Math.round((1 - idleDiff / totalDiff) * 100)
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

export function setupSystemIPC() {
  startWindowsAppMonitor()
  app.on('before-quit', stopWindowsAppMonitor)

  ipcMain.handle('system:getInfo', async () => {
    const cpus = os.cpus()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    return {
      platform: process.platform,
      hostname: os.hostname(),
      cpuModel: cpus[0]?.model?.split('@')[0]?.trim() || 'Unknown',
      cpuCount: cpus.length,
      totalMemGB: (totalMem / 1024 / 1024 / 1024).toFixed(1),
      freeMemGB: (freeMem / 1024 / 1024 / 1024).toFixed(1),
      usedMemPercent: Math.round((1 - freeMem / totalMem) * 100),
      cpuPercent: getCPUUsage(),
      uptime: Math.floor(os.uptime() / 3600)
    }
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
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}
