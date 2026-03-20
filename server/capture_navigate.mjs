import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Computed from spawn analysis:
// Spawn is at (686, 2007, -250) - direction (0.32, 0.94, -0.12)
// Wood nodes are near XZ=(0, 0) i.e., north pole area
// We need to walk roughly toward XZ=(-686, +250) from spawn
// That's roughly Northwest on the planet surface

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
  console.log('Waiting 12s for 3D to load...');
  await delay(12000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_001.png` });
  console.log('Frame 1 - initial');

  // Find and click CLICK TO PLAY
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
  console.log('Clicked play');
  await delay(2000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_002.png` });
  console.log('Frame 2 - after play');

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
    await delay(200);
  };

  let frameNum = 3;
  const shot = async (label = '') => {
    if (frameNum > 30) return;
    const fp = `${SAVE_PATH}/vid_${String(frameNum).padStart(3, '0')}.png`;
    await page.screenshot({ path: fp });
    console.log(`Frame ${frameNum} saved ${label}`);
    frameNum++;
  };

  // Sprint forward while holding Shift+W
  // We need to cover ~730m; at 14.4 m/s sprint speed, ~51 seconds
  // But we also need to navigate in the right direction
  // The spawn direction in XZ is (0.32, -0.12) normalized, so player initially faces
  // roughly the same direction as the spawn offset from origin.
  // We need to turn to face toward (0,0) from (686, -250) = direction (-686, 250)
  // Normalized: (-0.939, 0.343) in XZ

  // The camera initial facing direction is unknown without knowing where it points
  // Let's try to turn left (negative X from current facing) to face toward the nodes

  const sprint = async (ms) => {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('W');
    await delay(ms);
    await page.keyboard.up('W');
    await page.keyboard.up('ShiftLeft');
    await delay(100);
  };

  const fwd = async (ms) => {
    await page.keyboard.down('W');
    await delay(ms);
    await page.keyboard.up('W');
    await delay(100);
  };

  // First, take a screenshot to see where we are and which way we face
  await shot('- initial position');

  // Sprint forward for ~30 seconds, taking screenshots along the way
  // to try to find the wood node area
  // The nodes are ~730m away. At sprint speed 14.4 m/s, we need ~51s
  // Let's sprint for ~60 seconds while occasionally checking

  // Try different turn amounts to find the right direction
  // Turn left significantly to face toward (0,0) from spawn
  await injectMouseMove(-200, 0);
  await shot('after initial turn');

  // Sprint in bursts with screenshots
  for (let burst = 0; burst < 10; burst++) {
    await sprint(5000); // 5 second sprint = ~72m
    await shot(`burst ${burst+1} - ~${(burst+1)*72}m traveled`);
    if (frameNum > 28) break;
  }

  // Take a few more with camera panning
  await injectMouseMove(200, 0);
  await shot('pan right');
  await injectMouseMove(-400, 0);
  await shot('pan left');
  await injectMouseMove(200, 100);
  await shot('look down');

  console.log(`Total frames: ${frameNum - 1}`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
