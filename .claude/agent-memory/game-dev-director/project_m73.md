---
name: M73 Organism Visibility Sprint
description: M73 DONE — organisms scaled 8-20m, golden-angle species colors, floating labels in spectator mode, LOD thresholds 300/1000m
type: project
---

M73 addressed the critical organism visibility problem discovered by playtester after M72.

**Root cause:** sizeFromGenome() returned 0.05-0.30m. Planet radius is 4000m. Organisms were sub-pixel.

**Completed:**
- M73-1 (P0) DONE: sizeFromGenome() now returns 8-20m, species coloring via golden-angle hue on speciesId, LOD thresholds scaled to 300m/1000m (commits 58feba4, 3090268)
- M73-2 (P1) DONE: OrganismLabels.tsx — floating labels showing species ID + size in spectator mode, 40 label cap, 80 unit range, updates every 10 frames
- M73-3 (P2): Cluster indicators — deferred to future milestone

**Why:** Organisms are the core of the simulation. They must be visually prominent.

**How to apply:** All organism rendering changes must maintain zero per-frame allocation pattern. OrganismLabels uses useSyncExternalStore for spectator state subscription.
