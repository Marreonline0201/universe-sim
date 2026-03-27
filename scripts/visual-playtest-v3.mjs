/**
 * Visual Playtest v3 - Focused panel/HUD checks
 * Uses CDP screenshots to capture actual panel open states
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'vp-current');
const BASE_URL = 'http://localhost:5173';

async function cdpShot(client, name, description) {
  try {
    const result = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const filename = path.join(OUT, `${name}.png`);
    fs.writeFileSync(filename, Buffer.from(result.data, 'base64'));
    console.log(`[SHOT] ${name}: ${description}`);
  } catch (err) {
    console.log(`[SHOT FAIL] ${name}: ${err.message}`);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/fonts.googleapis.com/**', r => r.abort());
  await context.route('**/fonts.gstatic.com/**', r => r.abort());

  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(3000);

  // Click CLICK TO PLAY
  const overlay = page.locator('text=CLICK TO PLAY');
  if (await overlay.count() > 0) {
    // Use JS click to avoid Playwright's actionability checks that can hang
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent?.includes('CLICK TO PLAY'));
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(2000);
  }

  // --- Measure the actual toolbar dimensions ---
  const toolbarInfo = await page.evaluate(() => {
    // Find the sidebar container
    const allDivs = Array.from(document.querySelectorAll('div'));
    const sidebar = allDivs.find(d => {
      const s = d.style;
      return s.position === 'fixed' && (s.right === '0px' || s.right === '0') &&
             d.querySelectorAll('button').length > 5;
    });
    if (!sidebar) return { found: false };
    const rect = sidebar.getBoundingClientRect();
    const btns = Array.from(sidebar.querySelectorAll('button')).slice(0, 5).map(b => {
      const r = b.getBoundingClientRect();
      return { text: b.innerText, x: r.x, y: r.y, w: r.width, h: r.height, computed: window.getComputedStyle(b).height };
    });
    return { found: true, sidebarRect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, buttons: btns };
  });
  console.log('Toolbar info:', JSON.stringify(toolbarInfo, null, 2));

  // Take screenshot to see current state
  await cdpShot(client, 'v3-01-default', 'Default game state after click-to-play');

  // Try clicking the INV button directly (should be at roughly x=1418, y=18 for a 44x34 button)
  // First find the exact position
  const invBtnPos = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const invBtn = btns.find(b => b.innerText.trim() === 'INV' || b.title === 'Inventory (I)');
    if (!invBtn) return null;
    const r = invBtn.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height, title: invBtn.title };
  });
  console.log('INV button center:', JSON.stringify(invBtnPos));

  if (invBtnPos) {
    await page.mouse.click(invBtnPos.x, invBtnPos.y);
    await sleep(1000);
    await cdpShot(client, 'v3-02-inv-clicked', 'After clicking INV button directly');

    // Check if panel opened
    const panelState = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('div')).filter(d => {
        const s = d.style;
        return s.position === 'fixed' && s.right === '0px' && s.zIndex === '200';
      });
      return panels.map(p => ({
        rect: (() => { const r = p.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })(),
        text: p.innerText?.slice(0, 100)
      }));
    });
    console.log('Panel state after INV click:', JSON.stringify(panelState, null, 2));
    await cdpShot(client, 'v3-03-inv-panel', 'INV panel close-up check');
  }

  // Now use I key
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('i');
  await sleep(1000);
  await cdpShot(client, 'v3-04-I-key', 'After I key press');

  // Check what panel opened via DOM
  const panelContent = await page.evaluate(() => {
    // Look for the panel by z-index
    const allFixed = Array.from(document.querySelectorAll('[style*="position: fixed"]'));
    return allFixed.map(el => {
      const s = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        zIndex: s.zIndex,
        right: s.right,
        width: s.width,
        height: s.height,
        x: Math.round(rect.x), y: Math.round(rect.y),
        visible: rect.width > 100 && rect.height > 100,
        text: el.textContent?.trim().slice(0, 80)
      };
    }).filter(e => e.visible && parseInt(e.zIndex) > 100);
  });
  console.log('Visible fixed panels:', JSON.stringify(panelContent, null, 2));

  await page.keyboard.press('Escape');
  await sleep(500);

  // --- Test each panel individually with focus management ---
  const testPanels = [
    { key: 'i', name: 'v3-inventory', label: 'Inventory' },
    { key: 'c', name: 'v3-crafting', label: 'Crafting' },
    { key: 'j', name: 'v3-journal', label: 'Journal' },
    { key: 'Tab', name: 'v3-character', label: 'Character' },
    { key: 'm', name: 'v3-map', label: 'Map' },
    { key: 'k', name: 'v3-skills', label: 'Skills' },
    { key: 'q', name: 'v3-quests', label: 'Quests' },
    { key: 'z', name: 'v3-achievements', label: 'Achievements' },
    { key: 'x', name: 'v3-progression', label: 'Progression' },
    { key: 'h', name: 'v3-home', label: 'Home Base' },
    { key: 'n', name: 'v3-housing', label: 'Housing' },
    { key: 'y', name: 'v3-alchemy', label: 'Alchemy' },
    { key: 'l', name: 'v3-worldevents', label: 'World Events' },
    { key: 'Escape', name: 'v3-settings', label: 'Settings (Esc)' },
  ];

  for (const { key, name, label } of testPanels) {
    // Make sure body has focus, not a panel
    await page.evaluate(() => document.activeElement?.blur?.());
    await sleep(100);
    await page.keyboard.press(key);
    await sleep(1000);
    await cdpShot(client, name, `${label} panel`);

    // Measure what opened
    const panelText = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('*')).filter(el => {
        const rect = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return s.position === 'fixed' && rect.width > 200 && rect.height > 400 && parseInt(s.zIndex) >= 200;
      });
      return panels.map(p => ({
        tag: p.tagName,
        text: p.textContent?.trim().slice(0, 80)
      }));
    });
    if (panelText.length > 0) {
      console.log(`  ${label}: panel text = "${panelText[0]?.text?.slice(0, 60)}"`);
    } else {
      console.log(`  ${label}: NO PANEL DETECTED`);
    }

    await page.keyboard.press('Escape');
    await sleep(500);
  }

  // --- B key test ---
  await page.keyboard.press('b');
  await sleep(1000);
  await cdpShot(client, 'v3-B-key', 'B key - EcosystemDashboard or Build');
  const bPanelText = await page.evaluate(() => document.querySelector('[class*="ecosystem"], [class*="Ecosystem"]')?.textContent?.slice(0, 100));
  console.log('B key result - ecosystem text:', bPanelText);
  await page.keyboard.press('Escape');
  await sleep(400);

  // --- G key test ---
  await page.keyboard.press('g');
  await sleep(1500);
  await cdpShot(client, 'v3-G-key', 'G key - SpectatorCamera');
  const spectatorText = await page.evaluate(() => document.querySelector('[class*="spectator"], [class*="Spectator"]')?.textContent?.slice(0, 80));
  console.log('G key result - spectator text:', spectatorText);
  await page.keyboard.press('g');
  await sleep(400);

  // --- Check for visual overflow issues ---
  console.log('\n=== OVERFLOW CHECK ===');
  const overflowIssues = await page.evaluate(() => {
    const issues = [];
    const body = document.body;
    if (body.scrollWidth > body.clientWidth) {
      issues.push(`Horizontal overflow: scrollWidth=${body.scrollWidth} clientWidth=${body.clientWidth}`);
    }
    // Check all fixed elements for right-edge clipping
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 5) {
        issues.push(`Element clips right: ${el.tagName}.${el.className.slice(0,40)} right=${Math.round(rect.right)}`);
      }
      if (rect.bottom > window.innerHeight + 5) {
        issues.push(`Element clips bottom: ${el.tagName}.${el.className.slice(0,40)} bottom=${Math.round(rect.bottom)}`);
      }
    });
    return issues.slice(0, 20);
  });
  console.log('Overflow issues:', overflowIssues.length > 0 ? overflowIssues : 'none');

  // --- Mobile viewport ---
  await page.setViewportSize({ width: 800, height: 900 });
  await sleep(1000);
  await cdpShot(client, 'v3-mobile-800', 'Mobile 800px wide');

  const mobileIssues = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 5) {
        const s = window.getComputedStyle(el);
        issues.push({
          tag: el.tagName, class: el.className.slice(0,40),
          right: Math.round(rect.right), vw: window.innerWidth,
          overhang: Math.round(rect.right - window.innerWidth)
        });
      }
    });
    return issues.slice(0, 15);
  });
  console.log('Mobile overflow elements:', JSON.stringify(mobileIssues, null, 2));

  await page.keyboard.press('i');
  await sleep(800);
  await cdpShot(client, 'v3-mobile-inventory', 'Inventory on mobile 800px');
  await page.keyboard.press('Escape');
  await sleep(400);

  await page.setViewportSize({ width: 600, height: 900 });
  await sleep(800);
  await cdpShot(client, 'v3-mobile-600', 'Mobile 600px wide');

  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(600);

  // --- Final overview ---
  await cdpShot(client, 'v3-final', 'Final state at 1440px');

  // Collect all console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await browser.close();
  console.log('\n=== DONE ===');
}

run().catch(err => {
  console.error('FATAL:', err.stack || err.message);
  process.exit(1);
});
