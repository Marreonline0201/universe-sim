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
