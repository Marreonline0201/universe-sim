// ── HousingUpgradeSystem.ts ─────────────────────────────────────────────────
// M48 Track A: Player Housing Upgrades
// Players can purchase upgrades for their home base using gold + materials.

import { MAT } from '../player/Inventory'
import { inventory } from './GameSingletons'
import { usePlayerStore } from '../store/playerStore'

// ── Types ────────────────────────────────────────────────────────────────────

export interface HousingUpgrade {
  id: string
  name: string
  description: string
  tier: 1 | 2 | 3
  cost: { gold: number; materials: Array<{ matId: number; qty: number }> }
  effect: string        // human-readable effect description
  unlocksTier?: number  // purchasing this upgrade unlocks the given tier
}

// ── Upgrade catalogue ────────────────────────────────────────────────────────

export const HOUSING_UPGRADES: HousingUpgrade[] = [
  // ── Tier 1 ──────────────────────────────────────────────────────────────
  {
    id: 'sturdy_walls',
    name: 'Sturdy Walls',
    description: 'Reinforce your home walls.',
    tier: 1,
    cost: { gold: 50, materials: [{ matId: MAT.STONE, qty: 20 }] },
    effect: '+10% shelter duration',
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    description: 'Stay warm during cold nights.',
    tier: 1,
    cost: { gold: 40, materials: [{ matId: MAT.WOOD, qty: 15 }, { matId: MAT.STONE, qty: 10 }] },
    effect: '+5°C ambient temp while sheltered',
  },
  {
    id: 'storage_room',
    name: 'Storage Room',
    description: 'Expand your inventory capacity.',
    tier: 1,
    cost: { gold: 60, materials: [{ matId: MAT.WOOD, qty: 25 }] },
    effect: '+10 inventory slots',
    unlocksTier: 2,
  },
  // ── Tier 2 ──────────────────────────────────────────────────────────────
  {
    id: 'workshop',
    name: 'Workshop',
    description: 'A dedicated crafting space.',
    tier: 2,
    cost: { gold: 120, materials: [{ matId: MAT.WOOD, qty: 30 }, { matId: MAT.IRON_INGOT, qty: 5 }] },
    effect: '-10% crafting time',
  },
  {
    id: 'alchemy_nook',
    name: 'Alchemy Nook',
    description: 'A corner for your potions and reagents.',
    tier: 2,
    cost: { gold: 100, materials: [{ matId: MAT.STONE, qty: 20 }, { matId: MAT.MUSHROOM, qty: 10 }] },
    effect: '+1 alchemy slot, +5% potion potency',
  },
  {
    id: 'trophy_room',
    name: 'Trophy Room',
    description: 'Display your greatest achievements.',
    tier: 2,
    cost: { gold: 80, materials: [{ matId: MAT.WOOD, qty: 20 }] },
    effect: '+5% XP gain from kills',
    unlocksTier: 3,
  },
  // ── Tier 3 ──────────────────────────────────────────────────────────────
  {
    id: 'vault',
    name: 'Gold Vault',
    description: 'A secure vault for your riches.',
    tier: 3,
    cost: { gold: 300, materials: [{ matId: MAT.STONE, qty: 50 }, { matId: MAT.IRON_INGOT, qty: 20 }] },
    effect: '+500 max gold storage',
  },
  {
    id: 'grand_hall',
    name: 'Grand Hall',
    description: 'An impressive hall befitting a hero.',
    tier: 3,
    cost: { gold: 500, materials: [{ matId: MAT.WOOD, qty: 60 }, { matId: MAT.STONE, qty: 40 }] },
    effect: '+20% faction reputation gain',
  },
]

// ── Owned upgrades state ─────────────────────────────────────────────────────

const _ownedUpgrades = new Set<string>()

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Returns true if the player has enough gold and all required materials
 * to afford the given upgrade.
 */
export function canAffordUpgrade(
  upgrade: HousingUpgrade,
  gold: number,
  inv: { items: Array<{ matId: number; qty: number }> },
): boolean {
  if (gold < upgrade.cost.gold) return false
  for (const { matId, qty } of upgrade.cost.materials) {
    const available = inv.items.filter(i => i.matId === matId).reduce((s, i) => s + i.qty, 0)
    if (available < qty) return false
  }
  return true
}

/**
 * Purchase an upgrade: deduct gold + materials, mark as owned, dispatch event.
 * Silently returns if the upgrade is already owned or can't be afforded.
 */
export function applyUpgrade(upgradeId: string): void {
  if (_ownedUpgrades.has(upgradeId)) return

  const upgrade = HOUSING_UPGRADES.find(u => u.id === upgradeId)
  if (!upgrade) return

  const playerState = usePlayerStore.getState()

  // Check gold
  if (playerState.gold < upgrade.cost.gold) return

  // Check materials
  for (const { matId, qty } of upgrade.cost.materials) {
    if (inventory.countMaterial(matId) < qty) return
  }

  // Deduct gold
  playerState.spendGold(upgrade.cost.gold)

  // Deduct materials
  for (const { matId, qty } of upgrade.cost.materials) {
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

  _ownedUpgrades.add(upgradeId)
  window.dispatchEvent(new CustomEvent('housing-upgrade', { detail: { upgradeId } }))
}

/** Returns array of owned upgrade IDs. */
export function getOwnedUpgrades(): string[] {
  return Array.from(_ownedUpgrades)
}

/** Returns true if the player owns the given upgrade. */
export function isUpgradeOwned(upgradeId: string): boolean {
  return _ownedUpgrades.has(upgradeId)
}

/**
 * Returns all upgrades available for the given unlocked tier (1, 2, or 3).
 * Only tiers <= unlockedTier are returned.
 */
export function getAvailableUpgrades(unlockedTier: number): HousingUpgrade[] {
  return HOUSING_UPGRADES.filter(u => u.tier <= unlockedTier)
}
