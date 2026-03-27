# M75 Task T2: Organism Wandering Movement

**Task ID:** M75-T2
**Agent:** biology-prof
**Priority:** P0 (Critical)
**Status:** READY FOR DISPATCH

---

## Objective

Simulation organisms (created by `SimulationIntegration.ts`) currently sit motionless at their spawn positions forever. They have ECS Position and Velocity components but are never registered with the `creatureWander` map that `tickCreatureWander()` iterates. The result: a static, lifeless world.

**Goal:** Make every organism drift slowly across the planet surface, changing direction every few seconds. This is the most basic sign of life.

---

## Technical Analysis (Director-provided)

### How movement works today (for old RPG creatures)
1. `CreatureSpawner.ts` creates creature ECS entities AND calls `creatureWander.set(eid, {...})` to register them
2. `GameLoop.ts` line 400 calls `tickCreatureWander(dt, ...)` every frame
3. `CreatureWanderSystem.ts` iterates the `creatureWander` map, applies random velocity, re-projects to planet surface

### What's missing for simulation organisms
- `SimulationIntegration.ts` creates ECS entities via `createCreatureEntity()` but **never** calls `creatureWander.set()`
- Therefore `tickCreatureWander()` has no entries for simulation organisms and they never move

### The fix
In `SimulationIntegration.ts`, after every `createCreatureEntity()` call, register the new entity with the wander system:

**File:** `src/biology/SimulationIntegration.ts`

1. Add import at top:
```typescript
import { creatureWander } from '../ecs/systems/CreatureWanderSystem'
```

2. In `initializeSimulation()` (around line 148-158), after the `createCreatureEntity()` call, add:
```typescript
// M75: Register organism with wander system so it moves
const wanderAngle = posRng() * Math.PI * 2
const wanderSpeed = 0.1 + posRng() * 0.2  // slow drift: 0.1-0.3 m/s (organisms are large)
creatureWander.set(eid, {
  vx: Math.cos(wanderAngle) * wanderSpeed,
  vy: 0,
  vz: Math.sin(wanderAngle) * wanderSpeed,
  timer: 2 + posRng() * 6,
})
```

3. In the birth sync section (around line 240-248), after the `createCreatureEntity()` call for new organisms born during ticks, add the same registration:
```typescript
// M75: Register newborn with wander system
const bornAngle = posRng() * Math.PI * 2
const bornSpeed = 0.1 + posRng() * 0.2
creatureWander.set(eid, {
  vx: Math.cos(bornAngle) * bornSpeed,
  vy: 0,
  vz: Math.sin(bornAngle) * bornSpeed,
  timer: 2 + posRng() * 6,
})
```

4. In the death sync section (around line 206-217), when removing dead organisms, also clean up the wander map:
```typescript
// M75: Clean up wander state for dead organisms
creatureWander.delete(eid)
```

### Speed calibration note
- Old RPG creatures wander at 0.3-0.8 m/s (line 40 of CreatureWanderSystem.ts)
- Simulation organisms are 8-20m in size, so they should wander SLOWER relative to body size
- 0.1-0.3 m/s creates gentle primordial drift (not frantic movement)
- `CreatureWanderSystem` already handles direction changes (timer 2-6s) and surface re-projection

---

## Deliverables
- Modified `src/biology/SimulationIntegration.ts` with wander registration on create, birth, and cleanup on death
- Build passes (`npx vite build`)
- No new files needed

## Quality Criteria
- All simulation organisms should visibly move when viewed in spectator mode [G]
- Movement should be slow, gentle drift — not frantic
- Dead organisms should not leave orphaned wander state entries (memory leak)
- No performance regression (organisms are instanced, wander system is O(n))

## Dependencies
- None — can proceed immediately

---

## Files to modify
- `src/biology/SimulationIntegration.ts` (primary)

## Files to read for context
- `src/ecs/systems/CreatureWanderSystem.ts` (understand wander map and tick)
- `src/ecs/systems/CreatureSpawner.ts` (see how old creatures register with wander)
- `src/rendering/entities/CreatureRenderer.tsx` (see how Position drives rendering)
