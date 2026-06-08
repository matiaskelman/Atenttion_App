// Copyright (c) 2026 Matias Kelman. All rights reserved.
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (cb) => {
      const handler = (_, v) => cb(v)
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.removeListener('window:maximized', handler)
    }
  },
  data: {
    saveSession: (session) => ipcRenderer.invoke('data:saveSession', session),
    savePreferences: (prefs) => ipcRenderer.invoke('data:savePreferences', prefs),
    loadPreferences: () => ipcRenderer.invoke('data:loadPreferences'),
    getSessionsPath: () => ipcRenderer.invoke('data:getSessionsPath'),
    getPrefsPath: () => ipcRenderer.invoke('data:getPrefsPath'),
    getSessionCount: () => ipcRenderer.invoke('data:getSessionCount'),
    loadSessions: () => ipcRenderer.invoke('data:loadSessions'),
    saveAppUsage: (data) => ipcRenderer.invoke('data:saveAppUsage', data),
    loadAppUsage: () => ipcRenderer.invoke('data:loadAppUsage'),
    exportCsv: (sessions) => ipcRenderer.invoke('data:exportCsv', sessions)
  },
  docs: {
    checkDeps: () => ipcRenderer.invoke('docs:checkDeps'),
    installMarkitdown: () => ipcRenderer.invoke('docs:installMarkitdown'),
    pickFile: () => ipcRenderer.invoke('docs:pickFile'),
    convertFile: (path) => ipcRenderer.invoke('docs:convertFile', path),
    convertUrl: (url) => ipcRenderer.invoke('docs:convertUrl', url)
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:getInfo'),
    getActiveApp: () => ipcRenderer.invoke('system:getActiveApp'),
    getAppIcon: (name) => ipcRenderer.invoke('system:getAppIcon', name),
    getCurrentWallpaper: () => ipcRenderer.invoke('system:getCurrentWallpaper'),
    setWallpaper: (path) => ipcRenderer.invoke('system:setWallpaper', path),
    createFocusWallpaper: () => ipcRenderer.invoke('system:createFocusWallpaper')
  },
  overlay: {
    update: (data) => ipcRenderer.send('overlay:update', data),
    showFeedback: (goal) => ipcRenderer.send('overlay:show-feedback', goal),
    dismissFeedback: () => ipcRenderer.send('overlay:dismiss-feedback'),
    onRating: (cb) => {
      const handler = (_, rating) => cb(rating)
      ipcRenderer.on('overlay:rating-result', handler)
      return () => ipcRenderer.removeListener('overlay:rating-result', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
