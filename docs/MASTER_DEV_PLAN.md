# Universe Simulation — Master Development Plan
**Director:** game-dev-director (Claude Sonnet 4.6)
**Date:** 2026-03-21
**Status:** ACTIVE

---

## Vision Statement

A real running universe inside the web browser. Players join it and live inside it as inhabitants
at human scale (L3-L4). The universe simulates actual physical laws at every scale — from
Arrhenius chemistry to planetary geology. It runs whether players watch or not. History happened
because the simulation ran forward. Players spawn with nothing and survive using the same laws
the world obeys.

**The north star metric:** A new player opens the URL, spawns, looks around, and within 30
seconds sees the world MOVING — fire flickering, chemistry visibly happening in grid cells,
resources scattered across real terrain with biome variation. The universe feels alive.

---

## Codebase Audit Summary (2026-03-21)

### What EXISTS and is functional

| System | State | Notes |
|--------|-------|-------|
| Rapier physics (sphere planet, KCC, player capsule) | WORKING | Trimesh collider, radial gravity, WASD movement, jump, swim |
| SimulationEngine + 4 workers (physics/fluid/thermal/chem) | WORKING | SharedArrayBuffer Grid3D 64x32x64, ticks every frame |
| Arrhenius combustion in chem.worker.ts | WORKING | Wood/bark/fiber ignite, O2 consumed, heat produced — BUT INVISIBLE |
| LocalSimManager | WORKING | getHotCells(), ignite(), placeWood(), getTemperatureAt() |
| FireRenderer.tsx | PARTIAL | Reads hot cells from LocalSimManager at 10Hz, renders point lights + sphere glows — but ONLY when player manually ignites with flint (no ambient fire) |
| PlanetTerrain (cube-sphere, FBM noise, vertex colors) | WORKING | Beautiful sphere, detail noise shader, ocean + atmosphere |
| ResourceNodes (19 types, seeded placement, surface-normal aligned) | WORKING | Stone/flint/wood/ore/fiber etc. placed on terrain surface |
| PlayerController (WASD, mouse look, third/first/orbit camera) | WORKING | Sphere-aware gravity reference frame, sprint/crouch/swim |
| Inventory (40-slot, stacking, god mode) | WORKING | Backend functional |
| Gather mechanic (press F near resource, item added to inventory) | WORKING | Prompt shown, item added, node respawns after 60s |
| HUD vitals (hunger/thirst/health/temp bars) | PARTIAL | Bars render correctly, wired to MetabolismSystem ECS — but temperature reads from sim grid which shows static 15C everywhere |
| Clerk auth + Neon DB save/load | WORKING | 60s autosave, position/vitals persisted |
| Railway WebSocket multiplayer | WORKING | Remote players render, NPCs sync |
| Building system (place walls/floors/roofs) | PARTIAL | Structure placed, no physics integration yet |
| Crafting system | PARTIAL | Recipe list exists, UI exists — not wired to physical chemistry |
| Equip system | WORKING | Items equip to hand slot, stats apply |

### Critical Gaps (ordered by impact)

1. **SIMULATION INVISIBLE** — The grid ticks, chemistry runs, temperature changes — but nothing in
   the Three.js scene reflects any of it. Players see a static world.
2. **No ambient life** — No organisms spawned. Abiogenesis pipeline stubbed. World feels dead.
3. **Temperature HUD static** — HUD reads sim grid temperature but grid initializes at 15C and only
   changes if fire is lit. No environmental temperature variation by biome/time of day.
4. **Crafting not physical** — Craft panel uses recipe list, not chemistry engine. Cu2S + C + heat
   does not actually produce Cu.
5. **No day/night cycle** — Sun position fixed. No atmospheric lighting change.
6. **No biome differentiation visually** — Vertex colors vary by terrain height only. No desert
   redness, no snow caps, no forest density variation.
7. **Organisms not spawned** — Genome encoder and mutation engine exist but no creature is ever
   instantiated from them. CreatureRenderer renders nothing.
8. **No geology-based ore placement** — Resource nodes are randomly placed, not by geology rules.

---

## Priority Tiers

### P0 — Make the Universe Visible (Week 1)
These must ship before any player-facing feature work. Without visibility the game cannot be
playtested, demoed, or evaluated.

| ID | Task | Rationale |
|----|------|-----------|
| P0-1 | SimGrid Visualizer — real-time temperature/material heat map overlay | Players must be able to SEE that chemistry is running |
| P0-2 | Ambient fire sources — pre-place wood piles on the map, auto-ignite some at start | Proves fire system works without player action required |
| P0-3 | Day/night cycle — rotate directional light + sun position over 20-minute real-time cycle | World must feel like it moves |
| P0-4 | Wind-driven particle layer — ambient dust/pollen particles in air, direction from atmospheric sim | Visual proof that atmosphere is simulated |
| P0-5 | Biome temperature initialization — initialize sim grid cells to biome-correct ambient temperature | Snowy peaks cold, deserts hot — HUD temperature meaningful |
| P0-6 | Organism spawning — spawn at least 10 creatures from genome encoder at world start | World must not be empty |

### P1 — Survival Slice 1: Gather → Inventory (Week 1-2)
Slice 1 per the survival spec: fully wired end-to-end.

| ID | Task | Rationale |
|----|------|-----------|
| P1-1 | Gather mechanic polish — visual feedback (resource node shrinks/disappears, particle burst) | Currently functional but visually dead |
| P1-2 | Inventory UI wired — hotbar shows actual held items with icons, slot drag-and-drop | Inventory slots show nothing currently |
| P1-3 | Temperature vitals wired — HUD temp reads biome-corrected ambient from sim grid | Static 15C is meaningless |

### P1 — Survival Slice 2: Craft → Equip → Use (Week 2)
| ID | Task | Rationale |
|----|------|-----------|
| P1-4 | Stone tool crafting end-to-end — hold rock+flint, press C, stone tool appears, equips | First "discovery through doing" moment |
| P1-5 | Tree chopping — equip stone tool, attack tree, tree loses health, falls, yields wood | First use of an equipped tool |
| P1-6 | Fire lighting — gather tinder+wood, place in world, strike flint, fire ignites via sim grid | Proves chemistry engine drives gameplay |

### P1 — Survival Slice 3: Vitals Loop (Week 2-3)
| ID | Task | Rationale |
|----|------|-----------|
| P1-7 | Hunger depletion + eat mechanic — raw food gathers, cooked food restores more hunger | First survival pressure |
| P1-8 | Fire cooking — raw food placed near fire cell >200C becomes cooked over time | Sim grid drives a gameplay mechanic |
| P1-9 | Thirst depletion + water source — walk to ocean/river, press F, drink, thirst restores | |

### P2 — Simulation Depth (Week 3-4)
| ID | Task | Rationale |
|----|------|-----------|
| P2-1 | Physical smelting — build furnace structure, place ore+charcoal, light fire, Cu appears via chem engine | The showcase chemistry moment |
| P2-2 | Wound + infection system — take damage, bacteria count rises, herb treatment reduces it | Biology engine drives gameplay |
| P2-3 | NPC utility AI — NPCs have needs, roam, gather, react to player trust/threat score | World feels inhabited |
| P2-4 | Geology-based ore placement — copper near volcanic zones, coal in organic layers | Scientific resource distribution |
| P2-5 | Building physics — unsupported blocks fall, wood burns when adjacent fire cell > 300C | Structures interact with simulation |

### P2 — Companion Website (Week 4)
| ID | Task | Rationale |
|----|------|-----------|
| P2-6 | Science companion site — separate Vercel deployment, Claude API backing, explains game science | Player education layer |

---

## Technical Architecture Decisions

### Rendering Pipeline
- Three.js + React Three Fiber (retain — already established)
- MeshStandardMaterial with onBeforeCompile GLSL injection (retain — working in PlanetTerrain)
- InstancedMesh for resource nodes at scale (upgrade from individual meshes)
- No Nanite (WebGL limitation) — use LOD + InstancedMesh instead

### Simulation Visualization Architecture
The sim grid runs in workers. Visualization must:
1. Read the Float32Array SharedArrayBuffer from the main thread (already accessible via LocalSimManager)
2. Map temperature/material values to visual properties on every N-th frame (not every frame — 10Hz cap)
3. Use THREE.DataTexture to feed grid state to a GLSL shader — most performant path
4. Shader samples DataTexture, overlays color based on temp range (blue=cold, yellow=warm, red=hot)
5. Toggle-able debug overlay (Tab key) — not always on

### Day/Night Cycle
- Rotate a THREE.Group containing directional light + Sky sun position around planet Y-axis
- Full cycle = 20 minutes real time (configurable via SimClock)
- Sky turbidity adjusts for dawn/dusk (atmospheric scattering approximation)
- Ambient light intensity follows a cosine curve (bright noon, dark midnight)

### Organism Spawning
- GenomeEncoder already exists — use it to generate 10 starter organisms with varied genomes
- Place on terrain surface near spawn, add to ECS world
- CreatureRenderer already handles rendering — just needs entities to render

### Biome Temperature
- terrainHeightAt() returns height above sea level
- Biome = f(height, latitude-proxy from sphere position)
- Initialize grid cells: mountain peaks = -5C, desert lowlands = 35C, sea level temperate = 15C
- This gives the HUD temperature bar meaningful real-world variation

---

## Photorealism Standards (enforced on all visual work)

1. Fire: point lights must flicker (sin wave + noise, not static intensity). Color must gradient
   from deep red (300C) through orange (600C) to white-hot (1200C+). Smoke particle trail above.
2. Terrain: existing detail noise shader is good. Add wet-surface darkening near ocean edge
   (roughness increase + albedo darken within 20m of sea level).
3. Resource nodes: trees must sway (vertex shader wind animation, 0.5Hz, 2cm amplitude).
   Rocks must have specular highlight variation by face angle.
4. Day/night: sky color temperature must shift (warm orange at dawn/dusk, cool blue at noon,
   deep navy at night). Stars only visible when sun below horizon.
5. Atmospheric haze: existing fogExp2 is correct. Density must increase at night slightly.
6. Creature rendering: subsurface scattering approximation for organic materials (cheap:
   backlit translucency using dot(N, lightDir) * rimColor term in fragment shader).

---

## Subagent Roles

| Role | Responsibilities |
|------|----------------|
| sim-visualizer | P0-1: Build SimGrid DataTexture visualization layer |
| ambient-life | P0-2 + P0-6: Pre-placed fire sources + organism spawning |
| day-night-atmos | P0-3 + P0-4: Day/night cycle + wind particles + atmospheric effects |
| biome-temp | P0-5: Biome temperature initialization in sim grid |
| survival-slice-1 | P1-1 through P1-3: Gather polish + inventory UI + temp vitals |
| survival-slice-2 | P1-4 through P1-6: Stone tool crafting + tree chopping + fire lighting |
| survival-slice-3 | P1-7 through P1-9: Hunger/thirst vitals loop + cooking |
| game-playtester | After every slice: end-to-end automated playtest, report broken steps |

---

## Milestone Schedule

| Milestone | Target | Gate Criteria |
|-----------|--------|---------------|
| M0: Universe is Visible | Day 2 | Player spawns and within 30 seconds sees: fire flickering somewhere, time of day changing, creatures moving, temperature HUD showing non-static values |
| M1: Survive Slice 1 | Day 4 | Playtester: walks to rock, presses F, rock appears in inventory, can be inspected. Zero errors. |
| M2: Survive Slice 2 | Day 7 | Playtester: has rock+flint, crafts stone tool, equips it, chops tree, tree falls. Zero errors. |
| M3: Survive Slice 3 | Day 10 | Playtester: has raw food, places near fire, food cooks, eating restores hunger bar. Zero errors. |
| M4: Chemistry Showcase | Day 14 | Playtester: builds furnace, places Cu2S+charcoal, lights fire, copper metal appears. Zero errors. |

---

## Quality Gate: Definition of Done

A task is DONE when:
1. The feature is end-to-end functional (no dead-end UI, no backend-only systems)
2. A playtester agent has run the acceptance scenario and reported zero errors
3. No TypeScript type errors (tsc --noEmit passes)
4. Performance: scene maintains 60fps at 1080p on a mid-range GPU (GTX 1070 equivalent)
5. Visual: passes photorealism audit against standards above

A task is NOT done if:
- It works in dev but throws errors in production build
- It is UI-only without backend wiring
- The playtester agent found any broken step

---

## Implementation Rules (from survival spec)

1. Full vertical slices only — no feature is done until end-to-end per pass/fail criteria
2. Playtester loop after each slice — agent plays it, reports failures, dev fixes, repeat until clean
3. No dead ends — if a UI element exists, it must do something real
4. No UI-only features — do not build UI without connected backend systems
5. The simulation is the source of truth — never hardcode outcomes
6. Test-driven — write acceptance test before implementing each slice
