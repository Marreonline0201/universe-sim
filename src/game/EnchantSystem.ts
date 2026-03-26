// ── EnchantSystem.ts ─────────────────────────────────────────────────────────
// M37 Track B: Alchemy System — Weapon & Armor Enchanting
//
// Players can apply one enchant to their current weapon or armor at an alchemy table.
// Each enchant has a material cost, a visible stat effect description, and an icon.
// Only one weapon enchant and one armor enchant can be active at a time.
//
// Integration:
//   - applyEnchant(enchant): consume materials from inventory and set active enchant
//   - activeWeaponEnchant / activeArmorEnchant: read from HUD / combat system
//   - getPotionDamageMult-equivalent: getEnchantDamageMult()
//   - getEnchantDamageReductionMult(): armor fortify
//   - ENCHANTS: full enchant catalog (for UI display)

import { MAT } from '../player/Inventory'
import { inventory } from './GameSingletons'

// ── Enchant type definitions ───────────────────────────────────────────────────

export type WeaponEnchant = 'sharpness' | 'fire_edge' | 'life_steal'
export type ArmorEnchant = 'fortify'
export type Enchant = WeaponEnchant | ArmorEnchant

export interface EnchantDef {
  name: string
  icon: string
  materialCost: Array<{ matId: number; qty: number }>
  effect: string
  applyTo: 'weapon' | 'armor' | 'tool'
  // Stat modifiers (read by combat / movement systems)
  damageMult?: number         // e.g. 1.2 = +20% weapon damage
  lifestealFrac?: number      // e.g. 0.05 = heal 5% of damage dealt
  fireEdge?: boolean          // true = attacks apply burning debuff for 5s
  damageReduction?: number    // e.g. 0.2 = -20% incoming damage (armor)
}

// ── Enchant catalog ────────────────────────────────────────────────────────────

export const ENCHANTS: Record<Enchant, EnchantDef> = {
  sharpness: {
    name: 'Sharpness',
    icon: '⚔',
    materialCost: [{ matId: MAT.IRON_ORE, qty: 5 }],
    effect: '+20% weapon damage',
    applyTo: 'weapon',
    damageMult: 1.2,
  },
  fire_edge: {
    name: 'Fire Edge',
    icon: '🔥',
    materialCost: [
      { matId: MAT.COAL,     qty: 5 },
      { matId: MAT.IRON_ORE, qty: 3 },
    ],
    effect: 'Attacks ignite target for 5s',
    applyTo: 'weapon',
    fireEdge: true,
  },
  life_steal: {
    name: 'Life Steal',
    icon: '❤',
    materialCost: [{ matId: MAT.IRON_ORE, qty: 8 }],
    effect: 'Heal 5% of damage dealt',
    applyTo: 'weapon',
    lifestealFrac: 0.05,
  },
  fortify: {
    name: 'Fortify',
    icon: '🛡',
    materialCost: [{ matId: MAT.STONE, qty: 10 }],
    effect: '-20% incoming damage',
    applyTo: 'armor',
    damageReduction: 0.2,
  },
}

// ── Active enchant state ───────────────────────────────────────────────────────

export let activeWeaponEnchant: WeaponEnchant | null = null
export let activeArmorEnchant: ArmorEnchant | null = null

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt to apply an enchant to the player's weapon or armor.
 * Consumes the required materials from inventory.
 * Returns true if successful, false if materials are insufficient.
 */
export function applyEnchant(enchant: Enchant): boolean {
  const def = ENCHANTS[enchant]
  if (!def) return false

  // Check all material costs
  if (!inventory.isGodMode()) {
    for (const { matId, qty } of def.materialCost) {
      if (inventory.countMaterial(matId) < qty) return false
    }
    // Consume materials
    for (const { matId, qty } of def.materialCost) {
      let remaining = qty
      for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
        const slot = inventory.getSlot(i)
        if (slot && slot.itemId === 0 && slot.materialId === matId) {
          const take = Math.min(slot.quantity, remaining)
          inventory.removeItem(i, take)
          remaining -= take
        }
      }
    }
  }

  // Apply enchant
  if (def.applyTo === 'weapon' || def.applyTo === 'tool') {
    activeWeaponEnchant = enchant as WeaponEnchant
  } else if (def.applyTo === 'armor') {
    activeArmorEnchant = enchant as ArmorEnchant
  }
  return true
}

/**
 * Remove the active weapon enchant (e.g. when switching weapons).
 */
export function removeWeaponEnchant(): void {
  activeWeaponEnchant = null
}

/**
 * Remove the active armor enchant.
 */
export function removeArmorEnchant(): void {
  activeArmorEnchant = null
}

/**
 * Returns the weapon damage multiplier from the active weapon enchant.
 * Multiply with base weapon damage in the combat system.
 */
export function getEnchantDamageMult(): number {
  if (!activeWeaponEnchant) return 1.0
  return ENCHANTS[activeWeaponEnchant].damageMult ?? 1.0
}

/**
 * Returns true if the active weapon enchant applies fire edge (burning on hit).
 */
export function hasFireEdge(): boolean {
  if (!activeWeaponEnchant) return false
  return ENCHANTS[activeWeaponEnchant].fireEdge === true
}

/**
 * Returns the life steal fraction from the active weapon enchant.
 * On hit: heal this fraction of damage dealt.
 */
export function getEnchantLifeStealFrac(): number {
  if (!activeWeaponEnchant) return 0
  return ENCHANTS[activeWeaponEnchant].lifestealFrac ?? 0
}

/**
 * Returns the damage reduction fraction from the active armor enchant.
 * Incoming damage multiplied by (1 - reduction).
 */
export function getEnchantDamageReduction(): number {
  if (!activeArmorEnchant) return 0
  return ENCHANTS[activeArmorEnchant].damageReduction ?? 0
}
