# Director Plan -- Universe Sim

**Date**: 2026-03-25
**Sprint**: M18
**Status**: Active -- Sprint Planning Complete

---

## M17 Retrospective

**Shipped:**
- SceneRoot decomposition: 3843 -> 2189 lines (GameLoop extracted to `src/game/GameLoop.ts`, unused imports cleaned)
- Genome-to-behavior wiring validated and fixed in `AnimalAISystem.ts`
- ContextualHints system (`src/ui/ContextualHints.tsx`) + simplified click-to-play overlay
- PostProcessing pipeline (bloom + vignette) stable
- Agent bus works in Node.js/Claude Code context
- Server: auto-idle agents after inactivity

**Carried over to M18:**
- SceneRoot still 2189 lines -- target is under 600. ~1500 lines of inline renderers remain.
- Chemistry-to-gameplay pipeline still dormant (ReactionEngine exists but not wired to gameplay)
- PostProcessing only has bloom + vignette -- no SSAO, no color grading
- PBR material pass not started (terrain/rocks/trees still use basic vertex colors + simple materials)

**Lessons learned:**
- Incremental extraction pattern proven successful in M17 -- GameLoop extracted cleanly
- PostProcessing as standalone import is the gold standard pattern
- Always verify build after each extraction step

---

## M18 Sprint Plan -- 3 Parallel Tracks

### Track A (P0): SceneRoot Continued Decomposition
**Assigned to**: `ui-worker`
**Duration**: Full sprint
**Strategy**: Continue incremental extraction. Each step produces a new file in `src/rendering/entities/` or `src/rendering/`, SceneRoot imports the component, inline code is deleted. Build verified after each step.

SceneRoot currently contains these inline renderer components (total ~1500 lines):

| Step | Extract | Target File | Approx Lines | What It Contains |
|------|---------|-------------|-------------|------------------|
| A1 | NPC humanoid figure + skin/clothing | `src/rendering/entities/HumanoidFigure.tsx` | ~100 | `HumanoidFigure` component, `NPC_SKIN_TONES`, `NPC_SHIRT_COLS`, `NPC_PANTS_COLS` constants |
| A2 | Server NPC renderer | `src/rendering/entities/ServerNpcsRenderer.tsx` | ~200 | `AnimatedNpcMesh`, `ServerNpcsRenderer` -- imports HumanoidFigure |
| A3 | Local NPC renderer + utility AI | `src/rendering/entities/LocalNpcsRenderer.tsx` | ~400 | `LocalNpcState`, `utilityScore`, `selectAiAction`, `buildLocalNpcs`, `LocalNpcMesh`, `LocalNpcsRenderer` -- the entire local NPC AI and rendering system |
| A4 | Player mesh + equipped item | `src/rendering/entities/PlayerRenderer.tsx` | ~300 | `PlayerMesh`, `EquippedItemMesh`, `HumanoidFigure` usage for player body |
| A5 | Resource nodes (trees/rocks/bark) | `src/rendering/entities/ResourceNodesRenderer.tsx` | ~300 | `TreeMesh`, `BarkMesh`, `RockMesh`, `ResourceNodes`, `nodeRand`, `makeWindFoliageMaterial`, `makeRockMaterial` |
| A6 | Node health bars | `src/rendering/entities/NodeHealthBars.tsx` | ~90 | `NodeHealthBars`, preallocated mesh pool, billboard quaternion logic |
| A7 | Building ghost + placed buildings | `src/rendering/entities/BuildingsRenderer.tsx` | ~120 | `BuildingGhost`, `PlacedBuildingsRenderer`, `BUILDING_COLORS` |
| A8 | Death loot + bedroll + dig holes | `src/rendering/entities/MiscRenderers.tsx` | ~130 | `DeathLootDropsRenderer`, `BedrollMeshRenderer`, `DigHolesRenderer`, shared geometry |
| A9 | Creature spawning logic | `src/ecs/systems/CreatureSpawner.ts` | ~100 | `spawnInitialCreatures()` function currently at module scope in SceneRoot |
| A10 | Final cleanup -- SceneRoot as thin composition root | SceneRoot.tsx | Target: under 600 lines | Remove dead code, consolidate imports |

**Quality gate per step**: `npm run build` succeeds. SceneRoot line count drops by the expected amount. No new console errors. Extracted component renders identically.

**Quality gate final**: SceneRoot under 600 lines. All game systems functional.

---

### Track B (P1): PostProcessing Pipeline Enhancement
**Assigned to**: `ui-worker` (after Track A steps A1-A5, or in parallel if separate agent)
**Duration**: Sprint second half

Current PostProcessing.tsx has bloom + vignette only. M18 adds:

| Task | Description | Technical Spec |
|------|-------------|---------------|
| B1 | SSAO (Screen-Space Ambient Occlusion) | Add `SAOPass` or custom SSAO ShaderPass to the EffectComposer chain. Parameters: radius 0.5m, intensity 0.3, bias 0.025. Insert AFTER RenderPass, BEFORE bloom. This darkens crevices in terrain, under trees, inside building interiors. |
| B2 | Film-grade color grading | Add a LUT-based color grading ShaderPass at the END of the chain (after vignette). Use a neutral-warm cinematic LUT: lift shadows slightly blue (+0.02 B), push midtones warm (+0.04 R, +0.02 G), highlight rolloff. Implement as 3D LUT texture lookup in fragment shader. |
| B3 | Filmic tonemapping | Replace Three.js default tonemapping (ACESFilmic) with a custom filmic curve ShaderPass for finer control. Parameters: shoulder strength 0.22, linear strength 0.30, linear angle 0.10, toe strength 0.20, exposure 1.0. |

**Quality gate**: Side-by-side before/after screenshots showing: (a) visible AO darkening in terrain crevices and tree bases, (b) warm cinematic color shift without over-saturation, (c) smooth highlight rolloff without clipping.

---

### Track C (P1): Chemistry-to-Gameplay Pipeline
**Assigned to**: `chemistry-prof` (via `knowledge-director`)
**Duration**: Full sprint

The ReactionEngine.ts is a complete Arrhenius-based system with 40+ reactions defined. But NONE are wired to affect gameplay. M18 connects chemistry to the game world.

| Task | Description | Target File |
|------|-------------|-------------|
| C1 | Fermentation gameplay effect | When player places grain + water in a container near warmth (fire/smelter), after 60s game time, produce "Fermented Brew" item. Wire ReactionEngine `fermentation` reaction to inventory system. | New: `src/game/ChemistryGameplay.ts` |
| C2 | Acid rain weather event | When weather system rolls `storm` + temperature < 10C, trigger acid rain. Acid rain reduces durability of exposed buildings by 1%/minute and damages player health 0.5 HP/s when not under shelter. Wire `acid_base` reactions. | ChemistryGameplay.ts + WeatherSystem hook |
| C3 | Photosynthesis feedback loop | Trees near the player should visually "grow" (scale += 0.001/tick) when sunlight is above threshold (dayAngle between PI/4 and 3PI/4) and sufficient water (rain weather state). Wire `photosynthesis` reaction rate to tree scale. | ChemistryGameplay.ts + resource node hook |
| C4 | Chemistry HUD indicator | Show a small chemistry icon in the HUD when a reaction is actively occurring near the player (smelting, fermentation, etc). Display reaction name + progress bar. | New: `src/ui/ChemistryHUD.tsx` |

**Quality gate**: (a) Fermentation produces item after correct conditions are met, (b) acid rain damages buildings and player visibly, (c) trees near player grow measurably over a 5-minute play session during sunny rain, (d) chemistry indicator appears during smelting/fermentation.

---

## Priority Queue (After M18 Tracks Complete)

| Priority | Item | Assigned To | Status |
|----------|------|-------------|--------|
| P1 | PBR material pass (roughness/normal maps on terrain, rocks, trees) | ui-worker | Queued for M19 |
| P2 | Atmospheric scattering (Rayleigh + Mie) for day/night | ui-worker | Queued |
| P2 | Tree LOD (instanced low-poly at distance) | ui-worker | Queued |
| P2 | Species divergence notifications in journal | biology-prof | Queued |
| P2 | Water shader (SSR on ocean surface, caustics, foam at shoreline) | ui-worker | Queued |

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Extract renderers to `src/rendering/entities/` subdirectory | Keeps rendering components organized; entities/ already has CreatureRenderer.tsx |
| HumanoidFigure extracted first (A1) | Used by PlayerMesh, ServerNpcs, and LocalNpcs -- shared dependency must exist before consumers can be extracted |
| SSAO before color grading in post-processing chain | AO is a lighting effect computed on linear-space data; color grading operates on final tonemapped image |
| Chemistry pipeline as standalone module | Same pattern as PostProcessing -- new file, SceneRoot/GameLoop imports it, no surgery on existing code |
| LUT-based color grading over per-channel curves | Industry standard for film-quality results; allows artist iteration via Photoshop/DaVinci LUT export |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SceneRoot extraction breaks NPC rendering | Medium | High | Extract HumanoidFigure first as shared dep; build-check after each step |
| SSAO performance regression on low-end GPUs | Medium | Medium | Make SSAO optional via gameStore toggle, default ON for high-performance preference |
| Chemistry gameplay feels disconnected | Low | Medium | C4 chemistry HUD makes reactions visible; fermentation gives tangible item reward |
| Post-processing chain order bugs | Low | High | Test each pass in isolation before compositing all 5 passes |

---

## Agent Dispatch Plan

| Agent | Track | First Task | Report To |
|-------|-------|-----------|-----------|
| `ui-worker` | Track A | A1: Extract HumanoidFigure.tsx from SceneRoot | director |
| `ui-worker` | Track B | B1: Add SSAO to PostProcessing (after A5 or parallel) | director |
| `chemistry-prof` | Track C | C1: Wire fermentation reaction to inventory | knowledge-director -> director |
| `cqa` | Code review | Review each extraction commit for correctness | director |

---

## Immediate Next Actions

1. Report M18 plan to Railway as `director`
2. Dispatch `ui-worker` for Track A (SceneRoot continued decomposition -- A1 through A10)
3. Dispatch `chemistry-prof` for Track C (chemistry-to-gameplay pipeline)
4. After Track A completes A5, dispatch Track B (PostProcessing enhancement)
5. Run `npm run build` after each extraction step to verify
