import fs from 'fs';
import { put } from '@vercel/blob';

// Load env from .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#][^=]*)="?([^"]*)"?$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SLACK_CHANNEL = 'C0AMWTPE0AE';

const screenshots = [
  { path: '/tmp/game_01_landing.png', name: 'game_01_landing.png', title: 'Universe Sim - Landing/Login Page' },
  { path: '/tmp/game_02_after_click.png', name: 'game_02_after_click.png', title: 'Universe Sim - After Interaction' },
  { path: '/tmp/game_03_fullpage.png', name: 'game_03_fullpage.png', title: 'Universe Sim - Full Page View' },
  { path: '/tmp/game_04_key_i.png', name: 'game_04_key_i.png', title: 'Universe Sim - Key I Pressed' },
  { path: '/tmp/game_05_key_c.png', name: 'game_05_key_c.png', title: 'Universe Sim - Key C Pressed' },
  { path: '/tmp/game_06_key_tab.png', name: 'game_06_key_tab.png', title: 'Universe Sim - Tab Key' },
  { path: '/tmp/game_07_key_m.png', name: 'game_07_key_m.png', title: 'Universe Sim - Key M Pressed' },
  { path: '/tmp/game_08_admin.png', name: 'game_08_admin.png', title: 'Universe Sim - Admin Page' },
];

// Upload to Vercel Blob
const blobUrls = [];
console.log('Uploading screenshots to Vercel Blob...');
for (const s of screenshots) {
  try {
    const fileData = fs.readFileSync(s.path);
    const blob = await put(`screenshots/${s.name}`, fileData, {
      access: 'public',
      contentType: 'image/png',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    console.log(`  Uploaded ${s.name} -> ${blob.url}`);
    blobUrls.push({ url: blob.url, title: s.title });
  } catch (err) {
    console.error(`  Failed to upload ${s.name}:`, err.message);
  }
}

console.log(`\nUploaded ${blobUrls.length} screenshots to Vercel Blob`);

// Post to Slack as image blocks
console.log('\nPosting to Slack...');

// Post each image as a message with image block
for (const { url, title } of blobUrls) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: SLACK_CHANNEL,
      text: title,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*${title}*` }
        },
        {
          type: 'image',
          image_url: url,
          alt_text: title
        }
      ]
    })
  });
  const data = await res.json();
  if (data.ok) {
    console.log(`  Posted: ${title}`);
  } else {
    console.error(`  Failed to post ${title}:`, data.error);
  }
}

// Final summary message
const summaryRes = await fetch('https://slack.com/api/chat.postMessage', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    channel: SLACK_CHANNEL,
    text: `📸 Universe Sim screenshots captured — ${blobUrls.length} screenshots above\n\nGame URL: https://universe-sim-beryl.vercel.app\nNote: Game uses Clerk auth (GitHub/Google login). Screenshots show the login page and various key states since access without login is not available.`
  })
});
const summaryData = await summaryRes.json();
console.log('Summary message:', summaryData.ok ? 'posted OK' : JSON.stringify(summaryData));
