---
name: Universe Sim project context
description: Key architectural facts, milestone history, known bugs, and feature status for Universe Simulation as of 2026-03-26 (report v27, M15 complete)
type: project
---

The app is a multiplayer 3D browser survival game at https://universe-sim-beryl.vercel.app.

Architecture: Vite/React/Three.js frontend on Vercel, Vercel serverless API routes (save, load, world-settings, admin), always-on Railway WebSocket server, Neon Postgres database, Clerk for auth.

**Why:** Game is in active development. Report v27 written 2026-03-26 after M15 completion and 12 playtesting cycles (Cycles 1-12, 2026-03-24 to 2026-03-25). When asked to update the report, read the current version number and increment it (currently v27). Check these known issues before writing new findings. The Vite config has two named build entry points (main + status).

## Milestone status as of 2026-03-26

| Milestone | Status |
|---|---|
| M0: Universe Visible | Done |
| M1-M4: All 7 Survival Slices | Done |
| M5: Shared World | Done |
| M6: NPC Civilization | Done |
| M7: Iron Age + PvP Outlaw | Done |
| M8 Track 1: Weather (fire extinguishing during rain pending) | In Progress |
| M8 Track 2: Steel Age (carburization, quenching) | Planned |
| M9: Rivers + Animals + Performance | Done |
| M10: Seasons + Sailing + Trade Economy | Done |
| M11: Gunpowder + Castles + Astronomy + Diplomacy | Done |
| M12: Space Age (Rockets, Radio, Electric Lighting) | Done |
| M13: First Contact + Orbital Mechanics + Nuclear Reactor | Done |
| M14: Interplanetary Transit + Velar Language + Universe Registry | Done |
| M15: Universe Map on Companion Site | Done |
| Companion site (https://universe-companion.vercel.app) | Live; Universe Map at /universes added M15 |

## Next available IDs
- MAT: 70
- ITEM: 68
- Recipe: 106

## Database tables
- player_saves: position, vitals, ev_points, civ_tier, discoveries (TEXT JSON), current_goal, sim_seconds, murder_count
- world_settings: time_scale, sim_time
- npc_memory: settlement_id, player_id, trust, threat, last_interaction
- settlement_stockpiles: settlement_id, material_id, quantity, updated_at (M10 — must be created manually; init-db does not create this)
- discoveries: id, discovery_type, player_id, data (JSONB), created_at (M13 — must be created manually)
- planets: id, planet_name, terrain_type, mineral_composition (JSONB), atmospheric_conditions (JSONB), surveyed_at, surveyed_by (M13 — must be created manually)
- universes: seed, name, origin, player_count, tech_level, discovery_count (M14)

## WebSocket messages through M15
Client to server: JOIN, PLAYER_UPDATE, NODE_DESTROYED, FIRE_STARTED, PLAYER_KILLED, TRADE_OFFER, TRADE_ACCEPT, SHOP_BUY, SHOP_SELL, ADMIN_SET_TIME, INTERPLANETARY_TRANSIT_LAUNCHED, TRANSIT_ARRIVED, VELAR_RESPONSE, VELAR_GATEWAY_ACTIVATED
Server to client: WORLD_SNAPSHOT, BATCH_UPDATE, PLAYER_JOINED, PLAYER_LEFT, NODE_DESTROYED, FIRE_STARTED, PLAYER_KILLED, SETTLEMENT_UNLOCKED_IRON, BOUNTY_COLLECTED, SEASON_CHANGED, STOCKPILE_UPDATE, CARAVAN_SPAWNED, DIPLOMACY_STATE_CHANGED, ROCKET_LAUNCHED, PLAYER_RADIO_BROADCAST, CIVILIZATION_L6, VELAR_DECODED, PROBE_LANDED, INTERPLANETARY_TRANSIT_LAUNCHED, TRANSIT_ARRIVED_BROADCAST, VELAR_GATEWAY_REVEALED, VELAR_GATEWAY_ACTIVATED, VELAR_RESPONSE

## M14/M15 new files
- src/systems/InterplanetaryTransitSystem.ts — F-key at launch pad, 20s transit, consumes Orbital Capsule
- src/store/transitStore.ts — phase machine: idle/launching/arrived, destination seed, pad position
- src/rendering/TransitOverlay.tsx — full-screen canvas cinematic, 300 streaming stars, destination planet growth, velocity counter
- src/rendering/DestinationPlanet.tsx — procedural cube-sphere from destination seed, FBM terrain, biome colors, ocean, atmosphere, 50 resource node dots
- src/systems/VelarLanguageSystem.ts — procedural 5-glyph SVG alphabet, 5 concepts (life/star/path/here/come)
- src/store/VelarStore.ts — decoded symbols, gateway active state, gateway position
- src/rendering/VelarResponsePanel.tsx — symbol decoding puzzle with hint tooltips, VELAR_RESPONSE_DECODED on completion
- src/rendering/VelarGatewayRenderer.tsx — 6m torus ring, 80 halo particles, rotating inner energy disc
- server/src/UniverseRegistry.js — universes Neon DB table, spawnVelarWorld(), in-process room registry
- companion-site/app/api/universes/route.ts — API endpoint querying universes table, 60s cache
- companion-site/app/universes/page.tsx — SVG Universe Map, universe detail panels, list sidebar, 30s polling

## M14 new items and materials
- ITEM 67: Velar Key (recipe 105: 5x circuit_board + 3x nuclear_fuel + 10x steel_ingot + 1x velar_crystal)
- MAT 69: Velar Crystal (recipe 104: 3x nuclear_fuel + 5x hydrogen + 2x gold)
- Recipes 104-105 assigned

## Known active bugs as of 2026-03-26
- B-01: admin.ts still uses Web API style — will 500 in production (admin player list broken)
- B-02: No save-failed toast notification
- B-03: Duplicate Clerk packages (@clerk/clerk-react v5 and @clerk/react v6)
- B-04: Simulation grid state not persisted (fires lost on disconnect)
- B-05: Status site canvas fixed at 800x600 — click detection may be off at extreme aspect ratios
- B-06: Fire extinguishing during rain not yet wired to chemistry grid (WeatherRenderer exists, back-end wiring pending)
- B-07: Railway WebSocket server intermittently DOWN (found during playtesting 2026-03-24)
- B-10: Fire CRAFT recipe produces inert ITEM.FIRE item (misleading; real fire mechanic is equip Flint + press Q)
- B-17: MAP panel shows position (0,0) after bedroll respawn until player moves (low priority)
- ADMIN_SET_TIME WebSocket command still has no server-side auth check

## Resolved bugs (confirmed)
- B-08: Vitals drain behind CLICK TO PLAY overlay — fixed 2026-03-24
- B-09: No food on respawn — fixed 2026-03-24 (3x Cooked Meat given on respawn)
- B-11: Ambient temp permanently stuck after storm — fixed 2026-03-24
- B-12: Cold death attributed to "STARVED TO DEATH" — fixed 2026-03-24 ('hypothermia' cause added)
- B-13: Ambient temp not recovering after storm cleared — fixed 2026-03-24
- B-15: God Mode + steel quench notification infinite spam — fixed 2026-03-25 (isGodMode guard in tickQuenching)
- B-16: God Mode did not protect from cold/starvation damage — fixed 2026-03-24
- B-18: Building resource consumption no-op in God Mode — fixed 2026-03-25 (removeItemForce added)
- B-19: Crafting consumed materials when inventory full — fixed 2026-03-25 (canAddItem validation added)

## Sidebar panel status (as of 2026-03-26)
- Inventory (I): Working
- Crafting (C): Working (recipes 1-105 through M14)
- Build (B): Working (includes castle blocks M11; resource consumption fixed M15 sessions)
- Science (S): Working — links to https://universe-companion.vercel.app
- Tech Tree (T): Working — 10 tiers, ReactFlow graph view, EP spend confirmed
- Evolution (E): Working — biological traits purchasable with EP
- Journal (J): Working — discovery log with category filter
- Character (CHR): Working — Identity/Vitals/Genome display
- Map (M): Working — fog of war, compass, player dot; position stuck at (0,0) after respawn (B-17)
- Settings (Esc): Placeholder only

## Food system architecture (confirmed from playtesting)
Food is foraged from world environment or obtained by hunting animals. It is NOT crafted from base materials at a crafting table. The Systematic Gathering tech tree discovery (T0, 3 EP) unlocks the ability to find edible plants/fungi in the world via G key or world pickup.

## Starvation damage threshold unclear
Playtest cycle 10 (2026-03-25): player survived 26+ minutes with hunger=22 and health=100 (no starvation damage). Damage threshold appears to trigger at or near 0, not at low-but-nonzero hunger. Needs investigation.
