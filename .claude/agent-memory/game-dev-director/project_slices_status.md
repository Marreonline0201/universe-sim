---
name: Survival Slices Milestone Status
description: Completion status of all survival slices and milestones M5-M10, live at universe-sim-beryl.vercel.app
type: project
---

Slices 1-7 and all P2 tasks are COMPLETE as of 2026-03-21.
M5-M13 all DONE as of 2026-03-21.

Latest production deployment: dpl_GQCvBKkqMoY7GvsiB5AFUUTajoRS — READY at universe-sim-beryl.vercel.app
Latest commit: f5652f5 "Add M13: Velar Contact — First Contact, Orbital Mechanics, Nuclear Physics"

Slice status:
- Slice 1: Gather -> inventory (PASS)
- Slice 2: Craft -> equip -> use stone tool (PASS)
- Slice 3: Fire lighting via sim grid (PASS)
- Slice 4: Raw food near fire >80C for 8s -> cooked meat -> E key eat -> hunger bar decreases (PASS)
- Slice 5: Creature bite -> wound HUD -> bacteria logistic growth -> H key herb -> wound clears (PASS)
- Slice 6: Build shelter -> craft Bedroll -> Z key sleep -> fatigue decreases (PASS)
- Slice 7: stone_furnace -> copper ore + charcoal -> sim fire 500C+ -> copper appears -> craft copper knife (PASS)

P2 task status:
- P2-1 Physical Smelting: DONE
- P2-2 Wound+Infection: DONE
- P2-3 NPC Utility AI: DONE
- P2-4 Geology Ore Placement: DONE
- P2-5 Building Physics: DONE
- P2-6 Science Companion: DONE

M5 Track 1 — Shared World: DONE (see project_m5_track1_multiplayer.md)
M5 Track 2 — Death + Bedroll Respawn: DONE
M5 Track 3 — Photorealism Pass: DONE (see project_photorealism_pass.md)
M6 — NPC Civilization: DONE (dpl_F6h7jMhkdLMvKBssxRyyZYGgdjz7, commit 892b046)
M7 Track 1 — Iron Age: DONE (dpl_Gw2bs3x1ktC36AQuBbPaPfU2R5pU, commit 488b871)
M7 Track 2 — Outlaw System: DONE (see project_m7_outlaw_system.md)
M8 Track 1 — Weather System: DONE (see project_m8_weather.md)
M8 Track 2 — Steel Age: DONE (see project_m8_steel_age.md)
M8 Track 3 — Science Companion Site: DONE (files written; needs vercel deploy --prod)
M9 Track 1 — Rivers and Erosion: DONE (commit 8df5d30, see project_m9_rivers.md)
M9 Track 2 — Animal AI: DONE (see project_m9_animal_ai.md)
M9 Track 3 — Performance Optimization: DONE (see project_m9t3_perf.md)
M10 Track A — Seasonal Cycle: DONE (commit fdaafe9, see project_m10.md)
M10 Track B — Ocean Sailing and Navigation: DONE (commit fdaafe9, see project_m10.md)
M10 Track C — Advanced NPC Trade Economy: DONE (commit fdaafe9, see project_m10.md)
M11 — Civilization Age: DONE (see project_m11.md)
M12 — Space Age / Rocketry / Radio / Velar Signal: DONE (commit 90a5ca4)
M13 Track A — Velar Signal Decoding / First Contact: DONE (commit f5652f5, see project_m13.md)
M13 Track B — Orbital Mechanics: DONE (commit f5652f5, see project_m13.md)
M13 Track C — Nuclear Physics / Meltdown: DONE (commit f5652f5, see project_m13.md)

Next IDs: MAT 69, ITEM 67, Recipe 104.

Known edge case (low priority): On fresh load where bedrollPlaced was already true from a prior session,
setPlacedBedrollAnchor() is not called from loadSave(), so the 3D bedroll mesh won't render until
the player interacts with a bedroll again.

**Why:** Running status record for all milestone progress.
**How to apply:** Check this file before planning new milestones to understand completed feature surface.
