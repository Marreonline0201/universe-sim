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

  // Save initial frame (shows full world before entering)
  await page.screenshot({ path: `${SAVE_PATH}/final_001.png` });
  console.log('Final frame 1 saved - overview');

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
  await page.screenshot({ path: `${SAVE_PATH}/final_002.png` });
  console.log('Final frame 2 - after click');

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

  let fNum = 3;
  const shot = async () => {
    const fp = `${SAVE_PATH}/final_${String(fNum).padStart(3, '0')}.png`;
    await page.screenshot({ path: fp });
    console.log(`Final frame ${fNum} saved`);
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

  // Phase 1: Navigate toward wood nodes
  // Spawn is at (686, -250) in XZ, nodes are near (0, 0) in XZ
  // Direction: (-686, 250) normalized = (-0.939, 0.343) in XZ
  // Player starts facing in spawn direction which is roughly (+X, -Z)
  // We need to turn ~180° + some angle to face toward origin
  // Let's turn left significantly to face the right way
  await shot();

  // Turn left ~140 degrees (the direction to the nodes is roughly 160° from current facing)
  // In FPS games, positive movementX = turn right, negative = turn left
  // 140 degrees ~ a lot of mouse movement
  await injectMouseMove(-700, 0, 60);
  await shot();

  // Sprint hard toward nodes for ~55 seconds
  console.log('Sprinting toward wood nodes...');
  for (let i = 0; i < 11; i++) {
    await sprint(5000);
    await shot();
    if (fNum > 25) break;
  }

  // Pan around to look for tree/rock objects
  await shot();
  await injectMouseMove(200, 0);
  await shot();
  await injectMouseMove(-400, 0);
  await shot();
  await injectMouseMove(200, 150); // look down to see ground objects
  await shot();
  await injectMouseMove(300, 0);
  await shot();
  await injectMouseMove(-600, 0);
  await shot();
  await injectMouseMove(300, -100);
  await shot();

  console.log(`Total final frames: ${fNum - 1}`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
