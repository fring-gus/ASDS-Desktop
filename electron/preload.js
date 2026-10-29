const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Classes
  listClasses: () => ipcRenderer.invoke('classes:list'),
  createClass: (name) => ipcRenderer.invoke('classes:create', name),
  deleteClass: (id) => ipcRenderer.invoke('classes:delete', id),
  saveClass: (session) => ipcRenderer.invoke('classes:save', session),
  getClass: (id) => ipcRenderer.invoke('classes:get', id),

  // Files
  openFileDialog: () => ipcRenderer.invoke('files:open-dialog'),

  // Analysis
  runAnalysis: (data) => ipcRenderer.invoke('analysis:run', data),
  cancelAnalysis: () => ipcRenderer.invoke('analysis:cancel'),
  onAnalysisProgress: (callback) => {
    const handler = (event, data) => callback(data)
    ipcRenderer.on('analysis:progress', handler)
    return () => ipcRenderer.removeListener('analysis:progress', handler)
  },
  getPythonStatus: () => ipcRenderer.invoke('python:status'),
  onPythonReady: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('python:ready', handler)
    return () => ipcRenderer.removeListener('python:ready', handler)
  },

  // Setup
  onSetupLog: (callback) => {
    const handler = (e, text) => callback(text)
    ipcRenderer.on('setup:log', handler)
    return () => ipcRenderer.removeListener('setup:log', handler)
  },
  onSetupComplete: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('setup:complete', handler)
    return () => ipcRenderer.removeListener('setup:complete', handler)
  },
  checkSetupRequired: () => ipcRenderer.invoke('setup:check'),
  startSetup: () => ipcRenderer.invoke('setup:start'),

  // Export
  exportExcel: (data) => ipcRenderer.invoke('export:excel', data),
})
