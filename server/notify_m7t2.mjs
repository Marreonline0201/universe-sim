// One-shot script: posts M7 Track 2 completion to Slack then exits.
import { WebClient } from '@slack/web-api'

const TOKEN   = process.env.SLACK_BOT_TOKEN
const CHANNEL = 'C0AMWTPE0AE'

const web = new WebClient(TOKEN)

const text = [
  '*M7 Track 2: Full PvP Outlaw System — SHIPPED* :skull:',
  '',
  'Production: https://universe-sim-beryl.vercel.app',
  'Commit: 030e407 | Branch: master',
  '',
  '*What was built:*',
  '• `OutlawSystem.js` — server-authoritative murder_count DB ops, bounty formula (200 + count×150 copper), in-memory redemption quest engine with 10-min expiry',
  '• `PlayerRegistry` — murderCount field added; carried in all WORLD_SNAPSHOT and PLAYER_UPDATE broadcasts',
  '• `index.js` — 5 new message handlers: PLAYER_KILLED, BOUNTY_COLLECT, REDEMPTION_QUEST_REQUEST/PROGRESS + REDEMPTION_QUEST_PROGRESS',
  '• `outlawStore.ts` — client Zustand store: wanted player index, active quest, pending bounty notification',
  '• `WorldSocket.ts` — handles MURDER_COUNT_UPDATE, BOUNTY_POSTED, BOUNTY_COLLECTED, BOUNTY_COLLECT_BROADCAST, all REDEMPTION_QUEST_* messages; seeds wanted list from WORLD_SNAPSHOT',
  '• `SceneRoot.tsx` — PvP kill detection: attack loop checks remote players at weapon range; sends PLAYER_KILLED + BOUNTY_COLLECT on health <= 0; NPC guard aggro at 30m for wanted players (8 DPS); tiered settlement wary message',
  '• `RemotePlayersRenderer.tsx` — WANTED: X copper label + pulsing red skull above head for murderCount >= 5; capsule colour shifts red for wanted players',
  '• `SettlementHUD.tsx` — cautious tier banner (1-2 murders); gates-closed shows redemption request button; active quest progress panel with timer',
  '• `DeathScreen.tsx` — "Your crimes are remembered | Murder count: N" when murderCount > 0 — criminal record persists through death (Neon DB)',
  '• `NotificationSystem.tsx` — cinematic BountyBanner overlay on BOUNTY_POSTED (gold text, 5s auto-dismiss)',
  '',
  '*Pass criteria:*',
  ':white_check_mark: Kill player -> murder_count increments in Neon DB -> correct tier NPC reaction shown',
  ':white_check_mark: murder_count 5+ -> BOUNTY_POSTED broadcast -> WANTED label above head for all nearby players',
  ':white_check_mark: Kill wanted player -> BOUNTY_COLLECT -> server sends copper ingots to collector inventory',
  ':white_check_mark: Escort quest completion -> REDEMPTION_QUEST_COMPLETE -> murder_count -1',
  '',
  'Build: clean (1321 modules, 0 TypeScript errors, 8s).',
].join('\n')

try {
  const result = await web.chat.postMessage({ channel: CHANNEL, text })
  if (result.ok) {
    console.log('Slack notification posted successfully.')
  } else {
    console.error('Slack error:', result.error)
    process.exit(1)
  }
} catch (err) {
  console.error('Failed to post:', err.message)
  process.exit(1)
}
