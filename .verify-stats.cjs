const { chromium } = require('playwright-core')
const fs = require('fs')

const OUT = process.env.TEMP + '\\stats-verify'
fs.mkdirSync(OUT, { recursive: true })

async function shot(page, path) {
  const cdp = await page.context().newCDPSession(page)
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" })
  fs.writeFileSync(path, Buffer.from(data, "base64"))
  await cdp.detach()
}

async function main() {
  let browser
  for (let i = 0; i < 20; i++) {
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:9233')
      break
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  if (!browser) throw new Error('Could not connect to CDP after 20s')

  const pages = browser.contexts().flatMap((c) => c.pages())
  console.log('pages:', pages.map((p) => p.url()).join(' | '))
  const page = pages.find((p) => p.url().includes('index.html') && !p.url().includes('overlay'))
  if (!page) throw new Error('Main window not found')

  await page.setViewportSize({ width: 1100, height: 800 }).catch(() => {})

  // 1. Navigate to Stats
  await page.click('button:has-text("Stats")')
  await page.waitForSelector('h3:has-text("Sessions")', { timeout: 10000 })
  await page.waitForTimeout(1500) // let charts + icons render
  await shot(page, OUT + '\\1-stats-top.png' )
  console.log('STEP1 done — stats page loaded')

  // Order check: section headings top-to-bottom
  const order = await page.$$eval('h3', (els) => els.map((e) => e.textContent.trim()))
  console.log('SECTION ORDER:', JSON.stringify(order))
  const ritual = await page.$$eval('*', (els) => els.filter((e) => e.textContent === 'Ritual Impact').length)
  console.log('RITUAL IMPACT PRESENT:', ritual > 0)
  const blinkChart = order.some((t) => t.includes('Blink Rate'))
  console.log('BLINK RATE CHART PRESENT:', blinkChart)

  // 2. Expand first session row
  const firstRow = page.locator('button.w-full.grid').first()
  await firstRow.click()
  await page.waitForSelector('text=Apps used', { timeout: 5000 })
  await page.waitForTimeout(800)
  await shot(page, OUT + '\\2-row-expanded.png' )
  console.log('STEP2 done — row expanded, "Apps used" visible')

  // 3. Switch to Today tab — expanded row should collapse
  await page.click('button:has-text("Today")')
  await page.waitForTimeout(400)
  const appsUsedVisible = await page.locator('text=Apps used').count()
  console.log('STEP3 — after tab switch, expanded panels open:', appsUsedVisible)
  const counter = await page.locator('h3:has-text("Sessions")').locator('xpath=following-sibling::div//span | ../div//span').first().textContent().catch(() => '?')
  await shot(page, OUT + '\\3-today-tab.png' )

  // 4. Probe: Month tab + Show all
  await page.click('button:has-text("Month")')
  await page.waitForTimeout(300)
  const showAllBtn = page.locator('button:has-text("Show all")')
  if ((await showAllBtn.count()) > 0) {
    const label = await showAllBtn.textContent()
    console.log('STEP4 — Show all button label on Month tab:', JSON.stringify(label))
    await showAllBtn.click()
    await page.waitForTimeout(400)
  } else {
    console.log('STEP4 — no Show all button on Month tab (<=8 sessions)')
  }
  await shot(page, OUT + '\\4-month-showall.png' )

  // 5. Scroll to Distractions / Best Focus Hours
  await page.locator('h3:has-text("Best Focus Hours")').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await shot(page, OUT + '\\5-distractions-hours.png' )
  const bestWindow = await page.locator('text=Best window').textContent().catch(() => 'NOT FOUND')
  console.log('STEP5 — Best Focus Hours footer:', bestWindow)

  // 6. Probe: rapid-fire expand/collapse on a row (state sanity)
  await page.click('button:has-text("All")')
  await page.waitForTimeout(300)
  const row = page.locator('button.w-full.grid').first()
  for (let i = 0; i < 5; i++) await row.click()
  await page.waitForTimeout(300)
  console.log('STEP6 — rapid toggle x5, expanded panels open:', await page.locator('text=Apps used').count())

  // 7. Check console errors collected
  console.log('ALL STEPS DONE')
  await browser.close()
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
