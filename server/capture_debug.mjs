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

  const allConsoleMsgs = [];
  page.on('console', msg => {
    const txt = msg.text();
    allConsoleMsgs.push(txt);
    if (txt.includes('spawn') || txt.includes('SPAWN') || txt.includes('position') || txt.includes('[debug]')) {
      console.log('PAGE:', txt.substring(0, 200));
    }
  });

  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Inject a hook to intercept module exports
  await page.evaluate(() => {
    // Hook into the Vite module system to get access to game modules
    window.__debugModules = {};
    // Try to intercept ES module imports via proxy on global objects
    // Listen for when rapierWorld module is used
    const origFetch = window.fetch;
    window.__rapierWorldRef = null;
    window.__playerControllerRef = null;

    // Monitor for Three.js camera - it will be available via the scene
    const checkInterval = setInterval(() => {
      // Try to find camera via Three.js renderer
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      // Look for __r3f (React Three Fiber) context
      const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return;

      // Try to find R3F store
      const propsKey = Object.keys(canvas).find(k => k.startsWith('__reactProps'));
      if (propsKey) {
        const props = canvas[propsKey];
        // R3F stores the Three.js state in a context
        if (props && props.children) {
          clearInterval(checkInterval);
          window.__r3fProps = props;
          console.log('[debug] Found R3F props');
        }
      }
    }, 500);
  });

  console.log('Waiting 12s...');
  await delay(12000);

  // Try to access the camera position via R3F
  const cameraInfo = await page.evaluate(() => {
    try {
      // Access R3F store via canvas
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'no canvas' };

      // Walk React fiber to find R3F context
      const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return { error: 'no fiber' };

      let fiber = canvas[fiberKey];
      let depth = 0;
      const results = [];

      // Walk the fiber tree looking for stateNode with camera or scene
      function walk(f, d) {
        if (!f || d > 100) return;

        // Check for R3F store context
        if (f.memoizedState) {
          let state = f.memoizedState;
          while (state) {
            if (state.memoizedState) {
              const ms = state.memoizedState;
              // R3F store has camera, scene, etc.
              if (ms && ms.camera && ms.camera.isCamera) {
                results.push({
                  type: 'r3f_store',
                  cameraPos: [ms.camera.position.x, ms.camera.position.y, ms.camera.position.z],
                  cameraType: ms.camera.type,
                });
                return;
              }
              // Check for refs to player position
              if (ms && ms.current) {
                const c = ms.current;
                if (c && typeof c === 'object' && c._position) {
                  results.push({ type: 'player_controller', pos: [c._position.x, c._position.y, c._position.z] });
                }
              }
            }
            state = state.next;
          }
        }

        walk(f.child, d + 1);
        walk(f.sibling, d + 1);
      }

      walk(fiber, 0);
      return { results: results.slice(0, 5) };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Camera info:', JSON.stringify(cameraInfo));

  // Click CLICK TO PLAY
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

  // Try to read camera position after pointer lock
  const camPos = await page.evaluate(() => {
    try {
      const canvas = document.querySelector('canvas');
      const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
      let fiber = canvas[fiberKey];
      const results = [];

      function walk(f, d) {
        if (!f || d > 200) return;
        if (f.memoizedState) {
          let state = f.memoizedState;
          while (state) {
            if (state.memoizedState && state.memoizedState.camera && state.memoizedState.camera.isCamera) {
              const cam = state.memoizedState.camera;
              results.push({
                cameraPos: [
                  Math.round(cam.position.x),
                  Math.round(cam.position.y),
                  Math.round(cam.position.z)
                ]
              });
            }
            state = state.next;
          }
        }
        if (f.child) walk(f.child, d + 1);
        if (f.sibling) walk(f.sibling, d + 1);
      }
      walk(fiber, 0);
      return results.slice(0, 3);
    } catch(e) {
      return [{ error: e.message }];
    }
  });
  console.log('Camera position after click:', JSON.stringify(camPos));

  await page.screenshot({ path: `${SAVE_PATH}/vid_debug.png` });
  await browser.close();
}

main().catch(e => console.error('Error:', e.message));
