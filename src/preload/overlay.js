import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('overlayApi', {
  onState:    (cb) => ipcRenderer.on('overlay:state',    (_, data) => cb(data)),
  onFeedback: (cb) => ipcRenderer.on('overlay:feedback', (_, data) => cb(data)),
  onDismiss:  (cb) => ipcRenderer.on('overlay:dismiss',  ()       => cb()),
  submitRating: (rating) => ipcRenderer.send('overlay:rating', rating)
})
