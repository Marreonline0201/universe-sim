# Director Plan -- Universe Sim

**Date**: 2026-03-25
**Status**: Active -- Phase 1 Assessment Complete

---

## Executive Assessment

The codebase is impressive in scope -- a scientifically grounded open-world survival sim running on a sphere planet with full ECS, Rapier physics, WebSocket multiplayer, genome-driven biology, Arrhenius chemistry, Lotka-Volterra ecosystems, day/night cycles, weather, seasons, rivers, settlements, diplomacy, rocketry, nuclear reactors, and interplanetary transit. The foundations are strong.

However, the project has a critical architectural problem and several gameplay gaps that need immediate attention. Here are the top priorities.

---

## Priority 1 (P0): SceneRoot Monolith Decomposition

**Problem**: `src/rendering/SceneRoot.tsx` is **3,843 lines** -- a single React component containing the entire game loop, resource spawning, creature AI, combat, crafting, building placement, death handling, settlement proximity, fishing, sailing, musket firing, rocket launching, nuclear reactor ticking, and dozens of renderer components. This is the single biggest technical debt in the project.

**Impact**:
- Impossible to test individual systems in isolation
- Every change risks breaking unrelated systems
- Merge conflicts for any multi-agent work
- Performance optimization is blind -- cannot profile individual systems
- New developers cannot onboard to any subsystem without reading 3800+ lines

**Assigned to**: `gp-agent` (gameplay programmer)

**Deliverables**:
1. Extract `GameLoop` into `src/game/GameLoop.ts` -- pure function taking (dt, entityId, refs)
2. Extract resource node logic into `src/world/ResourceNodeManager.ts`
3. Extract creature wander AI into `src/ecs/systems/CreatureWanderSystem.ts`
4. Extract building placement into `src/game/BuildingPlacement.ts`
5. Extract death loot pickup into `src/game/LootPickup.ts`
6. Keep SceneRoot as a thin composition root -- only wiring, no game logic

**Quality gate**: SceneRoot under 800 lines. Each extracted module has a clear single responsibility. Game behavior is identical before and after.

---

## Priority 2 (P0): Creature AI and Biology Systems Are Disconnected

**Problem**: The genome system (`GenomeEncoder`, `MutationEngine`, `SpeciesRegistry`, `EcosystemBalance`) is beautifully designed but **not connected to actual gameplay**. Creatures are spawned with random genomes but their behavior is a simple wander-and-bite state machine. The genome bits (vision, locomotion, offense, defense, neural complexity) do not influence creature behavior at all.

Meanwhile, `src/ai/` contains sophisticated systems (`BehaviorTree`, `GOAP`, `EmotionModel`, `SensorySystem`, `NeuralArchitecture`, `SocialSimulation`, `MemorySystem`) that appear to be unused -- the actual creature AI is hardcoded in SceneRoot lines 1043-1094 and `AnimalAISystem.ts`.

**Impact**: The core promise of the game -- "everything emerges from real physics/chemistry/biology" -- is broken for creatures. Players see animals wandering randomly regardless of their genome.

**Assigned to**: `knowledge-director` -> `biology-prof` + `ai-npc`

**Deliverables**:
1. Wire genome phenotype decoding into creature behavior: vision range affects detection distance, locomotion stats affect movement speed, offense/defense affects combat, neural level determines AI complexity tier
2. Connect `BehaviorTree` / `GOAP` systems to `AnimalAISystem` so higher-neural-level creatures exhibit more complex behavior
3. Make `MutationEngine` actually run on creature reproduction events
4. Wire `EcosystemBalance` Lotka-Volterra dynamics to real population control (currently only deer/wolf/boar with hardcoded respawn)
5. Species divergence events should be visible to the player (notification + journal entry)

**Quality gate**: A creature with genome bits encoding "fast swim speed, no legs" should swim and not walk. A creature with high neural complexity should exhibit learning behavior. Population dynamics should show predator-prey oscillations over time.

---

## Priority 3 (P1): Chemistry-to-Gameplay Pipeline Gap

**Problem**: The `ReactionEngine` has 50+ Arrhenius reactions modeled with real activation energies and enthalpies. The `SimulationEngine` runs 4 web workers (physics, fluid, thermal, chem). But the chemistry results do not feed back into observable gameplay effects beyond cooking and smelting.

Reactions like photosynthesis, fermentation, acid-base chemistry, and abiogenesis are defined but produce no visible world effects. The player cannot experiment with chemistry -- they gather pre-placed resource nodes and follow hardcoded crafting recipes.

**Assigned to**: `knowledge-director` -> `chemistry-prof` + `physics-prof`

**Deliverables**:
1. Expose sim-grid chemistry to player interaction: mixing materials near heat sources should trigger observable reactions with visual/audio feedback
2. Make photosynthesis drive plant growth rates (connect to biome vegetation density)
3. Fermentation should produce alcohol (new consumable with gameplay effects)
4. Acid rain (SO2 + H2O -> H2SO4) should damage structures and affect soil fertility
5. Player-discoverable reactions should unlock journal entries explaining the science

**Quality gate**: Player can discover at least 5 chemical reactions through experimentation (not menus). Each reaction has a visible world effect.

---

## Priority 4 (P1): Post-Processing and Visual Polish

**Problem**: The comment on line 925-926 of SceneRoot says it all:
> "EffectComposer (Bloom + Vignette) removed: @react-three/postprocessing 3.0.4 crashes with @react-three/fiber 8.18.0"

The game has no post-processing. No bloom, no SSAO, no depth of field, no color grading, no motion blur. For a game targeting visual fidelity, this is unacceptable.

Additionally:
- Fog is a flat `fogExp2` with a single color (#c0d8f4) -- no volumetric scattering
- Tree geometry is basic cones with no leaf billboards or LODs
- Rock meshes are single dodecahedrons
- No PBR textures anywhere -- everything is flat `meshStandardMaterial` with color only

**Assigned to**: `ui-worker` (rendering specialist)

**Deliverables**:
1. Fix post-processing pipeline: upgrade `@react-three/postprocessing` or use raw Three.js `EffectComposer`
2. Add bloom (sun, fire, bioluminescent creatures), SSAO, and subtle vignette
3. Implement proper atmospheric scattering for the day/night cycle (Rayleigh + Mie)
4. Add PBR material maps to hero assets (trees, rocks, terrain) -- at minimum roughness/normal variation
5. Implement LOD for tree meshes (instanced low-poly at distance)

**Quality gate**: Screenshot comparison shows measurable improvement in lighting depth, material variety, and atmospheric quality.

---

## Priority 5 (P1): Player Onboarding and Discovery Flow

**Problem**: New players spawn on a sphere planet with no guidance. The "click to play" overlay lists 15+ keybinds. There is no progressive disclosure of mechanics. The game philosophy is "no tech trees, no gates" but there is also no narrative thread to guide exploration.

**Assigned to**: `gp-agent` + `ui-worker`

**Deliverables**:
1. Contextual hints system: show keybind hints only when relevant (show "F to gather" when near a resource, "G to dig" when standing on diggable terrain)
2. First 5 minutes flow: spawn near obvious resources, first gather auto-opens inventory, first craft auto-opens craft panel (some of this exists but is inconsistent)
3. Discovery journal should auto-populate initial entries explaining basic survival (hunger, thirst, shelter)
4. Reduce "click to play" overlay to essential controls only (WASD, mouse, Space, F); show others contextually

**Quality gate**: A new player can survive their first 10 minutes without reading external documentation.

---

## Immediate Next Action

**Spawning `gp-agent` now** to begin Priority 1 (SceneRoot decomposition). This unblocks all other work by making the codebase modular enough for parallel agent development.

While that runs, I will prepare detailed briefs for `knowledge-director` (Priorities 2-3) and `ui-worker` (Priority 4).

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Extract game loop before adding features | Every new feature added to the 3800-line monolith compounds the debt |
| Wire genomes to behavior before adding new species | Foundation must work before scaling |
| Fix post-processing before adding visual assets | Pipeline must be in place before art passes |
| Chemistry feedback before new reactions | Existing reactions should be visible before adding more |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SceneRoot refactor breaks existing gameplay | High | Critical | Incremental extraction with behavior verification after each module |
| Post-processing upgrade introduces new crashes | Medium | High | Test on branch, keep fallback path |
| Genome-behavior wiring creates balance issues | High | Medium | Start with observation (journal) before combat effects |
| Multi-agent file conflicts in shared directories | Medium | Medium | Clear file ownership per AGENTS.md, coordination via status reporting |
