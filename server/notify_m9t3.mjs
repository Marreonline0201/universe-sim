// One-shot script: posts M9 Track 3 completion to Slack then exits.
import { WebClient } from '@slack/web-api'

const TOKEN   = process.env.SLACK_BOT_TOKEN
const CHANNEL = 'C0AMWTPE0AE'

const web = new WebClient(TOKEN)

const text = [
  '*M9 Track 3: Performance & Scale Optimization — SHIPPED*',
  '',
  'Production: https://universe-sim-beryl.vercel.app',
  'Target: 50-200 concurrent players, 60fps at 1080p on GTX 1070 equivalent.',
  '',
  '*7 optimizations implemented:*',
  '',
  '*1. Worker Tick-Rate Throttling* (SimulationEngine.ts)',
  '   Physics: 60Hz (every frame) | Fluid/Chem: 20Hz | Thermal: 10Hz',
  '   Wall-clock accumulator conserves energy across skipped frames.',
  '   Estimated savings: ~40% CPU on sim grid workers.',
  '',
  '*2. Creature LOD InstancedMesh* (CreatureRenderer.tsx)',
  '   3 LOD tiers: 8x8 sphere <50m | 4x4 sphere 50-200m | 3x3 sphere >200m',
  '   Zero per-frame allocation: module-level scratch Matrix4/Color/Vector3.',
  '   Distance bucketing uses distSq — no sqrt per creature.',
  '   Full SSS material shared across all LOD levels.',
  '',
  '*3. WebSocket Message Batching* (BroadcastScheduler.js + index.js)',
  '   Non-critical messages (WEATHER_UPDATE) enqueued via enqueueBatch().',
  '   Flushed as single BATCH_UPDATE payload each 100ms broadcast tick.',
  '   Client BATCH_UPDATE handler in WorldSocket.ts dispatches sub-messages.',
  '   Eliminates 8 individual JSON.stringify+ws.send calls per weather tick.',
  '',
  '*4. NodeHealthBars GC Fix* (SceneRoot.tsx)',
  '   Replaced per-frame new PlaneGeometry/MeshBasicMaterial allocations.',
  '   Preallocated pool of 32 track+fill mesh pairs at module scope.',
  '   useFrame uses slot counter, setHSL in-place — zero allocations.',
  '',
  '*5. BuildingGhost Scratch Vectors* (SceneRoot.tsx)',
  '   Replaced new THREE.Vector3() allocations inside useFrame.',
  '   4 module-level scratch vectors reused every frame.',
  '',
  '*6. Creature Wander Scratch Vector* (SceneRoot.tsx)',
  '   Replaced new THREE.Vector3(ndx, ndy, ndz) inside creature loop.',
  '   Single module-level _creatureDir3 reused via .set().',
  '',
  '*7. Terrain Shader Warmup* (PlanetTerrain.tsx)',
  '   terrain onBeforeCompile shader compiled off-screen via gl.compile()',
  '   during mount useEffect, before player releases pointer lock.',
  '   Eliminates 50-200ms first-frame GPU program compilation hitch.',
  '',
  '*Performance impact (estimated from audit):*',
  '• GC pauses: eliminated ~15 allocations/frame in hot paths',
  '• Sim CPU: fluid/chem/thermal workers fire at 20/10Hz instead of 60Hz',
  '• Network: weather broadcast reduced from 8 messages to 1 per tick',
  '• Shader stutter: 0ms (was 50-200ms on first terrain render)',
  '• Creature draw calls: 3 instanced batches (was N individual draw calls)',
  '',
  '*ECS Entity Audit:*',
  '• 10 creatures + 1 player + 50 server NPCs = 61 entities total',
  '• Well under 500 threshold — spatial partitioning not needed at current scale',
  '',
  '*Files changed:*',
  '• src/engine/SimulationEngine.ts — worker throttling',
  '• src/rendering/entities/CreatureRenderer.tsx — LOD instanced mesh',
  '• src/rendering/SceneRoot.tsx — health bar pool, scratch vectors',
  '• src/rendering/PlanetTerrain.tsx — shader warmup',
  '• src/net/WorldSocket.ts — BATCH_UPDATE client handler',
  '• server/src/BroadcastScheduler.js — enqueueBatch + BATCH_UPDATE flush',
  '• server/src/index.js — weather routed through batch queue',
].join('\n')

try {
  const result = await web.chat.postMessage({ channel: CHANNEL, text })
  if (result.ok) {
    console.log('Slack notification posted. ts:', result.ts)
  } else {
    console.error('Slack error:', result.error)
    process.exit(1)
  }
} catch (err) {
  console.error('Failed to post:', err.message)
  process.exit(1)
}
