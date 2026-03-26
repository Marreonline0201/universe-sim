// ── PetSystem.ts ─────────────────────────────────────────────────────────────
// M45 Track A: Pet and Companion System
// Players tame small creatures that follow them and provide passive buffs.

import { MAT } from '../player/Inventory'
import { inventory } from './GameSingletons'

// ── Pet type constants ────────────────────────────────────────────────────────
export const PetType = {
  FOX:    'fox',
  CROW:   'crow',
  RABBIT: 'rabbit',
  WOLF:   'wolf',
  OWL:    'owl',
} as const
export type PetTypeValue = typeof PetType[keyof typeof PetType]

// ── Pet definitions ───────────────────────────────────────────────────────────
export interface PetDef {
  name: string
  icon: string
  tameCost: Array<{ materialId: number; qty: number }>
  buffs: string[]
  buffDesc: string[]
}

export const PET_DEFS: Record<string, PetDef> = {
  [PetType.FOX]: {
    name: 'Fox',
    icon: '🦊',
    tameCost: [{ materialId: MAT.COOKED_MEAT, qty: 3 }],
    buffs: ['scavenge'],
    buffDesc: ['Occasionally finds hidden items'],
  },
  [PetType.CROW]: {
    name: 'Crow',
    icon: '🐦',
    tameCost: [
      { materialId: MAT.GRAIN, qty: 2 },
      { materialId: MAT.COOKED_FISH, qty: 1 },
    ],
    buffs: ['alert'],
    buffDesc: ['Warns 3s before animal attacks'],
  },
  [PetType.RABBIT]: {
    name: 'Rabbit',
    icon: '🐇',
    tameCost: [{ materialId: MAT.BERRY, qty: 3 }],
    buffs: ['luck'],
    buffDesc: ['+5% item drop rate from animals'],
  },
  [PetType.WOLF]: {
    name: 'Wolf',
    icon: '🐺',
    tameCost: [{ materialId: MAT.RAW_MEAT, qty: 5 }],
    buffs: ['intimidate'],
    buffDesc: ['Reduces hostile animal spawn rate by 20%'],
  },
  [PetType.OWL]: {
    name: 'Owl',
    icon: '🦉',
    tameCost: [{ materialId: MAT.FISH, qty: 3 }],
    buffs: ['wisdom'],
    buffDesc: ['+8% XP gain at night'],
  },
}

// ── Active pet state ──────────────────────────────────────────────────────────
export let playerPet: { type: string; name: string } | null = null

// ── tamePet ───────────────────────────────────────────────────────────────────
/** Checks player has tame cost materials, consumes them, sets playerPet.
 *  Returns true on success, false if insufficient materials. */
export function tamePet(type: string): boolean {
  const def = PET_DEFS[type]
  if (!def) return false

  // Check all tame costs
  for (const { materialId, qty } of def.tameCost) {
    if (inventory.countMaterial(materialId) < qty) return false
  }

  // Consume tame costs
  for (const { materialId, qty } of def.tameCost) {
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

  playerPet = { type, name: def.name }
  window.dispatchEvent(new CustomEvent('pet-tamed', { detail: { petType: type } }))
  return true
}

// ── dismissPet ────────────────────────────────────────────────────────────────
export function dismissPet(): void {
  playerPet = null
  window.dispatchEvent(new CustomEvent('pet-dismissed'))
}

// ── getPetBuffs ───────────────────────────────────────────────────────────────
export function getPetBuffs(): string[] {
  if (!playerPet) return []
  return PET_DEFS[playerPet.type]?.buffs ?? []
}

// ── hasPetBuff ────────────────────────────────────────────────────────────────
export function hasPetBuff(buff: string): boolean {
  return getPetBuffs().includes(buff)
}
