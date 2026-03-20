import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
  console.log('Launching system Chrome with GPU support...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,720',
      '--start-maximized',
    ],
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERR:', msg.text().substring(0, 120));
  });

  console.log('Navigating to http://localhost:5176...');
  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for Three.js/WebGL to initialize
  console.log('Waiting for 3D to initialize (8 seconds)...');
  await delay(8000);

  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: false };
    const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
    // Check if canvas has actual pixels
    if (ctx) {
      const pixels = new Uint8Array(4);
      ctx.readPixels(canvas.width/2, canvas.height/2, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);
      return { found: true, width: canvas.width, height: canvas.height, centerPixel: Array.from(pixels) };
    }
    return { found: true, width: canvas.width, height: canvas.height, noCtx: true };
  });
  console.log('Canvas info:', JSON.stringify(canvasInfo));

  await page.screenshot({ path: `${SAVE_PATH}/vid_001.png` });
  console.log('Frame 1 saved');

  // Find and click "CLICK TO PLAY"
  const clickPos = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.children.length === 0 && el.textContent && el.textContent.includes('CLICK TO PLAY')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
      }
    }
    // fallback: find any button-like element with CLICK
    for (const el of all) {
      if (el.textContent && el.textContent.trim() === 'CLICK TO PLAY') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
      }
    }
    return null;
  });

  if (clickPos) {
    console.log('Clicking CLICK TO PLAY at', clickPos.x, clickPos.y);
    await page.mouse.click(clickPos.x, clickPos.y);
  } else {
    console.log('CLICK TO PLAY not found, clicking canvas center');
    await page.mouse.click(640, 360);
  }

  await delay(2000);
  await page.screenshot({ path: `${SAVE_PATH}/vid_002.png` });
  console.log('Frame 2 saved');

  // Click again to make sure pointer is locked
  await page.mouse.click(640, 360);
  await delay(1000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_003.png` });
  console.log('Frame 3 saved');

  let frameNum = 4;
  let mouseX = 640, mouseY = 360;

  // Movement sequence
  const steps = [
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 250, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 250, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: -450, dy: 30 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: -350, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 300, dy: -30 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: 400, dy: 0 },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'key', key: 'W', hold: 2000 },
    { type: 'shot' },
    { type: 'mouse', dx: -500, dy: 80 },
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
      const newY = Math.max(150, Math.min(570, mouseY + step.dy));
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
  console.error(err.stack);
  process.exit(1);
});
