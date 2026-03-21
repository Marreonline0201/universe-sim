---
name: Survival Slices Milestone Status
description: Completion status of all survival slices, M5 tracks, and current project state
type: project
---

Slices 1-7 and all P2 tasks are COMPLETE as of 2026-03-21.
M5 Track 2 (Death + Bedroll Respawn System) is COMPLETE as of 2026-03-21.
M5 Track 3 (Photorealism Pass) is COMPLETE as of 2026-03-21.

Deployment: dpl_GjQHcgFH5ZPR9i3dSoHejrfhMixA — READY at universe-sim-beryl.vercel.app
Commit: dc4fcc4 "Commit unstaged local changes: DeathSystem, SurvivalSystems, SceneRoot updates"

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

M5 Track 2 — Death + Bedroll Respawn System: DONE
- Death trigger: health <= 0 drops all inventory as DEATH_LOOT_DROPS world pickups, pins HP at 0.001, calls triggerDeath() -> isDead state
- Death cause attribution: per-frame flags markCombatDamage()/markInfectionDamage() in SurvivalSystems; priority: combat > infection > starvation > drowning
- DeathScreen.tsx: full-screen overlay, 1.5s CSS fade, cause-of-death label, RESPAWN button appears after 2s
- Bedroll recipe: 3 Fiber + 2 Wood (changed from 3 Hide + 4 Fiber)
- Bedroll position persisted to Neon DB (bedroll_x/y/z columns via self-healing ALTER TABLE)
- Respawn: executeRespawn() teleports to bedrollPos (or worldSpawnPos fallback), groggy state 50% HP / 40% hunger / 40% thirst / 70% energy
- Criminal record: murderCount field on RemotePlayer, persisted to murder_count INT column; skull orb + red nameplate displayed on killers
- DeathLootDropsRenderer: polls DEATH_LOOT_DROPS every 500ms, renders yellow box + ring, aligned to sphere surface normal
- BedrollMeshRenderer: polls placedBedrollAnchor every 2s, renders mat + pillow + blanket stripe + pointLight

M5 Track 3 — Photorealism Pass: DONE (see project_photorealism_pass.md for details)

Known edge case (low priority): On fresh load where bedrollPlaced was already true from a prior session,
setPlacedBedrollAnchor() is not called from loadSave(), so the 3D bedroll mesh won't render until
the player interacts with a bedroll again. Fix: call setPlacedBedrollAnchor in loadSave() when bedroll data exists.

**Why:** M5 milestone completes death stakes, respawn flow, and bedroll persistence.
**How to apply:** Death system is self-contained in DeathSystem.ts. checkAndTriggerDeath() is called
each frame from GameLoop after all survival ticks. executeRespawn() is called from SceneRoot's
handleRespawn callback wired to DeathScreen's onRespawn prop.
