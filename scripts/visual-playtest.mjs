/**
 * Visual Playtest Script - Universe Sim
 * Takes systematic screenshots of every major UI state
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

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function shot(page, name, description) {
  const filename = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filename, fullPage: false, timeout: 10000 });
  console.log(`[SCREENSHOT] ${name}: ${description}`);
  return filename;
}

async function waitAndShot(page, name, description, waitMs = 800) {
  await page.waitForTimeout(waitMs);
  return shot(page, name, description);
}

async function run() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--window-size=1440,900',
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Block external fonts that cause screenshot hangs
    serviceWorkers: 'block'
  });

  // Block font requests that cause screenshot timeouts
  await context.route('**/{fonts,font}.googleapis.com/**', route => route.abort());
  await context.route('**/fonts.gstatic.com/**', route => route.abort());

  const page = await context.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  console.log('\n=== PHASE 1: INITIAL LOAD ===\n');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(4000);
  await shot(page, '01-initial-load', 'Cold start - before any interaction');

  // Log what is visible
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Visible text on load:', bodyText.replace(/\n/g, ' | '));

  console.log('\n=== PHASE 2: CLICK TO PLAY ===\n');
  // Try clicking the overlay/play button
  const clickToPlay = page.locator('text=CLICK TO PLAY').first();
  const hasClickToPlay = await clickToPlay.count() > 0;
  console.log('Has CLICK TO PLAY:', hasClickToPlay);

  if (hasClickToPlay) {
    await clickToPlay.click();
    await page.waitForTimeout(1500);
    await shot(page, '02-after-click-to-play', 'After clicking CLICK TO PLAY overlay');
  } else {
    // Try clicking anywhere on the screen
    await page.mouse.click(720, 450);
    await page.waitForTimeout(1500);
    await shot(page, '02-after-click-center', 'After clicking center of screen');
  }

  console.log('\n=== PHASE 3: HUD ANALYSIS ===\n');
  await shot(page, '03-hud-default', 'Default HUD with no panels open - full view');

  // Check what HUD elements are present
  const hudElements = await page.evaluate(() => {
    const elements = [];
    document.querySelectorAll('[class*="hud"], [class*="HUD"], [class*="toolbar"], [class*="Toolbar"]').forEach(el => {
      elements.push({ tag: el.tagName, class: el.className.slice(0, 80), text: el.innerText?.slice(0, 50) });
    });
    return elements;
  });
  console.log('HUD elements found:', JSON.stringify(hudElements, null, 2));

  console.log('\n=== PHASE 4: PANEL TESTS ===\n');

  // Test I key - Inventory
  await page.keyboard.press('i');
  await waitAndShot(page, '04-inventory-I-key', 'Inventory panel opened with I key', 800);

  // Close it then try J
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('j');
  await waitAndShot(page, '05-journal-J-key', 'Journal panel opened with J key', 800);

  // Close and try M
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('m');
  await waitAndShot(page, '06-map-M-key', 'Map panel opened with M key', 800);

  // Close and try more panels
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Try Tab key for character
  await page.keyboard.press('Tab');
  await waitAndShot(page, '07-tab-character', 'Tab key pressed - character panel?', 800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Try C key
  await page.keyboard.press('c');
  await waitAndShot(page, '08-C-key', 'C key pressed', 800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Try S key
  await page.keyboard.press('s');
  await waitAndShot(page, '09-S-key', 'S key pressed', 800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Try Q key
  await page.keyboard.press('q');
  await waitAndShot(page, '10-Q-key', 'Q key pressed', 800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Try K key
  await page.keyboard.press('k');
  await waitAndShot(page, '11-K-key', 'K key pressed', 800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Scroll the toolbar and click buttons - first find the toolbar
  console.log('\n=== TOOLBAR BUTTON SCAN ===\n');
  const toolbarButtons = await page.evaluate(() => {
    const btns = [];
    // Look for toolbar buttons
    document.querySelectorAll('button, [role="button"]').forEach(btn => {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        btns.push({
          text: btn.innerText?.slice(0, 30),
          title: btn.title,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height)
        });
      }
    });
    return btns;
  });
  console.log('All visible buttons:', JSON.stringify(toolbarButtons, null, 2));

  // Click buttons in the right-side toolbar area (x > 1300 on 1440px width)
  const rightButtons = toolbarButtons.filter(b => b.x > 1300);
  console.log('Right-side buttons:', JSON.stringify(rightButtons, null, 2));

  for (let i = 0; i < Math.min(rightButtons.length, 6); i++) {
    const btn = rightButtons[i];
    await page.mouse.click(btn.x + btn.w / 2, btn.y + btn.h / 2);
    await page.waitForTimeout(600);
    await shot(page, `12-toolbar-btn-${i + 1}-${(btn.title || btn.text || 'unknown').replace(/[^a-z0-9]/gi, '_').slice(0, 20)}`, `Toolbar button ${i + 1}: ${btn.title || btn.text}`);
    // Close panel before next
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  console.log('\n=== PHASE 5: B KEY - ECOSYSTEM/BUILD ===\n');
  await page.keyboard.press('b');
  await waitAndShot(page, '20-B-key', 'B key pressed - should open EcosystemDashboard or Build', 1000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  console.log('\n=== PHASE 6: G KEY - SPECTATOR CAMERA ===\n');
  await page.keyboard.press('g');
  await waitAndShot(page, '21-G-key', 'G key pressed - SpectatorCamera or other', 1200);
  // Press G again to toggle off
  await page.keyboard.press('g');
  await page.waitForTimeout(400);

  console.log('\n=== PHASE 7: OTHER KEY TESTS ===\n');

  // Test number keys (1-5 for quick slots or panels)
  for (const key of ['1', '2', '3', '4', '5']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    await shot(page, `22-key-${key}`, `Key ${key} pressed`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Test H key
  await page.keyboard.press('h');
  await waitAndShot(page, '23-H-key', 'H key pressed', 600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Test F key
  await page.keyboard.press('f');
  await waitAndShot(page, '24-F-key', 'F key pressed', 600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Test P key
  await page.keyboard.press('p');
  await waitAndShot(page, '25-P-key', 'P key pressed', 600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\n=== PHASE 8: MOBILE LAYOUT (800px wide) ===\n');
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(1000);
  await shot(page, '30-mobile-800px', 'Layout at 800px wide');

  // Try opening a panel at narrow width
  await page.keyboard.press('i');
  await waitAndShot(page, '31-mobile-inventory', 'Inventory panel at 800px wide', 800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Try even narrower
  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForTimeout(800);
  await shot(page, '32-mobile-600px', 'Layout at 600px wide');

  // Restore full size
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);

  console.log('\n=== PHASE 9: STRESS TEST - MULTIPLE PANELS ===\n');
  // Open multiple panels in sequence without closing
  await page.keyboard.press('i');
  await page.waitForTimeout(400);
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  await shot(page, '40-two-panels', 'Two panels open simultaneously - Inventory and Journal');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // Final clean state
  await shot(page, '50-final-state', 'Final game state after all tests');

  // Report errors
  console.log('\n=== ERROR REPORT ===\n');
  console.log('Console errors collected:', consoleErrors.length);
  consoleErrors.forEach(e => console.log('  ERROR:', e));
  console.log('Page errors collected:', pageErrors.length);
  pageErrors.forEach(e => console.log('  PAGE ERROR:', e));

  // Write error report
  const errorReport = {
    timestamp: new Date().toISOString(),
    consoleErrors,
    pageErrors,
    toolbarButtons,
    rightButtons
  };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'error-report.json'), JSON.stringify(errorReport, null, 2));

  await browser.close();
  console.log('\n=== PLAYTEST COMPLETE ===');
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
