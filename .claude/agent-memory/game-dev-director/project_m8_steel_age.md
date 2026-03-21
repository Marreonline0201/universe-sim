---
name: M8 Track 2 Steel Age Architecture
description: Steel Age implementation details: carburization chemistry, quenching, armor slot, MAT/ITEM IDs, recipe IDs, civLevel 3 gate
type: project
---

M8 Track 2 Steel Age + Advanced Metallurgy is COMPLETE as of 2026-03-21 (commit fa8a098, Vercel dpl_C8LXREVs7LWR2Ti4v5b5wAZcZHqj).

## New IDs (must not conflict with existing)

MAT.STEEL_INGOT     = 44  (quenched steel, full quality)
MAT.CAST_IRON_INGOT = 45  (brittle cast iron, 2.4% C)
MAT.HOT_STEEL_INGOT = 46  (intermediate — must be quenched within 30s)
MAT.SOFT_STEEL      = 47  (missed quench → 50% quality penalty)

ITEM.STEEL_SWORD_M8  = 52  (damage 45, 2.5x iron_knife)
ITEM.STEEL_CHESTPLATE = 53 (armor: 40% damage absorption)
ITEM.STEEL_CROSSBOW  = 54  (damage 35, 30m range)
ITEM.CAST_IRON_POT   = 55  (cooking vessel)
ITEM.CAST_IRON_DOOR  = 56  (building component)

## Recipe IDs

71 — Steel Sword (3x STEEL_INGOT + 1x WOOD)
72 — Steel Chestplate (6x STEEL_INGOT)
73 — Steel Crossbow (4x STEEL_INGOT + 3x WOOD + 2x FIBER)
74 — Cast Iron Pot (2x CAST_IRON_INGOT)
75 — Cast Iron Door (4x CAST_IRON_INGOT)

All require knowledgeRequired: ['iron_smelting', 'steel_making'] (71-73)
Cast iron recipes require only ['iron_smelting'] (74-75)

## Steel Chemistry in tickBlastFurnaceSmelting()

Location: src/game/SurvivalSystems.ts
Two-path logic:
  Path A (steel at 1200°C): steelTempReached=true AND player has iron_ingot
    - 1 charcoal:1 iron_ingot → hot_steel_ingot (0.8% C, steel grade)
    - 2 charcoal:1 iron_ingot → cast_iron_ingot (2.4% C, no quench needed)
  Path B (iron at 1000°C): standard 3x iron_ore + 4x charcoal → iron_ingot

Constants: BLAST_TEMP_C=1000, STEEL_TEMP_C=1200, QUENCH_WINDOW_S=30

## Quenching System

tickQuenching() in SurvivalSystems.ts — called each GameLoop frame.
playerStore.quenchSecondsRemaining: countdown timer (set by setQuenchTimer(30)).
playerStore.tickQuenchTimer(dt): decrements each frame from SceneRoot GameLoop.
Water detection: player y <= WATER_Y_THRESHOLD (1.5m) = at sea level.
On quench: hot_steel_ingot → steel_ingot at full quality, +15 smithingXp.
On expire: hot_steel_ingot → soft_steel at quality * 0.50.

## Quality System

steelQualityFromXp(): master at smithingXp >= 180 (60% of iron's 300 threshold).
Steel reaches max quality faster than iron (better material → faster mastery).

## Armor Slot

playerStore.equippedArmorSlot: number | null
Actions: equipArmor(slotIndex), unequipArmor()
Absorption: applyArmorAbsorptionSync(rawDamage, inv) — STEEL_CHESTPLATE_ITEM_ID=53, 40% reduction
HUD: chest slot bottom-left (40px box), click to equip/unequip, shows '-40%' label when equipped.

## civLevel 3 Steel Gate

STEEL_UNLOCK_LEVEL = 3 in server/src/SettlementManager.js
_steelUnlocked Set prevents repeat broadcasts.
tick(dtRealSec, onLevelUp, onIronUnlock, onSteelUnlock) — 4th callback added.
Server index.js: broadcasts SETTLEMENT_UNLOCKED_STEEL + Slack post.
Client WorldSocket.ts: techTree.markResearched('steel_making') + discoverRecipe(71-75).

## Build Fix

Removed duplicate WeatherRendererWrapper function from SceneRoot.tsx (lines 67-72).
Was causing TS2393 "Duplicate function implementation" error. Pre-existing issue from M8 weather system.
Also committed WeatherSystem.js, WeatherRenderer.tsx, weatherStore.ts, WeatherSectors.ts (previously untracked).

**Why:** These are load-bearing architectural facts for any future Steel Age expansion.
**How to apply:** Reference when adding post-steel tiers, new armor slots, or further metallurgy.
