---
name: feedback_sceneroot_extraction
description: SceneRoot must be decomposed incrementally (one module per commit), never rewritten wholesale — learned from M16 corruption incident
type: feedback
---

Never rewrite SceneRoot.tsx in a single pass. Extract one module at a time, verify build after each extraction.

**Why:** In M16, gp-agent attempted a wholesale rewrite of the 3844-line SceneRoot and truncated/corrupted it mid-write. The entire file had to be restored from backup (commit 8506fb5). The extracted module files (GameLoop.ts, BuildingPlacement.ts, etc.) were written but SceneRoot was never updated to import them.

**How to apply:** When any agent proposes working on SceneRoot decomposition, enforce the incremental pattern: (1) identify one inline subsystem, (2) verify the corresponding extracted module file exists and is correct, (3) update SceneRoot to import and delegate to it, (4) remove the inline code, (5) run `npm run build`, (6) commit. Repeat for next module. If an agent proposes rewriting the whole file, reject the approach.
