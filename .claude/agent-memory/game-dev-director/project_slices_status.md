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
M5 Track 1 — Shared World: DONE (see project_m5_track1_multiplayer.md for details)

M6 — NPC Civilization: DONE as of 2026-03-21
Deployment: dpl_F6h7jMhkdLMvKBssxRyyZYGgdjz7 — READY at universe-sim-beryl.vercel.app (commit 892b046)

M7 Track 1 — Iron Age: DONE as of 2026-03-21
Deployment: dpl_Gw2bs3x1ktC36AQuBbPaPfU2R5pU — READY at universe-sim-beryl.vercel.app (commit 488b871)

M7 Track 1 feature status:
- MAT.IRON_INGOT (id 43) added to Inventory.ts MAT enum (DONE)
- ITEM.IRON_KNIFE (49), IRON_AXE (50), IRON_PICKAXE (51) added to ITEM enum (DONE)
- Recipe 67: Blast Furnace (8x Stone + 4x Iron Ore + 2x Clay, tier 2, knowledgeRequired: iron_smelting) (DONE)
- Recipe 68: Iron Knife (2x IRON_INGOT + 1x Wood, damage 18 = 1.8x copper knife) (DONE)
- Recipe 69: Iron Axe (3x IRON_INGOT + 2x Wood, trees felled in 2 hits via harvestPower 5) (DONE)
- Recipe 70: Iron Pickaxe (3x IRON_INGOT + 2x Wood, required to mine iron_ore) (DONE)
- blast_furnace BuildingType added to BUILDING_TYPES (Tier 2, provides blast_furnace/iron_smelting) (DONE)
- tickBlastFurnaceSmelting() in SurvivalSystems.ts: Fe2O3+3C->2Fe+3CO2 at >=1000C, consumes 3x iron_ore + 4x charcoal (DONE)
- Tool quality system: smithingXp in playerStore (addSmithingXp), ironQualityFromXp() → novice 0.5-0.7 / experienced 0.8-0.95 / master 0.95-1.0 (DONE)
- Iron pickaxe required for iron_ore: SceneRoot isIronOre check gates gather behind hasIronPickaxe || hasIronAxe (DONE)
- Iron axe 2-hit tree fell: getNodeMaxHits() now accepts harvestPower param, returns 2 for wood when harvestPower>=5 (DONE)
- SettlementManager.js: tick() accepts onIronUnlock callback, fires when civLevel crosses IRON_UNLOCK_LEVEL=2 (DONE)
- server/src/index.js: onIronUnlock broadcasts SETTLEMENT_UNLOCKED_IRON + Slack post (DONE)
- WorldSocket.ts: handles SETTLEMENT_UNLOCKED_IRON -> discovery notification + inventory.discoverRecipe(67) (DONE)
- Vercel build failure fixed: outlawStore.ts + OutlawSystem.js were untracked, committed in 488b871 (DONE)

M6 feature status:
- Shared civLevel: SettlementManager.js — 5 settlements, researchPts accumulate (sqrt(npcCount) * 1+civLevel*0.3 per real second), level threshold array [0,500,2000...], broadcasts SETTLEMENT_UPDATE on level-up (DONE)
- NPCs craft: CraftingNpc logic embedded in SettlementManager._runCraftTick(), 30s interval, 6 recipes using same MAT IDs as player (wood→plank, stone→stone_tool, etc.) (DONE)
- NPC memory: NpcMemory.js persists to npc_player_memory Neon table, trustScore -10..+10, threatLevel 0..10, decays in real time (DONE)
- Territory: TERRITORY_RADIUS=150m, SceneRoot proximity check every 3s using settlementCheckTimerRef, sends PLAYER_NEAR_SETTLEMENT (DONE)
- Trade: checkTradeOffer() finds surplus mats (>=5 units), sends TRADE_OFFER; TRADE_ACCEPT executes transfer, improves trust, broadcasts SETTLEMENT_UPDATE (DONE)
- Criminal record: NPC_ATTACKED message → addThreat(settlementId, playerId, 2) → GATES_CLOSED when threatLevel>3 (DONE)

Bug fixed in same commit: /api/save 500 NeonDbError — added CREATE TABLE IF NOT EXISTS as first op in save.ts so endpoint self-bootstraps on fresh Neon DB.

Known edge case (low priority): On fresh load where bedrollPlaced was already true from a prior session,
setPlacedBedrollAnchor() is not called from loadSave(), so the 3D bedroll mesh won't render until
the player interacts with a bedroll again. Fix: call setPlacedBedrollAnchor in loadSave() when bedroll data exists.

**Why:** M5 milestone completes death stakes, respawn flow, and bedroll persistence.
**How to apply:** Death system is self-contained in DeathSystem.ts. checkAndTriggerDeath() is called
each frame from GameLoop after all survival ticks. executeRespawn() is called from SceneRoot's
handleRespawn callback wired to DeathScreen's onRespawn prop.
