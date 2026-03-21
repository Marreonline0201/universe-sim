// One-shot script: posts M8 Track 1 Weather System completion to Slack then exits.
import { WebClient } from '@slack/web-api'

const TOKEN   = process.env.SLACK_BOT_TOKEN
const CHANNEL = 'C0AMWTPE0AE'

if (!TOKEN) { console.error('SLACK_BOT_TOKEN not set'); process.exit(1) }

const web = new WebClient(TOKEN)

await web.chat.postMessage({
  channel: CHANNEL,
  text: [
    '*M8 Track 1 SHIPPED: Emergent Weather System*',
    '',
    'The planet now has real atmospheric weather — emergent from the simulation, not scripted.',
    '',
    '*What was built:*',
    '• `WeatherSystem.js` — 8-sector Markov-chain state machine on the server. Each sector tracks temperature, humidity, pressure, wind direction, and wind speed. Transitions every 5 real minutes with biome-weighted probabilities (desert rarely rains, polar rarely heat-waves, tropical storms frequently). Broadcasts `WEATHER_UPDATE` to all clients on every transition.',
    '• `WeatherRenderer.tsx` — Instanced particle systems inside the R3F Canvas: 2000 rain drops oriented along fall vector + wind angle, 800 snow flakes with spiral descent (when temp < 0°C), 300 dust/leaf wind sprites (CLEAR/CLOUDY), cloud billboard sphere scaled by opacity (CLEAR→STORM), and random lightning directional flash every 15-45s in STORM with 100ms burst.',
    '• `WeatherSectors.ts` — Client-side sector ID mapping that mirrors server logic exactly for zero-drift sector assignment.',
    '• `weatherStore.ts` — Zustand store for all 8 sector states + player sector tracking.',
    '• `LocalSimManager.suppressFire()` — Sends `cool` message to chem worker. Rain extinguishes unprotected campfires (RAIN=50%/s, STORM=100%/s).',
    '• `WorldSocket.ts` — `WEATHER_UPDATE` dispatch + `WORLD_SNAPSHOT` weather hydration for joining players.',
    '• `HUD.tsx` — Weather widget in top-right corner: SVG sun/cloud/rain/storm icon + temperature reading for player\'s current sector.',
    '• `SceneRoot.tsx` — GameLoop integration: sector tracking per-frame, rain-suppresses-fire, wind-chill drives ambient temp down during rain/storm (cold storm = faster body temperature drain).',
    '',
    '*Pass criteria:*',
    '1. Weather transitions through CLEAR / CLOUDY / RAIN / STORM over time (server Markov chain)',
    '2. Rain visually falls with correct wind angle (velocity = windDir + gravity, instanced)',
    '3. Rain extinguishes unprotected campfire (suppressFire() → chem cool message)',
    '4. Player in storm loses body heat faster than in clear weather (wind-chill integration)',
    '5. HUD shows current weather state + temperature for player\'s sector',
    '6. Slack receives storm alerts: "[WeatherSystem] Storm forming over Sector N"',
    '',
    `Production: https://universe-sim-beryl.vercel.app | Commit: 2f805bb`,
  ].join('\n'),
})

console.log('[notify] M8 Track 1 posted to Slack')
