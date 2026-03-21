---
name: M9 Track 3 Performance Optimization
description: M9 Track 3 — 7 performance optimizations: worker throttling, LOD creatures, zero-alloc HP bars, WS batching, shader warmup
type: project
---

M9 Track 3: Performance & Scale Optimization — DONE as of 2026-03-21.

Target: 50-200 concurrent players, 60fps at 1080p on GTX 1070 equivalent.

## Changes

### 1. Worker Tick-Rate Throttling — src/engine/SimulationEngine.ts
WORKER_INTERVAL_MS map: physics=0 (every frame), fluid=50ms (20Hz), chem=50ms (20Hz), thermal=100ms (10Hz).
workerAccumMs: Map<string, number> accumulates wall-clock time per throttled worker.
Accumulated dt passed on fire — energy conserved across skipped frames.

### 2. Creature LOD InstancedMesh — src/rendering/entities/CreatureRenderer.tsx
3 LOD tiers: 8x8 sphere <50m (LOD_NEAR_SQ=2500), 4x4 sphere 50-200m, 3x3 sphere >200m (LOD_FAR_SQ=40000).
Scratch objects: _matrix useRef(new Matrix4()), _color useRef(new Color()), _camPos useRef(new Vector3()), _cPos useRef(new Vector3()).
Three separate refs meshRef0/meshRef1/meshRef2 (not array — Rules of Hooks).
distSq computed with no sqrt per creature. SSS material shared across all LOD meshes.

### 3. WebSocket Message Batching — server/src/BroadcastScheduler.js + index.js
_batchQueue = [] on constructor. enqueueBatch(msg) pushes to queue.
_broadcast() flushes as single BATCH_UPDATE JSON after WORLD_SNAPSHOT.
Queue drained even when players.count === 0 to prevent unbounded growth.
WeatherSystem.onBroadcast now calls scheduler.enqueueBatch() instead of broadcastAll().

### 4. BATCH_UPDATE Client Handler — src/net/WorldSocket.ts
case 'BATCH_UPDATE': iterates msg.messages array, calls this._dispatch(sub) for each.

### 5. NodeHealthBars GC Fix — src/rendering/SceneRoot.tsx
_MAX_HP_BARS=32 pool at module scope. _hpTrackGeo, _hpTrackMat, _hpFillGeo, _hpFillMats array(32).
_hpBarPos, _hpCamDir, _hpZAxis, _hpBillQ scratch objects.
useFrame: slot counter, setHSL in-place, scale.x for fill width. Zero per-frame allocations.

### 6. BuildingGhost Scratch — src/rendering/SceneRoot.tsx
_ghostPlayerPos, _ghostPlayerUp, _ghostDir, _ghostYUp module-level Vector3 scratch objects.

### 7. Creature Wander Scratch — src/rendering/SceneRoot.tsx
_creatureDir3 module-level Vector3, reused via .set(ndx, ndy, ndz) in creature loop.

### 8. Terrain Shader Warmup — src/rendering/PlanetTerrain.tsx
useEffect on mount: creates warmupScene + tiny SphereGeometry(1,4,4), calls gl.compile(warmupScene, camera).
Disposes warmupGeo after compile. Eliminates 50-200ms first-frame GPU program compilation hitch.

## ECS Audit Finding
Entity count: 10 creatures + 1 player + 50 server NPCs = 61 total. Well under 500 threshold.
Spatial partitioning not needed at current scale.

## Next IDs (unchanged from M9 T2)
Next MAT ID: 59 | Next ITEM ID: 59 | Next recipe ID: 81

**Why:** Performance baseline for 50-200 concurrent players.
**How to apply:** Worker throttling is keyed by worker name string — add new workers to WORKER_INTERVAL_MS.
BATCH_UPDATE is the pattern for all future non-critical server→client messages.
