---
name: Universe Sim project context
description: Key architectural facts, milestone history, known bugs, and feature status for Universe Simulation as of 2026-03-27 (report v28, RPG cleanup session)
type: project
---

The app is a living universe simulation (not a game) at https://universe-sim-beryl.vercel.app.

Architecture: Vite/React/Three.js frontend on Vercel, Vercel serverless API routes (save, load, world-settings, admin), always-on Railway WebSocket server, Neon Postgres database, Clerk for auth.

**Vision:** The universe exists for itself. The player is just another creature. No quests, no XP, no skill trees, no dungeons. The one test for every feature: "Does this make the universe feel more real — or more like a game?"

**Why:** Game is in active development. Report v28 written 2026-03-27 after major RPG cleanup session. When asked to update the report, read the current version number and increment it (currently v28). Check these known issues before writing new findings.

## Major work completed 2026-03-27

- All RPG code deleted from client (dungeons, quests, XP, skill trees, factions, loot, spells) — preserved in git tag rpg-preserved-20260327
- Server crash fixed: NpcManager and OutlawSystem imports removed (modules were deleted but imports remained)
- 360+ lines of dead WebSocket handlers removed (PvP, bounty, outlaw, shop, party, trade post)
- Admin-gated: spectator camera [G], organism seeding [O], ecosystem dashboard [B]
- MaterialRegistry: 116 materials with 11 physics properties (flammability, hardness/Mohs, moisture, meltingPoint, tensileStrength, workability, thermalConductivity, ignitionTemp, combustionEnergy)
- InteractionEngine: 5 physics interactions (bow-drill fire ~15-55%, flint-iron 40%, knapping 70%, pottery 95%, smelting)
- Hidden practice tracking (success rate improves silently with attempts)
- Discovery system (first success unlocks knowledge string ID)
- Geological resource distribution: copper near tectonic boundaries, gold at convergent, iron in interiors, coal in low basins
- SettlementManager geology query: server replicates client tectonic plate algorithm to assign specialties
- OrganismManager (server-authoritative at 6 Hz): 80-300 organisms, ORGANISM_UPDATE broadcast to all players
- PlayerRegistry: shelter_x/y/z columns added, defaultShelterPos() deterministic from worldSeed+userId
- [H] key registers shelter; respawn at shelter on death
- game-dev-director.md rewritten with correct vision

## Milestone status as of 2026-03-27

| Milestone | Status |
|---|---|
| M0: Universe Visible | Done |
| M1-M4: All 7 Survival Slices | Done |
| M5: Shared World | Done |
| M6: NPC Civilization | Done |
| M7: Iron Age + PvP Outlaw | Done (PvP handlers removed 2026-03-27 as RPG code) |
| M8 Track 1: Weather (fire extinguishing during rain pending) | In Progress |
| M8 Track 2: Steel Age (carburization, quenching) | Done (SurvivalSystems kept) |
| M9: Rivers + Animals + Performance | Done |
| M10: Seasons + Sailing + Trade Economy | Done |
| M11: Gunpowder + Castles + Astronomy + Diplomacy | Done |
| M12: Space Age (Rockets, Radio, Electric Lighting) | Done |
| M13: First Contact + Orbital Mechanics + Nuclear Reactor | Done |
| M14: Interplanetary Transit + Velar Language + Universe Registry | Done |
| M15: Universe Map on Companion Site | Done |
| Foundation cleanup (RPG deletion, physics crafting, shared organisms) | Done 2026-03-27 |
| Companion site (https://universe-companion.vercel.app) | Live; Universe Map at /universes |

## What is next (from polymorphic-wishing-metcalfe.md)

1. Atmosphere pressure/humidity derived from terrain geography (rain shadows, altitude)
2. Organism state persistence across server restarts (new DB table)
3. Contextual crafting UI — no recipe browser, hints when holding two materials
4. Element-based material arc: stone → copper → iron → advanced
5. Shared player position interpolation improvement

## Database tables

- world_settings: time_scale, sim_time
- players: position, vitals, shelter_x, shelter_y, shelter_z (added 2026-03-27)
- settlements: settlement data with geology-based specialty
- node_state: depleted resource nodes and respawn timers
- npc_memory: settlement_id, player_id, trust, threat, last_interaction
- settlement_stockpiles: settlement_id, material_id, quantity (must be created manually)
- discoveries: id, discovery_type, player_id, data (JSONB), created_at (must be created manually)
- planets: id, planet_name, terrain_type, mineral_composition, atmospheric_conditions (must be created manually)
- universes: seed, name, origin, player_count, tech_level, discovery_count

## WebSocket messages (current — post RPG cleanup)

Client to server: JOIN, PLAYER_UPDATE, NODE_DESTROYED, FIRE_STARTED, PLAYER_KILLED, TRADE_OFFER, TRADE_ACCEPT, ADMIN_SET_TIME, INTERPLANETARY_TRANSIT_LAUNCHED, TRANSIT_ARRIVED, VELAR_RESPONSE, VELAR_GATEWAY_ACTIVATED

Server to client: WORLD_SNAPSHOT, ORGANISM_UPDATE (6 Hz — new 2026-03-27), BATCH_UPDATE, PLAYER_JOINED, PLAYER_LEFT, NODE_DESTROYED, FIRE_STARTED, PLAYER_KILLED, SETTLEMENT_UPDATE, SETTLEMENT_UNLOCKED_IRON, SETTLEMENT_UNLOCKED_STEEL, SEASON_CHANGED, STOCKPILE_UPDATE, CARAVAN_SPAWNED, DIPLOMACY_STATE_CHANGED, ROCKET_LAUNCHED, PLAYER_RADIO_BROADCAST, CIVILIZATION_L6, VELAR_DECODED, PROBE_LANDED, INTERPLANETARY_TRANSIT_LAUNCHED, TRANSIT_ARRIVED_BROADCAST, VELAR_GATEWAY_REVEALED, VELAR_GATEWAY_ACTIVATED, VELAR_RESPONSE, NODE_RESPAWNED

Removed 2026-03-27 (RPG cleanup): PVP_ATTACK, BOUNTY_COLLECTED, OUTLAW_FLAGGED, SHOP_BUY, SHOP_SELL, PARTY_INVITE, TRADE_POST_UPDATE (and corresponding server handlers)

## Known active bugs as of 2026-03-27

- B-01: admin.ts still uses Web API style — will 500 in production (admin player list broken)
- B-02: No save-failed toast notification
- B-03: Duplicate Clerk packages (@clerk/clerk-react v5 and @clerk/react v6) — verify against current package.json; may already be resolved
- B-04: Organism state not persisted — ecosystem resets to 80 primordials on every Railway server restart
- B-05: Status site canvas fixed at 800x600 — click detection may be off at extreme aspect ratios
- B-06: Fire extinguishing during rain not yet wired to physics (WeatherRenderer exists, back-end wiring pending)
- B-07: Railway WebSocket server intermittently DOWN (found during playtesting 2026-03-24)
- B-10: Fire CRAFT recipe produces inert ITEM.FIRE item (misleading; real fire mechanic is physics interaction)
- B-17: Map panel shows position (0,0) after shelter respawn until player moves
- B-ADMIN: ADMIN_SET_TIME WebSocket command has no server-side auth check

## Resolved bugs (confirmed)

- B-08: Vitals drain behind CLICK TO PLAY overlay — fixed 2026-03-24
- B-09: No food on respawn — fixed 2026-03-24 (3x Cooked Meat given on respawn)
- B-11: Ambient temp permanently stuck after storm — fixed 2026-03-24
- B-12: Cold death attributed to "STARVED TO DEATH" — fixed 2026-03-24
- B-13: Ambient temp not recovering after storm cleared — fixed 2026-03-24
- B-15: God Mode + steel quench notification infinite spam — fixed 2026-03-25
- B-16: God Mode did not protect from cold/starvation damage — fixed 2026-03-24
- B-18: Building resource consumption no-op in God Mode — fixed 2026-03-25
- B-19: Crafting consumed materials when inventory full — fixed 2026-03-25

## Sidebar panel status (as of 2026-03-27)

- Inventory (I): Working
- Crafting (C): Working (physics interactions; recipe list UI still visible but physics engine is active)
- Build (B): Working; ecosystem dashboard admin-only
- Science (S): Working — links to https://universe-companion.vercel.app
- Tech Tree (T): Working — 10 tiers, ReactFlow graph view
- Evolution (E): Working — biological traits
- Journal (J): Working — discovery log with category filter
- Character (CHR): Working — Identity/Vitals/Genome display
- Map (M): Working — fog of war, compass, player dot; position stuck at (0,0) after respawn (B-17)
- [H]: Register shelter — new 2026-03-27
- [G]: Spectator camera — admin-only 2026-03-27
- [O]: Organism seeding — admin-only 2026-03-27
- Settings (Esc): Placeholder only
