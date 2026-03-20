import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const BASE_URL = 'https://universe-sim-beryl.vercel.app';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

// Screenshot 1: Landing/login page
console.log('Taking screenshot 1: Landing page');
await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(2000);
await page.screenshot({ path: '/tmp/game_01_landing.png', fullPage: false });
console.log('Screenshot 1 done');

// Get current URL and page content info
const url1 = page.url();
const title1 = await page.title();
console.log(`Page URL: ${url1}, Title: ${title1}`);

// Check for dev bypass or buttons on landing page
const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
console.log('Body text snippet:', bodyText);

// Screenshot 2: Try to find and click any play/enter/start button
console.log('Taking screenshot 2: After interaction');
try {
  // Look for buttons or links
  const btns = await page.$$eval('button, a, input[type="submit"]', els => 
    els.map(e => ({ text: e.innerText || e.value || e.href, tag: e.tagName })).slice(0, 20)
  );
  console.log('Buttons/links found:', JSON.stringify(btns));
  
  // Try clicking a play/start/enter button
  const clicked = await page.evaluate(() => {
    const allBtns = [...document.querySelectorAll('button, a')];
    const playBtn = allBtns.find(b => /play|start|enter|join|game|begin|launch/i.test(b.textContent));
    if (playBtn) { playBtn.click(); return playBtn.textContent.trim(); }
    return null;
  });
  console.log('Clicked button:', clicked);
  await sleep(3000);
} catch(e) {
  console.log('No play button found:', e.message);
}
await page.screenshot({ path: '/tmp/game_02_after_click.png', fullPage: false });
console.log('Screenshot 2 done, URL:', page.url());

// Screenshot 3: Full page scroll
console.log('Taking screenshot 3: Full page');
await page.screenshot({ path: '/tmp/game_03_fullpage.png', fullPage: true });
console.log('Screenshot 3 done');

// Screenshot 4: Try pressing keys in game (I, C, T, E, J, M, Tab)
console.log('Taking screenshot 4: After pressing I key (inventory?)');
await page.keyboard.press('i');
await sleep(1000);
await page.screenshot({ path: '/tmp/game_04_key_i.png', fullPage: false });

console.log('Taking screenshot 5: After pressing C key');
await page.keyboard.press('Escape');
await sleep(500);
await page.keyboard.press('c');
await sleep(1000);
await page.screenshot({ path: '/tmp/game_05_key_c.png', fullPage: false });

console.log('Taking screenshot 6: After pressing Tab key');
await page.keyboard.press('Escape');
await sleep(500);
await page.keyboard.press('Tab');
await sleep(1000);
await page.screenshot({ path: '/tmp/game_06_key_tab.png', fullPage: false });

console.log('Taking screenshot 7: After pressing M key (map?)');
await page.keyboard.press('Escape');
await sleep(500);
await page.keyboard.press('m');
await sleep(1000);
await page.screenshot({ path: '/tmp/game_07_key_m.png', fullPage: false });

// Try to navigate to /admin
console.log('Taking screenshot 8: Admin page');
await page.goto(BASE_URL + '/admin', { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
await sleep(2000);
await page.screenshot({ path: '/tmp/game_08_admin.png', fullPage: false });
console.log('Screenshot 8 done');

await browser.close();
console.log('All screenshots done!');
