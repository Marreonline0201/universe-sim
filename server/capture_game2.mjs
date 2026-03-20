import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';

async function main() {
  console.log('Launching browser with WebGL support...');
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,720',
      '--use-gl=desktop',
      '--enable-webgl',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
    ],
    defaultViewport: { width: 1280, height: 720 },
    executablePath: undefined, // use bundled chromium
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Listen for console logs from page
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text().substring(0, 100));
  });

  console.log('Navigating to http://localhost:5176...');
  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the page to load and 3D to initialize
  await delay(5000);

  // Check if canvas exists and has content
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: false };
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      found: true,
      width: canvas.width,
      height: canvas.height,
      hasCtx: !!ctx,
    };
  });
  console.log('Canvas info:', JSON.stringify(canvasInfo));

  // Take screenshot to check state
  await page.screenshot({ path: `${SAVE_PATH}/vid_001.png` });
  console.log('Frame 1 saved');

  // Try to click "CLICK TO PLAY"
  try {
    // Find any element with "CLICK" text
    const clickElem = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.innerText && el.innerText.includes('CLICK TO PLAY')) {
          const rect = el.getBoundingClientRect();
          return { x: rect.left + rect.width/2, y: rect.top + rect.height/2, text: el.innerText };
        }
      }
      return null;
    });
    if (clickElem) {
      console.log('Found CLICK TO PLAY at', clickElem.x, clickElem.y);
      await page.mouse.click(clickElem.x, clickElem.y);
    } else {
      console.log('CLICK TO PLAY not found, clicking center');
      await page.mouse.click(640, 360);
    }
  } catch(e) {
    console.log('Click error:', e.message);
    await page.mouse.click(640, 360);
  }

  await delay(2000);
  await page.screenshot({ path: `${SAVE_PATH}/vid_002.png` });
  console.log('Frame 2 saved');

  // Click again to lock pointer
  await page.mouse.click(640, 360);
  await delay(1500);
  await page.screenshot({ path: `${SAVE_PATH}/vid_003.png` });
  console.log('Frame 3 saved');

  let frameNum = 4;
  let mouseX = 640, mouseY = 360;

  const steps = [
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 300, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 300, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: -500, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: -300, dy: 50 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 200, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 500, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: -500, dy: 100 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
  ];

  for (const step of steps) {
    if (frameNum > 30) break;

    if (step.type === 'key') {
      await page.keyboard.down(step.key);
      await delay(step.hold);
      await page.keyboard.up(step.key);
      await delay(100);
    } else if (step.type === 'shot') {
      const fp = `${SAVE_PATH}/vid_${String(frameNum).padStart(3, '0')}.png`;
      await page.screenshot({ path: fp });
      console.log(`Frame ${frameNum} saved`);
      frameNum++;
    } else if (step.type === 'mouse') {
      const newX = Math.max(200, Math.min(1080, mouseX + step.dx));
      const newY = Math.max(200, Math.min(520, mouseY + step.dy));
      await page.mouse.move(newX, newY, { steps: 30 });
      mouseX = newX;
      mouseY = newY;
      await delay(400);
    }
  }

  console.log(`Total frames captured: ${frameNum - 1}`);
  await browser.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
