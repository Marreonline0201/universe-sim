import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
  console.log('Launching system Chrome...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,720',
    ],
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log('Navigating to http://localhost:5176...');
  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for 3D to initialize
  console.log('Waiting 10 seconds for 3D world to load...');
  await delay(10000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_001.png` });
  console.log('Frame 1 saved - initial state');

  // Find and click CLICK TO PLAY
  const clickPos = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.textContent && el.textContent.trim() === 'CLICK TO PLAY') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
      }
    }
    return { x: 640, y: 360 };
  });

  console.log('Clicking CLICK TO PLAY at', clickPos.x, clickPos.y);
  await page.mouse.click(clickPos.x, clickPos.y);
  await delay(3000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_002.png` });
  console.log('Frame 2 saved - after clicking play');

  // Inject simulated mousemove events to rotate camera (pointer lock game)
  // The game listens for mousemove events; we'll dispatch them via JS
  const injectMouseMove = async (dx, dy, steps = 20) => {
    const stepDx = Math.round(dx / steps);
    const stepDy = Math.round(dy / steps);
    for (let i = 0; i < steps; i++) {
      await page.evaluate((sdx, sdy) => {
        // Dispatch mousemove event that mimics pointer lock behavior
        const event = new MouseEvent('mousemove', {
          movementX: sdx,
          movementY: sdy,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        window.dispatchEvent(event);
        const canvas = document.querySelector('canvas');
        if (canvas) canvas.dispatchEvent(event);
      }, stepDx, stepDy);
      await delay(30);
    }
    await delay(200);
  };

  let frameNum = 3;

  const shotAndSave = async () => {
    if (frameNum > 30) return;
    const fp = `${SAVE_PATH}/vid_${String(frameNum).padStart(3, '0')}.png`;
    await page.screenshot({ path: fp });
    console.log(`Frame ${frameNum} saved`);
    frameNum++;
  };

  const moveForward = async (ms) => {
    await page.keyboard.down('W');
    await delay(ms);
    await page.keyboard.up('W');
    await delay(100);
  };

  // Try to move around and look around using injected mouse events
  // First, just move forward and take screenshots
  await moveForward(2000);
  await shotAndSave();

  // Turn right using injected events
  await injectMouseMove(300, 0, 30);
  await shotAndSave();

  await moveForward(2000);
  await shotAndSave();

  // Turn right more
  await injectMouseMove(300, 0, 30);
  await shotAndSave();

  await moveForward(2000);
  await shotAndSave();

  // Turn left a lot
  await injectMouseMove(-500, 0, 50);
  await shotAndSave();

  await moveForward(2000);
  await shotAndSave();

  await injectMouseMove(-300, 0, 30);
  await shotAndSave();

  await moveForward(2000);
  await shotAndSave();

  // Look down a bit to see ground resources
  await injectMouseMove(0, 150, 20);
  await shotAndSave();

  await moveForward(2000);
  await shotAndSave();

  await injectMouseMove(400, -100, 40);
  await shotAndSave();

  await moveForward(2000);
  await shotAndSave();

  await injectMouseMove(-400, 0, 40);
  await shotAndSave();

  await moveForward(2000);
  await shotAndSave();

  await injectMouseMove(200, 0, 20);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(-300, 50, 30);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  console.log(`Total frames captured: ${frameNum - 1}`);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
