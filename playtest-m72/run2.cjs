const { chromium } = require('../node_modules/playwright');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ss(page, name) {
  await page.screenshot({ path: path.join(__dirname, name + '.png'), fullPage: false });
  console.log('[ss] ' + name);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], simLogs = [];
  page.on('console', msg => {
    const t = msg.text();
    if (msg.type() === 'error' && !t.includes('Clerk') && !t.includes('net::') && !t.includes('Source map')) { errors.push(t); console.log('[ERR]', t.slice(0,200)); }
    if (t.includes('Bootstrap complete') || t.includes('[SimIntegration]') || t.includes('organisms')) { simLogs.push(t); console.log('[SIM]', t); }
  });
  page.on('pageerror', e => { if (!e.message.includes('Clerk') && !e.message.includes('pointer')) { errors.push(e.message); console.log('[PAGEERR]', e.message.slice(0,200)); }});
  console.log('PHASE 1: Load');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(6000);
  await ss(page, 'p01-load');
  const t1 = await page.evaluate(() => document.body.innerText.slice(0,600));
  console.log('[BODY]', t1);
  console.log('[CANVAS]', await page.evaluate(() => document.querySelectorAll('canvas').length));
  console.log('[CLICK-TO-PLAY]', await page.evaluate(() => document.body.innerText.includes('CLICK TO PLAY')));
  console.log('[RENDER-ERR]', await page.evaluate(() => document.body.innerText.includes('RENDER ERROR')));
  console.log('[ECOSYSTEM]', await page.evaluate(() => document.body.innerText.includes('ECOSYSTEM')));
  
  console.log('PHASE 2: Enter game');
  await page.evaluate(() => { window.__POINTER_LOCK_FAILED__ = true; });
  await page.mouse.click(720, 450);
  await sleep(4000);
  await ss(page, 'p02-entered');
  const t2 = await page.evaluate(() => document.body.innerText.slice(0,500));
  console.log('[BODY-AFTER-CLICK]', t2);
  console.log('[RENDER-ERR-2]', await page.evaluate(() => document.body.innerText.includes('RENDER ERROR')));
  console.log('[ECOSYSTEM-2]', await page.evaluate(() => ({
    eco: document.body.innerText.includes('ECOSYSTEM'),
    orgs: document.body.innerText.match(/\d+\s*Organisms?/i)?.[0] || null,
    spc: document.body.innerText.match(/\d+\s*Species?/i)?.[0] || null,
  })));

  console.log('PHASE 3: Spectator G');
  await page.keyboard.press('g');
  await sleep(2000);
  await ss(page, 'p03-spectator');
  console.log('[SPECTATOR-BADGE]', await page.evaluate(() => document.body.innerText.includes('SPECTATOR')));
  console.log('[RENDER-ERR-3]', await page.evaluate(() => document.body.innerText.includes('RENDER ERROR')));

  console.log('PHASE 4: Fly W+E');
  await page.keyboard.down('w'); await sleep(1200); await page.keyboard.up('w'); await sleep(200);
  await page.keyboard.down('e'); await sleep(800); await page.keyboard.up('e'); await sleep(300);
  await ss(page, 'p04-fly');

  console.log('PHASE 5: Seed O');
  await page.keyboard.press('o'); await sleep(300);
  await page.keyboard.press('o'); await sleep(300);
  await page.keyboard.press('o'); await sleep(800);
  await ss(page, 'p05-seed');
  console.log('[SIM-LOGS]', JSON.stringify(simLogs));

  console.log('PHASE 6: Ecosystem B');
  await page.keyboard.press('b'); await sleep(600); await ss(page, 'p06-eco-off');
  await page.keyboard.press('b'); await sleep(600); await ss(page, 'p07-eco-on');
  const ecoText = await page.evaluate(() => {
    const t = document.body.innerText;
    const lines = t.split('\n').filter(l=>l.trim()).slice(0,20);
    return lines.join(' | ');
  });
  console.log('[ECO-TEXT]', ecoText);

  console.log('PHASE 7: Exit spectator, Inventory I');
  await page.keyboard.press('g'); await sleep(1000);
  await page.keyboard.press('i'); await sleep(2500);
  await ss(page, 'p08-inv');
  console.log('[INV]', await page.evaluate(() => ({
    vis: document.body.innerText.includes('INVENTORY'),
    err: document.body.innerText.includes('RENDER ERROR'),
  })));
  await page.keyboard.press('Escape'); await sleep(700);

  console.log('PHASE 8: Journal J');
  await page.keyboard.press('j'); await sleep(1800);
  await ss(page, 'p09-journal');
  const jt = await page.evaluate(() => document.body.innerText.slice(0,400));
  console.log('[JOURNAL]', jt);
  await page.keyboard.press('Escape'); await sleep(600);

  console.log('PHASE 9: Map M');
  await page.keyboard.press('m'); await sleep(1800);
  await ss(page, 'p10-map');
  console.log('[MAP]', await page.evaluate(() => document.body.innerText.includes('MAP') || document.body.innerText.includes('Map')));
  await page.keyboard.press('Escape'); await sleep(600);

  console.log('PHASE 10: Crafting C');
  await page.keyboard.press('c'); await sleep(1800);
  await ss(page, 'p11-craft');
  console.log('[CRAFT]', await page.evaluate(() => document.body.innerText.includes('CRAFT') || document.body.innerText.includes('recipe')));
  await page.keyboard.press('Escape'); await sleep(600);

  console.log('PHASE 11: Watch sim 12s');
  await sleep(12000);
  await ss(page, 'p12-sim');
  const st = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      orgs: t.match(/(\d+)\s*Organisms?/i)?.[0] || null,
      spc: t.match(/(\d+)\s*Species?/i)?.[0] || null,
      births: t.match(/Births?[:\s]+(\d+)/i)?.[0] || null,
      deaths: t.match(/Deaths?[:\s]+(\d+)/i)?.[0] || null,
      ticks: t.match(/Ticks?[:\s#]+(\d+)/i)?.[0] || null,
      ms: t.match(/(\d+\.?\d*)\s*ms/i)?.[0] || null,
      full: t.slice(0,400),
    };
  });
  console.log('[SIM-STATS-12s]', JSON.stringify(st));

  console.log('PHASE 12: ADVANCE FLOOR button');
  const advBtn = await page.$('button:has-text("ADVANCE")');
  if (advBtn) { await advBtn.click(); await sleep(1500); await ss(page, 'p13-advance'); console.log('[ADVANCE] clicked'); }
  else { console.log('[ADVANCE] not found'); }

  console.log('PHASE 13: Toolbar inspection');
  const btns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => {
      const r = b.getBoundingClientRect();
      return { text: b.innerText.trim().slice(0,15), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) };
    }).filter(b => b.w>3 && b.h>3 && b.x>=0 && b.x<1440).sort((a,b)=>a.y-b.y);
  });
  console.log('[BTN-COUNT]', btns.length);
  btns.slice(0,20).forEach(b => console.log('  BTN:', JSON.stringify(b)));

  await ss(page, 'p14-final');

  console.log('\n=== SUMMARY ===');
  console.log('Errors:', errors.length, criticalErrors(errors).length, 'critical');
  criticalErrors(errors).slice(0,5).forEach(e => console.log('  -', e.slice(0,200)));
  console.log('Sim logs:', simLogs.length);
  simLogs.forEach(l => console.log('  [sim]', l));

  await browser.close();
  function criticalErrors(errs) {
    return errs.filter(e => !e.includes('favicon
