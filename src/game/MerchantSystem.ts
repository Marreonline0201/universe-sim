// ── MerchantSystem.ts ────────────────────────────────────────────────────────
// M27 Track B: NPC merchant trading — three archetypes with buy/sell price lists.
//
// Archetypes:
//   general    — basic tools, food, building materials at standard prices
//   blacksmith — buys ore/ingots (60% value), sells metal tools + weapons
//   alchemist  — buys plants/chemicals, sells compound items
//
// Accessed via merchantSystem singleton from GameSingletons.

import { MAT, ITEM } from '../player/Inventory'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MerchantArchetype = 'general' | 'blacksmith' | 'alchemist'

export interface MerchantItem {
  /** 0 means raw material (use materialId), non-zero means crafted item */
  itemId: number
  materialId: number
  name: string
  price: number   // gold coins
}

// ── Price catalog ─────────────────────────────────────────────────────────────
// Reasonable integer prices. Raw materials are cheap; tools/weapons cost more.

const GENERAL_SELL_LIST: MerchantItem[] = [
  // Raw building materials
  { itemId: 0, materialId: MAT.WOOD,    name: 'Wood',     price: 2 },
  { itemId: 0, materialId: MAT.STONE,   name: 'Stone',    price: 3 },
  { itemId: 0, materialId: MAT.CLAY,    name: 'Clay',     price: 3 },
  { itemId: 0, materialId: MAT.FIBER,   name: 'Fiber',    price: 2 },
  { itemId: 0, materialId: MAT.ROPE,    name: 'Rope',     price: 5 },
  { itemId: 0, materialId: MAT.CLOTH,   name: 'Cloth',    price: 6 },
  // Food
  { itemId: 0, materialId: MAT.GRAIN,   name: 'Grain',    price: 4 },
  { itemId: 0, materialId: MAT.SALT,    name: 'Salt',     price: 5 },
  { itemId: 0, materialId: MAT.COOKED_MEAT, name: 'Cooked Meat', price: 8 },
  // Basic tools
  { itemId: ITEM.STONE_TOOL, materialId: 0, name: 'Stone Tool',  price: 12 },
  { itemId: ITEM.AXE,        materialId: 0, name: 'Stone Axe',   price: 25 },
  { itemId: ITEM.SPEAR,      materialId: 0, name: 'Spear',       price: 20 },
  { itemId: ITEM.KNIFE,      materialId: 0, name: 'Knife',       price: 18 },
  // Torch & bedroll
  { itemId: ITEM.TORCH,      materialId: 0, name: 'Torch',       price: 10 },
  { itemId: ITEM.BEDROLL,    materialId: 0, name: 'Bedroll',     price: 30 },
]

const BLACKSMITH_SELL_LIST: MerchantItem[] = [
  // Ores
  { itemId: 0, materialId: MAT.IRON_ORE,   name: 'Iron Ore',    price: 8 },
  { itemId: 0, materialId: MAT.COPPER_ORE, name: 'Copper Ore',  price: 6 },
  // Ingots
  { itemId: 0, materialId: MAT.IRON,       name: 'Iron Ingot',  price: 15 },
  { itemId: 0, materialId: MAT.IRON_INGOT, name: 'Iron Ingot+', price: 18 },
  { itemId: 0, materialId: MAT.BRONZE,     name: 'Bronze',      price: 20 },
  { itemId: 0, materialId: MAT.STEEL_INGOT, name: 'Steel Ingot', price: 35 },
  // Metal tools
  { itemId: ITEM.IRON_AXE,     materialId: 0, name: 'Iron Axe',      price: 45 },
  { itemId: ITEM.IRON_KNIFE,   materialId: 0, name: 'Iron Knife',    price: 40 },
  { itemId: ITEM.IRON_PICKAXE, materialId: 0, name: 'Iron Pickaxe',  price: 50 },
  { itemId: ITEM.COPPER_KNIFE, materialId: 0, name: 'Copper Knife',  price: 28 },
  // Weapons
  { itemId: ITEM.BRONZE_SWORD, materialId: 0, name: 'Bronze Sword',  price: 60 },
  { itemId: ITEM.IRON_SWORD,   materialId: 0, name: 'Iron Sword',    price: 80 },
  { itemId: ITEM.STEEL_SWORD_M8, materialId: 0, name: 'Steel Sword', price: 120 },
  // Armor
  { itemId: ITEM.BRONZE_ARMOR,    materialId: 0, name: 'Bronze Armor',    price: 75 },
  { itemId: ITEM.LEATHER_ARMOR,   materialId: 0, name: 'Leather Armor',   price: 55 },
  { itemId: ITEM.STEEL_CHESTPLATE, materialId: 0, name: 'Steel Chestplate', price: 150 },
]

const ALCHEMIST_SELL_LIST: MerchantItem[] = [
  // Plants / herbs
  { itemId: 0, materialId: MAT.LEAF,    name: 'Leaf',     price: 3 },
  { itemId: 0, materialId: MAT.BARK,    name: 'Bark',     price: 4 },
  // Chemicals
  { itemId: 0, materialId: MAT.SULFUR,       name: 'Sulfur',      price: 12 },
  { itemId: 0, materialId: MAT.SALTPETER,    name: 'Saltpeter',   price: 14 },
  { itemId: 0, materialId: MAT.GUNPOWDER,    name: 'Gunpowder',   price: 25 },
  { itemId: 0, materialId: MAT.CHARCOAL,     name: 'Charcoal',    price: 5 },
  { itemId: 0, materialId: MAT.CHARCOAL_POWDER, name: 'Charcoal Powder', price: 8 },
  // Glass
  { itemId: 0, materialId: MAT.GLASS,      name: 'Glass',        price: 10 },
  { itemId: 0, materialId: MAT.GLASS_INGOT, name: 'Glass Ingot', price: 18 },
  // Compound items
  { itemId: ITEM.CLAY_POT, materialId: 0, name: 'Clay Pot',   price: 15 },
  { itemId: ITEM.CAST_IRON_POT, materialId: 0, name: 'Cast Iron Pot', price: 45 },
  { itemId: ITEM.TORCH, materialId: 0, name: 'Torch',         price: 10 },
  { itemId: ITEM.COMPASS, materialId: 0, name: 'Compass',     price: 80 },
  { itemId: ITEM.FISHING_ROD, materialId: 0, name: 'Fishing Rod', price: 35 },
]

// ── Material buy prices (what merchant pays to player) ────────────────────────
// Keyed by materialId — 60% of the sell price from the catalog.

function buildBuyPriceMap(list: MerchantItem[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of list) {
    const key = `${item.itemId}:${item.materialId}`
    map.set(key, Math.max(1, Math.floor(item.price * 0.6)))
  }
  return map
}

const GENERAL_BUY_MAP    = buildBuyPriceMap(GENERAL_SELL_LIST)
const BLACKSMITH_BUY_MAP = buildBuyPriceMap(BLACKSMITH_SELL_LIST)
const ALCHEMIST_BUY_MAP  = buildBuyPriceMap(ALCHEMIST_SELL_LIST)

// ── MerchantSystem ────────────────────────────────────────────────────────────

export class MerchantSystem {
  getSellList(archetype: MerchantArchetype): MerchantItem[] {
    switch (archetype) {
      case 'general':    return GENERAL_SELL_LIST
      case 'blacksmith': return BLACKSMITH_SELL_LIST
      case 'alchemist':  return ALCHEMIST_SELL_LIST
    }
  }

  /** Returns the price the merchant will pay the player for a given item (60% of sell). */
  getBuyPrice(archetype: MerchantArchetype, itemId: number, materialId: number): number {
    const key = `${itemId}:${materialId}`
    switch (archetype) {
      case 'general':    return GENERAL_BUY_MAP.get(key) ?? 0
      case 'blacksmith': return BLACKSMITH_BUY_MAP.get(key) ?? 0
      case 'alchemist':  return ALCHEMIST_BUY_MAP.get(key) ?? 0
    }
  }

  canAfford(gold: number, price: number): boolean {
    return gold >= price
  }

  /** Assigns a random archetype, biased by settlement tier. */
  getArchetypeForSettlementTier(tier: number): MerchantArchetype {
    if (tier >= 2) {
      const roll = Math.random()
      if (roll < 0.33) return 'blacksmith'
      if (roll < 0.66) return 'alchemist'
      return 'general'
    }
    return 'general'
  }
}

export const merchantSystem = new MerchantSystem()
