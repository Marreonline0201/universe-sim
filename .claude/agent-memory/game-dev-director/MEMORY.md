# Memory Index

## Project
- [project_m17_sprint.md](project_m17_sprint.md) — M17 Sprint: SceneRoot decomposition (10-step incremental), genome validation, player onboarding hints
- [project_m14.md](project_m14.md) — M14 Interstellar Travel DONE — transit animation, Velar language/gateway, multiverse registry + companion Universe Map; next IDs: MAT 70, ITEM 68, Recipe 106
- [project_m13.md](project_m13.md) — M13 Velar Contact DONE — First Contact decoder/cinematic, orbital mechanics (Aethon/Velar/Sulfis), nuclear physics/meltdown; next IDs: MAT 69, ITEM 67, Recipe 104
- [project_m11.md](project_m11.md) — M11 Civilization Age DONE — gunpowder/musket, castle walls, mayor/diplomacy, night sky/telescope; next IDs: MAT 65, ITEM 65, recipe 93
- [project_m10.md](project_m10.md) — M10 Tracks A/B/C DONE — Seasonal Cycle, Ocean Sailing, NPC Trade Economy; next IDs: MAT 63, ITEM 63, recipe 88
- [project_m9t3_perf.md](project_m9t3_perf.md) — M9 Track 3: Performance Optimization DONE — worker throttling, LOD creatures, zero-alloc HP bars, WS batching, shader warmup
- [project_m9_rivers.md](project_m9_rivers.md) — M9 Track 1: Rivers and Erosion Terrain DONE — RiverSystem flow-field, valley carving, RiverRenderer, riverStore, RiverHUD, clay nodes, current physics, fresh water (commit 8df5d30)
- [project_m9_animal_ai.md](project_m9_animal_ai.md) — M9 Track 2: Animal AI DONE — AnimalAISystem, AnimalRenderer, deer/wolf/boar, MAT 57-58, ITEM 57-58, recipes 76-80, next IDs: MAT 59, ITEM 59, recipe 81
- [project_m8_companion_site.md](project_m8_companion_site.md) — M8 Track 3: Science Companion site at universe-companion — all files written, needs npm install + vercel deploy --prod to go live
- [project_m8_steel_age.md](project_m8_steel_age.md) — M8 Track 2: Steel Age — MAT/ITEM IDs 44-47/52-56, recipe IDs 71-75, carburization chemistry, quenching, armor slot, civLevel 3 gate
- [project_slices_status.md](project_slices_status.md) — Slices 1-7 PASS; M5-M11 all DONE; live at universe-sim-beryl.vercel.app
- [project_m8_weather.md](project_m8_weather.md) — M8 Track 1: Weather System — WeatherSystem.js Markov chain, WeatherRenderer.tsx particles, weatherStore, suppressFire, hypothermia, HUD widget
- [project_m7_outlaw_system.md](project_m7_outlaw_system.md) — M7 Track 2: PvP Outlaw system — OutlawSystem.js, murder detection, bounties, NPC tier reactions, redemption quests, death persistence
- [project_m7_iron_age.md](project_m7_iron_age.md) — M7 Track 1: Iron Age — MAT/ITEM IDs, recipe IDs 67-70, smelting logic, quality system, iron pickaxe gate, SettlementManager hook, build pitfall
- [project_m6_npc_civilization.md](project_m6_npc_civilization.md) — M6 architecture: SettlementManager, NpcMemory, message protocol, DB tables, R3F line pitfall
- [project_architecture.md](project_architecture.md) — Core engine/rendering/systems architecture: stack, ECS, singletons, MAT/ITEM IDs, recipe IDs, building types
- [project_photorealism_pass.md](project_photorealism_pass.md) — M5 Track 3 photorealism: all 6 systems implemented (wet terrain, wind sway, rock specular, creature SSS, night fog, postprocessing)
- [project_m5_track1_multiplayer.md](project_m5_track1_multiplayer.md) — M5 Track 1 server-authoritative world state: NODE_DESTROYED/RESPAWNED/FIRE_STARTED protocol, NodeStateSync, Neon DB depleted_nodes table, pitfalls

## Feedback
- [feedback_sceneroot_extraction.md](feedback_sceneroot_extraction.md) — SceneRoot must be decomposed incrementally, never wholesale — M16 corruption incident
- [feedback_playtester_approach.md](feedback_playtester_approach.md) — game-playtester Skill does not exist; use build log + runtime log + code audit instead
