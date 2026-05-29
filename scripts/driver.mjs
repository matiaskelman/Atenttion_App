import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(__dirname, '..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || 'C:/Users/Usuario/AppData/Local/Temp/atenttion-shots'
mkdirSync(SHOT_DIR, { recursive: true })

const electronBin = join(APP_DIR, 'node_modules/electron/dist/electron.exe')

async function run() {
  console.log('Launching Atenttion app...')

  const app = await electron.launch({
    executablePath: electronBin,
    args: ['.'],
    cwd: APP_DIR,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_ENV: 'production' },
    timeout: 30_000,
  })

  // Wait for the window to render
  await new Promise(r => setTimeout(r, 4000))

  const windows = app.windows()
  console.log(`Windows open: ${windows.length}`)
  for (const w of windows) console.log(' ', w.url())

  const page = windows.find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow()
  console.log('Using page:', page.url())

  // Wait for React to mount
  await page.waitForSelector('#root > *', { timeout: 15000 }).catch(() => console.log('root selector timeout'))

  async function shot(name) {
    const p = join(SHOT_DIR, name + '.png')
    await page.screenshot({ path: p })
    console.log('screenshot:', p)
    return p
  }

  async function clickText(text) {
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')]
      const el = els.find(e => e.textContent?.trim() === t) ?? els.find(e => e.textContent?.includes(t))
      if (!el) return 'NOT_FOUND'
      el.click(); return 'OK'
    }, text)
    console.log('click-text', JSON.stringify(text), '->', r)
    await new Promise(r => setTimeout(r, 600))
  }

  async function navigate(pageId) {
    const r = await page.evaluate(id => {
      const el = document.querySelector(`[data-page="${id}"]`)
      if (!el) return 'NOT_FOUND'
      el.click(); return 'OK'
    }, pageId)
    console.log('navigate', pageId, '->', r)
    await new Promise(r => setTimeout(r, 800))
  }

  async function clickSel(sel) {
    const r = await page.evaluate(s => {
      const el = document.querySelector(s)
      if (!el) return 'NOT_FOUND'
      el.click(); return 'OK'
    }, sel)
    console.log('click', sel, '->', r)
    await new Promise(r => setTimeout(r, 600))
  }

  // --- Drive the app ---

  // 1. Focus page (default landing)
  await shot('01-focus-page')

  // 2. Navigate to Stats
  await navigate('stats')
  await shot('02-stats-page')

  // 3. Navigate to System
  await navigate('system')
  await shot('03-system-page')

  // 4. Navigate to Docs
  await navigate('docs')
  await shot('04-docs-page')

  // 5. Back to Focus, open settings
  await navigate('focus')
  await clickText('Show')
  await new Promise(r => setTimeout(r, 400))
  await shot('05-settings-open')

  console.log('\nAll screenshots saved to:', SHOT_DIR)
  await app.close()
}

run().catch(e => { console.error(e); process.exit(1) })
