import { ipcMain, dialog } from 'electron'
import { execSync, spawn } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { extname, basename } from 'path'

function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: opts.windowsHide })
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString('utf-8') })
    proc.stderr.on('data', d => { stderr += d.toString('utf-8') })
    proc.on('close', code => resolve({ stdout, stderr, status: code }))
    proc.on('error', reject)
    setTimeout(() => { proc.kill(); reject(new Error('timeout')) }, opts.timeout || 30000)
  })
}

function checkMarkitdown() {
  try {
    execSync('python -c "import markitdown"', { timeout: 5000, windowsHide: true, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function checkPython() {
  try {
    const r = execSync('python --version 2>&1 || python3 --version 2>&1', { timeout: 5000, windowsHide: true, stdio: 'pipe' })
    return r.toString().trim()
  } catch {
    return null
  }
}

async function convertWithMarkitdown(filePath) {
  const result = await spawnAsync('python', ['-c', `
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert("${filePath.replace(/\\/g, '\\\\')}")
print(result.text_content)
`], { timeout: 30000, windowsHide: true })

  if (result.status !== 0) {
    throw new Error(result.stderr || 'markitdown conversion failed')
  }
  return result.stdout
}

async function convertWithMarkitdownUrl(url) {
  const result = await spawnAsync('python', ['-c', `
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert("${url}")
print(result.text_content)
`], { timeout: 30000 })

  if (result.status !== 0) {
    throw new Error(result.stderr || 'markitdown URL conversion failed')
  }
  return result.stdout
}

function readTextFile(filePath) {
  return readFileSync(filePath, 'utf-8')
}

async function fetchUrl(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Atenttion/1.0' }, signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const html = await r.text()
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Timed out after 15s')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export function setupDocumentsIPC() {
  ipcMain.handle('docs:checkDeps', async () => {
    const python = checkPython()
    const markitdown = python ? checkMarkitdown() : false
    return { python, markitdown }
  })

  ipcMain.handle('docs:installMarkitdown', async () => {
    try {
      execSync('pip install markitdown', { timeout: 60000, windowsHide: true, stdio: 'pipe' })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('docs:pickFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select document',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'html', 'csv'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('docs:convertFile', async (_, filePath) => {
    try {
      if (!existsSync(filePath)) throw new Error('File not found')
      const ext = extname(filePath).toLowerCase()
      const name = basename(filePath)
      let content

      if (['.txt', '.md'].includes(ext)) {
        content = readTextFile(filePath)
      } else if (checkMarkitdown()) {
        content = await convertWithMarkitdown(filePath)
      } else if (ext === '.html' || ext === '.htm') {
        const html = readTextFile(filePath)
        content = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      } else {
        throw new Error(`Requires markitdown (Python) for ${ext} files`)
      }

      return { success: true, name, path: filePath, content: content.trim(), ext }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('docs:convertUrl', async (_, url) => {
    try {
      let content
      if (checkMarkitdown()) {
        content = await convertWithMarkitdownUrl(url)
      } else {
        content = await fetchUrl(url)
      }
      return { success: true, name: url, path: url, content: content.trim(), ext: 'url' }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}
