---
name: Initial codebase assessment
description: Key findings from first deep-read of universe-sim codebase -- critical issues and priorities identified
type: project
---

SceneRoot.tsx is 3843 lines containing the entire game loop, all gameplay systems, and dozens of renderer components. This is the primary technical debt item.

The biology stack (GenomeEncoder, MutationEngine, SpeciesRegistry, EcosystemBalance) and AI stack (BehaviorTree, GOAP, EmotionModel, SensorySystem) are well-designed but disconnected from actual creature behavior. Creatures use a simple wander-and-bite loop hardcoded in SceneRoot.

Post-processing was removed due to a version conflict between @react-three/postprocessing 3.0.4 and @react-three/fiber 8.18.0. No bloom, SSAO, or color grading exists.

The chemistry ReactionEngine has 50+ Arrhenius reactions but only cooking and smelting produce visible gameplay effects.

**Why:** These findings drive the DIRECTOR_PLAN.md priority ordering.

**How to apply:** When assigning work, SceneRoot decomposition must come first (unblocks all parallel work). Genome wiring is next (core game promise). Post-processing and chemistry pipeline follow.
