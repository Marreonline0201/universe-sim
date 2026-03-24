---
name: project_m14
description: M14 Interstellar Travel — DONE. Track A transit, Track B Velar language/gateway, Track C multiverse registry. Next IDs: MAT 70, ITEM 68, Recipe 106
type: project
---

# M14: Interstellar Travel — DONE

**Commits:** `38b66b4` (main M14), `f752f80` (polish/wiring)

## Track A — Interplanetary Transit

- `src/game/InterplanetaryTransitSystem.ts` — checks ITEM.ORBITAL_CAPSULE (id 66), consumes it, begins transit, sends INTERPLANETARY_TRANSIT_LAUNCHED WS. `TRANSIT_DURATION_SEC = 20`, `DESTINATION_SEED_OFFSET = 0x14000000`
- `src/store/transitStore.ts` — Zustand store, phases: idle/launching/arrived, `beginTransit()` / `arriveAtDestination()` / `returnHome()`
- `src/ui/TransitOverlay.tsx` — Canvas 2D fullscreen cinematic: 300 seeded stars streaming outward, planet disc growing, velocity HUD, distance countdown, progress bar. Uses `useRef` stable callback pattern (avoids stale closure on stars). `fillRect` not `roundRect` for compat.
- `src/rendering/DestinationPlanet.tsx` — Cube-sphere geometry seeded from `DESTINATION_SEED_OFFSET ^ worldSeed`, `DEST_SUBDIVISIONS = 48`, `destBiomeColor()` unique per seed, 50 resource node dots, slow y-rotation.

**Server:** `INTERPLANETARY_TRANSIT_LAUNCHED` → broadcasts `TRANSIT_LAUNCHED`. `TRANSIT_ARRIVED` → broadcasts `TRANSIT_ARRIVED_BROADCAST`. Correct planet seeds: Aethon=`0xae7401`, Velar=`0xe1a001`, Sulfis=`0x501f01`.

## Track B — Velar Home World

- `src/game/VelarLanguageSystem.ts` — 5 concepts: `life/star/path/here/come` (fixed order, glyphs vary per seed). 5 SVG generators (spiral helix, radial spokes, S-curve, concentric rings, spreading arms). `generateVelarAlphabet(seed)` shuffles display order deterministically. `VELAR_RESPONSE_SEQUENCE = ['life','star','path','here','come']`. `VELAR_DECODED_MESSAGE = 'WE ARE THE ORIGIN OF LIFE...'`. `VELAR_GATEWAY_COORDS = { arcDistFromSpawn: 200, angleFromNorth: 0.78 }`.
- `src/ui/VelarResponsePanel.tsx` — fullscreen modal, 5 symbol slots (SVG 80×80) + concept dropdowns. Checks decode order on submit. On correct: `markGatewayRevealed()` + sends `VELAR_RESPONSE_DECODED`. Error flash on wrong position (errorPos state + 900ms timeout).
- `src/rendering/VelarGatewayRenderer.tsx` — teal torus ring (6m radius, `#00e8d0` emissive), inner energy disc (additive blend, only when `gatewayActive`), 80 orbiting particles, ground pedestal. `useGatewayPosition()` calculates world pos 200m NE of spawn. Returns null if `!gatewayRevealed`.
- `src/store/velarStore.ts` — extended with M14 fields: `velarResponseReceived`, `gatewayRevealed`, `gatewayActive`, `velarWorldSeed`. Actions: `markResponseReceived()`, `markGatewayRevealed()`, `activateGateway(seed)`.

**Recipes:**
- Recipe 104 — Velar Crystal (MAT 69): 3x nuclear_fuel + 5x hydrogen + 2x gold → MAT.VELAR_CRYSTAL. tier 4, 600s, knowledge: `['nuclear_physics','velar_decoded']`
- Recipe 105 — Velar Key (ITEM 67): 5x circuit_board + 3x nuclear_fuel + 10x steel_ingot + 1x velar_crystal → ITEM.VELAR_KEY. tier 4, 1800s, knowledge: `['nuclear_physics','velar_decoded']`

**Knowledge gate:** `WorldSocket VELAR_DECODED` → `techTree.markResearched('velar_decoded')` + `inventory.discoverRecipe(104)` + `inventory.discoverRecipe(105)`

**Server Velar flow:** ORBITAL_CAPSULE_LAUNCHED with `targetPlanet==='Velar'` → probe lands + 5s later sends `VELAR_RESPONSE` broadcast. `VELAR_RESPONSE_DECODED` → broadcasts `VELAR_GATEWAY_REVEALED`. `VELAR_GATEWAY_ACTIVATED` → `universeReg.spawnVelarWorld()` → broadcasts `VELAR_GATEWAY_ACTIVATED` with `velarSeed` + updated universes list.

## Track C — Multiverse Infrastructure

- `server/src/UniverseRegistry.js` — Neon DB `universes` table (`seed, name, origin, created_at, player_count, tech_level, discovery_count`). Lazy `neon()` singleton. `migrateSchema()` + `load()` on startup. `spawnVelarWorld()`: `VELAR_SEED = 0x7e1a4000`, techLevel 5. `homeSeed = 42`.
- `src/store/universeStore.ts` — `UniverseEntry { seed, name, origin?, playerCount, techLevel }`. `setUniverses(list)` always ensures seed 42 present. `useUniverseSync()` subscribes to `universes-updated` CustomEvent from WorldSocket.
- `server/src/index.js` — `WORLD_SNAPSHOT` includes `universes: universeReg.getAll()`. WorldSocket dispatches `universes-updated` CustomEvent on WORLD_SNAPSHOT + VELAR_GATEWAY_ACTIVATED.

**Companion site Universe Map:**
- `universe-companion/app/universe-map/page.tsx` — SVG-based node graph, polls `/api/universes` every 30s. Nodes: home at center, children orbit at seeded positions. Dashed teal connection lines for gateway-spawned universes. Click node for detail panel (tech level bar, stats, origin, discovery date). Tech labels 0-8.
- `universe-companion/app/api/universes/route.ts` — Neon DB query, 60s in-process cache, fallback stub if no DB.
- Nav link in `app/page.tsx` header points to `/universe-map`.

**Why:** Companion site has no git repo — must deploy via `vercel deploy --prod` from `universe-companion/` directory. Vercel project: `prj_AAcmBdVtLReZhn9NY0MCUxFTUy9l`, team: `team_kEnHD5MgVe5ERBChd2n2Qm5X`.

## Next IDs entering M15

- MAT: 70
- ITEM: 68
- Recipe: 106
