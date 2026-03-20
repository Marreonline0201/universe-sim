import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const txt = msg.text();
    if (!txt.startsWith('THREE.') && !txt.startsWith('[draco') && !txt.startsWith('[vite]') && !txt.startsWith('Download')) {
      if (txt.includes('fly') || txt.includes('speed') || txt.includes('FLY') || txt.includes('panel') || txt.includes('ESC')) {
        console.log('PAGE:', txt.substring(0, 200));
      }
    }
  });

  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Waiting 12s...');
  await delay(12000);

  await page.screenshot({ path: `${SAVE_PATH}/fly_001.png` });
  console.log('Frame 1 - overview');

  // Click to enter game
  const clickPos = await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.textContent && el.textContent.trim() === 'CLICK TO PLAY') {
        const r = el.getBoundingClientRect();
        if (r.width > 0) return { x: r.left + r.width/2, y: r.top + r.height/2 };
      }
    }
    return { x: 640, y: 360 };
  });
  await page.mouse.click(clickPos.x, clickPos.y);
  await delay(2000);
  await page.screenshot({ path: `${SAVE_PATH}/fly_002.png` });
  console.log('Frame 2 - entered game');

  // Press Escape to open Settings panel
  await page.keyboard.press('Escape');
  await delay(1000);
  await page.screenshot({ path: `${SAVE_PATH}/fly_003.png` });
  console.log('Frame 3 - after ESC (settings panel)');

  // Look for the Settings panel and click buttons
  const panelInfo = await page.evaluate(() => {
    const results = [];
    // Find all buttons
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text && text.length < 50) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          results.push({ text, x: r.left + r.width/2, y: r.top + r.height/2 });
        }
      }
    }
    // Also find divs that look like buttons (styled divs)
    const divs = document.querySelectorAll('div');
    for (const div of divs) {
      const text = div.textContent?.trim() || '';
      if ((text.includes('FLY') || text.includes('SPEED') || text.includes('Settings') || text.includes('ESC')) && text.length < 30) {
        const r = div.getBoundingClientRect();
        if (r.width > 5 && r.height > 5) {
          results.push({ text: '[DIV] ' + text, x: r.left + r.width/2, y: r.top + r.height/2 });
        }
      }
    }
    return results.slice(0, 20);
  });
  console.log('Panel buttons:', JSON.stringify(panelInfo, null, 2));

  // Find and click the FLY button
  const flyBtn = panelInfo.find(b => b.text.includes('FLY'));
  if (flyBtn) {
    console.log('Clicking FLY button at', flyBtn.x, flyBtn.y);
    await page.mouse.click(flyBtn.x, flyBtn.y);
    await delay(500);
    await page.screenshot({ path: `${SAVE_PATH}/fly_004.png` });
    console.log('Frame 4 - after FLY click');
  } else {
    console.log('FLY button not found, trying to find settings panel...');
    await page.screenshot({ path: `${SAVE_PATH}/fly_004.png` });
    console.log('Frame 4 - settings panel (manual check)');
  }

  // Also try to find speed input and set it to 20
  const speedInput = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="number"], input[type="range"]');
    for (const input of inputs) {
      const r = input.getBoundingClientRect();
      if (r.width > 0) return { x: r.left + r.width/2, y: r.top + r.height/2, value: input.value };
    }
    return null;
  });
  if (speedInput) {
    console.log('Found speed input:', speedInput);
    await page.mouse.click(speedInput.x, speedInput.y);
    await delay(200);
    await page.keyboard.selectAll();
    await page.keyboard.type('20');
    await page.keyboard.press('Enter');
    await delay(300);
  }

  // Click to re-enter game
  await page.mouse.click(640, 360);
  await delay(1500);
  await page.screenshot({ path: `${SAVE_PATH}/fly_005.png` });
  console.log('Frame 5 - back in game (fly mode?)');

  const injectMouseMove = async (dx, dy, steps = 20) => {
    const stepDx = Math.round(dx / steps);
    const stepDy = Math.round(dy / steps);
    for (let i = 0; i < steps; i++) {
      await page.evaluate((sdx, sdy) => {
        const e = new MouseEvent('mousemove', { movementX: sdx, movementY: sdy, bubbles: true });
        document.dispatchEvent(e);
      }, stepDx, stepDy);
      await delay(25);
    }
    await delay(300);
  };

  let fNum = 6;
  const shot = async (label = '') => {
    if (fNum > 30) return;
    const fp = `${SAVE_PATH}/fly_${String(fNum).padStart(3, '0')}.png`;
    await page.screenshot({ path: fp });
    console.log(`Frame ${fNum} saved ${label}`);
    fNum++;
  };

  const sprint = async (ms) => {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('W');
    await delay(ms);
    await page.keyboard.up('W');
    await page.keyboard.up('ShiftLeft');
    await delay(100);
  };

  // Fly forward and downward to scan the terrain quickly
  // First go forward to get away from spawn area
  await injectMouseMove(0, -100); // look slightly up/forward to fly over terrain
  await sprint(5000); await shot('sprint 1');
  await sprint(5000); await shot('sprint 2');
  await sprint(5000); await shot('sprint 3');
  await sprint(5000); await shot('sprint 4');
  await sprint(5000); await shot('sprint 5');
  await sprint(5000); await shot('sprint 6');
  await injectMouseMove(300, 0); await shot('turn right');
  await sprint(5000); await shot('sprint 7');
  await sprint(5000); await shot('sprint 8');
  await injectMouseMove(-600, 0); await shot('turn left');
  await sprint(5000); await shot('sprint 9');
  await sprint(5000); await shot('sprint 10');
  await injectMouseMove(0, 150); // look down to see terrain
  await shot('look down');
  await sprint(5000); await shot('sprint 11');
  await injectMouseMove(200, -100); await shot('pan');
  await sprint(5000); await shot('sprint 12');
  await sprint(5000); await shot('sprint 13');

  console.log(`Total frames: ${fNum - 1}`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
