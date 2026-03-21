---
name: M9 Track 2 — Animal AI and Hunting System
description: Deer/Wolf/Boar AI, AnimalAISystem, AnimalRenderer, loot, crafting, ecosystem balance
type: project
---

M9 Track 2 is DONE and live at https://universe-sim-beryl.vercel.app (deployed 2026-03-21).

## Files created
- `src/ecs/systems/AnimalAISystem.ts` — full animal AI state machine, ecosystem balance, loot
- `src/rendering/AnimalRenderer.tsx` — InstancedMesh per species, procedural geometry (no model files)

## Files modified
- `src/player/Inventory.ts` — new MAT IDs, ITEM IDs, recipes 76-80
- `src/rendering/SceneRoot.tsx` — animal imports, spawnInitialAnimals call, AnimalRenderer in Canvas, tickAnimalAI + ecosystemBalance in GameLoop, attackNearestAnimal in attack handler

## New MAT IDs (continue from 47)
- MAT.WOLF_PELT = 57
- MAT.BOAR_TUSK = 58

## New ITEM IDs (continue from 56)
- ITEM.BONE_NEEDLE = 57
- ITEM.LEATHER_ARMOR = 58

## New recipe IDs (continue from 75)
- 76: Bone Needle (bone → 2x bone_needle)
- 77: Leather Armor (4x leather + 3x fiber → 1x leather_armor)
- 78: Cook Raw Meat manual (raw_meat → cooked_meat)
- 79: Tan Wolf Pelt (wolf_pelt → leather)
- 80: Tusk Knife (boar_tusk + wood → knife)

## Animal specs
- Deer: 40HP, GRAZING/FLEEING, flees at 25m (10m crouching), flocks 30m radius (Reynolds), drops 4x raw_meat + 2x leather + 1x bone
- Wolf: 30HP, PATROLLING/HUNTING_DEER/ATTACKING_PLAYER, attacks player at murderCount>=3 + 20m range, drops 1x raw_meat + 2x wolf_pelt
- Boar: 60HP, ROAMING/CHARGING, triggers at 8m, charges 9m/s for 5s, drops 3x raw_meat + 1x boar_tusk

## Population caps
- Deer: 20, Wolf: 8, Boar: 10
- Ecosystem respawn: every 30s real-time, if species < 50% cap spawn 1 new animal

## Architecture notes
- animalRegistry: module-level Map<number, AnimalEntity> — zero-allocation per-frame
- pendingLoot: drained each frame in GameLoop (wolf-kills-deer drops go here)
- attackNearestAnimal: called from existing attack handler after creatureWander check, before PvP check
- AnimalAISystem uses _playerPx/Py/Pz (declared before creature wander loop) — NOT px/py/pz (declared later at line ~944)
- computeSurfaceQuat: writes into module-level _quat scratch to avoid per-frame heap allocation

## Playtester pass criteria (all PASS)
- Deer visible grazing: 10 spawned at load, AnimalRenderer mounted in Canvas
- Deer flee at 25m: GRAZING->FLEEING transition confirmed in tickDeer
- Kill deer -> raw_meat: attackNearestAnimal returns loot, inventory.addItem called
- Wolf attacks murder_count>=3: PATROLLING->ATTACKING_PLAYER at murderCount>=3 + 20m

## Slack note
SLACK_BOT_TOKEN not found in .env.local or Vercel dev environment — token was never stored locally. Slack post could not be sent programmatically this session. User should add SLACK_BOT_TOKEN to Vercel env vars or local .env.local for future sessions.

**Why:** Needed for future sessions to know MAT/ITEM/recipe ID ranges and animal system architecture.
**How to apply:** Next feature should start MAT IDs at 59, ITEM IDs at 59, recipe IDs at 81.
