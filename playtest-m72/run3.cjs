const { chromium } = require('../node_modules/playwright');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ss(page, name) {
  await page.screenshot({ path: path.join(__dirname, name + '.png'), fullPage: false });
  console.log('[ss] ' + name);
}

function criticalErrors(errs) {
  return errs.filter(e =>
    !e.includes('favicon') &&
    !e.includes('Source map') &&
    !e.includes('Failed to load') &&
    !e.includes('net::') &&
    !e.includes('Clerk') &&
    !e.includes('ClerkRuntime')
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const simLogs = [];

  page.on('console', msg => {
    const t = msg.text();
    if (msg.type() === 'error' && !t.includes('Clerk') && !t.includes('net::') && !t.includes('Source map')) {
      errors.push(t);
      console.log('[ERR] ' + t.slice(0, 200));
    }
    if (t.includes('Bootstrap complete') || t.includes('[SimIntegration]') || t.includes('organisms,') || t.includes('species,')) {
      simLogs.push(t);
      console.log('[SIM] ' + t);
    }
  });
  page.on('pageerror', e => {
    if (!e.message.includes('Clerk') && !e.message.includes('pointer')) {
      errors.push(e.message);
      console.log('[PAGEERR] ' + e.message.slice(0, 200));
    }
  });

  // PHASE 1: Initial Load
  console.log('--- PHASE 1: Load ---');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(7000);
  await ss(page, 'p01-load');

  const body1 = await page.evaluate(() => document.body.innerText.slice(0, 700));
  console.log('[BODY-1]', body1);
  console.log('[CANVAS]', await page.evaluate(() => document.querySelectorAll('canvas').length));
  console.log('[CLICK-TO-PLAY]', await page.evaluate(() => document.body.innerText.includes('CLICK TO PLAY')));
  console.log('[RENDER-ERR-1]', await page.evaluate(() =>
    document.body.innerText.includes('RENDER ERROR') || document.body.innerText.includes('removeChild')
  ));
  console.log('[ECOSYSTEM-1]', await page.evaluate(() => document.body.innerText.includes('ECOSYSTEM')));

  // PHASE 2: Enter game
  console.log('--- PHASE 2: Enter ---');
  await page.evaluate(() => { window.__POINTER_LOCK_FAILED__ = true; });
  await page.mouse.click(720, 450);
  await sleep(4000);
  await ss(page, 'p02-entered');

  const body2 = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('[BODY-2]', body2);
  console.log('[RENDER-ERR-2]', await page.evaluate(() => document.body.innerText.includes('RENDER ERROR')));

  const eco2 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      eco: t.includes('ECOSYSTEM'),
      orgs: (t.match(/\d+\s*Organisms?/i) || [null])[0],
      spc: (t.match(/\d+\s*Species?/i) || [null])[0],
    };
  });
  console.log('[ECOSYSTEM-2]', JSON.stringify(eco2));

  // PHASE 3: Spectator (G)
  console.log('--- PHASE 3: Spectator G ---');
  await page.keyboard.press('g');
  await sleep(2000);
  await ss(page, 'p03-spectator');
  console.log('[SPECTATOR-BADGE]', await page.evaluate(() => document.body.innerText.includes('SPECTATOR')));
  console.log('[RENDER-ERR-3]', await page.evaluate(() => document.body.innerText.includes('RENDER ERROR')));

  // PHASE 4: Fly around
  console.log('--- PHASE 4: Fly W+E ---');
  await page.keyboard.down('w');
  await sleep(1200);
  await page.keyboard.up('w');
  await sleep(200);
  await page.keyboard.down('e');
  await sleep(800);
  await page.keyboard.up('e');
  await sleep(300);
  await ss(page, 'p04-fly');

  // PHASE 5: Seed organisms (O)
  console.log('--- PHASE 5: Seed O ---');
  await page.keyboard.press('o');
  await sleep(300);
  await page.keyboard.press('o');
  await sleep(300);
  await page.keyboard.press('o');
  await sleep(800);
  await ss(page, 'p05-seed');
  console.log('[SIM-LOGS-SO-FAR]', JSON.stringify(simLogs));

  // PHASE 6: Ecosystem dashboard (B)
  console.log('--- PHASE 6: Eco B ---');
  await page.keyboard.press('b');
  await sleep(600);
  await ss(page, 'p06-eco-off');
  await page.keyboard.press('b');
  await sleep(600);
  await ss(page, 'p07-eco-on');
  const ecoText = await page.evaluate(() => {
    const t = document.body.innerText;
    return t.split('\n').filter(l => l.trim()).slice(0, 20).join(' | ');
  });
  console.log('[ECO-TEXT]', ecoText);

  // PHASE 7: Inventory (I)
  console.log('--- PHASE 7: Inventory I ---');
  await page.keyboard.press('g');
  await sleep(1000);
  await page.keyboard.press('i');
  await sleep(2500);
  await ss(page, 'p08-inv');
  const inv = await page.evaluate(() => ({
    vis: document.body.innerText.includes('INVENTORY') || document.body.innerText.includes('Inventory'),
    err: document.body.innerText.includes('RENDER ERROR'),
    snippet: document.body.innerText.slice(0, 350),
  }));
  console.log('[INV]', JSON.stringify(inv));
  await page.keyboard.press('Escape');
  await sleep(700);

  // PHASE 8: Journal (J)
  console.log('--- PHASE 8: Journal J ---');
  await page.keyboard.press('j');
  await sleep(1800);
  await ss(page, 'p09-journal');
  const jt = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log('[JOURNAL]', jt);
  await page.keyboard.press('Escape');
  await sleep(600);

  // PHASE 9: Map (M)
  console.log('--- PHASE 9: Map M ---');
  await page.keyboard.press('m');
  await sleep(1800);
  await ss(page, 'p10-map');
  console.log('[MAP-VISIBLE]', await page.evaluate(() => document.body.innerText.includes('MAP') || document.body.innerText.includes('Map')));
  await page.keyboard.press('Escape');
  await sleep(600);

  // PHASE 10: Crafting (C)
  console.log('--- PHASE 10: Crafting C ---');
  await page.keyboard.press('c');
  await sleep(1800);
  await ss(page, 'p11-craft');
  console.log('[CRAFT-VISIBLE]', await page.evaluate(() =>
    document.body.innerText.includes('CRAFT') || document.body.innerText.includes('craft')
  ));
  await page.keyboard.press('Escape');
  await sleep(600);

  // PHASE 11: Watch sim 12 seconds
  console.log('--- PHASE 11: Watch sim 12s ---');
  await sleep(12000);
  await ss(page, 'p12-sim');
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      orgs: (t.match(/(\d+)\s*Organisms?/i) || [null])[0],
      spc: (t.match(/(\d+)\s*Species?/i) || [null])[0],
      births: (t.match(/Births?[:\s]+(\d+)/i) || [null])[0],
      deaths: (t.match(/Deaths?[:\s]+(\d+)/i) || [null])[0],
      ticks: (t.match(/Ticks?[:\s#]+(\d+)/i) || [null])[0],
      ms: (t.match(/(\d+\.?\d*)\s*ms/i) || [null])[0],
      full: t.slice(0, 500),
    };
  });
  console.log('[SIM-STATS-12s]', JSON.stringify(st));

  // PHASE 12: ADVANCE FLOOR
  console.log('--- PHASE 12: Advance floor ---');
  const advBtn = await page.$('button:has-text("ADVANCE")');
  if (advBtn) {
    await advBtn.click();
    await sleep(1500);
    await ss(page, 'p13-advance');
    console.log('[ADVANCE] button found and clicked');
  } else {
    console.log('[ADVANCE] button not found (expected in M72 — RPG disabled)');
    await ss(page, 'p13-no-advance');
  }

  // PHASE 13: Toolbar inspection
  console.log('--- PHASE 13: Toolbar ---');
  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return {
        text: b.innerText.trim().slice(0, 15),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }).filter(b => b.w > 3 && b.h > 3 && b.x >= 0 && b.x < 1440).sort((a, b) => a.y - b.y);
  });
  console.log('[BTN-COUNT]', btns.length);
  btns.slice(0, 20).forEach(b => console.log('  BTN:', JSON.stringify(b)));

  // Final overview
  await page.keyboard.press('g');
  await sleep(800);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await sleep(2500);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await sleep(500);
  await ss(page, 'p14-final-overview');
  await sleep(1000);
  await ss(page, 'p15-final');

  console.log('\n=== SUMMARY ===');
  console.log('Total JS errors: ' + errors.length);
  const crit = criticalErrors(errors);
  console.log('Critical (non-Clerk) errors: ' + crit.length);
  crit.slice(0, 8).forEach(e => console.log('  -', e.slice(0, 250)));
  console.log('Sim logs captured: ' + simLogs.length);
  simLogs.forEach(l => console.log('  [sim]', l));

  await browser.close();
})();
