import fs from 'fs';

const token = process.env.SLACK_TOKEN;
const channel = 'C0AMWTPE0AE';

// Try multipart form upload (legacy files.upload)
async function uploadLegacy(filePath, filename, title) {
  console.log(`Trying legacy upload for ${filename}...`);
  const fileData = fs.readFileSync(filePath);
  
  const formData = new FormData();
  formData.append('token', token);
  formData.append('channels', channel);
  formData.append('filename', filename);
  formData.append('title', title);
  formData.append('file', new Blob([fileData], { type: 'image/png' }), filename);

  const res = await fetch('https://slack.com/api/files.upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const data = await res.json();
  console.log(`Result for ${filename}:`, JSON.stringify(data).substring(0, 300));
  return data.ok;
}

const screenshots = [
  { path: '/tmp/game_01_landing.png', name: 'game_01_landing.png', title: 'Universe Sim - Landing/Login Page' },
  { path: '/tmp/game_02_after_click.png', name: 'game_02_after_click.png', title: 'Universe Sim - After Interaction' },
  { path: '/tmp/game_03_fullpage.png', name: 'game_03_fullpage.png', title: 'Universe Sim - Full Page View' },
  { path: '/tmp/game_04_key_i.png', name: 'game_04_key_i.png', title: 'Universe Sim - Key I Pressed' },
  { path: '/tmp/game_05_key_c.png', name: 'game_05_key_c.png', title: 'Universe Sim - Key C Pressed' },
  { path: '/tmp/game_06_key_tab.png', name: 'game_06_key_tab.png', title: 'Universe Sim - Tab Key Pressed' },
  { path: '/tmp/game_07_key_m.png', name: 'game_07_key_m.png', title: 'Universe Sim - Key M Pressed' },
  { path: '/tmp/game_08_admin.png', name: 'game_08_admin.png', title: 'Universe Sim - Admin Page' },
];

let successCount = 0;
for (const s of screenshots) {
  const ok = await uploadLegacy(s.path, s.name, s.title);
  if (ok) successCount++;
}

console.log(`\nUploaded ${successCount}/${screenshots.length} screenshots via legacy API`);

// Post updated summary message
if (successCount > 0) {
  const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      text: `📸 Universe Sim screenshots captured — ${successCount} screenshots above`
    })
  });
  const msgData = await msgRes.json();
  console.log('Summary message:', msgData.ok ? 'posted OK' : JSON.stringify(msgData));
}
