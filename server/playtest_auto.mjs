import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js'

const URL = 'https://universe-sim-beryl.vercel.app/'
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

let keepRunning = true
process.on('SIGINT', () => {
  console.log('\n[auto-loop] Stopping on SIGINT...')
  keepRunning = false
})

function parseVitals(text) {
  const pick = (re) => {
    const m = text.match(re)
    return m ? m[1] : null
  }
  return {
    hp: pick(/\u2665\s*(\d+(?:\.\d+)?)/),
    food: pick(/\u25c6\s*(\d+(?:\.\d+)?)/),
    water: pick(/~\s*(\d+(?:\.\d+)?)/),
    energy: pick(/\u26a1\s*(\d+(?:\.\d+)?)/),
    stamina: pick(/\u25cf\s*(\d+(?:\.\d+)?)/),
  }
}

async function enterPlay(page) {
  await page.mouse.click(700, 420)
  await delay(250)
  const bodyText = await page.evaluate(() => document.body?.innerText || '')
  if (bodyText.includes('CLICK TO PLAY')) {
    await page.mouse.click(700, 420)
    await delay(350)
  }
}

async function runLoop(page, n) {
  await enterPlay(page)

  // World actions: move + look + dig + interact + attack
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down('w')
    await page.keyboard.down('Shift')
    await page.mouse.move(620 + i * 120, 400 + (i % 2 ? 55 : -55))
    await delay(800)
    await page.keyboard.up('Shift')
    await page.keyboard.up('w')
    await page.keyboard.press('g').catch(() => {})
    await page.keyboard.press('q').catch(() => {})
    if (i % 2 === 0) await page.keyboard.press('f').catch(() => {})
    await delay(220)
  }

  // Camera mode cycle during active play
  await page.keyboard.press('v').catch(() => {})
  await delay(250)
  await page.keyboard.down('w')
  await page.mouse.move(850, 430)
  await delay(650)
  await page.keyboard.up('w')
  await page.keyboard.press('v').catch(() => {})
  await delay(220)
  await page.keyboard.press('v').catch(() => {})
  await delay(220)

  // Unlock pointer/look mode before clicking panels
  await page.keyboard.press('Escape').catch(() => {})
  await delay(220)

  const labels = ['INV', 'CRF', 'BLD', 'TEC', 'EVO', 'JRN', 'CHR', 'MAP', '?', 'SET']
  const panelState = {}
  for (const label of labels) {
    const button = await page.$x(`//button[contains(normalize-space(.), '${label}')]`)
    if (!button.length) {
      panelState[label] = 'missing'
      continue
    }
    try {
      await button[0].click()
      await delay(220)
      await page.keyboard.press('Escape').catch(() => {})
      panelState[label] = 'ok'
    } catch {
      panelState[label] = 'fail'
    }
  }

  const text = await page.evaluate(() => document.body?.innerText || '')
  const vitals = parseVitals(text)
  const hasOverlay = text.includes('CLICK TO PLAY')
  const isDead = /YOU DIED|RESPAWN/i.test(text)
  console.log(`[auto-loop] loop=${n} hp=${vitals.hp} food=${vitals.food} water=${vitals.water} overlay=${hasOverlay} dead=${isDead} panels=${JSON.stringify(panelState)}`)
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  })

  const page = await browser.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[auto-loop][console error]', msg.text())
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await delay(4000)

  let loop = 0
  while (keepRunning) {
    loop += 1
    try {
      await runLoop(page, loop)
    } catch (err) {
      console.log('[auto-loop] loop error:', err?.message || err)
    }
    await delay(1000)
  }

  await browser.close()
  console.log('[auto-loop] Stopped.')
}

main().catch((err) => {
  console.error('[auto-loop] fatal:', err?.message || err)
  process.exit(1)
})
