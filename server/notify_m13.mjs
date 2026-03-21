// One-shot script: posts M13 Velar Contact completion to Slack then exits.
import { WebClient } from '@slack/web-api'

const TOKEN   = process.env.SLACK_BOT_TOKEN
const CHANNEL = 'C0AMWTPE0AE'

const web = new WebClient(TOKEN)

const text = [
  '*M13: Velar Contact — First Contact, Orbital Mechanics, Nuclear Physics — SHIPPED*',
  '',
  'Production: https://universe-sim-beryl.vercel.app',
  'Commit: f5652f5 | TS clean (0 errors) | 2447 insertions',
  '',
  '*Track A — Velar Signal Decoding (First Contact):*',
  '   DecoderPanel.tsx: 8-symbol Morse-style click decoder — DOT/DASH input matching',
  '   FirstContactOverlay.tsx: 12-second cinematic — 200 seeded stars, Velar dot scintillation, text reveal',
  '   VelarSignalView.tsx: "Attempt Decode" button after 3s, COORDINATES LOCKED on success',
  '   velarStore.ts: Zustand store for decode status, cinematic flag, probe results, reactor state',
  '   server DiscoveryDb.js: discoveries + planets tables, recordDecode / recordProbe (Neon DB)',
  '   server index.js: VELAR_DECODED → DB persist + broadcastAll + Slack',
  '   Companion site (universe-companion): 15s polling banner — "The universe is not empty"',
  '',
  '*Track B — Orbital Mechanics:*',
  '   OrbitalMechanicsSystem.ts: Kepler circular orbits — Aethon (0.7 AU), Velar (2.1 AU), Sulfis (0.4 AU)',
  '   Probe results seeded deterministically (LCG) — temp, atmosphere, 2-4 resources per planet',
  '   OrbitalView.tsx: 400x400 SVG solar map, orbit ellipses, planet click info panel, capsule launch',
  '   TelescopeView.tsx: 3-tab nav (Moon / Planets / Orbital)',
  '   Recipe 100: Orbital Capsule (5x CIRCUIT_BOARD + 10x STEEL_INGOT, tier 4, 1200s)',
  '   ITEM.ORBITAL_CAPSULE = 66',
  '',
  '*Track C — Nuclear Physics:*',
  '   NuclearReactorSystem.ts: 100 kW, +40°C/s fission, -60°C/s water cooling',
  '   Meltdown: 800°C sustained 30s → REACTOR_MELTDOWN WS → 20m radiation zone, 2 HP/s drain',
  '   Cleanup mission: 10x clay + 5x stone within 5m of reactor',
  '   BuildingSystem.ts: nuclear_reactor / electric_forge (3x smelt speed) / arc_welder (Tier 4)',
  '   Recipes 101-103: reactor (8x steel + 4x circuit + 2x nuclear_fuel), forge, welder',
  '   HUD ReactorWidget: temperature bar (green/amber/red), meltdown alert, cleanup countdown',
  '   MAT.HYDROGEN = 68 (electrolysis product — H₂O → H₂ + O₂)',
  '',
  '*ID Namespace after M13:*',
  '   Next MAT = 69 | Next ITEM = 67 | Next Recipe = 104',
  '',
  '*Files changed (28 files, 2447 insertions, 152 deletions):*',
  '   NEW: velarStore.ts, DecoderPanel.tsx, FirstContactOverlay.tsx, OrbitalView.tsx',
  '   NEW: NuclearReactorSystem.ts, OrbitalMechanicsSystem.ts, server/DiscoveryDb.js',
  '   NEW: universe-companion/app/api/velar-status/route.ts',
  '   MOD: VelarSignalView.tsx, TelescopeView.tsx, HUD.tsx, SceneRoot.tsx',
  '   MOD: WorldSocket.ts, useWorldSocket.ts, Inventory.ts, BuildingSystem.ts',
  '   MOD: server/index.js',
].join('\n')

if (!TOKEN) {
  console.error('SLACK_BOT_TOKEN not set — skipping Slack notification')
  process.exit(0)
}

try {
  const result = await web.chat.postMessage({ channel: CHANNEL, text })
  if (result.ok) {
    console.log('M13 Slack notification posted. ts:', result.ts)
  } else {
    console.error('Slack error:', result.error)
    process.exit(1)
  }
} catch (err) {
  console.error('Failed to post:', err.message)
  process.exit(1)
}
