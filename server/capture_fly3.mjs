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

  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Waiting 12s...');
  await delay(12000);

  // Click CLICK TO PLAY to enter game
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

  // Open settings with Escape
  await page.keyboard.press('Escape');
  await delay(1000);

  // Click FLY button (confirmed position from previous run: x=813, y=203)
  await page.mouse.click(813, 203);
  await delay(500);
  console.log('Clicked FLY button');

  // Set speed to 20: click the speed input (at x=1001, y=232)
  await page.mouse.click(1001, 232, { clickCount: 3 });
  await delay(200);
  await page.keyboard.type('20');
  await page.keyboard.press('Tab');
  await delay(300);
  console.log('Set speed to 20');

  // Check state of FLY button and read current settings
  const settingsState = await page.evaluate(() => {
    const result = {};
    // Find FLY button
    for (const el of document.querySelectorAll('*')) {
      if (el.textContent && el.textContent.includes('FLY')) {
        result.flyText = el.textContent.trim();
      }
    }
    // Find speed input value
    const inputs = document.querySelectorAll('input');
    for (const inp of inputs) {
      result.inputValue = inp.value;
    }
    return result;
  });
  console.log('Settings state:', JSON.stringify(settingsState));

  await page.screenshot({ path: `${SAVE_PATH}/fly3_001.png` });
  console.log('Frame 1 - settings open with fly mode');

  // Close the settings panel by clicking the ✕ button (confirmed: x=1201, y=26)
  await page.mouse.click(1201, 26);
  await delay(1000);
  await page.screenshot({ path: `${SAVE_PATH}/fly3_002.png` });
  console.log('Frame 2 - after closing settings');

  // Check if pointer is locked
  const isLocked = await page.evaluate(() => !!document.pointerLockElement);
  console.log('Pointer locked:', isLocked);

  // Click the canvas to lock the pointer
  await page.mouse.click(640, 360);
  await delay(1500);

  const isLocked2 = await page.evaluate(() => !!document.pointerLockElement);
  console.log('Pointer locked after canvas click:', isLocked2);

  await page.screenshot({ path: `${SAVE_PATH}/fly3_003.png` });
  console.log('Frame 3 - in game (fly mode active, pointer locked)');

  const injectMouseMove = async (dx, dy, steps = 20) => {
    const stepDx = Math.round(dx / steps);
    const stepDy = Math.round(dy / steps);
    for (let i = 0; i < steps; i++) {
      await page.evaluate((sdx, sdy) => {
        if (document.pointerLockElement) {
          const e = new MouseEvent('mousemove', { movementX: sdx, movementY: sdy, bubbles: true });
          document.dispatchEvent(e);
        } else {
          // Even without pointer lock, dispatch to document
          const e = new MouseEvent('mousemove', { movementX: sdx, movementY: sdy, bubbles: true });
          document.dispatchEvent(e);
          window.dispatchEvent(e);
        }
      }, stepDx, stepDy);
      await delay(25);
    }
    await delay(300);
  };

  let fNum = 4;
  const shot = async (label = '') => {
    if (fNum > 30) return;
    const fp = `${SAVE_PATH}/fly3_${String(fNum).padStart(3, '0')}.png`;
    await page.screenshot({ path: fp });
    const locked = await page.evaluate(() => !!document.pointerLockElement);
    console.log(`Frame ${fNum} saved ${label} (locked: ${locked})`);
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

  await shot('initial fly position');

  // Tilt down slightly to fly toward equator
  await injectMouseMove(0, 80);
  await shot('tilted toward equator');

  // Fly fast! With 20x speed + fly mode: 6 * 4 * 20 = 480 m/s
  // Cover 3000m in ~6.25 seconds to reach temperate forest
  await sprint(5000); await shot('fly burst 1 - ~2400m');
  await sprint(5000); await shot('fly burst 2 - ~4800m');

  // We should now be well into temperate or tropical zone
  // Look around
  await injectMouseMove(0, -80); // look up/level
  await shot('leveled out');
  await injectMouseMove(300, 0);
  await shot('scan right');
  await injectMouseMove(-600, 0);
  await shot('scan left');
  await injectMouseMove(300, 100); // look down at terrain
  await shot('look down at terrain');
  await sprint(3000); await shot('fly burst 3');
  await sprint(3000); await shot('fly burst 4');
  await injectMouseMove(0, -100); // look at horizon
  await shot('look at horizon');
  await sprint(3000); await shot('fly burst 5');
  await injectMouseMove(400, 0);
  await shot('scan right');
  await sprint(2000); await shot('fly burst 6');
  await injectMouseMove(-400, 0);
  await shot('scan left');
  await sprint(2000); await shot('fly burst 7');
  await injectMouseMove(0, 80);
  await sprint(2000); await shot('fly burst 8 - lower');

  console.log(`Total frames: ${fNum - 1}`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
