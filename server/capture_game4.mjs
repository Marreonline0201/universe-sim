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
  console.log('Frame 1 - initial state saved');

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

  console.log('Clicking at', clickPos.x, clickPos.y);
  await page.mouse.click(clickPos.x, clickPos.y);
  await delay(3000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_002.png` });
  console.log('Frame 2 - after click saved');

  let frameNum = 3;
  let mouseX = 640, mouseY = 360;

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

  const turn = async (dx, dy = 0) => {
    const newX = Math.max(100, Math.min(1180, mouseX + dx));
    const newY = Math.max(100, Math.min(620, mouseY + dy));
    await page.mouse.move(newX, newY, { steps: 40 });
    mouseX = newX;
    mouseY = newY;
    await delay(500);
  };

  // Sprint sequence - hold W for long stretches to cover ground
  // Then turn and keep going to find resources

  // Start moving forward aggressively
  await moveForward(3000);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  // Turn right significantly to find green area
  await turn(400, 0);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  // Turn more right
  await turn(400, 0);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  // Turn left
  await turn(-600, 0);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  // Try looking slightly down to see ground resources
  await turn(0, 100);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  // Turn left more
  await turn(-500, -80);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await moveForward(3000);
  await shotAndSave();

  await turn(300, 0);
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
