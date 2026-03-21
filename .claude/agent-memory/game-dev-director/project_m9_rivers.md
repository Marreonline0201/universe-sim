---
name: M9 Track 1 Rivers and Erosion Terrain
description: M9 Track 1 complete — RiverSystem flow-field, valley carving, RiverRenderer, riverStore, RiverHUD, SceneRoot integration
type: project
---

M9 Track 1: Rivers and Erosion Terrain — DONE as of 2026-03-21
Deployment: dpl_9XnjUZ9arWURaUpfNq2EPCnKnVP9 — READY at universe-sim-beryl.vercel.app (commit 8df5d30)

Feature inventory:

**RiverSystem.ts** (`src/world/RiverSystem.ts`)
- `buildRivers()`: flow-field algorithm, 10 rivers seeded from `RIVER_SEED=31337`
- Sources: `h > 100m` land points; stops at `h <= 4m` (ocean)
- March step: `0.008 rad` arc (~32m); max 600 steps; steepest-descent via finite-difference gradient
- `bakeCarveEntries()`: pre-baked influence grid for O(N) carve lookup per geometry vertex
- `getRiverCarveDepth(dx, dy, dz)`: returns 0-15m carve depth; corridor = 3× river width
- `queryNearestRiver(wx, wy, wz, maxDist)`: proximity query returning flow dir, speed, t, dist
- `getRiverClayPositions()`: 2-3 clay deposit positions per river at t > 0.3

**SpherePlanet.ts** (`src/world/SpherePlanet.ts`)
- `registerRiverCarveDepth(fn)`: lazy registration hook (avoids circular import)
- `terrainHeightAt()` now calls `_getRiverCarveDepth` and subtracts carve depth before clamping
- Called in SceneRoot at module eval time before React renders terrain geometry

**RiverRenderer.tsx** (`src/rendering/RiverRenderer.tsx`)
- Flat ribbon mesh per river: one quad per path segment
- Width lerp: 2m (source, t=0) → 15m (mouth, t=1)
- Lifted 0.3m above terrain to prevent z-fighting
- Material: `MeshPhongMaterial` with `onBeforeCompile` injection:
  - Animated wave brightness (sine scroll along world Y)
  - Deep-water color blend (dark blue toward centre)
  - Fresnel opacity (edge transparency via viewDir · normal)
  - `uTime` uniform driven by `useFrame` clock

**riverStore.ts** (`src/store/riverStore.ts`)
- `nearRiver: boolean` — within 20m
- `inRiver: boolean` — within 6m of centreline
- `riverCurrentX/Y/Z` — current velocity in world space

**RiverHUD.tsx** (`src/ui/RiverHUD.tsx`)
- Blue water droplet SVG + text
- `'In river — press [E] to drink'` when inRiver, `'Fresh water nearby [20m]'` when nearRiver only
- Mounted outside Canvas in SceneRoot JSX return

**SceneRoot.tsx integration:**
- Module-level: `registerRiverCarveDepth(getRiverCarveDepth)` — fires before React render
- Module-level IIFE: `getRiverClayPositions()` → pushes to `RESOURCE_NODES` as `type: 'clay'` nodes
- Canvas: `<RiverRenderer />` inside `<Suspense>` block
- DOM: `<RiverHUD />` after `<SettlementHUD />`
- GameLoop: river block checks `queryNearestRiver` every frame
  - `inRiver`: KCC nudged by `flowDir * speed * 0.4 * dt`, thirst auto-drains 0.04/s, valley warms
  - `nearRiver && thirst > 0.1`: drink prompt shown in gatherPrompt
  - `popEat` in river block for instant 25% drink (fires if eat block didn't consume it)
- Fixed pre-existing bug: `tickAnimalAI` used `px/py/pz` before declaration; replaced with `_playerPx/_playerPy/_playerPz`

**SlackAgent.js / index.js (server):**
- `notifyM9Shipped()` method added to SlackAgent
- `M9_NOTIFY_SENT` guard in index.js — fires on Railway boot after push to master (2026-03-21)

**Why:** Rivers are the core M9 geographical feature — they create real valley geography, resource biomes, and survival mechanics (fresh water vs. ocean salt water).
**How to apply:** River clay nodes are already in RESOURCE_NODES. For M9 Track 2 (fish), query RIVERS paths for fish spawn positions using `queryNearestRiver` with larger maxDist. For fish, `type: 'fish'` nodes placed near river mouth (t > 0.7).
