import fs from 'fs';

const token = process.env.SLACK_TOKEN;
const channel = 'C0AMWTPE0AE';

// Check token scopes
const authRes = await fetch('https://slack.com/api/auth.test', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});
const authData = await authRes.json();
console.log('Auth test:', JSON.stringify(authData, null, 2));
