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

  await page.screenshot({ path: `${SAVE_PATH}/fly2_001.png` });
  console.log('Frame 1 - overview');

  // Click CLICK TO PLAY
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
  await page.screenshot({ path: `${SAVE_PATH}/fly2_002.png` });
  console.log('Frame 2 - settings panel open');

  // Click FLY button (from previous run, it's at x=813, y=203)
  await page.mouse.click(813, 203);
  await delay(500);
  console.log('Clicked FLY button');

  // Set speed multiplier: click the speed input (at x=1001, y=232) and type 20
  await page.mouse.click(1001, 232, { clickCount: 3 }); // triple-click to select all
  await delay(300);
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await delay(300);
  console.log('Set speed to 20x');

  await page.screenshot({ path: `${SAVE_PATH}/fly2_003.png` });
  console.log('Frame 3 - settings configured');

  // Close settings by clicking ESC or clicking outside
  await page.keyboard.press('Escape');
  await delay(500);

  // Re-enter game by clicking canvas
  await page.mouse.click(640, 360);
  await delay(1500);
  await page.screenshot({ path: `${SAVE_PATH}/fly2_004.png` });
  console.log('Frame 4 - back in game');

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

  let fNum = 5;
  const shot = async (label = '') => {
    if (fNum > 30) return;
    const fp = `${SAVE_PATH}/fly2_${String(fNum).padStart(3, '0')}.png`;
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

  // FLY MODE: move down to ground level first, then fly forward fast
  // In fly mode, the camera direction controls movement
  // Look slightly downward to go toward equator (lower latitude)
  await injectMouseMove(0, 80); // tilt down toward equator
  await shot('- starting with fly mode');

  // With fly mode + 20x speed, should cover 1500m in ~5 seconds (14.4 * 20 * 4 = 1152 m/s!)
  // Actually FLY_SPEED = WALK_SPEED * 4 * speedMult = 6 * 4 * 20 = 480 m/s
  // So 1500m / 480 = 3.1 seconds

  // Fly toward equator for ~10 seconds (covers huge distance)
  await sprint(3000); await shot('fly 1 - 1440m traveled');
  await sprint(3000); await shot('fly 2 - 2880m traveled');
  await injectMouseMove(300, 0); await shot('turn right');
  await sprint(2000); await shot('fly 3');
  await injectMouseMove(-600, 0); await shot('turn left');
  await sprint(2000); await shot('fly 4');
  await injectMouseMove(300, -50); // level out and look at terrain
  await shot('look at terrain');
  await sprint(2000); await shot('fly 5');
  await sprint(2000); await shot('fly 6');
  await injectMouseMove(0, 100); // look down at terrain
  await shot('look down at terrain');
  await sprint(2000); await shot('fly 7');
  await injectMouseMove(-300, 0); await shot('scan left');
  await sprint(2000); await shot('fly 8');
  await injectMouseMove(300, 0); await shot('scan right');
  await sprint(2000); await shot('fly 9');
  await injectMouseMove(0, -50); // level up to see horizon
  await shot('level out - see horizon');
  await sprint(2000); await shot('fly 10');
  await sprint(2000); await shot('fly 11');

  console.log(`Total frames: ${fNum - 1}`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
