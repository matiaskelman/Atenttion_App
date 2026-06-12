// Copyright (c) 2026 Matias Kelman. All rights reserved.
import { app, BrowserWindow, ipcMain, shell, protocol, session, screen } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { setupSystemIPC } from './systemInfo'
import { setupDocumentsIPC } from './documents'
import { setupPersistenceIPC } from './persistence'

// Must register before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'models', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'sounds', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } },
])

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1140,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') mainWindow.webContents.toggleDevTools()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  ipcMain.on('window:minimize', () => mainWindow.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow.close())
  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized())

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))

  const isDev = process.env.NODE_ENV === 'development'
  const rendererURL = process.env['ELECTRON_RENDERER_URL']

  if (isDev && rendererURL) {
    mainWindow.loadURL(rendererURL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Minimized overlay — small circle shown when main window is minimized
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const overlayWindow = new BrowserWindow({
    width: 100,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  overlayWindow.setPosition(sw - 110, sh - 110)
  overlayWindow.setAlwaysOnTop(true, 'floating')

  if (isDev && rendererURL) {
    overlayWindow.loadURL(rendererURL.replace(/\/$/, '') + '/overlay.html')
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  // showInactive keeps the overlay visible without stealing focus from the user's current window.
  // If we used show() here, GetForegroundWindow() would return the overlay's own process
  // and the app tracker would always record "electron" instead of Chrome/Spotify/etc.
  mainWindow.on('blur',  () => overlayWindow.showInactive())
  mainWindow.on('focus', () => overlayWindow.hide())
  mainWindow.on('close', () => { if (!overlayWindow.isDestroyed()) overlayWindow.close() })

  ipcMain.on('overlay:update', (_, data) => {
    if (!overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      overlayWindow.webContents.send('overlay:state', data)
    }
  })

  ipcMain.on('overlay:show-feedback', (_, goal) => {
    if (overlayWindow.isDestroyed()) return
    const [x, y] = overlayWindow.getPosition()
    const [w, h] = overlayWindow.getSize()
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    overlayWindow.setSize(220, 150)
    const newX = Math.max(0, Math.min(x + w - 220, sw - 220))
    const newY = Math.max(0, Math.min(y + h - 150, sh - 150))
    overlayWindow.setPosition(newX, newY)
    overlayWindow.webContents.send('overlay:feedback', { goal: goal || null })
  })

  ipcMain.on('overlay:dismiss-feedback', () => {
    if (overlayWindow.isDestroyed()) return
    const [x, y] = overlayWindow.getPosition()
    const [w, h] = overlayWindow.getSize()
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    overlayWindow.setSize(100, 100)
    const newX = Math.max(0, Math.min(x + w - 100, sw - 100))
    const newY = Math.max(0, Math.min(y + h - 100, sh - 100))
    overlayWindow.setPosition(newX, newY)
    overlayWindow.webContents.send('overlay:dismiss')
  })

  // Phone morph: the ring is bottom-anchored in the overlay document and the window
  // resize is bottom-right anchored, so growing/shrinking the window doesn't move the
  // ring on screen — the CSS morph is the only visible motion.
  let phoneShrinkTimer = null
  ipcMain.on('overlay:phone-detected', (_, active) => {
    if (overlayWindow.isDestroyed()) return
    if (phoneShrinkTimer) { clearTimeout(phoneShrinkTimer); phoneShrinkTimer = null }
    const [x, y] = overlayWindow.getPosition()
    const [w, h] = overlayWindow.getSize()
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    if (active) {
      // Grow the window first so the morph animates inside it
      overlayWindow.setSize(100, 190)
      const newX = Math.max(0, Math.min(x + w - 100, sw - 100))
      const newY = Math.max(0, Math.min(y + h - 190, sh - 190))
      overlayWindow.setPosition(newX, newY)
      overlayWindow.webContents.send('overlay:phone-detected', true)
    } else {
      // Morph back first, shrink the window once the 450ms transition has finished
      overlayWindow.webContents.send('overlay:phone-detected', false)
      phoneShrinkTimer = setTimeout(() => {
        phoneShrinkTimer = null
        if (overlayWindow.isDestroyed()) return
        const [x2, y2] = overlayWindow.getPosition()
        const [w2, h2] = overlayWindow.getSize()
        overlayWindow.setSize(100, 100)
        const newX = Math.max(0, Math.min(x2 + w2 - 100, sw - 100))
        const newY = Math.max(0, Math.min(y2 + h2 - 100, sh - 100))
        overlayWindow.setPosition(newX, newY)
      }, 520)
    }
  })

  ipcMain.on('overlay:rating', (_, rating) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overlay:rating-result', rating)
    }
    if (!overlayWindow.isDestroyed()) {
      const [x, y] = overlayWindow.getPosition()
      const [w, h] = overlayWindow.getSize()
      const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
      overlayWindow.setSize(100, 100)
      const newX = Math.max(0, Math.min(x + w - 100, sw - 100))
      const newY = Math.max(0, Math.min(y + h - 100, sh - 100))
      overlayWindow.setPosition(newX, newY)
      overlayWindow.webContents.send('overlay:dismiss')
    }
  })

  setupSystemIPC()
  setupDocumentsIPC()
  setupPersistenceIPC()
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.atenttion.app')
  }

  // Grant camera and notification permissions so eye tracking and alerts work
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write']
    callback(allowed.includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write']
    return allowed.includes(permission)
  })

  // Serve model files via custom protocol in production.
  // Uses fs.readFile (not net.fetch) so WASM gets the correct application/wasm
  // MIME type that WebAssembly.instantiateStreaming requires.
  const MIME = {
    '.wasm': 'application/wasm',
    '.js':   'application/javascript',
    '.task': 'application/octet-stream',
  }
  protocol.handle('models', async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.slice(1))
    const basePath = app.isPackaged
      ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'renderer', 'models')
      : join(__dirname, '../renderer/models')
    const absolutePath = join(basePath, filePath)
    const ext = absolutePath.slice(absolutePath.lastIndexOf('.'))
    try {
      const data = await readFile(absolutePath)
      return new Response(data, {
        headers: { 'Content-Type': MIME[ext] || 'application/octet-stream' }
      })
    } catch (e) {
      console.error('[models protocol] not found:', absolutePath)
      return new Response('Not found', { status: 404 })
    }
  })

  protocol.handle('sounds', async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.slice(1))
    const basePath = app.isPackaged
      ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'renderer', 'sounds')
      : join(__dirname, '../renderer/sounds')
    const absolutePath = join(basePath, filePath)
    try {
      const data = await readFile(absolutePath)
      return new Response(data, { headers: { 'Content-Type': 'audio/mpeg' } })
    } catch (e) {
      console.error('[sounds protocol] not found:', absolutePath)
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
