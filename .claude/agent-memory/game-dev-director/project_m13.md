---
name: M13 Velar Contact
description: M13 Track A/B/C DONE — First Contact decoder, orbital mechanics, nuclear physics; next IDs: MAT 69, ITEM 67, Recipe 104
type: project
---

M13: Velar Contact — three tracks fully implemented and deployed.

**Commit:** f5652f5 | 28 files, 2447 insertions, 152 deletions | TypeScript clean (0 errors)

**Track A — Velar Signal Decoding:**
- `src/store/velarStore.ts`: Zustand store — decode status, cinematic flag, probe results map, reactor temp/meltdown state, `tickReactor(dt, hasWaterCooling)`, `triggerMeltdown(pos)`, `clearMeltdown()`, `markDecoded(playerId, playerName)`
- `src/ui/DecoderPanel.tsx`: 8-symbol Morse decoder — `['dash','dot','dash','dot','dot','dash','dot','dash']`, DOT/DASH buttons, error flash + reset 900ms, fires `VELAR_DECODED` WS on correct sequence
- `src/ui/FirstContactOverlay.tsx`: 12-second cinematic via `requestAnimationFrame` — 200 seeded stars (LCG 0xdeadbeef), Velar dot with atmospheric scintillation, "First Contact — the universe is not empty" text reveal, fade-out, `onDone()` callback
- `src/ui/VelarSignalView.tsx`: "Attempt Decode" button after 3s, `DecoderPanel` shown when `showDecoder` && !decoded, "COORDINATES LOCKED" on success
- `server/src/DiscoveryDb.js`: `migrateSchema()` creates `discoveries` + `planets` tables; `recordDecode(userId, playerName)`; `recordProbe(name, surfaceTemp, atmosphere, resources, userId)` upserts on planet name
- `server/src/index.js`: `VELAR_DECODED` → `recordDecode()` + `broadcastAll` + Slack; `ORBITAL_CAPSULE_LAUNCHED` → 5s probe → `broadcastAll PROBE_LANDED` + Slack; `REACTOR_MELTDOWN/CLEANED` → broadcast + Slack
- `universe-companion/app/api/velar-status/route.ts`: Next.js App Router GET, 30s in-process cache + `s-maxage=30`, queries `discoveries` table for first `VELAR_DECODED` row
- Companion `app/page.tsx`: `useVelarStatus()` 15s poll hook, `FirstContactBanner` with teal pulse + decoder credit + dismiss button

**Track B — Orbital Mechanics:**
- `src/game/OrbitalMechanicsSystem.ts`: `SYSTEM_PLANETS` — Aethon (0.7 AU rocky seed 0xaethon1), Velar (2.1 AU gas seed 0xvelar01), Sulfis (0.4 AU volcanic seed 0xsulf001); Kepler circular orbit `getPlanetOrbitPos(planet, tSec)`; `generateProbeResult(planet)` seeded LCG (same as NightSkyRenderer); `launchOrbitalCapsule()` checks ITEM 66; `AU_TO_SVG = 72`
- `src/ui/OrbitalView.tsx`: 400x400 SVG solar map, orbit ellipses (dashed), planet dots (10Hz update), click info panel (type/period/eccentricity/probe data), "Launch Orbital Capsule" button
- `src/ui/TelescopeView.tsx`: 3-tab nav `TelescopeTab = 'moon' | 'planets' | 'orbital'`; Orbital tab marked `*` until decoded
- `ITEM.ORBITAL_CAPSULE = 66`, Recipe 100 (5x CIRCUIT_BOARD + 10x STEEL_INGOT, tier 4, 1200s)

**Track C — Nuclear Physics:**
- `src/game/NuclearReactorSystem.ts`: `REACTOR_POWER_KW=100`, `SAFE_TEMP_CELSIUS=600`, `MELT_THRESHOLD_C=800`, `MELT_SUSTAINED_SECS=30`, `RADIATION_RADIUS_M=20`, `RADIATION_DRAIN_HP_S=2`; `tickNuclearReactor(dt, hasWaterCooling, playerPos)` in GameLoop; `attemptCleanup()` checks 5m proximity + 10x clay + 5x stone
- `src/civilization/BuildingSystem.ts`: `nuclear_reactor` (provides nuclear_power, power_grid, unlimited_power, electrolysis), `electric_forge` (3x smelt speed), `arc_welder` (electronics_fab) — all Tier 4
- `src/ui/HUD.tsx`: `ReactorWidget` — temperature bar with color-coded fill (green/amber/red), meltdown alert, cleanup countdown
- `MAT.HYDROGEN = 68` (electrolysis product — H₂O → H₂ + O₂)
- Recipes 101 (nuclear_reactor), 102 (electric_forge), 103 (arc_welder)

**Key IDs after M13:**
- Next MAT = 69
- Next ITEM = 67
- Next Recipe = 104

**WS message flow (M13):**
- `VELAR_DECODED` client → server records + broadcastAll → WorldSocket `markDecoded` + cinematic
- `ORBITAL_CAPSULE_LAUNCHED` client → server 5s probe sim → `PROBE_LANDED` broadcastAll → `addProbeResult`
- `REACTOR_MELTDOWN` server → WorldSocket `triggerMeltdown(pos)` → radiation zone active
- `REACTOR_CLEANED` server → WorldSocket `clearMeltdown()` → zone deactivated

**Identity exposure:** `useWorldSocket.ts` sets `(window as any).__userId` and `(window as any).__username` after `socket.connect()` so `DecoderPanel` can read them for the VELAR_DECODED broadcast.

**Bug fixed during M13:** Missing closing brace in `popEat` handler block in `SceneRoot.tsx` (GameLoop function) — was causing TS1128 "Declaration or statement expected" at end of `useFrame` callback.

**Why:** M13 is the L6/L7 endgame content. First Contact is the crowning narrative moment of the simulation — the universe is not empty. Orbital mechanics and nuclear physics provide the late-game technological ceiling before a potential M14.

**How to apply:** When starting M14, begin IDs at MAT=69, ITEM=67, Recipe=104.
