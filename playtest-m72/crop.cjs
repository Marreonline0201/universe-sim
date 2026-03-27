// Use Playwright to take cropped screenshots of key areas
const { chromium } = require('../node_modules/playwright');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ss(page, name, clip) {
  await page.screenshot({ path: path.join(__dirname, name + '.png'), fullPage: false, clip });
  console.log('[ss] ' + name);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  
  const simLogs = [];
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('Bootstrap') || t.includes('[SimIntegration]') || t.includes('tick') || t.includes('Tick')) {
      simLogs.push(t); console.log('[SIM]', t);
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(6000);
  await page.evaluate(() => { window.__POINTER_LOCK_FAILED__ = true; });
  await page.mouse.click(720, 450);
  await sleep(3000);

  // Full page for reference
  await ss(page, 'c01-full', { x: 0, y: 0, width: 1440, height: 900 });

  // Crop: Ecosystem dashboard (top-right area)
  await ss(page, 'c02-ecosystem-topright', { x: 1180, y: 0, width: 260, height: 400 });

  // Crop: Toolbar (far right strip)
  await ss(page, 'c03-toolbar-right', { x: 1380, y: 0, width: 60, height: 900 });

  // Crop: Top center (dungeon/floor)
  await ss(page, 'c04-topcenter', { x: 550, y: 0, width: 340, height: 120 });

  // Crop: Bottom center (hotbar)
  await ss(page, 'c05-hotbar', { x: 550, y: 820, width: 340, height: 80 });

  // Crop: Left side (tutorial/legend?)
  await ss(page, 'c06-leftside', { x: 0, y: 0, width: 250, height: 900 });

  // Now go to spectator and see planet
  await page.keyboard.press('g');
  await sleep(1500);
  // Zoom out
  await page.keyboard.down('Shift');
  await page.keyboard.down('s'); await sleep(2000); await page.keyboard.up('s');
  await page.keyboard.up('Shift');
  await sleep(500);
  await ss(page, 'c07-spectator-zoomed', { x: 0, y: 0, width: 1440, height: 900 });

  // More zoom out
  await page.keyboard.down('Shift');
  await page.keyboard.down('s'); await sleep(2000); await page.keyboard.up('s');
  await page.keyboard.up('Shift');
  await sleep(500);
  await ss(page, 'c08-more-zoomed', { x: 0, y: 0, width: 1440, height: 900 });

  // Crop: Center planet area
  await ss(page, 'c09-planet-center', { x: 300, y: 150, width: 840, height: 600 });

  // Wait 10s more for sim to tick
  await sleep(10000);
  // Go back to normal view
  await page.keyboard.press('g');
  await sleep(1000);
  await ss(page, 'c10-after-10s', { x: 0, y: 0, width: 1440, height: 900 });
  // Ecosystem widget
  await ss(page, 'c11-eco-after10s', { x: 1180, y: 0, width: 260, height: 400 });

  console.log('\n[SIM-LOGS-ALL]', simLogs);
  await browser.close();
})();
