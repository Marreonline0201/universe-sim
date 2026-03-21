---
name: universe-sim project context
description: Key architectural facts, recurring patterns, and known issues in the universe-sim spherical planet survival game
type: project
---

React Three Fiber spherical planet survival game. Stack: R3F + Rapier physics + bitECS + Zustand stores.

**Why:** Player is building a civilization sim on a procedurally generated spherical planet (PLANET_RADIUS=4000m, cube-sphere geometry).

**Key architectural facts:**
- Planet uses cube-sphere mapping (6 faces, segs=64 render / segs=60 physics), value noise FBM terrain
- Physics: Rapier KCC (kinematic character controller), zero world gravity, radial gravity applied in PlayerController
- ECS: bitECS (world, Position, Velocity, Rotation, Health, Metabolism components)
- Stores: gameStore (inputBlocked, flyMode, spectateTarget), playerStore (entityId, vitals), multiplayerStore (remoteNpcs)
- Resource nodes: module-level RESOURCE_NODES array generated once via getSpawnPosition() + seededRand
- NPC rendering: ServerNpcsRenderer (multiplayer) + LocalNpcsRenderer (offline fallback, 12 wandering NPCs)
- Gather system: F key calls popInteract() → gatheredNodeIds.add() → inventory.addItem(). Single-press gather (no multi-hit) for F key path. Attack path (Q/LMB) uses NODE_HITS_TAKEN multi-hit system.
- MetabolismSystem runs in ECS (hunger ticks every frame), then vitals pushed to playerStore for HUD.
- Death: checkAndTriggerDeath() called from GameLoop; DeathScreen reads isDead from playerStore; respawn calls executeRespawn().

**Known bugs identified in audit (2026-03-21):**

CRITICAL:
- Gather (F key) ignores NODE_HITS_TAKEN — instantly yields full loot on single press, bypassing multi-hit system used by attack path (SceneRoot.tsx ~958-986)
- Combat attack (Q/LMB) NEVER damages creatures — attack block only targets RESOURCE_NODES, zero code path for creature health damage (SceneRoot.tsx ~1092-1151)
- Node proximity check uses nearDist < 9 (3m squared radius check) but nearDist is raw squared distance so the actual check is sqrt(9)=3m which is correct — however the comment says "within 3m" and the variable name is misleading (not a bug, just confusing)
- Gather check: nearNode is the SINGLE nearest node, not the nearest within range — if the nearest node is >3m away, nothing is shown, but the actual range check (d2 < nearDist) accumulates all nodes' distances incorrectly: nearDist is initialized to Infinity, so nearNode is always the absolute nearest regardless of range. The range gate is only applied at line 945 (nearDist < 9). This is correct behavior but confusing.

HIGH:
- MetabolismSystem marks ECS entities dead (addComponent IsDead) but GameLoop checks Health.current[entityId] directly, not the IsDead component — the two death paths are parallel and could conflict (MetabolismSystem.ts:60-63 vs SceneRoot.tsx:776-788)
- Respawn: executeRespawn sets ECS position via callback but does NOT call rapierWorld.getPlayer()?.body.setNextKinematicTranslation() in executeRespawn itself — it IS called via the lambda in handleRespawn (SceneRoot.tsx:402), so this is fine — but if executeRespawn is ever called from elsewhere it would break physics sync
- Creature wander AI allocates new THREE.Vector3(ndx, ndy, ndz) inside useFrame every frame for every creature (SceneRoot.tsx ~727) — GC pressure with 10 creatures
- BuildingGhost allocates new THREE.Vector3 and new THREE.Quaternion inside useFrame every frame (SceneRoot.tsx ~1287-1305)
- DeathSystem: loot drops use flat world-Y offset (drop.y) instead of surface-normal offset — items may spawn underground on non-equatorial surfaces (DeathSystem.ts:71-73)
- determinDeathCause is spelled wrong (missing 'e') — minor but could cause import confusion

MEDIUM:
- SurvivalSystems tickFoodCooking checks slot.itemId !== 0 to exclude non-raw-material slots — but this means equipped items (itemId > 0) are never checked, which is correct. However slot.materialId !== MAT.RAW_MEAT check means ALL non-raw-meat material slots are deleted from cookingProgress each frame even if they never had cooking state — minor excess work.
- MapPanel: uses usePlayerStore(s => s.x) and usePlayerStore(s => s.z) but playerStore.x/z is only updated via setPosition() called each GameLoop frame — fine for online but MapPanel will show (0,0) briefly on load until first frame runs
- CraftingPanel: canCraft() is called 3 times per recipe per render (line 184, 249, 252) — minor perf issue

LOW / STYLE:
- terrainYAt() defined in SceneRoot.tsx (~259) but never called anywhere — dead code
- OCEAN_RADIUS = PLANET_RADIUS + SEA_LEVEL = PLANET_RADIUS + 0 so ocean check is exactly at planet radius
- hash3() precision issue (64-bit integer literal) noted in prior audit — still present
- SciencePanel LoadingDots animation logic: '...'.slice(0, frame === 0 ? 1 : frame === 1 ? 2 : 3) always resolves to 1, 2, or 3 dots — frame 3 shows '...' which is correct but frame 0 shows only '.' which is fine. Logic is correct but unnecessarily complex.

**Recurring patterns to watch:**
- Heavy per-frame THREE object allocation inside useFrame (Vectors, Quaternions, Matrix4) — ongoing GC pressure
- useGameStore.getState() called inside useFrame (correct pattern for Zustand in R3F loop)
- hash3() uses a 64-bit integer literal (6364136223846793005) in JS which loses precision — terrain noise is subtly wrong
- terrainYAt() function is defined but never called anywhere in the codebase
- The OCEAN_RADIUS constant = PLANET_RADIUS + SEA_LEVEL = PLANET_RADIUS + 0, so it equals PLANET_RADIUS exactly
- NPC facing direction computation uses a flat (dx, 0, dz) vector that ignores sphere-space Y movement
- BuildingGhost position offset is applied as `gy + btype.size[1] / 2` in world space (not surface-normal space)
- Camera near plane = 0.5m causes z-fighting at close range on a 4000m radius planet
- Attack path (Q/LMB) only targets resource nodes, never creature entities — combat damage against creatures is unimplemented

**How to apply:** Flag any new code that allocates THREE objects inside useFrame, touches the hash3 noise function, or modifies the camera near/far ratio. When reviewing combat code, confirm both resource node AND creature health paths exist.
