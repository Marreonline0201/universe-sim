---
name: M7 Track 1 Iron Age Architecture
description: Iron Age implementation details: MAT/ITEM IDs, recipe IDs, smelting logic, quality system, tool gates, SettlementManager hook
type: project
---

M7 Track 1 Iron Age is COMPLETE as of 2026-03-21 (commit 488b871, Vercel dpl_Gw2bs3x1ktC36AQuBbPaPfU2R5pU).

## New IDs (must not conflict with existing)

MAT.IRON_INGOT = 43  (raw material, stored as itemId:0 / materialId:43)
ITEM.IRON_KNIFE = 49
ITEM.IRON_AXE = 50
ITEM.IRON_PICKAXE = 51

## Recipe IDs

67 — Blast Furnace (output: ITEM.FURNACE, isMaterial:false, tier 2, knowledgeRequired: ['iron_smelting'])
     inputs: 8x STONE + 4x IRON_ORE + 2x CLAY
     NOTE: This is a crafting-panel recipe that produces the Furnace item, separate from the blast_furnace building placed via BuildPanel.

68 — Iron Knife (2x IRON_INGOT + 1x WOOD, output: ITEM.IRON_KNIFE)
69 — Iron Axe (3x IRON_INGOT + 2x WOOD, output: ITEM.IRON_AXE)
70 — Iron Pickaxe (3x IRON_INGOT + 2x WOOD, output: ITEM.IRON_PICKAXE)

## Smelting: tickBlastFurnaceSmelting()

Location: src/game/SurvivalSystems.ts
Called from: SceneRoot.tsx GameLoop useFrame, after tickFurnaceSmelting (copper).
Logic: checks building.typeId === 'blast_furnace', proximity <=6m, sim grid cells >=1000C within 4m.
Inputs consumed: 3x iron_ore + 4x charcoal.
Output: 1x iron_ingot with quality from ironQualityFromXp(smithingXp).
Side effects: addSmithingXp(25), addDiscovery('iron_smelting'), discoverRecipe(68/69/70).
5-second cooldown per furnace via _blastInProgress Set.

## Tool Quality System

playerStore.smithingXp (number, starts 0) tracked in Zustand.
addSmithingXp(xp) action increments it.
ironQualityFromXp(xp): xp<100 → 0.50-0.70; xp<300 → 0.80-0.95; xp>=300 → 0.95-1.00.
Quality is stored on the iron_ingot slot (quality field of InventorySlot).
NOTE: quality on raw material slots is preserved through crafting only if craft() propagates it — currently craft() hardcodes quality:0.7. To fully honour quality on tools, craft() would need to read input slot quality. This is a future improvement.

## Iron Pickaxe Gate (SceneRoot.tsx)

isIronOre = nearNode.matId === MAT.IRON_ORE
hasIronPickaxe = inventory.hasItemById(ITEM.IRON_PICKAXE) || inventory.hasItemById(ITEM.IRON_AXE)
canGather (for iron ore) = hasIronPickaxe only
Label shown when blocked: "[Need Iron Pickaxe] Iron Ore"

## Iron Axe 2-Hit Tree

getNodeMaxHits(nodeType, harvestPower=1): harvestPower>=5 && nodeType==='wood' returns 2 (else 3).
Call site passes stats.harvestPower from equipped item stats.
IRON_AXE harvestPower = 5 in EquipSystem.ts STATS map.

## Blast Furnace Building Type

id: 'blast_furnace', tier: 2, provides: ['blast_furnace','iron_smelting','metal_smelting']
materialsRequired: 8x STONE + 2x CLAY (building placement cost — different from recipe 67 craft cost)
Located in BUILDING_TYPES array in BuildingSystem.ts.

## SettlementManager Iron Unlock

IRON_UNLOCK_LEVEL = 2 constant in SettlementManager.js
_ironUnlocked Set<number> tracks which settlement IDs already fired (prevents repeat broadcasts per server lifetime).
tick(dtRealSec, onLevelUp, onIronUnlock) — new third callback.
onIronUnlock called in server/src/index.js: broadcastAll SETTLEMENT_UNLOCKED_IRON + Slack post.
Client WorldSocket: SETTLEMENT_UNLOCKED_IRON → addNotification discovery + inventory.discoverRecipe(67).

## Build Fix

outlawStore.ts and OutlawSystem.js were M7 Track 2 files developed locally but never committed.
WorldSocket.ts imported outlawStore, so Vercel failed with "Could not resolve outlawStore".
Fixed by committing both files in 488b871 along with related PlayerRegistry.js/useWorldSocket.ts/RemotePlayersRenderer.tsx changes.

**Why:** Vercel clones from git — untracked files that exist locally don't exist on Vercel.
**How to apply:** Always run `git status` before pushing. Untracked .ts/.tsx/.js files that are imported by committed code will cause Vercel build failures even if tsc passes locally (tsc resolves from disk, Rollup resolves from git clone).
