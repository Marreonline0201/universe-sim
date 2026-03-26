---
name: project_m17_sprint
description: M17 Sprint Plan — 3 tracks: SceneRoot incremental decomposition (ui-worker), genome validation (biology-prof), player onboarding hints (interaction agent)
type: project
---

# M17 Sprint — Started 2026-03-25

## Track A (P0): SceneRoot Incremental Decomposition
- **Agent**: ui-worker
- **Problem**: SceneRoot.tsx is 3844 lines. Previous wholesale rewrite attempt was reverted (commit 8506fb5). Extracted module files exist on disk (GameLoop.ts 1228 lines, BuildingPlacement.ts 97 lines, LootPickup.ts 54 lines, CreatureWanderSystem.ts 87 lines, ResourceNodeManager.ts 223 lines) but SceneRoot still has inline copies and does not import them.
- **Strategy**: One module extraction per commit, build-verify after each. Never rewrite SceneRoot wholesale.
- **10 steps**: A1 BuildingPlacement -> A2 LootPickup -> A3 ResourceNodeManager -> A4 CreatureWander -> A5 CombatSystem (new) -> A6 SailingFishing (new) -> A7 SettlementProximity (new) -> A8 Rocket/Nuclear/Transit wiring -> A9 Survival ticks consolidation -> A10 Final cleanup
- **Quality gate**: SceneRoot under 600 lines, npm run build passes

**Why:** SceneRoot monolith blocks all parallel development, makes profiling impossible, and caused the M16 corruption incident.
**How to apply:** All Track A work must be incremental. If an agent proposes rewriting SceneRoot in one pass, reject it.

## Track B (P0): Genome-to-Behavior Validation
- **Agent**: biology-prof via knowledge-director
- **Problem**: AnimalAISystem has phenotype interface (speedMult, detectionRange, attackDamage, maxHealth, armorReduction, behaviorTier) but needs testing that these values actually affect runtime behavior.
- **5 tasks**: B1 log phenotype variation at spawn, B2 verify behaviorTier routes to BehaviorTree/GOAP, B3 test mutation on reproduction, B4 verify Lotka-Volterra oscillation, B5 debug genome overlay

## Track C (P1): Player Onboarding -- Contextual Hints
- **Agent**: interaction
- **Problem**: 15+ keybinds on click-to-play overlay, no progressive disclosure
- **Deliverables**: ContextualHints.tsx component, hintsStore (Zustand + localStorage), reduced overlay, auto-open journal on first spawn
