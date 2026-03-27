const { chromium } = require('../node_modules/playwright');
const path = require('path');
// Fixed: use domcontentloaded instead of networkidle to avoid Clerk/WS timeout

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function screenshot(page, name) {
  const p = path.join(__dirname, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  console.log('[screenshot] ' + name);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const simLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.push(text);
      if (!text.includes('favicon') && !text.includes('Source map') && !text.includes('Failed to load resource')) {
        console.log('[console.error] ' + text.slice(0, 200));
      }
    }
    if (text.includes('[SimIntegration]') || text.includes('[NatSel]') || text.includes('[Bootstrap]') || text.includes('[sim]')) {
      simLogs.push(text);
      console.log('[sim] ' + text);
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log('[pageerror] ' + err.message.slice(0, 300));
  });

  // ── PHASE 1: Initial Load ──────────────────────────────────────────────
  console.log('=== PHASE 1: Initial load ===');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await sleep(4000);
  await screenshot(page, '01-initial-load');

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log('[body text]', bodyText);

  const renderError = await page.evaluate(() =>
    document.body.innerText.includes('RENDER ERROR') ||
    document.body.innerText.includes('UNCAUGHT ERROR') ||
    document.body.innerText.includes('removeChild')
  );
  console.log('[render error on load]', renderError);

  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log('[canvas elements]', canvasCount);

  const isAuthScreen = await page.evaluate(() => document.body.innerText.includes('Sign in'));
  console.log('[is auth screen]', isAuthScreen);

  const hasClickToPlay = await page.evaluate(() => document.body.innerText.includes('CLICK TO PLAY'));
  console.log('[has CLICK TO PLAY]', hasClickToPlay);

  // Check initial ecosystem visibility
  const preClickEco = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      ecosystem: t.includes('ECOSYSTEM'),
      organisms: t.toLowerCase().includes('organisms'),
      species: t.toLowerCase().includes('species'),
    };
  });
  console.log('[pre-click ecosystem]', JSON.stringify(preClickEco));

  // ── PHASE 2: Enter Game ──────────────────────────────────────────────
  console.log('=== PHASE 2: Click to enter game ===');
  await page.evaluate(() => { window.__POINTER_LOCK_FAILED__ = true; });
  await page.mouse.click(720, 450);
  await sleep(3000);
  await screenshot(page, '02-after-click');

  const renderError2 = await page.evaluate(() =>
    document.body.innerText.includes('RENDER ERROR') ||
    document.body.innerText.includes('removeChild') ||
    document.body.innerText.includes('UNCAUGHT ERROR')
  );
  console.log('[render error after click]', renderError2);

  const afterClickText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('[after click body]', afterClickText);

  // ── PHASE 3: Ecosystem dashboard ──────────────────────────────────────
  console.log('=== PHASE 3: Ecosystem dashboard check ===');
  const ecoCheck = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      ecosystem: t.includes('ECOSYSTEM'),
      organisms: t.match(/\d+\s*Organisms?/i) ? t.match(/\d+\s*Organisms?/i)[0] : null,
      species: t.match(/\d+\s*Species?/i) ? t.match(/\d+\s*Species?/i)[0] : null,
      births: t.match(/Births?:?\s*(\d+)/i) ? t.match(/Births?:?\s*(\d+)/i)[0] : null,
      deaths: t.match(/Deaths?:?\s*(\d+)/i) ? t.match(/Deaths?:?\s*(\d+)/i)[0] : null,
      ticks: t.match(/Tick\s*#?\s*\d+/i) ? t.match(/Tick\s*#?\s*\d+/i)[0] : null,
      simActive: t.includes('ECOSYSTEM') && t.includes('Tick'),
    };
  });
  console.log('[ecosystem dashboard]', JSON.stringify(ecoCheck));

  // ── PHASE 4: Spectator mode ──────────────────────────────────────────
  console.log('=== PHASE 4: Spectator mode (G) ===');
  await page.keyboard.press('g');
  await sleep(2000);
  await screenshot(page, '03-spectator');

  const spectator = await page.evaluate(() => {
    const t = document.body.innerText;
    return { badge: t.includes('SPECTATOR'), error: t.includes('RENDER ERROR') };
  });
  console.log('[spectator state]', JSON.stringify(spectator));

  // ── PHASE 5: Fly in spectator ──────────────────────────────────────────
  console.log('=== PHASE 5: Fly in spectator ===');
  await page.keyboard.down('w');
  await sleep(1000);
  await page.keyboard.up('w');
  await sleep(200);
  await page.keyboard.down('e');
  await sleep(800);
  await page.keyboard.up('e');
  await sleep(200);
  await screenshot(page, '04-spectator-fly');

  // ── PHASE 6: Seed organisms ──────────────────────────────────────────
  console.log('=== PHASE 6: Seed organisms (O x3) ===');
  await page.keyboard.press('o');
  await sleep(300);
  await page.keyboard.press('o');
  await sleep(300);
  await page.keyboard.press('o');
  await sleep(800);
  await screenshot(page, '05-after-seed');

  console.log('[sim logs so far]', JSON.stringify(simLogs));

  // ── PHASE 7: Ecosystem dashboard toggle ──────────────────────────────
  console.log('=== PHASE 7: Ecosystem dashboard (B) ===');
  await page.keyboard.press('b');
  await sleep(600);
  await screenshot(page, '06-eco-hidden');
  await page.keyboard.press('b');
  await sleep(600);
  await screenshot(page, '07-eco-visible');

  // ── PHASE 8: Exit spectator, open inventory ──────────────────────────
  console.log('=== PHASE 8: Inventory (I) ===');
  await page.keyboard.press('g');
  await sleep(800);
  await page.keyboard.press('i');
  await sleep(2000);
  await screenshot(page, '08-inventory');

  const invInfo = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      visible: t.includes('INVENTORY') || t.includes('Inventory'),
      renderError: t.includes('RENDER ERROR') || t.includes('removeChild'),
      snippet: t.slice(0, 300),
    };
  });
  console.log('[inventory]', JSON.stringify(invInfo));
  await page.keyboard.press('Escape');
  await sleep(600);

  // ── PHASE 9: Journal ──────────────────────────────────────────────────
  console.log('=== PHASE 9: Journal (J) ===');
  await page.keyboard.press('j');
  await sleep(1500);
  await screenshot(page, '09-journal');
  const jrnlText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log('[journal text]', jrnlText);
  await page.keyboard.press('Escape');
  await sleep(500);

  // ── PHASE 10: Map ─────────────────────────────────────────────────────
  console.log('=== PHASE 10: Map (M) ===');
  await page.keyboard.press('m');
  await sleep(1500);
  await screenshot(page, '10-map');
  await page.keyboard.press('Escape');
  await sleep(500);

  // ── PHASE 11: Crafting ────────────────────────────────────────────────
  console.log('=== PHASE 11: Crafting (C) ===');
  await page.keyboard.press('c');
  await sleep(1500);
  await screenshot(page, '11-crafting');
  await page.keyboard.press('Escape');
  await sleep(500);

  // ── PHASE 12: Watch simulation 10 seconds ─────────────────────────────
  console.log('=== PHASE 12: Watch simulation for 10 seconds ===');
  await sleep(10000);
  await screenshot(page, '12-sim-10sec');

  const simStats = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      orgMatch: t.match(/(\d+)\s*Organisms?/i) ? t.match(/(\d+)\s*Organisms?/i)[0] : null,
      spcMatch: t.match(/(\d+)\s*Species?/i) ? t.match(/(\d+)\s*Species?/i)[0] : null,
      bthMatch: t.match(/Births?:?\s*(\d+)/i) ? t.match(/Births?:?\s*(\d+)/i)[0] : null,
      dthMatch: t.match(/Deaths?:?\s*(\d+)/i) ? t.match(/Deaths?:?\s*(\d+)/i)[0] : null,
      tckMatch: t.match(/Tick\s*#?\s*(\d+)/i) ? t.match(/Tick\s*#?\s*(\d+)/i)[0] : null,
      msMatch: t.match(/(\d+\.?\d*)\s*ms/i) ? t.match(/(\d+\.?\d*)\s*ms/i)[0] : null,
      fullEcoSection: '',
    };
  });
  console.log('[sim stats after 10sec]', JSON.stringify(simStats));

  // ── PHASE 13: Final overview ────────────────────────────────────────────
  console.log('=== PHASE 13: Final spectator overview ===');
  await page.keyboard.press('g');
  await sleep(800);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await sleep(2000);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await sleep(500);
  await screenshot(page, '13-final-overview');

  // Check toolbar button visibility
  const toolbarButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons
      .map(b => ({
        text: b.innerText.trim().slice(0, 15),
        x: Math.round(b.getBoundingClientRect().x),
        y: Math.round(b.getBoundingClientRect().y),
        w: Math.round(b.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height),
      }))
      .filter(b => b.w > 0 && b.h > 0 && b.x > 0)
      .slice(0, 20);
  });
  console.log('[visible buttons]', JSON.stringify(toolbarButtons));

  await screenshot(page, '14-final');

  // ── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('\n=== PLAYTEST SUMMARY ===');
  console.log('Total JS errors: ' + errors.length);
  const criticalErrors = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('Source map') &&
    !e.includes('Failed to load resource') &&
    !e.includes('net::ERR')
  );
  console.log('Critical errors: ' + criticalErrors.length);
  criticalErrors.slice(0, 8).forEach(e => console.log('  -', e.slice(0, 250)));
  console.log('Sim logs: ' + simLogs.length);
  simLogs.forEach(l => console.log('  [sim]', l));

  await browser.close();
})();
