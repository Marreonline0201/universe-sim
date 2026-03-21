---
name: Core Architecture Decisions
description: Key engine, rendering, and systems architecture decisions for universe-sim
type: project
---

Stack: React + React Three Fiber + Three.js, Vite build, Vercel deployment, Neon PostgreSQL, Clerk auth, Railway WebSocket server.

Engine: SimulationEngine with 4 SharedArrayBuffer workers (physics/fluid/thermal/chem). Grid: 64x32x64. LocalSimManager is the main-thread interface.

Key singletons (GameSingletons.ts): inventory (Inventory), buildingSystem, techTree, evolutionTree, journal.

ECS: bitecs — world, createPlayerEntity, createCreatureEntity. Components: Position, Rotation, Velocity, Health, Metabolism, CreatureBody, IsDead.

PlayerController: WASD + mouse look, Rapier KCC, popInteract/popAttack/popDig/popEat/popHerb/popSleep key events.

GameLoop: runs inside Canvas via useFrame in SceneRoot.tsx. All survival system ticks happen here per-frame.

SurvivalSystems.ts: tickFoodCooking, tickWoundSystem, tickSleepSystem, tickFurnaceSmelting — all called from GameLoop useFrame.

playerStore (Zustand): hunger/thirst/health/energy/fatigue/ambientTemp/wounds/isSleeping/bedrollPlaced/equippedSlot.

Material IDs (MAT): CHARCOAL=10, COPPER_ORE=11, RAW_MEAT from NODE_TYPES, COOKED_MEAT, LEAF, COPPER.
Item IDs (ITEM): BEDROLL=47, COPPER_KNIFE=48.

Recipe IDs relevant to slices: 64=Cook Meat manual, 65=Bedroll, 66=Copper Knife.

Building types: stone_furnace (tier 0, id='stone_furnace'), smelting_furnace (tier 2). Slice 7 uses stone_furnace as the tier-0 smelting path.

/api/save: self-healing inline ALTER TABLE ADD COLUMN IF NOT EXISTS migrations. /api/load: SELECT * with JSON.parse on text columns.

**Why:** These are load-bearing architectural facts that affect every implementation decision.
**How to apply:** Reference when adding new systems, recipes, buildings, or API endpoints.
