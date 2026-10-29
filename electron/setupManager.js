const path = require('path')
const fs = require('fs')
const { spawn, execSync } = require('child_process')
const https = require('https')
const { app } = require('electron')

const USER_DATA = app.getPath('userData')
const ENGINE_DIR = path.join(USER_DATA, 'ai-engine')
const PYTHON_EXE = path.join(ENGINE_DIR, 'python.exe')

function downloadFile(url, dest, onLog) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location, dest, onLog).then(resolve).catch(reject)
        return
      }
      const total = parseInt(response.headers['content-length'] || '0', 10)
      let downloaded = 0
      let lastPct = 0

      response.on('data', (chunk) => {
        downloaded += chunk.length
        if (total > 0) {
          const pct = Math.floor((downloaded / total) * 100)
          if (pct >= lastPct + 10) {
            if (onLog) onLog(`Downloading... ${pct}%`)
            lastPct = pct
          }
        }
      })

      response.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err))
    })
  })
}

function runCmd(cmd, args, cwd, onLog) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd })
    p.stdout.on('data', (d) => {
      const txt = d.toString().trim()
      if (txt && onLog) onLog(txt)
    })
    p.stderr.on('data', (d) => {
      const txt = d.toString().trim()
      // Note: pip outputs progress strictly on stderr
      if (txt && onLog) onLog(txt)
    })
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Command failed: ${cmd} ${args.join(' ')}`))
    })
  })
}

async function isEngineInstalled() {
  const stDir = path.join(ENGINE_DIR, 'Lib', 'site-packages', 'sentence_transformers')
  return fs.existsSync(PYTHON_EXE) && fs.existsSync(stDir)
}

function getPythonPath() {
  return fs.existsSync(PYTHON_EXE) ? PYTHON_EXE : null
}

async function setupEngine(onLog) {
  if (await isEngineInstalled()) {
    onLog('AI Engine already installed.')
    return
  }

  if (!fs.existsSync(ENGINE_DIR)) {
    fs.mkdirSync(ENGINE_DIR, { recursive: true })
  }

  // 1. Download minimal Embeddable Python
  const pyZip = path.join(USER_DATA, 'python-embed.zip')
  onLog('Downloading Python Core...')
  await downloadFile('https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip', pyZip, onLog)

  // 2. Extract using native Windows tar
  onLog('Extracting Python Core...')
  execSync(`tar -xf "${pyZip}" -C "${ENGINE_DIR}"`)
  fs.unlinkSync(pyZip) // clean up

  // 3. Fix the ._pth file to allow "site" packages (needed for pip)
  onLog('Configuring Python Environment...')
  const pthFile = path.join(ENGINE_DIR, 'python310._pth')
  if (fs.existsSync(pthFile)) {
    let pthContent = fs.readFileSync(pthFile, 'utf8')
    pthContent = pthContent.replace('#import site', 'import site')
    fs.writeFileSync(pthFile, pthContent)
  }

  // 4. Download get-pip.py
  const getPip = path.join(USER_DATA, 'get-pip.py')
  onLog('Fetching Package Manager...')
  await downloadFile('https://bootstrap.pypa.io/get-pip.py', getPip, onLog)

  // 5. Install pip
  onLog('Installing Package Manager...')
  await runCmd(PYTHON_EXE, [getPip], ENGINE_DIR, onLog)
  fs.unlinkSync(getPip)

  // 6. Install PyTorch, Sentence-Transformers, and Utils
  onLog('Downloading & Installing AI Core Dependencies (This will take a while)...')
  const reqs = [
    'torch', 'torchvision', 'torchaudio', '--extra-index-url', 'https://download.pytorch.org/whl/cpu',
    'sentence-transformers', 'scikit-learn', 'PyMuPDF', 'python-docx', 'openpyxl'
  ]
  
  await runCmd(PYTHON_EXE, ['-m', 'pip', 'install', ...reqs], ENGINE_DIR, onLog)

  onLog('AI Engine Setup Complete!')
}

module.exports = {
  isEngineInstalled,
  setupEngine,
  getPythonPath
}
