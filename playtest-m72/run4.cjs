const { chromium } = require('../node_modules/playwright');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ss(page, name) {
  try {
    await page.screenshot({ path: path.join(__dirname, name + '.png'), fullPage: false, timeout: 10000 });
    console.log('[ss] ' + name);
  } catch (e) {
    console.log('[ss-FAIL] ' + name + ' — ' + e.message.slice(0, 100));
  }
}

function critErr(errs) {
  return errs.filter(e =>
    !e.includes('favicon') && !e.includes('Source map') &&
    !e.includes('Failed to load') && !e.includes('net::') &&
    !e.includes('Clerk') && !e.includes('ClerkRuntime')
  );
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Disable WebGL to avoid canvas rendering blocks
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  const errors = [], simLogs = [], gameLogs = [];
  page.on('console', msg => {
    const t = msg.text();
    if (msg.type() === 'error' && !t.includes('Clerk') && !t.includes('net::') && !t.includes('Source map')) {
      errors.push(t);
      console.log('[ERR] ' + t.slice(0, 200));
    }
    if (t.includes('Bootstrap complete') || t.includes('[SimIntegration]')) {
      simLogs.push(t);
      console.log('[SIM] ' + t);
    }
    // Capture all info/log lines that look meaningful
    if (msg.type() === 'log' && (t.includes('[') || t.includes('ECOSYSTEM') || t.includes('tick'))) {
      gameLogs.push(t);
    }
  });
  page.on('pageerror', e => {
    if (!e.message.includes('Clerk') && !e.message.includes('pointer')) {
      errors.push(e.message);
      console.log('[PAGEERR] ' + e.message.slice(0, 200));
    }
  });

  // Phase 1: Load
  console.log('=== PHASE 1: LOAD ===');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(8000);  // wait for React + R3F + sim to init
  await ss(page, 'p01-load');

  const b1 = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 800),
    canvas: document.querySelectorAll('canvas').length,
    clickToPlay: document.body.innerText.includes('CLICK TO PLAY'),
    renderErr: document.body.innerText.includes('RENDER ERROR'),
    ecosystem: document.body.innerText.includes('ECOSYSTEM'),
    orgs: (document.body.innerText.match(/\d+\s*Organisms?/i) || [null])[0],
  }));
  console.log('[PHASE1]', JSON.stringify(b1, null, 2));

  // Phase 2: Enter game
  console.log('=== PHASE 2: ENTER GAME ===');
  await page.evaluate(() => { window.__POINTER_LOCK_FAILED__ = true; });
  // Try clicking CLICK TO PLAY text directly
  const overlay = await page.$('text=CLICK TO PLAY');
  if (overlay) {
    await overlay.click();
    console.log('[OVERLAY] Clicked CLICK TO PLAY text');
  } else {
    await page.mouse.click(720, 450);
    console.log('[OVERLAY] Clicked center of screen');
  }
  await sleep(4000);
  await ss(page, 'p02-entered');

  const b2 = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 600),
    renderErr: document.body.innerText.includes('RENDER ERROR') || document.body.innerText.includes('removeChild'),
    ecosystem: document.body.innerText.includes('ECOSYSTEM'),
    orgs: (document.body.innerText.match(/\d+\s*Organisms?/i) || [null])[0],
    spc: (document.body.innerText.match(/\d+\s*Species?/i) || [null])[0],
  }));
  console.log('[PHASE2]', JSON.stringify(b2, null, 2));

  // Phase 3: Spectator (G)
  console.log('=== PHASE 3: SPECTATOR (G) ===');
  await page.keyboard.press('g');
  await sleep(2000);
  await ss(page, 'p03-spectator');
  const b3 = await page.evaluate(() => ({
    badge: document.body.innerText.includes('SPECTATOR'),
    renderErr: document.body.innerText.includes('RENDER ERROR'),
  }));
  console.log('[PHASE3]', JSON.stringify(b3));

  // Phase 4: Fly
  console.log('=== PHASE 4: FLY ===');
  await page.keyboard.down('w'); await sleep(1200); await page.keyboard.up('w'); await sleep(200);
  await page.keyboard.down('e'); await sleep(800); await page.keyboard.up('e'); await sleep(300);
  await ss(page, 'p04-fly');

  // Phase 5: Seed organisms (O)
  console.log('=== PHASE 5: SEED O ===');
  for (let i = 0; i < 5; i++) { await page.keyboard.press('o'); await sleep(250); }
  await sleep(800);
  await ss(page, 'p05-seed');
  console.log('[SIM-LOGS]', simLogs);

  // Phase 6: Ecosystem (B)
  console.log('=== PHASE 6: ECOSYSTEM (B) ===');
  await page.keyboard.press('b'); await sleep(600);
  await ss(page, 'p06-eco-off');
  await page.keyboard.press('b'); await sleep(600);
  await ss(page, 'p07-eco-on');
  const ecoText = await page.evaluate(() => document.body.innerText.split('\n').filter(l => l.trim()).slice(0, 25).join(' | '));
  console.log('[ECO-FULL-TEXT]', ecoText);

  // Check canvas pixel color (do organisms render as colored dots?)
  const canvasColor = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return 'webgl-only';
    const px = ctx2d.getImageData(720, 450, 1, 1).data;
    return Array.from(px);
  });
  console.log('[CANVAS-CENTER-PX]', canvasColor);

  // Phase 7: Exit spectator, Inventory (I)
  console.log('=== PHASE 7: INVENTORY (I) ===');
  await page.keyboard.press('g'); await sleep(1000);
  await page.keyboard.press('i'); await sleep(2500);
  await ss(page, 'p08-inv');
  const inv = await page.evaluate(() => ({
    vis: document.body.innerText.includes('INVENTORY') || document.body.innerText.includes('Inventory'),
    err: document.body.innerText.includes('RENDER ERROR'),
    text: document.body.innerText.slice(0, 400),
  }));
  console.log('[INV]', JSON.stringify(inv));
  await page.keyboard.press('Escape'); await sleep(700);

  // Phase 8: Journal (J)
  console.log('=== PHASE 8: JOURNAL (J) ===');
  await page.keyboard.press('j'); await sleep(1800);
  await ss(page, 'p09-journal');
  const jt = await page.evaluate(() => ({
    vis: document.body.innerText.includes('JOURNAL') || document.body.innerText.includes('Journal'),
    err: document.body.innerText.includes('RENDER ERROR'),
    text: document.body.innerText.slice(0, 400),
  }));
  console.log('[JOURNAL]', JSON.stringify(jt));
  await page.keyboard.press('Escape'); await sleep(600);

  // Phase 9: Map (M)
  console.log('=== PHASE 9: MAP (M) ===');
  await page.keyboard.press('m'); await sleep(1800);
  await ss(page, 'p10-map');
  const mt = await page.evaluate(() => ({
    vis: document.body.innerText.includes('MAP') || document.body.innerText.includes('Map'),
    err: document.body.innerText.includes('RENDER ERROR'),
  }));
  console.log('[MAP]', JSON.stringify(mt));
  await page.keyboard.press('Escape'); await sleep(600);

  // Phase 10: Crafting (C)
  console.log('=== PHASE 10: CRAFTING (C) ===');
  await page.keyboard.press('c'); await sleep(1800);
  await ss(page, 'p11-craft');
  const ct = await page.evaluate(() => ({
    vis: document.body.innerText.includes('CRAFT') || document.body.innerText.includes('Crafting'),
    err: document.body.innerText.includes('RENDER ERROR'),
  }));
  console.log('[CRAFT]', JSON.stringify(ct));
  await page.keyboard.press('Escape'); await sleep(600);

  // Phase 11: Watch 15 seconds
  console.log('=== PHASE 11: WATCH SIM 15s ===');
  await sleep(15000);
  await ss(page, 'p12-sim-15s');
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      orgs: (t.match(/(\d+)\s*Organisms?/i) || [null])[0],
      spc: (t.match(/(\d+)\s*Species?/i) || [null])[0],
      births: (t.match(/Births?[:\s]+(\d+)/i) || [null])[0],
      deaths: (t.match(/Deaths?[:\s]+(\d+)/i) || [null])[0],
      ticks: (t.match(/Ticks?[:\s#]+(\d+)/i) || [null])[0],
      ms: (t.match(/(\d+\.?\d*)\s*ms/i) || [null])[0],
      full: t.slice(0, 600),
    };
  });
  console.log('[SIM-STATS-15s]', JSON.stringify(st));

  // Phase 12: ADVANCE FLOOR
  console.log('=== PHASE 12: ADVANCE FLOOR ===');
  const advBtn = await page.$('button:has-text("ADVANCE")');
  if (advBtn) {
    await advBtn.click(); await sleep(1500);
    await ss(page, 'p13-advance');
    console.log('[ADVANCE] clicked');
  } else {
    console.log('[ADVANCE] not found — expected, RPG disabled in M72');
    await ss(page, 'p13-no-advance');
  }

  // Phase 13: Toolbar
  console.log('=== PHASE 13: TOOLBAR ===');
  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return { text: b.innerText.trim().slice(0, 15), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(b => b.w > 3 && b.h > 3 && b.x >= 0 && b.x < 1440).sort((a, b) => a.y - b.y)
  );
  console.log('[BTN-COUNT]', btns.length);
  btns.slice(0, 25).forEach(b => console.log('  BTN:', JSON.stringify(b)));

  // Final overview
  await page.keyboard.press('g'); await sleep(800);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w'); await sleep(2500); await page.keyboard.up('w');
  await page.keyboard.up('Shift'); await sleep(500);
  await ss(page, 'p14-final-overview');
  await sleep(1000);
  await ss(page, 'p15-final');

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('Total errors: ' + errors.length + ', Critical: ' + critErr(errors).length);
  critErr(errors).slice(0, 8).forEach(e => console.log('  ERR:', e.slice(0, 250)));
  console.log('Sim logs: ' + simLogs.length);
  simLogs.forEach(l => console.log('  [sim]', l));
  console.log('Game logs: ' + gameLogs.length);

  await browser.close();
})();
