import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('overlayApi', {
  onState:          (cb) => ipcRenderer.on('overlay:state',          (_, data)   => cb(data)),
  onFeedback:       (cb) => ipcRenderer.on('overlay:feedback',       (_, data)   => cb(data)),
  onDismiss:        (cb) => ipcRenderer.on('overlay:dismiss',        ()          => cb()),
  onPhoneDetected:  (cb) => ipcRenderer.on('overlay:phone-detected', (_, active) => cb(active)),
  submitRating: (rating) => ipcRenderer.send('overlay:rating', rating)
})
