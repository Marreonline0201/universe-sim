// ── LootTable.ts ──────────────────────────────────────────────────────────────
// M23 Track C: Weighted loot tables for animal kills, treasure, and special nodes.
//
// Each table entry: { itemId, materialId, quantity: [min, max], rarity, weight }.
// Higher weight = more likely. rollLoot() picks 1-3 items via weighted random.

import { MAT, ITEM, type InventorySlot, type RarityTier, RARITY } from '../player/Inventory'

export interface LootEntry {
  itemId: number
  materialId: number
  quantity: [number, number]  // [min, max] inclusive
  rarity: RarityTier
  weight: number              // higher = more common in the table
}

// ── Per-Species Loot Tables ─────────────────────────────────────────────────

export const DEER_LOOT: LootEntry[] = [
  { itemId: 0, materialId: MAT.RAW_MEAT,  quantity: [1, 3], rarity: RARITY.COMMON,   weight: 40 },
  { itemId: 0, materialId: MAT.HIDE,      quantity: [1, 2], rarity: RARITY.COMMON,   weight: 35 },
  { itemId: 0, materialId: MAT.BONE,      quantity: [1, 2], rarity: RARITY.COMMON,   weight: 30 },
  { itemId: 0, materialId: MAT.LEATHER,   quantity: [1, 1], rarity: RARITY.UNCOMMON, weight: 12 },
  { itemId: 0, materialId: MAT.BONE,      quantity: [2, 4], rarity: RARITY.RARE,     weight: 4  },  // antler-quality bone
]

export const WOLF_LOOT: LootEntry[] = [
  { itemId: 0, materialId: MAT.RAW_MEAT,  quantity: [1, 2], rarity: RARITY.COMMON,   weight: 35 },
  { itemId: 0, materialId: MAT.BONE,      quantity: [1, 2], rarity: RARITY.COMMON,   weight: 25 },
  { itemId: 0, materialId: MAT.WOLF_PELT, quantity: [1, 1], rarity: RARITY.UNCOMMON, weight: 18 },
  { itemId: 0, materialId: MAT.HIDE,      quantity: [1, 2], rarity: RARITY.UNCOMMON, weight: 15 },
  { itemId: 0, materialId: MAT.WOLF_PELT, quantity: [2, 2], rarity: RARITY.RARE,     weight: 5  },
  { itemId: 0, materialId: MAT.LEATHER,   quantity: [1, 2], rarity: RARITY.RARE,     weight: 3  },
]

export const BOAR_LOOT: LootEntry[] = [
  { itemId: 0, materialId: MAT.RAW_MEAT,   quantity: [2, 4], rarity: RARITY.COMMON,   weight: 40 },
  { itemId: 0, materialId: MAT.HIDE,       quantity: [1, 2], rarity: RARITY.COMMON,   weight: 30 },
  { itemId: 0, materialId: MAT.BOAR_TUSK,  quantity: [1, 2], rarity: RARITY.UNCOMMON, weight: 15 },
  { itemId: 0, materialId: MAT.BONE,       quantity: [1, 3], rarity: RARITY.COMMON,   weight: 20 },
  { itemId: 0, materialId: MAT.BOAR_TUSK,  quantity: [2, 3], rarity: RARITY.RARE,     weight: 5  },
  { itemId: 0, materialId: MAT.LEATHER,    quantity: [2, 3], rarity: RARITY.RARE,     weight: 3  },
]

// Treasure loot (for future treasure chests / special nodes)
export const TREASURE_LOOT: LootEntry[] = [
  { itemId: 0, materialId: MAT.COPPER_COIN, quantity: [5, 15], rarity: RARITY.COMMON,    weight: 30 },
  { itemId: 0, materialId: MAT.SILVER,      quantity: [1, 3],  rarity: RARITY.UNCOMMON,  weight: 20 },
  { itemId: 0, materialId: MAT.GOLD,        quantity: [1, 2],  rarity: RARITY.RARE,      weight: 10 },
  { itemId: ITEM.BRONZE_SWORD, materialId: 0, quantity: [1, 1], rarity: RARITY.RARE,     weight: 8  },
  { itemId: ITEM.IRON_SWORD, materialId: 0,   quantity: [1, 1], rarity: RARITY.EPIC,     weight: 3  },
  { itemId: ITEM.STEEL_SWORD_M8, materialId: 0, quantity: [1, 1], rarity: RARITY.LEGENDARY, weight: 1 },
]

// Map species name to loot table
export const SPECIES_LOOT: Record<string, LootEntry[]> = {
  deer: DEER_LOOT,
  wolf: WOLF_LOOT,
  boar: BOAR_LOOT,
}

// ── Roll Loot ────────────────────────────────────────────────────────────────

/**
 * Roll 1-3 items from a loot table using weighted random selection.
 * Each roll is independent (same entry can be picked multiple times — quantities add).
 */
export function rollLoot(table: LootEntry[], rollCount?: number): InventorySlot[] {
  if (table.length === 0) return []

  const count = rollCount ?? (1 + Math.floor(Math.random() * 3))  // 1-3 items
  const totalWeight = table.reduce((sum, e) => sum + e.weight, 0)
  const results: InventorySlot[] = []

  for (let r = 0; r < count; r++) {
    let roll = Math.random() * totalWeight
    for (const entry of table) {
      roll -= entry.weight
      if (roll <= 0) {
        const qty = entry.quantity[0] + Math.floor(Math.random() * (entry.quantity[1] - entry.quantity[0] + 1))
        // Quality range by rarity
        const qualityRanges: [number, number][] = [[0.5, 0.7], [0.65, 0.8], [0.75, 0.9], [0.85, 0.95], [0.95, 1.0]]
        const [qMin, qMax] = qualityRanges[entry.rarity] ?? [0.5, 0.7]
        const quality = qMin + Math.random() * (qMax - qMin)

        // Try to merge with existing result of same type+rarity
        const existing = results.find(
          s => s.itemId === entry.itemId && s.materialId === entry.materialId && (s.rarity ?? 0) === entry.rarity
        )
        if (existing) {
          existing.quantity += qty
        } else {
          results.push({
            itemId: entry.itemId,
            materialId: entry.materialId,
            quantity: qty,
            quality: Math.round(quality * 100) / 100,
            rarity: entry.rarity,
          })
        }
        break
      }
    }
  }

  return results
}
