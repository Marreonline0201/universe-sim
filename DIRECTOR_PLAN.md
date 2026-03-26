# Director Plan -- Universe Sim

**Date**: 2026-03-25
**Sprint**: M17
**Status**: Active -- Sprint Planning Complete

---

## M16 Retrospective

**Shipped:**
- PostProcessing.tsx: UnrealBloom + GLSL vignette via raw Three.js EffectComposer (bypasses fiber version conflict)
- Genome phenotype wiring: AnimalAISystem now reads locomotion/vision/offense/defense/neural from genome
- Extracted module files: GameLoop.ts (1228 lines), BuildingPlacement.ts, LootPickup.ts, CreatureWanderSystem.ts, ResourceNodeManager.ts
- Telegram approval flow for blocked agents
- Status site: draggable sidebar, bigger fonts, agentState in JOIN snapshot

**Not shipped (carried over):**
- SceneRoot decomposition REVERTED -- gp-agent truncated SceneRoot mid-write, had to restore from backup (commit 8506fb5). SceneRoot is still 3844 lines. The extracted modules exist on disk but SceneRoot does not import them; it still has its own inline GameLoop at line 997.
- Genome system wired but never tested against actual gameplay
- Chemistry-to-gameplay pipeline still dormant
- Player onboarding still absent

**Lessons learned:**
- SceneRoot extraction is extremely high-risk. The previous agent tried to rewrite the entire file at once and corrupted it. We must extract incrementally -- one system at a time, verify after each extraction.
- PostProcessing was done correctly by writing a new standalone file that SceneRoot simply imports. This is the pattern to follow.

---

## M17 Sprint Plan -- 3 Parallel Tracks

### Track A (P0): SceneRoot Incremental Decomposition
**Assigned to**: `ui-worker`
**Duration**: Full sprint
**Strategy**: Incremental extraction -- one module per pass, verify game still runs after each extraction. Never rewrite SceneRoot wholesale.

The inline GameLoop (lines 997-3844) contains the following subsystems that must be extracted one at a time:

| Step | Extract | Target File | Approx Lines | Dependencies |
|------|---------|-------------|-------------|--------------|
| A1 | Building placement logic | Already in `src/game/BuildingPlacement.ts` (97 lines) -- wire it in | ~120 lines from SceneRoot | gameStore, buildingSystem |
| A2 | Loot pickup logic | Already in `src/game/LootPickup.ts` (54 lines) -- wire it in | ~80 lines from SceneRoot | playerStore, inventory |
| A3 | Resource gathering/node interaction | Already in `src/world/ResourceNodeManager.ts` (223 lines) -- wire it in | ~150 lines from SceneRoot | inventory, canHarvest |
| A4 | Creature wander + spawn | Already in `src/ecs/systems/CreatureWanderSystem.ts` (87 lines) -- wire it in | ~100 lines from SceneRoot | ECS Position, terrain |
| A5 | Combat system (melee + ranged) | New: `src/game/CombatSystem.ts` | ~200 lines from SceneRoot | Health, inventory, wounds |
| A6 | Sailing + fishing | New: `src/game/SailingFishingSystem.ts` | ~150 lines from SceneRoot | SailingSystem, store |
| A7 | Settlement proximity + NPC trade | New: `src/game/SettlementProximity.ts` | ~100 lines from SceneRoot | settlementStore |
| A8 | Rocket + nuclear + transit | Already split across game/ -- wire remaining pieces | ~100 lines from SceneRoot | transit/rocket stores |
| A9 | Survival ticks (cooking, smelting, quenching, sleep) | Consolidate into existing `SurvivalSystems.ts` | ~150 lines from SceneRoot | SurvivalSystems |
| A10 | Final cleanup -- SceneRoot as thin composition root | SceneRoot.tsx | Target: under 600 lines | All above |

**Quality gate per step**: `npm run build` succeeds. SceneRoot line count drops by the expected amount. No new console errors.

**Quality gate final**: SceneRoot under 600 lines. All game systems functional.

---

### Track B (P0): Genome-to-Behavior Validation + Testing
**Assigned to**: `biology-prof` (via `knowledge-director`)
**Duration**: Sprint first half

The genome phenotype interface already exists in `AnimalAISystem.ts`:
```
speedMult, detectionRange, attackDamage, maxHealth, armorReduction, behaviorTier
```

What needs verification:
1. **B1**: Confirm deer/wolf/boar spawn with genomes and phenotype values actually affect their runtime behavior. Log phenotype values at spawn and verify speed/detection differ between individuals.
2. **B2**: Confirm `behaviorTier` > 0 creatures use BehaviorTree (tier 1-2) or GOAP (tier 3). Currently AnimalAISystem defines the tiers but may fall back to the same state machine for all tiers.
3. **B3**: Test mutation on reproduction -- verify `MutationEngine.mutate()` is called when animals reproduce and offspring have varied phenotypes.
4. **B4**: Verify `tickEcosystemBalance()` produces Lotka-Volterra oscillations over a 10-minute play session (prey population grows, predators follow, prey crashes, predators starve).
5. **B5**: Add a `/debug genome` overlay that shows the genome phenotype of the nearest creature (dev-mode only).

**Quality gate**: Screenshots or console logs showing: (a) varied phenotype values across individuals, (b) behavioral differences between high/low detection range creatures, (c) population oscillation over time.

---

### Track C (P1): Player Onboarding -- Contextual Hints System
**Assigned to**: `interaction` agent
**Duration**: Full sprint

**Problem**: New players see 15+ keybinds on the click-to-play overlay and have no progressive guidance.

**Deliverables**:

| Task | Description | Target File |
|------|-------------|-------------|
| C1 | Create `src/ui/ContextualHints.tsx` -- a component that watches player state and shows floating hints | New file |
| C2 | "F to gather" hint -- appears when player is within 5m of a resource node and has not gathered before | ContextualHints.tsx |
| C3 | "G to dig" hint -- appears when on diggable terrain | ContextualHints.tsx |
| C4 | "Tab to open inventory" hint -- appears after first successful gather | ContextualHints.tsx |
| C5 | "C to craft" hint -- appears when player has 2+ material types in inventory | ContextualHints.tsx |
| C6 | Reduce click-to-play overlay to: WASD (move), Mouse (look), Space (jump), F (interact). Add "Press H for all controls" for the rest | WorldBootstrapScreen.tsx or equivalent |
| C7 | Auto-open journal with "Survival Basics" entry on first spawn | journal singleton + first-frame hook |

**Technical spec**: Hints should be screen-space divs (not 3D), positioned bottom-center, fade in/out with CSS transitions, auto-dismiss after action is performed. Use a `hintsStore` (Zustand) to track which hints have been shown. Persist shown hints in localStorage so they don't repeat.

**Quality gate**: A first-time player sees contextual prompts that guide them through gather -> inventory -> craft within 3 minutes without reading any external docs.

---

## Priority Queue (After M17 Tracks Complete)

| Priority | Item | Assigned To | Status |
|----------|------|-------------|--------|
| P1 | Chemistry-to-gameplay pipeline (fermentation, acid rain, photosynthesis feedback) | chemistry-prof | Queued for M18 |
| P1 | SSAO + color grading in PostProcessing pipeline | ui-worker | Queued -- bloom + vignette shipped |
| P1 | PBR material pass (roughness/normal maps on terrain, rocks, trees) | ui-worker | Queued for M18 |
| P2 | Atmospheric scattering (Rayleigh + Mie) for day/night | ui-worker | Queued |
| P2 | Tree LOD (instanced low-poly at distance) | ui-worker | Queued |
| P2 | Species divergence notifications in journal | biology-prof | Queued |

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Incremental extraction, not wholesale rewrite | Previous wholesale attempt corrupted SceneRoot and had to be reverted |
| One extracted module per commit | Enables bisect if something breaks |
| Extracted modules already exist on disk | GameLoop.ts, BuildingPlacement.ts, LootPickup.ts, CreatureWanderSystem.ts, ResourceNodeManager.ts all exist -- SceneRoot just needs to import and delegate to them |
| PostProcessing as standalone import is the pattern | Proven in M16 -- write new file, SceneRoot imports it, no surgery on the monolith needed |
| Genome validation before new species | Must confirm existing phenotype wiring works before adding complexity |
| Onboarding before new features | Players cannot discover features they don't know exist |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SceneRoot extraction breaks gameplay (again) | High | Critical | One module per commit, build check after each, never rewrite wholesale |
| Genome phenotypes not actually affecting behavior | Medium | High | B1-B4 explicit test plan with logging |
| Hints system feels intrusive | Low | Medium | Auto-dismiss, localStorage persistence, no repeat |
| Multi-agent file conflicts | Medium | Medium | Track A owns SceneRoot + src/game/, Track B owns src/biology/ + src/ecs/systems/, Track C owns src/ui/ |

---

## Agent Dispatch Plan

| Agent | Track | First Task | Report To |
|-------|-------|-----------|-----------|
| `ui-worker` | Track A | A1: Wire BuildingPlacement.ts into SceneRoot, remove inline building logic | director |
| `biology-prof` | Track B | B1: Log genome phenotype values at animal spawn, verify variation | knowledge-director -> director |
| `interaction` | Track C | C1: Create ContextualHints.tsx with "F to gather" as first hint | director |
| `cqa` | Code review | Review each Track A extraction commit for correctness | director |

---

## Immediate Next Actions

1. Report M17 plan to Railway as `director`
2. Dispatch `ui-worker` for Track A (SceneRoot decomposition, incremental approach)
3. Dispatch `knowledge-director` to coordinate `biology-prof` for Track B (genome validation)
4. Dispatch `interaction` for Track C (contextual hints)
5. Update AGENTS.md if new file ownership needed
