const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = 'C:\\Users\\ddogr\\OneDrive\\Desktop\\Questions\\universe-sim\\playtest-screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page, name, label) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false, timeout: 10000 });
    console.log(`[SCREENSHOT] ${label} -> ${file}`);
  } catch(e) {
    console.log(`[SCREENSHOT FAILED] ${label}: ${e.message}`);
  }
  return file;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-web-security', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    ignoreHTTPSErrors: true
  });

  const logs = [];
  const page = await context.newPage();

  page.on('dialog', async dialog => {
    console.log(`[DIALOG] type=${dialog.type()} message="${dialog.message()}"`);
    await dialog.accept().catch(() => {});
  });

  page.on('console', msg => {
    const text = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    logs.push(text);
    const t = msg.text();
    if (msg.type() === 'error') console.error(text);
    else if (t.includes('organism') || t.includes('bootstrap') || t.includes('Bootstrap') ||
             t.includes('tick') || t.includes('Tick') || t.includes('sim') || t.includes('Sim')) {
      console.log(text);
    }
  });
  page.on('pageerror', err => {
    console.error(`[PAGE_ERROR] ${err.message}`);
    logs.push(`[PAGE_ERROR] ${err.message}`);
  });

  console.log('\n=== PHASE 1: INITIAL LOAD ===');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'commit', timeout: 15000 });
  } catch(e) {
    console.log(`[GOTO] ${e.message} - continuing`);
  }
  await sleep(6000);
  await shot(page, '01_cold_load', 'Cold load after 6s');

  // Read the page title and visible content
  const title = await page.title().catch(() => 'N/A');
  console.log(`[PAGE] Title: "${title}"`);

  // Check for CLICK TO PLAY
  const clickToPlay = await page.locator('text=CLICK TO PLAY').first().isVisible({ timeout: 2000 }).catch(() => false);
  console.log(`[CHECK] CLICK TO PLAY overlay: ${clickToPlay}`);
  if (clickToPlay) {
    await page.locator('text=CLICK TO PLAY').first().click({ timeout: 5000 }).catch(e => console.log(`Click failed: ${e.message}`));
    await sleep(3000);
    await shot(page, '02_entered_game', 'After entering game');
  }

  console.log('\n=== PHASE 2: RPG BLEED AUDIT ===');
  // Specific RPG elements that should be GONE
  const checks = {
    'DUNGEON widget': 'text=DUNGEON',
    'FLOOR widget': 'text=FLOOR 1',
    'ADVANCE FLOOR': 'text=ADVANCE FLOOR',
    'Spring Festival': 'text=Spring Festival',
    'XP x boost': 'text=XP x',
    'HP bar': 'text=HP',
    'Hunger bar': 'text=Hunger',
    'Stamina bar': 'text=Stamina',
    'Thirst bar': 'text=Thirst',
    'Warmth bar': 'text=Warmth',
  };

  for (const [label, selector] of Object.entries(checks)) {
    const visible = await page.locator(selector).first().isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`  ${label}: ${visible ? 'STILL VISIBLE (BAD)' : 'hidden (good)'}`);
  }

  // Count toolbar buttons
  const toolbarBtns = await page.locator('[class*="sidebar"] button, [class*="Sidebar"] button, [class*="toolbar"] button').count().catch(() => 0);
  console.log(`  Toolbar button count: ${toolbarBtns}`);

  // What sim buttons ARE there?
  const simBtns = {
    'Map button': 'button:has-text("MAP"), button:has-text("Map")',
    'Codex button': 'button:has-text("CODEX"), button:has-text("Codex")',
    'World Events': 'button:has-text("WORLD"), button:has-text("Events")',
    'Ecosystem/Eco': 'button:has-text("ECO"), button:has-text("Ecosystem")',
  };
  for (const [label, selector] of Object.entries(simBtns)) {
    const visible = await page.locator(selector).first().isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`  ${label}: ${visible ? 'visible' : 'not found'}`);
  }

  await shot(page, '03_ui_audit', 'UI state for RPG bleed audit');

  // Capture toolbar region specifically
  const sidebarBox = await page.locator('[class*="sidebar"], [class*="Sidebar"]').first().boundingBox().catch(() => null);
  if (sidebarBox) {
    console.log(`[SIDEBAR] Found at x=${sidebarBox.x} y=${sidebarBox.y} w=${sidebarBox.width} h=${sidebarBox.height}`);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03b_sidebar.png'),
      clip: { x: Math.max(0, sidebarBox.x), y: Math.max(0, sidebarBox.y), width: Math.min(sidebarBox.width + 20, 300), height: Math.min(sidebarBox.height, 800) },
      timeout: 8000
    }).catch(e => console.log(`Sidebar screenshot failed: ${e.message}`));
    console.log('[SCREENSHOT] Sidebar detail captured');
  }

  console.log('\n=== PHASE 3: TUTORIAL / ONBOARDING TEXT ===');
  // Read all visible text from page
  const visibleTexts = await page.evaluate(() => {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t.length > 3) results.push(t);
    }
    return [...new Set(results)];
  });

  console.log(`[VISIBLE TEXT] Found ${visibleTexts.length} unique text nodes:`);
  // Show first 80 texts
  visibleTexts.slice(0, 80).forEach((t, i) => console.log(`  ${i}: "${t}"`));

  // Specifically look for tutorial-relevant strings
  const tutorialKeywords = ['WASD', 'move', 'spectator', 'Spectator', 'G key', '[G]', 'ecosystem', 'Ecosystem', 'organism', 'seed', 'Seed', 'press G', 'press B', 'press O'];
  for (const kw of tutorialKeywords) {
    const found = visibleTexts.some(t => t.includes(kw));
    if (found) {
      const match = visibleTexts.find(t => t.includes(kw));
      console.log(`  [KEYWORD FOUND] "${kw}" in: "${match}"`);
    }
  }

  console.log('\n=== PHASE 4: SPECTATOR MODE (G KEY) ===');
  // Click on the canvas first to ensure focus
  const canvas = await page.locator('canvas').first().boundingBox().catch(() => null);
  if (canvas) {
    await page.mouse.click(canvas.x + canvas.width/2, canvas.y + canvas.height/2);
    console.log('[CANVAS] Clicked canvas to focus');
    await sleep(500);
  }

  await page.keyboard.press('g');
  console.log('[KEY] Pressed G');
  await sleep(3000);
  await shot(page, '04_spectator_mode', 'Spectator mode after G key');

  const spectatorBadge = await page.locator('text=SPECTATOR').first().isVisible({ timeout: 2000 }).catch(() => false);
  console.log(`[SPECTATOR] Badge visible: ${spectatorBadge}`);

  // Move camera around to look for organisms
  await page.keyboard.press('w');
  await sleep(800);
  await page.keyboard.press('e');
  await sleep(800);
  await shot(page, '05_spectator_moved', 'After spectator camera movement');

  // Count canvases and check for WebGL
  const sceneInfo = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    return {
      count: canvases.length,
      sizes: canvases.map(c => `${c.width}x${c.height}`),
      hasWebGL: canvases.some(c => {
        try { return !!c.getContext('webgl2') || !!c.getContext('webgl'); } catch(e) { return false; }
      })
    };
  });
  console.log(`[3D SCENE] Canvases: ${sceneInfo.count}, Sizes: ${sceneInfo.sizes.join(', ')}, WebGL: ${sceneInfo.hasWebGL}`);

  console.log('\n=== PHASE 5: ECOSYSTEM DASHBOARD ===');
  // Exit spectator
  await page.keyboard.press('g');
  await sleep(500);
  // Open dashboard
  await page.keyboard.press('b');
  await sleep(2000);
  await shot(page, '06_ecosystem_dashboard', 'Ecosystem Dashboard');

  const dashVisible = await page.locator('text=Ecosystem').first().isVisible({ timeout: 2000 }).catch(() => false);
  console.log(`[DASHBOARD] "Ecosystem" text visible: ${dashVisible}`);

  // Get dashboard content
  const dashContent = await page.evaluate(() => {
    // Find any panel that might be the ecosystem dashboard
    const panels = Array.from(document.querySelectorAll('[class*="panel"], [class*="Panel"], [class*="dashboard"], [class*="Dashboard"], [class*="ecosystem"], [class*="Ecosystem"]'));
    for (const p of panels) {
      const text = p.textContent.trim();
      if (text.includes('Tick') || text.includes('organism') || text.includes('Organism') || text.includes('Ecosystem')) {
        return { found: true, text: text.substring(0, 500), className: p.className };
      }
    }
    return { found: false, text: document.body.innerText.substring(0, 800) };
  });
  console.log(`[DASHBOARD CONTENT] Found: ${dashContent.found}`);
  if (dashContent.found) {
    console.log(`  Class: ${dashContent.className}`);
    console.log(`  Text: "${dashContent.text}"`);
  } else {
    console.log(`  Body text sample: "${dashContent.text}"`);
  }

  // Watch ticks for 20 seconds
  console.log('[WATCHING] Tick counter for 20 seconds...');
  let prevTickVal = null;
  let tickChanged = false;
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    const tickVal = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        const t = node.textContent.trim();
        if (t.match(/^Ticks?:\s*\d+/) || t.match(/^\d+$/) && node.parentElement?.textContent?.includes('Tick')) {
          return t;
        }
      }
      // Broader search
      const all = document.body.innerText;
      const match = all.match(/Ticks?\s*[:\s]\s*(\d+)/);
      return match ? match[0] : null;
    });
    console.log(`  t+${(i+1)*2}s: Tick value = "${tickVal}"`);
    if (tickVal && prevTickVal && tickVal !== prevTickVal) tickChanged = true;
    prevTickVal = tickVal;
  }
  console.log(`[TICKS] Did tick counter change? ${tickChanged}`);

  await shot(page, '07_dashboard_after_20s', 'Dashboard after 20 seconds watching');

  // Check for 2D dot map
  const dotMapInfo = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg');
    const circles = document.querySelectorAll('svg circle');
    const canvases2d = Array.from(document.querySelectorAll('canvas')).filter(c => {
      try { return !!c.getContext('2d'); } catch(e) { return false; }
    });
    return {
      svgCount: svgs.length,
      circleCount: circles.length,
      canvas2dCount: canvases2d.length
    };
  });
  console.log(`[DOT MAP] SVGs: ${dotMapInfo.svgCount}, Circles: ${dotMapInfo.circleCount}, 2D Canvases: ${dotMapInfo.canvas2dCount}`);

  // Get births/deaths/population if visible
  const statsSearch = await page.evaluate(() => {
    const text = document.body.innerText;
    const patterns = [
      /Organism[s]?\s*[:\s]\s*(\d+)/i,
      /Species\s*[:\s]\s*(\d+)/i,
      /Birth[s]?\s*[:\s]\s*(\d+)/i,
      /Death[s]?\s*[:\s]\s*(\d+)/i,
      /Tick[s]?\s*[:\s]\s*(\d+)/i,
    ];
    return patterns.map(p => {
      const m = text.match(p);
      return m ? m[0] : null;
    }).filter(Boolean);
  });
  console.log(`[STATS FOUND]: ${JSON.stringify(statsSearch)}`);

  console.log('\n=== PHASE 6: FIRST IMPRESSION SWEEP ===');
  await page.keyboard.press('b'); // close dashboard
  await sleep(1000);
  await shot(page, '08_final_state', 'Final state - overall impression');

  // Get full visible text for impression
  const finalTexts = await page.evaluate(() => {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t.length > 2) results.push(t);
    }
    return [...new Set(results)];
  });
  console.log(`[FINAL VISIBLE TEXT] ${finalTexts.length} nodes:`);
  finalTexts.slice(0, 100).forEach((t, i) => console.log(`  ${i}: "${t}"`));

  // Save logs
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'console-logs.txt'), logs.join('\n'));
  console.log(`\n[DONE] Console logs: ${logs.length} entries, saved`);
  console.log(`[DONE] Screenshots in: ${SCREENSHOT_DIR}`);

  await sleep(1000);
  await browser.close();
})();
