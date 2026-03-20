import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Use Windows-accessible path for screenshots
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';

async function main() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,720',
      '--disable-web-security',
    ],
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log('Navigating to http://localhost:5176...');
  await page.goto('http://localhost:5176', { waitUntil: 'networkidle2', timeout: 30000 });

  await delay(2000);
  await page.screenshot({ path: `${SAVE_PATH}/vid_001.png` });
  console.log('Frame 1 saved');

  // Look for "CLICK TO PLAY" button
  try {
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Page text snippet:', bodyText.substring(0, 200));
  } catch(e) {}

  // Click center of screen to enter game
  await page.mouse.click(640, 360);
  await delay(2000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_002.png` });
  console.log('Frame 2 saved');

  // Try clicking again to lock pointer
  await page.mouse.click(640, 360);
  await delay(1500);

  await page.screenshot({ path: `${SAVE_PATH}/vid_003.png` });
  console.log('Frame 3 saved');

  let frameNum = 4;

  // Movement sequences: press key, screenshot, repeat
  const sequence = [
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'mouse', dx: 200, dy: 0 },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'mouse', dx: 200, dy: 0 },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'mouse', dx: -300, dy: 50 },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'mouse', dx: -300, dy: 0 },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'mouse', dx: 200, dy: -50 },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'mouse', dx: 400, dy: 0 },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'mouse', dx: -400, dy: 0 },
    { type: 'key', key: 'w', hold: 1500 },
    { type: 'screenshot' },
    { type: 'key', key: 'w', hold: 2000 },
    { type: 'screenshot' },
    { type: 'mouse', dx: 300, dy: 100 },
    { type: 'key', key: 'w', hold: 2000 },
    { type: 'screenshot' },
    { type: 'key', key: 'w', hold: 2000 },
    { type: 'screenshot' },
    { type: 'mouse', dx: -200, dy: -100 },
    { type: 'key', key: 'w', hold: 2000 },
    { type: 'screenshot' },
    { type: 'key', key: 'w', hold: 2000 },
    { type: 'screenshot' },
  ];

  // Keep track of mouse position
  let mouseX = 640;
  let mouseY = 360;
  await page.mouse.move(mouseX, mouseY);

  for (const step of sequence) {
    if (frameNum > 30) break;

    if (step.type === 'key') {
      await page.keyboard.down(step.key.toUpperCase());
      await delay(step.hold);
      await page.keyboard.up(step.key.toUpperCase());
      await delay(100);
    } else if (step.type === 'screenshot') {
      const fp = `${SAVE_PATH}/vid_${String(frameNum).padStart(3, '0')}.png`;
      await page.screenshot({ path: fp });
      console.log(`Frame ${frameNum} saved`);
      frameNum++;
    } else if (step.type === 'mouse') {
      // For pointer-locked games, we need to use mouse.move with relative movement
      // The pointer lock API captures mouse movement events
      await page.mouse.move(mouseX + step.dx, mouseY + step.dy, { steps: 20 });
      mouseX = Math.max(100, Math.min(1180, mouseX + step.dx));
      mouseY = Math.max(100, Math.min(620, mouseY + step.dy));
      await delay(300);
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
