// ── Slack Agent Notifications ─────────────────────────────────────────────────
// Utility for agents to post status updates to the team Slack channel.
// Channel: universe-enw3477.slack.com / C0AMWTPE0AE
//
// Usage:
//   import { slackPost } from '../utils/slack'
//   await slackPost('Player logged in — epoch: Galactic, simTime: 4.32 Gyr')

const CHANNEL = import.meta.env.SLACK_CHANNEL_ID ?? 'C0AMWTPE0AE'
const TOKEN   = import.meta.env.SLACK_BOT_TOKEN

export async function slackPost(text: string): Promise<void> {
  if (!TOKEN) return  // silently skip if no token (e.g. CI environments)
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: CHANNEL, text }),
    })
  } catch {
    // Never crash the game for a Slack failure
  }
}
