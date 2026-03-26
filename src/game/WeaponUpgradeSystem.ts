// ── WeaponUpgradeSystem.ts ─────────────────────────────────────────────────────
// M43 Track A: Weapon upgrade paths, forge logic, and upgrade execution.

import { ITEM, MAT, type Inventory } from '../player/Inventory'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UpgradePath {
  fromItemId: number
  toItemId: number
  materialCosts: Array<{ materialId: number; quantity: number }>
  requiresForge: boolean
  upgradeName: string
}

// ── Upgrade path table ─────────────────────────────────────────────────────────
// Only uses ITEM/MAT values that exist in Inventory.ts.
// Stone-tier weapons: AXE (Stone Axe), SPEAR (Stone Spear)
// Bronze-tier: BRONZE_SWORD
// Iron-tier: IRON_SWORD, IRON_AXE, IRON_PICKAXE, IRON_KNIFE
// Steel-tier: STEEL_SWORD (17), STEEL_SWORD_M8 (52)

export const UPGRADE_PATHS: UpgradePath[] = [
  // Stone/Bronze → Iron upgrades
  {
    fromItemId: ITEM.AXE,
    toItemId: ITEM.IRON_AXE,
    materialCosts: [{ materialId: MAT.IRON_INGOT, quantity: 4 }],
    requiresForge: true,
    upgradeName: 'Stone Axe → Iron Axe',
  },
  {
    fromItemId: ITEM.SPEAR,
    toItemId: ITEM.IRON_KNIFE,
    materialCosts: [{ materialId: MAT.IRON_INGOT, quantity: 3 }],
    requiresForge: true,
    upgradeName: 'Spear → Iron Knife',
  },
  {
    fromItemId: ITEM.BRONZE_SWORD,
    toItemId: ITEM.IRON_SWORD,
    materialCosts: [{ materialId: MAT.IRON_INGOT, quantity: 5 }],
    requiresForge: true,
    upgradeName: 'Bronze Sword → Iron Sword',
  },
  // Iron → Steel upgrades
  {
    fromItemId: ITEM.IRON_SWORD,
    toItemId: ITEM.STEEL_SWORD,
    materialCosts: [
      { materialId: MAT.STEEL_INGOT, quantity: 5 },
      { materialId: MAT.COAL,        quantity: 3 },
    ],
    requiresForge: true,
    upgradeName: 'Iron Sword → Steel Sword',
  },
  {
    fromItemId: ITEM.IRON_AXE,
    toItemId: ITEM.STEEL_SWORD_M8,
    materialCosts: [
      { materialId: MAT.STEEL_INGOT, quantity: 4 },
      { materialId: MAT.COAL,        quantity: 3 },
    ],
    requiresForge: true,
    upgradeName: 'Iron Axe → Steel Sword',
  },
  {
    fromItemId: ITEM.IRON_KNIFE,
    toItemId: ITEM.STEEL_SWORD_M8,
    materialCosts: [
      { materialId: MAT.STEEL_INGOT, quantity: 3 },
      { materialId: MAT.COAL,        quantity: 2 },
    ],
    requiresForge: true,
    upgradeName: 'Iron Knife → Steel Sword',
  },
  {
    fromItemId: ITEM.IRON_PICKAXE,
    toItemId: ITEM.STEEL_SWORD_M8,
    materialCosts: [
      { materialId: MAT.STEEL_INGOT, quantity: 4 },
      { materialId: MAT.COAL,        quantity: 2 },
    ],
    requiresForge: true,
    upgradeName: 'Iron Pickaxe → Steel Sword',
  },
]

// ── Lookup helpers ─────────────────────────────────────────────────────────────

/** Returns the upgrade path for a given base weapon item ID, or null if none. */
export function getUpgradePathForItem(itemId: number): UpgradePath | null {
  return UPGRADE_PATHS.find(p => p.fromItemId === itemId) ?? null
}

// ── Upgrade validation ─────────────────────────────────────────────────────────

export interface CanUpgradeResult {
  canUpgrade: boolean
  reason: string
}

/**
 * Checks whether the player can perform the upgrade for the given base weapon.
 * Returns { canUpgrade: true, reason: '' } on success, or a failure with reason.
 */
export function canUpgrade(
  itemId: number,
  inv: Inventory,
  hasForge: boolean,
): CanUpgradeResult {
  const path = getUpgradePathForItem(itemId)
  if (!path) {
    return { canUpgrade: false, reason: 'No upgrade path available for this weapon.' }
  }

  if (path.requiresForge && !hasForge) {
    return { canUpgrade: false, reason: 'No forge nearby — approach a settlement forge to upgrade.' }
  }

  for (const cost of path.materialCosts) {
    const have = inv.countMaterial(cost.materialId)
    if (have < cost.quantity) {
      return {
        canUpgrade: false,
        reason: `Missing materials: need ${cost.quantity}x material #${cost.materialId} (have ${have}).`,
      }
    }
  }

  return { canUpgrade: true, reason: '' }
}

// ── Upgrade execution ──────────────────────────────────────────────────────────

/**
 * Performs a weapon upgrade if all conditions are met.
 * - Deducts required materials from inventory
 * - Removes the base weapon from its equipped slot
 * - Adds the upgraded weapon to inventory
 * Returns true if the upgrade succeeded.
 */
export function performUpgrade(
  itemId: number,
  inv: Inventory,
  equippedSlot: number,
): boolean {
  const path = getUpgradePathForItem(itemId)
  if (!path) return false

  // Verify materials (without consuming yet)
  for (const cost of path.materialCosts) {
    if (inv.countMaterial(cost.materialId) < cost.quantity) return false
  }

  // Verify the equipped slot actually contains this weapon
  const slot = inv.getSlot(equippedSlot)
  if (!slot || slot.itemId !== itemId) return false

  // Consume materials
  for (const cost of path.materialCosts) {
    let remaining = cost.quantity
    for (let i = 0; i < inv.slotCount && remaining > 0; i++) {
      const s = inv.getSlot(i)
      if (s && s.itemId === 0 && s.materialId === cost.materialId) {
        const take = Math.min(s.quantity, remaining)
        inv.removeItem(i, take)
        remaining -= take
      }
    }
  }

  // Remove the base weapon
  inv.removeItem(equippedSlot, 1)

  // Add the upgraded weapon
  return inv.addItem({
    itemId:     path.toItemId,
    materialId: 0,
    quantity:   1,
    quality:    0.8,
    rarity:     0,
  })
}
