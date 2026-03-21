// ── EquipSystem ────────────────────────────────────────────────────────────────
// Authoritative source for equipped-item stats and food stats.
// All systems that need to know what a held item does import from here.

import { ITEM, MAT } from './Inventory'

export interface ItemStats {
  name:          string
  damage:        number    // raw hit damage
  harvestPower:  number    // 1=hand, 2=stone tool, 3=knife/spear, 4=axe, 5+=upgrades
  harvestTypes:  string[]  // resource node type strings — must match node.type in SceneRoot
  range:         number    // reach in metres
}

const HAND: ItemStats = {
  name:         'Hand',
  damage:       1,
  harvestPower: 1,
  harvestTypes: ['wood', 'fiber', 'bark', 'bone', 'hide', 'leaf', 'rubber', 'saltpeter'],
  range:        2.0,
}

// Map itemId → stats. itemId=0 (raw materials) always falls back to HAND.
const STATS: Partial<Record<number, ItemStats>> = {
  [ITEM.STONE_TOOL]: {
    name:         'Stone Tool',
    damage:       5,
    harvestPower: 2,
    harvestTypes: ['stone', 'flint', 'clay', 'wood', 'fiber', 'sand', 'bark', 'coal', 'tin_ore', 'copper_ore', 'iron_ore', 'sulfur', 'leaf', 'rubber', 'saltpeter', 'gold', 'silver', 'uranium'],
    range:        2.5,
  },
  [ITEM.KNIFE]: {
    name:         'Knife',
    damage:       8,
    harvestPower: 2,
    harvestTypes: ['fiber', 'bark', 'hide', 'bone'],
    range:        1.5,
  },
  [ITEM.SPEAR]: {
    name:         'Spear',
    damage:       12,
    harvestPower: 2,
    harvestTypes: ['fiber', 'bark'],
    range:        3.5,
  },
  [ITEM.AXE]: {
    name:         'Axe',
    damage:       10,
    harvestPower: 3,
    harvestTypes: ['stone', 'wood', 'clay', 'fiber', 'bark', 'coal', 'tin_ore', 'copper_ore', 'iron_ore', 'sulfur', 'gold', 'silver', 'uranium', 'rubber', 'saltpeter'],
    range:        2.5,
  },
  [ITEM.BOW]: {
    name:         'Bow',
    damage:       7,
    harvestPower: 1,
    harvestTypes: [],
    range:        20.0,
  },
  [ITEM.BRONZE_SWORD]: {
    name:         'Bronze Sword',
    damage:       15,
    harvestPower: 2,
    harvestTypes: [],
    range:        2.5,
  },
  [ITEM.IRON_SWORD]: {
    name:         'Iron Sword',
    damage:       20,
    harvestPower: 3,
    harvestTypes: [],
    range:        2.5,
  },
  [ITEM.STEEL_SWORD]: {
    name:         'Steel Sword',
    damage:       25,
    harvestPower: 4,
    harvestTypes: [],
    range:        2.5,
  },
  // ── Slice 7: Copper knife ────────────────────────────────────────────────
  [ITEM.COPPER_KNIFE]: {
    name:         'Copper Knife',
    damage:       10,
    harvestPower: 3,
    harvestTypes: ['fiber', 'bark', 'hide', 'bone', 'raw_meat', 'leaf'],
    range:        1.8,
  },
  // ── Bedroll (equippable / placeable) ─────────────────────────────────────
  [ITEM.BEDROLL]: {
    name:         'Bedroll',
    damage:       0,
    harvestPower: 1,
    harvestTypes: [],
    range:        1.0,
  },

  // ── M7: Iron Age tools ────────────────────────────────────────────────────
  //
  // Damage values:
  //   Iron Knife:    18  (1.8× copper knife 10)
  //   Iron Axe:      20  (2.0× stone axe 10, fells trees in 2 hits via harvestPower 5)
  //   Iron Pickaxe:  22  (only tool that can mine iron_ore — harvestPower 5 + type gate)
  //
  // Base quality 0.7 (novice smith). Quality multiplier applied at craft time
  // in SurvivalSystems.ts tickBlastFurnace based on smithingXp.
  [ITEM.IRON_KNIFE]: {
    name:         'Iron Knife',
    damage:       18,
    harvestPower: 4,
    harvestTypes: ['fiber', 'bark', 'hide', 'bone', 'raw_meat', 'leaf', 'wood'],
    range:        1.8,
  },
  [ITEM.IRON_AXE]: {
    name:         'Iron Axe',
    damage:       20,
    harvestPower: 5,
    harvestTypes: ['wood', 'stone', 'clay', 'fiber', 'bark', 'coal', 'tin_ore',
                   'copper_ore', 'sulfur', 'gold', 'silver', 'uranium', 'rubber', 'saltpeter'],
    range:        2.5,
  },
  [ITEM.IRON_PICKAXE]: {
    name:         'Iron Pickaxe',
    // iron_ore requires harvestPower ≥ 5 AND explicit iron_ore in harvestTypes.
    // Stone tool / stone axe (harvestPower 2-3) is blocked by SceneRoot gate.
    damage:       22,
    harvestPower: 5,
    harvestTypes: ['stone', 'flint', 'clay', 'coal', 'tin_ore', 'copper_ore',
                   'iron_ore', 'sulfur', 'gold', 'silver', 'uranium', 'rubber', 'saltpeter'],
    range:        2.5,
  },

  // ── M8: Steel Age tools ───────────────────────────────────────────────────
  //
  // Steel Sword damage = 45 ≈ 2.5× Iron Knife (18).
  // Steel Crossbow is ranged — damage handled separately; range 30m for ranged combat.
  // Steel Chestplate has no offensive stats; armor is tracked via equippedArmorSlot.
  // Cast Iron Pot / Door are not equippable weapons — zero combat stats.
  [ITEM.STEEL_SWORD_M8]: {
    name:         'Steel Sword',
    damage:       45,
    harvestPower: 4,
    harvestTypes: [],
    range:        2.5,
  },
  [ITEM.STEEL_CHESTPLATE]: {
    name:         'Steel Chestplate',
    damage:       0,
    harvestPower: 1,
    harvestTypes: [],
    range:        1.0,
  },
  [ITEM.STEEL_CROSSBOW]: {
    name:         'Steel Crossbow',
    damage:       35,   // per bolt; ballistic arc handled in GameLoop
    harvestPower: 1,
    harvestTypes: [],
    range:        30.0,
  },
  [ITEM.CAST_IRON_POT]: {
    name:         'Cast Iron Pot',
    damage:       5,    // can be used as a blunt weapon in a pinch
    harvestPower: 1,
    harvestTypes: [],
    range:        1.5,
  },
  [ITEM.CAST_IRON_DOOR]: {
    name:         'Cast Iron Door',
    damage:       0,
    harvestPower: 1,
    harvestTypes: [],
    range:        1.0,
  },

  // ── M11: Civilization Age items ──────────────────────────────────────────
  //
  // Musket: first firearm. Damage 80, range 60m. 8s reload.
  // Historically: Brown Bess musket KE ~1800J, kills unarmored targets in one shot.
  // Reload: bite cartridge, powder+ball down barrel, tamp ramrod, prime flintlock.
  // Simplified to single 8s reload timer in GunpowderSystem.ts.
  [ITEM.MUSKET]: {
    name:         'Musket',
    damage:       80,
    harvestPower: 1,
    harvestTypes: [],
    range:        60.0,
  },
  // Telescope: no combat use. Equip + F key → TelescopeView overlay.
  [ITEM.TELESCOPE]: {
    name:         'Telescope',
    damage:       0,
    harvestPower: 1,
    harvestTypes: [],
    range:        1.0,
  },
}

/** Return stats for the given itemId. Falls back to HAND stats if unknown or 0. */
export function getItemStats(itemId: number): ItemStats {
  return STATS[itemId] ?? HAND
}

/** True if the equipped tool can harvest a node of the given resource type. */
export function canHarvest(itemId: number, resourceType: string): boolean {
  return getItemStats(itemId).harvestTypes.includes(resourceType)
}

// ── Food stats ─────────────────────────────────────────────────────────────────

export interface FoodStats {
  hungerRestore: number   // amount to SUBTRACT from hunger (store: 0=full, 1=starving)
  thirstRestore: number   // amount to SUBTRACT from thirst
}

// materialId → food stats.
const FOOD_STATS: Partial<Record<number, FoodStats>> = {
  // Raw plant materials — edible for basic survival
  [MAT.FIBER]: { hungerRestore: 0.12, thirstRestore: 0.04 },  // edible plant fiber
  [MAT.BARK]:  { hungerRestore: 0.05, thirstRestore: 0.0  },  // emergency bark chewing
  [MAT.CLAY]:  { hungerRestore: 0.0,  thirstRestore: 0.08 },  // wet clay quenches thirst slightly
  [MAT.LEAF]:  { hungerRestore: 0.08, thirstRestore: 0.06 },  // fresh leaves — mild nutrition + moisture
  [MAT.COOKED_MEAT]: { hungerRestore: 0.40, thirstRestore: 0.05 },  // cooked meat — substantial food
  [MAT.RAW_MEAT]:    { hungerRestore: 0.15, thirstRestore: 0.02 },  // raw meat — risky, low nutrition
}

/** Return food stats for a materialId, or null if it is not food. */
export function getFoodStats(materialId: number): FoodStats | null {
  return FOOD_STATS[materialId] ?? null
}
