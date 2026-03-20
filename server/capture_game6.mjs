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

  page.on('console', msg => {
    const txt = msg.text();
    if (txt.includes('[CAPTURE]')) console.log(txt);
  });

  console.log('Navigating to http://localhost:5176...');
  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for 3D to initialize
  console.log('Waiting 12 seconds for 3D world to load...');
  await delay(12000);

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
  console.log('Frame 2 saved');

  // Try to get resource node positions and spawn position via JS
  const gameInfo = await page.evaluate(() => {
    try {
      // Try to access the game store/state if exposed
      const allWindows = Object.keys(window);
      // Try to find Three.js scene
      const canvases = document.querySelectorAll('canvas');
      const info = { canvasCount: canvases.length };

      // Check if there's a __THREE__ or similar debug global
      if (window.__THREE__) info.threeVersion = window.__THREE__;

      // Try to find Zustand store
      const storeKeys = allWindows.filter(k =>
        k.includes('store') || k.includes('game') || k.includes('player') || k.includes('use')
      );
      info.storeKeys = storeKeys.slice(0, 10);

      return info;
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Game info:', JSON.stringify(gameInfo));

  // Inject simulated mousemove events that go directly to document
  const injectMouseMove = async (dx, dy, steps = 20) => {
    const stepDx = Math.round(dx / steps);
    const stepDy = Math.round(dy / steps);
    for (let i = 0; i < steps; i++) {
      await page.evaluate((sdx, sdy) => {
        const eventInit = {
          movementX: sdx,
          movementY: sdy,
          bubbles: true,
          cancelable: true,
          clientX: 640,
          clientY: 360,
        };
        document.dispatchEvent(new MouseEvent('mousemove', eventInit));
        window.dispatchEvent(new MouseEvent('mousemove', eventInit));
      }, stepDx, stepDy);
      await delay(25);
    }
    await delay(300);
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
    await delay(150);
  };

  const sprint = async (ms) => {
    // Hold shift + W to sprint if sprint exists, otherwise just W
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('W');
    await delay(ms);
    await page.keyboard.up('W');
    await page.keyboard.up('ShiftLeft');
    await delay(150);
  };

  // Move forward aggressively to find resources
  // Resources are within 200/2000 radians = 0.1 radians = ~200m of north pole spawn dir
  // But player may have spawned away from north pole
  // Try moving in different directions

  // Phase 1: forward for a while
  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(200, 0);
  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(200, 0);
  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(200, 0);
  await moveForward(3000);
  await shotAndSave();

  // Phase 2: turn back and go different direction
  await injectMouseMove(-800, 0);
  await shotAndSave();
  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(-400, 0);
  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(-400, 0);
  await moveForward(3000);
  await shotAndSave();

  // Phase 3: Look down and move
  await injectMouseMove(0, 200);
  await moveForward(2000);
  await shotAndSave();
  await moveForward(2000);
  await shotAndSave();

  // Look back up
  await injectMouseMove(0, -150);
  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(500, 0);
  await moveForward(3000);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(-300, 100);
  await moveForward(3000);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await injectMouseMove(200, -100);
  await moveForward(3000);
  await shotAndSave();

  console.log(`Total frames captured: ${frameNum - 1}`);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
