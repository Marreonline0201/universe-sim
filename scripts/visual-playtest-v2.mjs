/**
 * Visual Playtest Script v2 - Universe Sim
 * Uses CDP to take screenshots, bypassing font/webgl hang
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, '..', 'vp-current');
const BASE_URL = 'http://localhost:5173';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function cdpShot(client, page, name, description) {
  try {
    // Use CDP Page.captureScreenshot which doesn't wait for fonts
    const result = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true
    });
    const filename = path.join(SCREENSHOT_DIR, `${name}.png`);
    fs.writeFileSync(filename, Buffer.from(result.data, 'base64'));
    console.log(`[SCREENSHOT] ${name}: ${description}`);
    return filename;
  } catch (err) {
    console.log(`[SCREENSHOT FAILED] ${name}: ${err.message}`);
    return null;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--window-size=1440,900',
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--font-render-hinting=none',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  // Route to block hanging font requests
  await context.route('**/fonts.googleapis.com/**', route => route.abort());
  await context.route('**/fonts.gstatic.com/**', route => route.abort());

  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  // Collect errors
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('\n=== PHASE 1: INITIAL LOAD ===\n');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('Page loaded, waiting for React to mount...');
  await sleep(4000);

  await cdpShot(client, page, '01-initial-load', 'Cold start - before any interaction');

  // Get visible text
  const bodyText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && el.innerText?.trim())
      .map(el => el.innerText.trim())
      .slice(0, 30)
      .join(' | ');
  });
  console.log('Visible text snippets:', bodyText.slice(0, 400));

  console.log('\n=== PHASE 2: CLICK TO PLAY ===\n');
  // Check for click-to-play overlay
  const overlayCount = await page.locator('text=CLICK TO PLAY').count();
  const hasOverlay = overlayCount > 0;
  console.log('Has CLICK TO PLAY overlay:', hasOverlay);

  if (hasOverlay) {
    await page.locator('text=CLICK TO PLAY').first().click();
  } else {
    // Click center
    await page.mouse.click(720, 450);
  }
  await sleep(2000);
  await cdpShot(client, page, '02-after-click-to-play', 'After clicking CLICK TO PLAY');

  console.log('\n=== PHASE 3: DEFAULT GAMEPLAY HUD ===\n');
  await cdpShot(client, page, '03-hud-default', 'Default gameplay HUD - no panels open');

  // Examine HUD structure
  const hudInfo = await page.evaluate(() => {
    const info = [];
    // Look for key UI containers
    const selectors = [
      '[class*="hud"]', '[class*="HUD"]',
      '[class*="toolbar"]', '[class*="Toolbar"]',
      '[class*="panel"]', '[class*="Panel"]',
      '[class*="overlay"]', '[class*="Overlay"]',
      '[class*="sidebar"]', '[class*="Sidebar"]',
      '[class*="minimap"]', '[class*="MiniMap"]',
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 10 && rect.height > 10) {
          info.push({
            selector: sel,
            class: el.className.slice(0, 60),
            x: Math.round(rect.x), y: Math.round(rect.y),
            w: Math.round(rect.width), h: Math.round(rect.height),
            text: el.innerText?.slice(0, 40)
          });
        }
      });
    });
    return info.slice(0, 30);
  });
  console.log('HUD elements:', JSON.stringify(hudInfo, null, 2));

  console.log('\n=== PHASE 4: PANEL TESTS VIA KEYBOARD ===\n');

  const panels = [
    { key: 'i', name: '04-panel-inventory', label: 'Inventory (I key)' },
    { key: 'j', name: '05-panel-journal', label: 'Journal (J key)' },
    { key: 'm', name: '06-panel-map', label: 'Map (M key)' },
    { key: 'c', name: '07-panel-C', label: 'C key panel' },
    { key: 'k', name: '08-panel-K', label: 'K key panel' },
    { key: 'q', name: '09-panel-Q', label: 'Q key panel (quests?)' },
    { key: 'h', name: '10-panel-H', label: 'H key panel' },
    { key: 'p', name: '11-panel-P', label: 'P key panel' },
    { key: 'f', name: '12-panel-F', label: 'F key panel' },
    { key: 'n', name: '13-panel-N', label: 'N key panel' },
    { key: 'l', name: '14-panel-L', label: 'L key panel' },
    { key: 'u', name: '15-panel-U', label: 'U key panel' },
    { key: 'o', name: '16-panel-O', label: 'O key panel' },
    { key: 'r', name: '17-panel-R', label: 'R key panel' },
  ];

  for (const { key, name, label } of panels) {
    await page.keyboard.press(key);
    await sleep(700);
    await cdpShot(client, page, name, label);
    await page.keyboard.press('Escape');
    await sleep(400);
  }

  console.log('\n=== PHASE 5: NUMBER KEY PANELS ===\n');
  for (const num of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    await page.keyboard.press(num);
    await sleep(600);
    await cdpShot(client, page, `18-key-${num}`, `Number key ${num}`);
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  console.log('\n=== PHASE 6: B KEY (EcosystemDashboard or Build) ===\n');
  await page.keyboard.press('b');
  await sleep(1000);
  await cdpShot(client, page, '20-B-key', 'B key - EcosystemDashboard or Build menu');

  // Check if panel opened
  const panelAfterB = await page.evaluate(() => {
    const panels = document.querySelectorAll('[class*="panel"], [class*="Panel"], [class*="modal"], [class*="Modal"]');
    const visible = [];
    panels.forEach(p => {
      const rect = p.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        visible.push({ class: p.className.slice(0, 60), w: rect.width, h: rect.height });
      }
    });
    return visible;
  });
  console.log('Panels visible after B key:', JSON.stringify(panelAfterB, null, 2));
  await page.keyboard.press('Escape');
  await sleep(400);

  console.log('\n=== PHASE 7: G KEY (SpectatorCamera) ===\n');
  await page.keyboard.press('g');
  await sleep(1200);
  await cdpShot(client, page, '21-G-key', 'G key - SpectatorCamera mode');
  // Toggle off
  await page.keyboard.press('g');
  await sleep(400);

  console.log('\n=== PHASE 8: TOOLBAR BUTTON SCAN ===\n');
  // Get all buttons with positions
  const allButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="button"]'))
      .map(btn => {
        const rect = btn.getBoundingClientRect();
        return {
          text: btn.innerText?.trim().slice(0, 30),
          title: btn.title?.slice(0, 30),
          ariaLabel: btn.getAttribute('aria-label')?.slice(0, 30),
          x: Math.round(rect.x), y: Math.round(rect.y),
          w: Math.round(rect.width), h: Math.round(rect.height),
          visible: rect.width > 0 && rect.height > 0
        };
      })
      .filter(b => b.visible);
  });
  console.log('All visible buttons:');
  allButtons.forEach(b => console.log(`  [${b.x},${b.y}] ${b.w}x${b.h} - "${b.text || b.title || b.ariaLabel || '?'}"`));

  // Click buttons in right column (x > 1350 for 1440px viewport)
  const rightToolbarBtns = allButtons.filter(b => b.x > 1350 && b.h < 80);
  console.log(`Found ${rightToolbarBtns.length} right-toolbar buttons`);

  for (let i = 0; i < Math.min(rightToolbarBtns.length, 8); i++) {
    const btn = rightToolbarBtns[i];
    const label = btn.title || btn.text || btn.ariaLabel || `btn${i}`;
    console.log(`Clicking button ${i + 1}: "${label}" at [${btn.x}, ${btn.y}]`);
    await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
    await sleep(700);
    await cdpShot(client, page, `25-toolbar-${i + 1}-${label.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}`, `Toolbar button: ${label}`);
    await page.keyboard.press('Escape');
    await sleep(400);
  }

  console.log('\n=== PHASE 9: MULTIPLE PANELS OPEN ===\n');
  await page.keyboard.press('i');
  await sleep(400);
  await page.keyboard.press('j');
  await sleep(600);
  await cdpShot(client, page, '30-two-panels', 'Two panels open simultaneously - check overlap');
  await page.keyboard.press('Escape');
  await sleep(400);

  console.log('\n=== PHASE 10: MOBILE LAYOUT (800px) ===\n');
  await page.setViewportSize({ width: 800, height: 900 });
  await sleep(1200);
  await cdpShot(client, page, '31-viewport-800px', 'Viewport at 800px wide');

  await page.keyboard.press('i');
  await sleep(700);
  await cdpShot(client, page, '32-800px-inventory', 'Inventory at 800px wide');
  await page.keyboard.press('Escape');
  await sleep(400);

  await page.setViewportSize({ width: 600, height: 900 });
  await sleep(800);
  await cdpShot(client, page, '33-viewport-600px', 'Viewport at 600px wide');

  // Restore
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(600);

  console.log('\n=== PHASE 11: SETTINGS/MENU ===\n');
  await page.keyboard.press('Escape');
  await sleep(800);
  await cdpShot(client, page, '40-escape-menu', 'Escape key - settings or pause menu?');

  console.log('\n=== FINAL STATE ===\n');
  await page.keyboard.press('Escape');
  await sleep(500);
  await cdpShot(client, page, '50-final-clean', 'Final clean game state');

  // Error report
  console.log('\n=== ERRORS ===');
  console.log(`Console errors: ${consoleErrors.length}`);
  consoleErrors.slice(0, 20).forEach(e => console.log('  ERR:', e.slice(0, 200)));
  console.log(`Page errors: ${pageErrors.length}`);
  pageErrors.slice(0, 10).forEach(e => console.log('  PAGE ERR:', e.slice(0, 200)));

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    viewport: '1440x900',
    consoleErrors: consoleErrors.slice(0, 50),
    pageErrors: pageErrors.slice(0, 20),
    allButtons,
    hudInfo,
    panelAfterB
  };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'playtest-data.json'), JSON.stringify(report, null, 2));

  await browser.close();
  console.log('\n=== PLAYTEST COMPLETE ===');
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
}

run().catch(err => {
  console.error('FATAL:', err.stack || err);
  process.exit(1);
});
