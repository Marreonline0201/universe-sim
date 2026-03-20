import puppeteer from './node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function main() {
  console.log('Launching system Chrome...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const txt = msg.text();
    if (!txt.startsWith('THREE.') && !txt.startsWith('[draco')) console.log('PAGE:', txt.substring(0, 200));
  });

  console.log('Navigating to http://localhost:5176...');
  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Inject a script that will:
  // 1. After the game loads, try to find the player controller or Rapier world
  // 2. Teleport the player to near a resource node
  await page.evaluate(() => {
    // Override requestPointerLock to auto-approve it
    const orig = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function() {
      console.log('requestPointerLock called');
      return orig.call(this);
    };
  });

  console.log('Waiting 12 seconds for 3D to load...');
  await delay(12000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_001.png` });
  console.log('Frame 1 saved');

  // Check what's accessible from window
  const windowVars = await page.evaluate(() => {
    const vars = {};
    // Check for any Rapier/Three.js globals
    try { vars.rapier = typeof window.rapier; } catch(e) {}
    try { vars.THREE = typeof window.THREE; } catch(e) {}
    // Check for React fiber on canvas
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const keys = Object.keys(canvas).filter(k => k.startsWith('__reactFiber') || k.startsWith('__react'));
      vars.reactKeys = keys.slice(0, 5);
    }
    return vars;
  });
  console.log('Window vars:', JSON.stringify(windowVars));

  // Click CLICK TO PLAY
  const clickPos = await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.textContent && el.textContent.trim() === 'CLICK TO PLAY') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
      }
    }
    return { x: 640, y: 360 };
  });
  await page.mouse.click(clickPos.x, clickPos.y);
  console.log('Clicked play');
  await delay(2000);

  await page.screenshot({ path: `${SAVE_PATH}/vid_002.png` });
  console.log('Frame 2 saved');

  // Now try to use Zustand devtools to get/set state
  // Also try to use the rapierWorld module that's imported
  // We can try to access the module system via react's internals

  // Try a different approach: since resources are near north pole (0, 1, 0) direction,
  // and the planet radius is 2000, resources are at approximately (0, 2000, 0) + small offsets
  // The terrain Y at (0, 0) would be PLANET_RADIUS + terrain height

  // Try to find the PlayerController or rapierWorld via React internals
  const playerInfo = await page.evaluate(() => {
    try {
      // Walk React fiber tree looking for PlayerController ref
      function walkFiber(fiber, depth = 0) {
        if (!fiber || depth > 50) return null;
        // Check memoizedState for refs
        if (fiber.memoizedState) {
          const s = fiber.memoizedState;
          if (s.memoizedState && s.memoizedState.current) {
            const ref = s.memoizedState.current;
            if (ref && ref._position) {
              return { type: 'PlayerController', pos: [ref._position.x, ref._position.y, ref._position.z] };
            }
          }
        }
        // Check stateNode
        if (fiber.stateNode && fiber.stateNode.getWorldPosition) {
          return { type: 'Three Object', name: fiber.stateNode.name };
        }
        const childResult = fiber.child ? walkFiber(fiber.child, depth + 1) : null;
        if (childResult) return childResult;
        const siblingResult = fiber.sibling ? walkFiber(fiber.sibling, depth + 1) : null;
        return siblingResult;
      }

      const canvas = document.querySelector('canvas');
      const fiberKey = canvas ? Object.keys(canvas).find(k => k.startsWith('__reactFiber')) : null;
      if (!fiberKey) return { error: 'no react fiber' };

      const rootFiber = canvas[fiberKey];
      return walkFiber(rootFiber);
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Player info:', JSON.stringify(playerInfo));

  // Inject mouse move and move forward to explore
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
  const shot = async () => {
    if (frameNum > 30) return;
    const fp = `${SAVE_PATH}/vid_${String(frameNum).padStart(3, '0')}.png`;
    await page.screenshot({ path: fp });
    console.log(`Frame ${frameNum} saved`);
    frameNum++;
  };

  const fwd = async (ms) => {
    await page.keyboard.down('W');
    await delay(ms);
    await page.keyboard.up('W');
    await delay(100);
  };

  // Movement sequence exploring in all directions from spawn
  await fwd(2000); await shot();
  await injectMouseMove(300, 0); await shot();
  await fwd(2000); await shot();
  await injectMouseMove(300, 0); await shot();
  await fwd(2000); await shot();
  await injectMouseMove(-700, 0); await shot();
  await fwd(2000); await shot();
  await injectMouseMove(-400, 0); await shot();
  await fwd(2000); await shot();
  await injectMouseMove(0, 200); await shot(); // look down
  await fwd(2000); await shot();
  await injectMouseMove(0, -100); await shot(); // look back up
  await fwd(2000); await shot();
  await injectMouseMove(500, 100); await shot();
  await fwd(3000); await shot();
  await fwd(3000); await shot();
  await injectMouseMove(-400, -100); await shot();
  await fwd(3000); await shot();
  await fwd(3000); await shot();
  await injectMouseMove(200, 0); await shot();
  await fwd(3000); await shot();
  await fwd(3000); await shot();

  console.log(`Total frames: ${frameNum - 1}`);
  await browser.close();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
