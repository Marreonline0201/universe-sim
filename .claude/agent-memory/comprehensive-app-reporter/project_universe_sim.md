---
name: Universe Sim project context
description: Key architectural facts, milestone history, known bugs, and feature status for Universe Simulation as of 2026-03-21 (report v11, M13 complete)
type: project
---

The app is a multiplayer 3D browser survival game at https://universe-sim-beryl.vercel.app.

Architecture: Vite/React/Three.js frontend on Vercel, Vercel serverless API routes (save, load, world-settings, admin), always-on Railway WebSocket server, Neon Postgres database, Clerk for auth.

**Why:** Game is in active development. Report v11 written 2026-03-21 after M13 completion. manual.md last updated 2026-03-21 (M13).

**How to apply:** When asked to update the report, read the current report.md version number and increment it (currently v11). Check these known issues before writing new findings. The Vite config has two named build entry points (main + status).

## Milestone status as of 2026-03-21

| Milestone | Status |
|---|---|
| M0: Universe Visible (ambient fire, day/night, biome temps, organisms, SimGrid, photorealism) | Done |
| M1-M4: All 7 Survival Slices (gather, craft+equip, fire, cook, wound+herb, sleep, copper smelt) | Done |
| M5: Shared World (node sync, fire sync, nameplates, death+loot, bedroll, criminal record, photorealism) | Done |
| M6: NPC Civilization (5 settlements, NPC memory in DB, territory, trade, gate closure, SettlementHUD) | Done |
| M7: Iron Age + PvP Outlaw (iron ore, blast furnace, real iron chemistry, PvP kills, bounties, redemption) | Done |
| M8 Track 1: Weather (Markov chain, rain/snow/storm/wind/clouds — fire extinguishing in progress) | In Progress |
| M8 Track 2: Steel Age (carburization, quenching, steel tools/armor) | Planned |
| M9 Track 1: Rivers (RiverSystem, flow-field erosion, valley carving, RiverRenderer Fresnel, KCC push, freshwater, clay nodes, RiverHUD) | Done |
| M9 Track 2: Animals (AnimalAISystem deer/wolf/boar, AnimalRenderer InstancedMesh LOD, hunting loot, leather/armor/needle/tusk knife) | Done |
| M9 Track 3: Performance (worker tick rates, creature LOD, BATCH_UPDATE, NodeHealthBars pool, gl.compile warmup) | Done |
| M10 Track A: Seasons (SeasonSystem.js 40-min year, 4 seasons, SeasonalTerrainPass overlays, winter +20% metabolic cost, SeasonWidget HUD) | Done |
| M10 Track B: Sailing + Fishing (SailingSystem.ts raft/sailing boat/tacking/no-go zone, SailingRenderer.tsx, compass, fishing rod, bite timer, ITEM 59-62, recipes 81-87) | Done |
| M10 Track C: Trade Economy (TradeEconomy.js, settlement_stockpiles Neon DB, 0.6x-2.5x pricing, 5 specializations, NPC caravans every 5min, ShopHUD.tsx buy/sell, copper coins, MAT 59-62) | Done |
| M11: Gunpowder (KNO3+C+S Arrhenius, saltpeter/sulfur sourcing, musket), Castles (CastleRenderer, wall/tower/gate, siege, civLevel 4-5), Astronomy (IAU star positions, telescope, moon phase, eclipse), Diplomacy (mayor NPC, envoys, war/peace, criminal alignment) | Done |
| M12: Space Age (RocketSystem.ts, RocketVFXRenderer.tsx, RadioSystem.ts, RadioTowerVFXRenderer.tsx, ElectricLightPass.tsx, civLevel 6 gate, VelarSignalView.tsx L7 teaser) | Done |
| M13 Track A: Velar Signal (DecoderPanel.tsx 8-symbol Morse, FirstContactOverlay.tsx 12s cinematic 200 stars scintillation, VELAR_DECODED WS, discoveries+planets Neon DB tables, FirstContactBanner on companion site 15s poll) | Done |
| M13 Track B: Orbital Mechanics (OrbitalMechanicsSystem.ts Aethon 0.7AU/Velar 2.1AU/Sulfis 0.4AU Kepler orbits, OrbitalView.tsx 400x400 SVG solar map capsule launch arc, ITEM 66 Orbital Capsule recipe 100 5x circuit_board+10x steel_ingot 1200s, PROBE_LANDED WS seeded planet data) | Done |
| M13 Track C: Nuclear (NuclearReactorSystem.ts 100kW +40C/s fission -60C/s water cooling meltdown at 800C 20m radiation zone 2HP/s cleanup mission 10 clay+5 stone, ReactorWidget HUD green/amber/red, electric_forge arc_welder, MAT.HYDROGEN=68, recipes 101-103) | Done |
| Companion site (https://universe-companion.vercel.app) | Live; FirstContactBanner added M13 |

## Next available IDs
- MAT: 69
- ITEM: 67
- Recipe: 104

## Database tables
- player_saves: position, vitals, ev_points, civ_tier, discoveries (TEXT JSON), current_goal, sim_seconds, murder_count
- world_settings: time_scale, sim_time
- npc_memory: settlement_id, player_id, trust, threat, last_interaction
- settlement_stockpiles: settlement_id, material_id, quantity, updated_at (M10 — must be created manually; init-db does not yet create this table)
- discoveries: id, discovery_type, player_id, data (JSONB), created_at (M13 — must be created manually; not yet in init-db)
- planets: id, planet_name, terrain_type, mineral_composition (JSONB), atmospheric_conditions (JSONB), surveyed_at, surveyed_by (M13 — must be created manually; not yet in init-db)

## WebSocket messages through M13
Client to server: JOIN, PLAYER_UPDATE, NODE_DESTROYED, FIRE_STARTED, PLAYER_KILLED, TRADE_OFFER, TRADE_ACCEPT, SHOP_BUY (M10), SHOP_SELL (M10), ADMIN_SET_TIME
Server to client: WORLD_SNAPSHOT, BATCH_UPDATE, PLAYER_JOINED, PLAYER_LEFT, NODE_DESTROYED, FIRE_STARTED, PLAYER_KILLED, SETTLEMENT_UNLOCKED_IRON, BOUNTY_COLLECTED, SEASON_CHANGED (M10), STOCKPILE_UPDATE (M10), CARAVAN_SPAWNED (M10), DIPLOMACY_STATE_CHANGED (M11), ROCKET_LAUNCHED (M12), PLAYER_RADIO_BROADCAST (M12), CIVILIZATION_L6 (M12), VELAR_DECODED (M13), PROBE_LANDED (M13)

## M13 new files
- src/rendering/DecoderPanel.tsx — 8-symbol Morse DOT/DASH input panel; validates Velar cipher; broadcasts VELAR_DECODED on success
- src/rendering/FirstContactOverlay.tsx — 12-second cinematic on VELAR_DECODED; 200 star particles with scintillation shader; writes to discoveries+planets DB
- src/systems/OrbitalMechanicsSystem.ts — Kepler orbit simulation for Aethon (0.7 AU), Velar (2.1 AU), Sulfis (0.4 AU); broadcasts PROBE_LANDED with seeded planet data
- src/rendering/OrbitalView.tsx — 400x400 SVG solar map showing live planetary positions and capsule launch arc
- src/systems/NuclearReactorSystem.ts — 100kW reactor with fission/cooling physics, meltdown at 800C, 20m radiation zone 2HP/s, cleanup mission
- src/ui/ReactorWidget — HUD temperature bar green/amber/red for nuclear reactor

## M12 new files
- src/systems/RocketSystem.ts — countdown/ignition/ascent state machine, ROCKET_LAUNCHED WS broadcast, screen shake
- src/rendering/RocketVFXRenderer.tsx — 3-layer exhaust cone (white/orange/soot, 180 particles), heat shimmer ShaderMaterial, scorch disc
- src/systems/RadioSystem.ts — broadcast queue, tower registry, PLAYER_RADIO_BROADCAST WS
- src/rendering/RadioTowerVFXRenderer.tsx — teal EM pulse rings (additive blend, 1 ring/2s)
- src/rendering/ElectricLightPass.tsx — 40 tungsten PointLights (2700K, #FFBA74) on civLevel 6 settlements, night-only with flicker
- src/ui/VelarSignalView.tsx — Morse-blink signal panel, L7 teaser text, triggers 30s after first rocket launch (upgraded to interactive decoder in M13)

## M13 new items and materials (IDs)
- ITEM 66: Orbital Capsule (recipe 100: 5x circuit_board + 10x steel_ingot, 1200s)
- MAT 68: Hydrogen (electrolysis byproduct at nuclear reactor, recipe 101)
- Recipe 100: Orbital Capsule
- Recipe 101: Hydrogen production (electrolysis)
- Recipe 102: Electric Forge (construction station)
- Recipe 103: Arc Welder (construction station)

## M11/M12 items and materials (IDs)
- MUSKET: ITEM 63
- TELESCOPE: ITEM 64
- ARTILLERY_SHELL: ITEM 65 (no delivery system yet — item is inert)
- SALTPETER: MAT 63
- SULFUR: MAT 64
- ROCKET_FUEL: MAT 65
- CIRCUIT_BOARD: MAT 66
- NUCLEAR_FUEL: MAT 67

## M11/M12 recipes (IDs 88-99)
- 88: Gunpowder (Saltpeter + Carbon + Sulfur at heat)
- 89: Musket (Iron Barrel + Powder Charge)
- 90: Glass Ingot (2 Sand in kiln)
- 91: Telescope (4 Iron Ingot + 2 Glass Ingot)
- 92: Castle Wall Segment
- 93: Castle Tower
- 94: Castle Gate
- 95: Artillery Shell
- 96-99: M12 electronics/rocket/radio recipes (Circuit Board, Radio Tower, Rocket, Nuclear Fuel)

## Bug fixed in M13
- SceneRoot.tsx popEat handler missing closing brace (TS1128) — resolved

## Fixed in session 2026-03-19
- /api/save, /api/load, /api/world-settings converted from Web API style to Node.js req/res style
- Admin time-scale POST now sends Clerk JWT
- Pointer lock released when sidebar panels open
- Rapier3D physics engine fully integrated (planet trimesh, player capsule, KCC, radial gravity)
- Terrain triangle winding fixed
- DevUser ghost copy removed

## Known remaining bugs as of 2026-03-21 (M13)
- B-01: admin.ts still uses Web API style — will 500 in production (admin player list broken)
- B-02: No save-failed toast notification
- B-03: Duplicate Clerk packages (@clerk/clerk-react v5 and @clerk/react v6)
- B-04: Simulation grid state not persisted (fires lost on disconnect)
- B-05: Status site canvas fixed at 800x600 — click detection may be off at extreme aspect ratios
- B-06: Fire extinguishing during rain not yet wired to chemistry grid (WeatherRenderer exists, back-end wiring pending)
- B-07 (M10): Watercraft position not broadcast over WebSocket — other players cannot see moving boats
- B-08 (M10): Fishing rod has no cast animation — rod appears static during bite wait
- B-09 (M10): settlement_stockpiles table requires manual creation; init-db does not create it automatically
- B-10 (M12): 40 PointLights per civLevel 6 settlement — performance impact at multiple simultaneous civLevel 6 settlements unverified
- B-11 (M12): RESOLVED in M13 — VelarSignalView is now a full interactive decoder
- B-12 (M13): Velar cipher validation is client-side in DecoderPanel.tsx — should be server-side to prevent bundle inspection bypass
- B-13 (M13): Nuclear reactor radiation zone is client-side state only — lost on page refresh; should persist to DB
- B-14 (M13): discoveries and planets Neon DB tables not in init-db — require manual creation on fresh deployments
- B-15 (M13): No in-world capsule flight VFX — other players see PROBE_LANDED event but no visual of the capsule in flight
- ADMIN_SET_TIME WebSocket command still has no server-side auth check

## Sidebar panel status
- Inventory (I): Working
- Crafting (C): Working (includes M9-M13 recipes through Recipe 103)
- Build (B): Working (includes castle blocks from M11)
- Science (S): Working — links to https://universe-companion.vercel.app
- Tech Tree (T): Placeholder only
- Evolution (E): Placeholder only
- Journal (J): Placeholder only
- Settings (Esc): Placeholder only
