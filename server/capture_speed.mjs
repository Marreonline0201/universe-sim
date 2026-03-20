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

  page.on('console', msg => {
    const txt = msg.text();
    if (txt.includes('[STORE]') || txt.includes('speed') || txt.includes('zustand')) {
      console.log('PAGE:', txt.substring(0, 200));
    }
  });

  await page.goto('http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Intercept the store creation to expose it globally
  await page.evaluate(() => {
    // Try to intercept the Zustand store by proxying the 'create' function
    // This needs to run BEFORE the store is created
    // Since the page already loaded, we need to try to find it via React fiber

    // Scan all React fibers for a state that has adminSpeedMult
    function findZustandStore(fiber, depth = 0) {
      if (!fiber || depth > 150) return null;

      // Check memoizedState chain for store subscriptions
      let state = fiber.memoizedState;
      while (state) {
        const queue = state.queue;
        if (queue && queue.dispatch) {
          // This is a useState/useReducer hook
        }
        // Zustand subscriptions are in useEffect/useSyncExternalStore
        if (state.memoizedState && typeof state.memoizedState === 'object') {
          const ms = state.memoizedState;
          if (ms && ms.getState && typeof ms.getState === 'function') {
            try {
              const s = ms.getState();
              if (s && 'adminSpeedMult' in s) {
                return ms;
              }
            } catch(e) {}
          }
        }
        state = state.next;
      }

      const child = fiber.child ? findZustandStore(fiber.child, depth + 1) : null;
      if (child) return child;
      return fiber.sibling ? findZustandStore(fiber.sibling, depth + 1) : null;
    }

    const canvas = document.querySelector('canvas');
    if (!canvas) { console.log('[STORE] No canvas'); return; }
    const fk = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
    if (!fk) { console.log('[STORE] No fiber'); return; }

    const store = findZustandStore(canvas[fk]);
    if (store) {
      window.__gameStore = store;
      console.log('[STORE] Found! Keys:', Object.keys(store.getState()).join(',').substring(0, 100));
    } else {
      console.log('[STORE] Not found via canvas fiber');
    }
  });

  console.log('Waiting 12s...');
  await delay(12000);

  // Try to find and boost speed via Zustand store
  const storeResult = await page.evaluate(() => {
    try {
      // Walk all React component fibers from root
      // React stores a __reactContainer... on root div
      const root = document.getElementById('root') || document.querySelector('[data-reactroot]') || document.querySelector('div');
      if (!root) return { error: 'no root' };

      const fk = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
      if (!fk) return { error: 'no fiber key on root', keys: Object.keys(root).filter(k => k.startsWith('_')).slice(0, 5) };

      function findStore(fiber, depth = 0) {
        if (!fiber || depth > 200) return null;
        let state = fiber.memoizedState;
        while (state) {
          if (state.memoizedState && typeof state.memoizedState === 'object') {
            const ms = state.memoizedState;
            if (ms && ms.getState) {
              try {
                const s = ms.getState();
                if (s && typeof s.adminSpeedMult === 'number') return ms;
              } catch(e) {}
            }
          }
          state = state.next;
        }
        const c = fiber.child ? findStore(fiber.child, depth + 1) : null;
        if (c) return c;
        return fiber.sibling ? findStore(fiber.sibling, depth + 1) : null;
      }

      const store = findStore(root[fk]);
      if (!store) return { error: 'store not found' };

      const currentState = store.getState();
      // Set admin speed to 50x
      store.setState({ adminSpeedMult: 50 });
      window.__gameStore = store;
      return {
        found: true,
        keys: Object.keys(currentState).slice(0, 15),
        speedBefore: currentState.adminSpeedMult,
        speedAfter: store.getState().adminSpeedMult,
      };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Store result:', JSON.stringify(storeResult));

  await page.screenshot({ path: `${SAVE_PATH}/spd_001.png` });
  console.log('Frame 1 saved');

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

  // Try again after entering game
  const storeResult2 = await page.evaluate(() => {
    if (window.__gameStore) {
      window.__gameStore.setState({ adminSpeedMult: 50 });
      return { found: true, speed: window.__gameStore.getState().adminSpeedMult };
    }

    // Try harder to find store
    const root = document.getElementById('root');
    const fk = root ? Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer')) : null;
    if (!fk) return { error: 'no fiber key' };

    function findStore(fiber, depth = 0) {
      if (!fiber || depth > 300) return null;
      let state = fiber.memoizedState;
      while (state) {
        if (state.memoizedState && typeof state.memoizedState === 'object') {
          const ms = state.memoizedState;
          if (ms && ms.getState) {
            try {
              const s = ms.getState();
              if (s && typeof s.adminSpeedMult === 'number') return ms;
            } catch(e) {}
          }
        }
        state = state.next;
      }
      const c = fiber.child ? findStore(fiber.child, depth + 1) : null;
      if (c) return c;
      return fiber.sibling ? findStore(fiber.sibling, depth + 1) : null;
    }

    const store = findStore(root[fk]);
    if (!store) return { error: 'store not found after game start' };
    store.setState({ adminSpeedMult: 50 });
    window.__gameStore = store;
    return { found: true, speed: store.getState().adminSpeedMult };
  });
  console.log('Store result after game start:', JSON.stringify(storeResult2));

  await page.screenshot({ path: `${SAVE_PATH}/spd_002.png` });
  console.log('Frame 2 saved');

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

  let fNum = 3;
  const shot = async (label = '') => {
    const fp = `${SAVE_PATH}/spd_${String(fNum).padStart(3, '0')}.png`;
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

  await shot('- starting');

  // Sprint for up to 30 seconds, taking screenshots, with admin speed 50x
  for (let i = 0; i < 8; i++) {
    await sprint(3000);
    await shot(`burst ${i+1}`);

    // Periodically try to re-enable admin speed
    await page.evaluate(() => {
      if (window.__gameStore) window.__gameStore.setState({ adminSpeedMult: 50 });
    });
  }

  // Pan around
  await injectMouseMove(300, 0); await shot('pan right');
  await injectMouseMove(-600, 0); await shot('pan left');
  await injectMouseMove(300, 100); await shot('look down');
  await injectMouseMove(-200, -80); await shot('pan back');
  await sprint(3000); await shot('last sprint');
  await sprint(3000); await shot('last sprint 2');

  console.log(`Total frames: ${fNum - 1}`);
  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
