// ── /api/slack-notify ─────────────────────────────────────────────────────────
// One-shot Vercel serverless function: posts a message to Slack using the
// bot token stored in SLACK_BOT_TOKEN env var.
// Called once per milestone completion. Delete after use or gate behind secret.

import type { VercelRequest, VercelResponse } from '@vercel/node'

const CHANNEL = process.env.SLACK_CHANNEL_ID ?? 'C0AMWTPE0AE'
const TOKEN   = process.env.SLACK_BOT_TOKEN

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' })
  }

  const { text, secret } = req.body as { text?: string; secret?: string }

  // Gate behind a simple shared secret to prevent abuse
  const expectedSecret = process.env.ADMIN_SECRET
  if (expectedSecret && secret !== expectedSecret) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  if (!TOKEN) {
    return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' })
  }

  if (!text) {
    return res.status(400).json({ error: 'text required' })
  }

  try {
    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type':  'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: CHANNEL, text }),
    })
    const data = await slackRes.json() as { ok: boolean; error?: string }
    if (!data.ok) {
      return res.status(502).json({ error: data.error ?? 'slack error' })
    }
    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
}
