const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const readline = require('readline')
const os = require('os')
const setupManager = require('./setupManager')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── Sessions Storage ──
const getSessionsDir = () => {
  const userDataPath = app.getPath('userData')
  const sessionsDir = path.join(userDataPath, 'sessions')
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true })
  return sessionsDir
}

let pythonProcess = null
let pendingRequests = new Map() // reqId -> resolve function
let cancelledRequests = new Set()
let analysisStates = new Map() // reqId -> { results, filenames }
let isPythonReady = false
let lastPythonError = null

function getBridgeScript() {
  return isDev
    ? path.join(__dirname, '../python_bridge/run_analysis.py')
    : path.join(process.resourcesPath, 'python_bridge/run_analysis.py')
}

async function startPythonDaemon() {
  const needsSetup = !(await setupManager.isEngineInstalled())
  if (needsSetup && !isDev) {
    console.log('[Python] Packaged engine missing. Waiting for setup...')
    return
  }

  const pythonCmd = isDev 
    ? (process.platform === 'win32' ? 'python' : 'python3') 
    : setupManager.getPythonPath()
  
  if (!pythonCmd) {
    lastPythonError = 'Python executable not found.'
    console.error('Python executable not found.')
    return
  }
  
  console.log(`[Electron] Starting Python Background Daemon via ${pythonCmd}...`)
  lastPythonError = null
  
  const userDataPath = app.getPath('userData')
  const modelsDir = path.join(userDataPath, 'ai-models')
  
  pythonProcess = spawn(pythonCmd, ['-u', getBridgeScript()], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HF_HOME: modelsDir }
  })

  // Use readline to perfectly parse JSON line by line
  const rl = readline.createInterface({ input: pythonProcess.stdout })

  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line)
      const reqId = msg.req_id

      // Handle system boot messages
      if (msg.type === 'sys_boot') {
        console.log(`[Python] ${msg.msg}`)
        // Let the renderer know if it wants to listen for status (optional)
        mainWindow?.webContents.send('analysis:progress', { percent: 0, msg: msg.msg })
        return
      }
      if (msg.type === 'sys_ready') {
        console.log(`[Python] ${msg.msg}`)
        isPythonReady = true
        mainWindow?.webContents.send('python:ready')
        return
      }

      if (reqId && cancelledRequests.has(reqId)) {
        if (msg.type === 'done' || msg.type === 'error') {
          cancelledRequests.delete(reqId)
        }
        return // Silently drop output from canceled requests
      }

      const resolve = pendingRequests.get(reqId)
      
      // If it's a progress update, stream it directly to React window
      if (msg.type === 'progress') {
        mainWindow?.webContents.send('analysis:progress', msg)
      } 
      else if (msg.type === 'filenames') {
        const state = analysisStates.get(reqId)
        if (state) state.filenames = msg.data
      } 
      else if (msg.type === 'result') {
        const state = analysisStates.get(reqId)
        if (state) state.results.push(msg.data)
      } 
      else if (msg.type === 'error') {
        console.error(`[Python Analysis Error] ${msg.message}`)
        if (resolve) resolve({ success: false, error: msg.message })
        pendingRequests.delete(reqId)
        analysisStates.delete(reqId)
      } 
      else if (msg.type === 'done') {
        if (msg.path) {
          // This was an export request
          if (resolve) resolve({ success: true, path: msg.path })
        } else {
          // This was an analysis request
          const state = analysisStates.get(reqId) || { results: [], filenames: [] }
          if (resolve) resolve({ 
            success: true, 
            results: state.results, 
            filenames: state.filenames 
          })
        }
        pendingRequests.delete(reqId)
        analysisStates.delete(reqId)
      }
    } catch (_) {
      // Not JSON, ignore or log
      // console.log(`[Python Raw]: ${line}`)
    }
  })

  pythonProcess.stderr.on('data', (d) => {
    const text = d.toString()
    lastPythonError = (lastPythonError || '') + text
    console.error(`[Python stderr] ${text}`)
  })

  pythonProcess.on('error', (err) => {
    lastPythonError = err.message
    console.error(`[Electron] Python process failed to start: ${err.message}`)
  })

  pythonProcess.on('close', (code) => {
    console.log(`[Electron] Python process closed with code ${code}`)
    pythonProcess = null
    // Fail all pending promises
    for (const [reqId, resolve] of pendingRequests.entries()) {
      const detail = lastPythonError ? ` ${lastPythonError.trim()}` : ''
      resolve({ success: false, error: `Python connection lost unexpectedly.${detail}` })
    }
    pendingRequests.clear()
    analysisStates.clear()
  })
}

function stopPythonDaemon() {
  if (pythonProcess) {
    pythonProcess.kill()
    pythonProcess = null
  }
}

// ── Window Creation ──
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d0d14',
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  startPythonDaemon() // Boot up ML models in background!
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  stopPythonDaemon() // Clean up process on exit
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Window Controls ──
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ── IPC: Classes (Sessions) ──
ipcMain.handle('classes:list', () => {
  try {
    const dir = getSessionsDir()
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
    return files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      return { ...data, _file: f }
    })
  } catch (e) {
    return []
  }
})

ipcMain.handle('classes:create', (event, name) => {
  try {
    const dir = getSessionsDir()
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    const session = {
      id,
      name,
      created_at: new Date().toISOString(),
      last_analyzed: null,
      file_paths: [],
      results: [],
      filenames: [],
    }
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(session, null, 2))
    return { success: true, session }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('classes:delete', (event, id) => {
  try {
    const dir = getSessionsDir()
    const fpath = path.join(dir, `${id}.json`)
    if (fs.existsSync(fpath)) fs.unlinkSync(fpath)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('classes:save', (event, session) => {
  try {
    const dir = getSessionsDir()
    fs.writeFileSync(path.join(dir, `${session.id}.json`), JSON.stringify(session, null, 2))
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('classes:get', (event, id) => {
  try {
    const dir = getSessionsDir()
    const fpath = path.join(dir, `${id}.json`)
    if (!fs.existsSync(fpath)) return null
    return JSON.parse(fs.readFileSync(fpath, 'utf8'))
  } catch (e) {
    return null
  }
})

// ── IPC: File Dialog ──
ipcMain.handle('files:open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Documents',
    filters: [
      { name: 'Documents', extensions: ['pdf', 'docx'] },
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'Word Documents', extensions: ['docx'] },
    ],
    properties: ['openFile', 'multiSelections'],
  })
  return result.canceled ? [] : result.filePaths
})

// ── IPC: Status ──
// ── IPC: Setup ──
ipcMain.handle('setup:check', async () => {
  if (isDev) return false // Dev mode never requires setup (uses global python)
  return !(await setupManager.isEngineInstalled())
})

ipcMain.handle('setup:start', async () => {
  try {
    await setupManager.setupEngine((log) => {
      mainWindow?.webContents.send('setup:log', log)
    })
    mainWindow?.webContents.send('setup:complete')
    startPythonDaemon()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ── IPC: Run Analysis (Python Bridge - IPC Daemon) ──
ipcMain.handle('analysis:run', async (event, { filePaths, mode, threshold, requestId }) => {
  return new Promise((resolve) => {
    if (!pythonProcess) {
      const detail = lastPythonError ? ` Last startup error: ${lastPythonError.trim()}` : ''
      resolve({ success: false, error: `Python AI Engine is not running in the background.${detail}` })
      return
    }

    const reqId = requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
    pendingRequests.set(reqId, resolve)
    analysisStates.set(reqId, { results: [], filenames: [] })

    const payload = JSON.stringify({
      req_id: reqId,
      action: 'analyze',
      mode: mode || 'semantic',
      file_paths: filePaths,
      threshold: threshold ?? null
    })

    // Dispatch job to python background process immediately
    pythonProcess.stdin.write(payload + '\n')
  })
})

ipcMain.handle('analysis:cancel', async () => {
  if (pythonProcess) {
    console.log('[Electron] Canceling ongoing analysis without terminating engine...')
    
    for (const [reqId, resolve] of pendingRequests.entries()) {
      resolve({ success: false, canceled: true, error: 'Analysis canceled by user.' })
      cancelledRequests.add(reqId) // Mark to ignore future background output
    }
    pendingRequests.clear()
    analysisStates.clear()
    
    return { success: true }
  }
  return { success: false, error: 'No analysis running.' }
})

// ── IPC: Export Excel ──
ipcMain.handle('export:excel', async (event, { results, filenames }) => {
  const savePath = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Results',
    defaultPath: `ASDS_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  })

  // Export cancelled by user
  if (savePath.canceled) return { success: false, canceled: true }

  return new Promise((resolve) => {
    if (!pythonProcess) {
      const detail = lastPythonError ? ` Last startup error: ${lastPythonError.trim()}` : ''
      resolve({ success: false, error: `Python AI Engine is not running.${detail}` })
      return
    }

    const reqId = `req_${Date.now()}`
    pendingRequests.set(reqId, (res) => {
      if (res.success) {
         // Auto open folder upon success
         shell.openPath(path.dirname(savePath.filePath))
      }
      resolve(res)
    })

    const payload = JSON.stringify({
      req_id: reqId,
      action: 'export',
      results,
      filenames,
      output_path: savePath.filePath,
    })

    // Write to python process
    pythonProcess.stdin.write(payload + '\n')
  })
})
