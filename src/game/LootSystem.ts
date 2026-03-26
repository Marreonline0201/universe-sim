// ── LootSystem.ts ──────────────────────────────────────────────────────────────
// M44 Track A: Boss loot drop system and dungeon chest loot system.
//
// Provides typed loot tables for dungeon bosses and treasure chests.
// rollLoot() picks entries by weighted random and returns {materialId, qty} pairs.
// applyLootToInventory() adds drops to the player inventory and returns display labels.

import { MAT } from '../player/Inventory'
import { inventory } from './GameSingletons'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LootEntry {
  materialId: number
  minQty: number
  maxQty: number
  weight: number
}

export interface LootTable {
  entries: LootEntry[]
}

// ── Boss Loot Tables ──────────────────────────────────────────────────────────

export const BOSS_LOOT_TABLES: Record<string, LootTable> = {
  dungeon_boss: {
    entries: [
      { materialId: MAT.STEEL_INGOT,    minQty: 1, maxQty: 3,  weight: 40 },
      { materialId: MAT.GOLD,           minQty: 5, maxQty: 15, weight: 30 },
      { materialId: MAT.POTION_HEALTH,  minQty: 1, maxQty: 2,  weight: 20 },
      { materialId: MAT.ELIXIR_WISDOM,  minQty: 1, maxQty: 1,  weight: 10 },
    ],
  },
  dungeon_miniboss: {
    entries: [
      { materialId: MAT.IRON_INGOT,   minQty: 1, maxQty: 2, weight: 50 },
      { materialId: MAT.GOLD,         minQty: 2, maxQty: 8, weight: 30 },
      { materialId: MAT.POTION_SPEED, minQty: 1, maxQty: 1, weight: 20 },
    ],
  },
}

// ── Chest Loot Table ──────────────────────────────────────────────────────────

export const CHEST_LOOT_TABLE: LootTable = {
  entries: [
    { materialId: MAT.WOOD,     minQty: 2, maxQty: 5, weight: 40 },
    { materialId: MAT.STONE,    minQty: 2, maxQty: 5, weight: 30 },
    { materialId: MAT.IRON_ORE, minQty: 1, maxQty: 3, weight: 20 },
    { materialId: MAT.GOLD,     minQty: 1, maxQty: 5, weight: 10 },
  ],
}

// ── Material Name Labels ──────────────────────────────────────────────────────

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [
    v,
    k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  ])
)

function matName(materialId: number): string {
  return MAT_NAMES[materialId] ?? `Material #${materialId}`
}

// ── Roll Loot ─────────────────────────────────────────────────────────────────

/**
 * Pick `rolls` entries from the table by weighted random.
 * Each roll is independent; entries with the same materialId are merged.
 * Returns an array of {materialId, qty}.
 */
export function rollLoot(
  table: LootTable,
  rolls: number,
): Array<{ materialId: number; qty: number }> {
  const { entries } = table
  if (entries.length === 0) return []

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0)
  const results: Array<{ materialId: number; qty: number }> = []

  for (let r = 0; r < rolls; r++) {
    let rand = Math.random() * totalWeight
    for (const entry of entries) {
      rand -= entry.weight
      if (rand <= 0) {
        const qty = entry.minQty + Math.floor(Math.random() * (entry.maxQty - entry.minQty + 1))
        const existing = results.find(d => d.materialId === entry.materialId)
        if (existing) {
          existing.qty += qty
        } else {
          results.push({ materialId: entry.materialId, qty })
        }
        break
      }
    }
  }

  return results
}

// ── Apply Loot To Inventory ───────────────────────────────────────────────────

/**
 * Add each drop to the player inventory.
 * Returns an array of human-readable strings like "3x Steel Ingot".
 */
export function applyLootToInventory(
  drops: ReturnType<typeof rollLoot>,
): string[] {
  return drops.map(({ materialId, qty }) => {
    inventory.addItem({ itemId: 0, materialId, quantity: qty, quality: 0.8 })
    return `${qty}x ${matName(materialId)}`
  })
}
