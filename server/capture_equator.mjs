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

  // Save initial frame showing game before entering
  await page.screenshot({ path: `${SAVE_PATH}/eq_001.png` });
  console.log('Frame 1 - overview (CLICK TO PLAY screen)');

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
  await page.screenshot({ path: `${SAVE_PATH}/eq_002.png` });
  console.log('Frame 2 - after entering game');

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
  const shot = async (label = '') => {
    const fp = `${SAVE_PATH}/eq_${String(fNum).padStart(3, '0')}.png`;
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

  // Initial position
  await shot('- starting position (snow biome)');

  // Sprint toward equator for ~120 seconds to reach temperate forest biome
  // Need to travel ~1500m+ toward equator at sprint speed 14.4 m/s = 104 seconds
  // We need to go "downhill" toward lower latitudes = moving away from north pole
  // The player is at lat=0.94, we need lat=0.45, which means moving in the XZ plane
  // The spawn direction was (0.32, 0.94, -0.12), so moving in XZ (+X, -Z) direction
  // moves us toward the equator if we keep the same longitude

  // Adjust direction slightly to go toward equator
  // Tilt camera down slightly so gravity + movement heads toward lower lat
  await injectMouseMove(0, 50); // slightly down = toward equator
  await shot('- angled down toward equator');

  // Sprint for 2 minutes total toward equator
  for (let i = 0; i < 15; i++) {
    await sprint(8000); // 8 second sprints
    await shot(`- sprint ${i+1} (~${(i+1)*115}m toward equator)`);
    if (fNum > 28) break;
  }

  // Now look around to find the green biome
  await injectMouseMove(0, -50); // look back up
  await shot('- looking up after travel');
  await injectMouseMove(300, 0);
  await shot('- panning right');
  await injectMouseMove(-600, 0);
  await shot('- panning left');
  await injectMouseMove(300, 100);
  await shot('- looking down at terrain');

  console.log(`Total frames: ${fNum - 1}`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
