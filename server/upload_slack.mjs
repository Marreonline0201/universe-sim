import fs from 'fs';

const token = process.env.SLACK_TOKEN;
const channel = 'C0AMWTPE0AE';
const SAVE_PATH = 'C:/Users/ddogr/AppData/Local/Temp';

async function uploadToSlack(filePath, filename, title) {
  if (!fs.existsSync(filePath)) { console.log('SKIP (not found): ' + filePath); return false; }
  console.log(`Uploading ${filename}...`);
  const fileData = fs.readFileSync(filePath);
  const fileSize = fileData.length;
  console.log(`  File size: ${(fileSize/1024).toFixed(1)}KB`);

  // Step 1: Get upload URL (use form-encoded — JSON body fails with built-in fetch)
  const p1 = new URLSearchParams({ filename, length: String(fileSize) });
  const urlRes = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p1.toString()
  });
  const urlData = await urlRes.json();
  if (!urlData.ok) {
    console.error(`  ERROR getting upload URL: ${urlData.error}`);
    return false;
  }
  const { upload_url, file_id } = urlData;

  // Step 2: Upload the file binary
  await fetch(upload_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: fileData
  });

  // Step 3: Complete upload WITHOUT channel (bot not in channel — share via postMessage)
  const p3 = new URLSearchParams({ files: JSON.stringify([{ id: file_id, title }]) });
  const completeRes = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p3.toString()
  });
  const cData = await completeRes.json();
  if (!cData.ok) { console.error(`  complete failed: ${cData.error}`); return false; }

  // Step 4: Post file to channel via chat.postMessage with files param
  const p4 = new URLSearchParams({ channel, text: title, files: JSON.stringify([{ id: file_id }]) });
  const shareRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p4.toString()
  });
  const result = await shareRes.json();
  console.log(`  ${filename} -> ${result.ok ? 'OK' : result.error}`);
  return result.ok;
}

// Best frames from our exploration run using system Chrome with fly mode
const screenshots = [
  { path: `${SAVE_PATH}/fly3_001.png`, name: 'explore_01_settings.png', title: 'Universe Sim - Settings: Fly Mode ON, 20x Speed' },
  { path: `${SAVE_PATH}/fly3_003.png`, name: 'explore_02_snow_spawn.png', title: 'Universe Sim - Spawn in polar snow biome (lat 0.94)' },
  { path: `${SAVE_PATH}/fly3_004.png`, name: 'explore_03_snow_terrain.png', title: 'Universe Sim - Snow terrain, starting to fly' },
  { path: `${SAVE_PATH}/fly3_005.png`, name: 'explore_04_tilted.png', title: 'Universe Sim - Camera tilted toward equator' },
  { path: `${SAVE_PATH}/fly3_006.png`, name: 'explore_05_green_biome.png', title: 'Universe Sim - Green biome visible ahead' },
  { path: `${SAVE_PATH}/fly3_007.png`, name: 'explore_06_green_mountains.png', title: 'Universe Sim - Flying through green mountains' },
  { path: `${SAVE_PATH}/fly3_008.png`, name: 'explore_07_terrain.png', title: 'Universe Sim - Green temperate forest terrain' },
  { path: `${SAVE_PATH}/fly3_009.png`, name: 'explore_08_scan_right.png', title: 'Universe Sim - Scanning terrain right' },
  { path: `${SAVE_PATH}/fly3_010.png`, name: 'explore_09_landscape.png', title: 'Universe Sim - Alien landscape with green hills' },
  { path: `${SAVE_PATH}/fly3_011.png`, name: 'explore_10_mountains.png', title: 'Universe Sim - Green mountains and blue ocean' },
  { path: `${SAVE_PATH}/fly3_012.png`, name: 'explore_11_flying.png', title: 'Universe Sim - Flying over alien world' },
  { path: `${SAVE_PATH}/fly3_014.png`, name: 'explore_12_deep_biome.png', title: 'Universe Sim - Deep in green biome' },
  { path: `${SAVE_PATH}/fly3_016.png`, name: 'explore_13_scan.png', title: 'Universe Sim - Scanning for resources' },
  { path: `${SAVE_PATH}/fly3_018.png`, name: 'explore_14_looking.png', title: 'Universe Sim - Looking at planet surface' },
  { path: `${SAVE_PATH}/fly3_020.png`, name: 'explore_15_final.png', title: 'Universe Sim - Final exploration frame' },
];

let successCount = 0;
for (const s of screenshots) {
  const ok = await uploadToSlack(s.path, s.name, s.title);
  if (ok) successCount++;
  await new Promise(r => setTimeout(r, 800));
}

console.log(`\nUploaded ${successCount}/${screenshots.length} frames`);

// Post summary message
const summaryText = `*Universe Sim Exploration Recording (${successCount} frames)*\n\nRecorded exploration of the 3D universe-sim game at http://localhost:5176:\n\n- Started in polar snow biome (latitude 0.94, above 0.82 snow cap threshold)\n- Opened Settings, enabled FLY MODE at 20x speed\n- Flew ~5000m toward the equator (~480 m/s)\n- Discovered the green temperate forest biome at lower latitudes\n\nResource nodes near spawn (polar ocean area): 20x Wood/Trees, 20x Stone, 15x Bark, 15x Fiber, 12x Clay, 10x Flint, 8x Copper Ore, 8x Iron Ore, 6x Coal, 5x Tin Ore, 8x Sand, 4x Sulfur`;
const pMsg = new URLSearchParams({ channel, text: summaryText });
const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: pMsg.toString()
});
const msgData = await msgRes.json();
console.log('Summary message:', msgData.ok ? 'OK' : msgData.error);
