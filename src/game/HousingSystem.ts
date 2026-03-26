// ── HousingSystem.ts ───────────────────────────────────────────────────────────
// M44 Track B: Player Housing & Furniture System
// Players can claim a house in a settlement and place furniture for passive buffs.

import { MAT } from '../player/Inventory'
import { inventory } from './GameSingletons'

// ── Furniture types ──────────────────────────────────────────────────────────
export const FurnitureType = {
  BED:           1,
  WORKBENCH:     2,
  BOOKSHELF:     3,
  FIREPLACE:     4,
  STORAGE_CHEST: 5,
} as const
export type FurnitureType = typeof FurnitureType[keyof typeof FurnitureType]

// ── Furniture definitions ────────────────────────────────────────────────────
export interface FurnitureDef {
  name:     string
  cost:     Array<{ materialId: number; qty: number }>
  buff:     string
  buffDesc: string
}

export const FURNITURE_DEFS: Record<FurnitureType, FurnitureDef> = {
  [FurnitureType.BED]: {
    name:     'Bed',
    cost:     [{ materialId: MAT.WOOD, qty: 5 }, { materialId: MAT.CLOTH, qty: 2 }],
    buff:     'rest_regen',
    buffDesc: '+20% HP regen while sleeping',
  },
  [FurnitureType.WORKBENCH]: {
    name:     'Workbench',
    cost:     [{ materialId: MAT.WOOD, qty: 8 }, { materialId: MAT.IRON_INGOT, qty: 2 }],
    buff:     'craft_speed',
    buffDesc: '+10% crafting speed',
  },
  [FurnitureType.BOOKSHELF]: {
    name:     'Bookshelf',
    cost:     [{ materialId: MAT.WOOD, qty: 6 }, { materialId: MAT.CLOTH, qty: 4 }],
    buff:     'xp_boost',
    buffDesc: '+5% XP gain at home',
  },
  [FurnitureType.FIREPLACE]: {
    name:     'Fireplace',
    cost:     [{ materialId: MAT.STONE, qty: 8 }, { materialId: MAT.COAL, qty: 3 }],
    buff:     'warmth',
    buffDesc: 'Prevents cold damage in winter',
  },
  [FurnitureType.STORAGE_CHEST]: {
    name:     'Storage Chest',
    cost:     [{ materialId: MAT.WOOD, qty: 10 }],
    buff:     'storage',
    buffDesc: '+20 inventory slots while at home',
  },
}

// ── Player house state ───────────────────────────────────────────────────────
export interface PlayerHouse {
  settlementId: string
  ownerId:      string
  furniture:    FurnitureType[]
}

export let playerHouse: PlayerHouse | null = null

// ── Actions ──────────────────────────────────────────────────────────────────

/** Claim a house in the given settlement. Dispatches 'house-claimed' event. */
export function claimHouse(settlementId: string): void {
  playerHouse = {
    settlementId,
    ownerId:   'local',
    furniture: [],
  }
  window.dispatchEvent(new CustomEvent('house-claimed', { detail: { settlementId } }))
}

/**
 * Attempt to place furniture in the player's house.
 * Checks materials, consumes them, adds the furniture, dispatches 'furniture-placed'.
 * Returns false if: no house, already placed this type, or missing materials.
 */
export function placeFurniture(type: FurnitureType): boolean {
  if (!playerHouse) return false
  if (playerHouse.furniture.includes(type)) return false

  const def = FURNITURE_DEFS[type]

  // Check materials
  for (const { materialId, qty } of def.cost) {
    if (inventory.countMaterial(materialId) < qty) return false
  }

  // Consume materials (find and remove raw-material slots)
  for (const { materialId, qty } of def.cost) {
    let remaining = qty
    for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
      const slot = inventory.getSlot(i)
      if (slot && slot.itemId === 0 && slot.materialId === materialId) {
        const take = Math.min(slot.quantity, remaining)
        inventory.removeItem(i, take)
        remaining -= take
      }
    }
  }

  playerHouse.furniture.push(type)
  window.dispatchEvent(new CustomEvent('furniture-placed', { detail: { type } }))
  return true
}

/** Returns active buff names from all placed furniture. */
export function getHouseBuffs(): string[] {
  if (!playerHouse) return []
  return playerHouse.furniture.map(t => FURNITURE_DEFS[t].buff)
}

/**
 * Whether the player is currently inside their house.
 * Placeholder — always false until position-based logic is added.
 */
export function isAtHome(): boolean {
  return false
}
