// ── CaveFeatureSystem.ts ───────────────────────────────────────────────────
// M50 Track C: Cave biome enhancements — resource nodes + discoverable features.

import { MAT } from '../player/Inventory'

// ── Types ──────────────────────────────────────────────────────────────────

export type CaveFeatureType =
  | 'crystal_cluster'    // Harvestable crystal deposit
  | 'underground_lake'   // Special area with cave fish
  | 'fossil_deposit'     // Dig for rare bones/artifacts
  | 'mushroom_patch'     // Harvestable mushrooms
  | 'ancient_ruins'      // Explore for lore + gold
  | 'ore_vein'           // Rich ore deposit

export interface CaveFeature {
  id: string
  type: CaveFeatureType
  name: string
  description: string
  interactPrompt: string
  lootTable: Array<{ matId: number; qty: number; chance: number }>
  respawnSec: number
  icon: string
}

export interface ActiveFeature {
  featureId: string
  harvestedAt: number  // Date.now() when last harvested; 0 = never harvested
}

// ── Feature definitions ────────────────────────────────────────────────────

export const CAVE_FEATURES: CaveFeature[] = [
  {
    id: 'crystal_cluster',
    type: 'crystal_cluster',
    name: 'Crystal Cluster',
    icon: '💎',
    description: 'A formation of glowing crystals growing from the cave wall.',
    interactPrompt: '[F] Harvest crystals',
    lootTable: [
      { matId: MAT.LUMINITE,     qty: 2, chance: 0.70 },
      { matId: MAT.DEEP_CORAL,   qty: 1, chance: 0.40 },
      { matId: MAT.STONE,        qty: 3, chance: 1.00 },
      { matId: MAT.VELAR_CRYSTAL,qty: 1, chance: 0.05 },
    ],
    respawnSec: 300,
  },
  {
    id: 'underground_lake',
    type: 'underground_lake',
    name: 'Underground Lake',
    icon: '💧',
    description: 'A still, dark lake fed by underground springs. Rare fish dwell here.',
    interactPrompt: '[F] Fish the underground lake',
    lootTable: [
      { matId: MAT.CAVE_FISH, qty: 1, chance: 0.80 },
      { matId: MAT.RAW_FISH,  qty: 2, chance: 0.50 },
      { matId: MAT.BASS,      qty: 1, chance: 0.30 },
      { matId: MAT.SALMON,    qty: 1, chance: 0.10 },
    ],
    respawnSec: 60,
  },
  {
    id: 'fossil_deposit',
    type: 'fossil_deposit',
    name: 'Fossil Deposit',
    icon: '🦴',
    description: 'Ancient bones and remnants of prehistoric creatures embedded in the rock.',
    interactPrompt: '[F] Excavate fossil',
    lootTable: [
      { matId: MAT.BONE,        qty: 3, chance: 1.00 },
      { matId: MAT.STONE,       qty: 2, chance: 1.00 },
      { matId: MAT.SHADOW_IRON, qty: 1, chance: 0.25 },
      { matId: MAT.COPPER,      qty: 1, chance: 0.15 },
    ],
    respawnSec: 600,
  },
  {
    id: 'mushroom_patch',
    type: 'mushroom_patch',
    name: 'Mushroom Patch',
    icon: '🍄',
    description: 'Bioluminescent mushrooms growing in clusters on the cave floor.',
    interactPrompt: '[F] Harvest mushrooms',
    lootTable: [
      { matId: MAT.MUSHROOM, qty: 5, chance: 1.00 },
      { matId: MAT.MUSHROOM, qty: 3, chance: 0.60 },  // bonus roll
      { matId: MAT.FIBER,    qty: 2, chance: 0.40 },
    ],
    respawnSec: 180,
  },
  {
    id: 'ancient_ruins',
    type: 'ancient_ruins',
    name: 'Ancient Ruins',
    icon: '🏛',
    description: 'The remnants of an ancient structure deep underground.',
    interactPrompt: '[F] Explore ruins',
    lootTable: [
      { matId: MAT.GOLD,        qty: 2, chance: 0.70 },
      { matId: MAT.IRON,        qty: 3, chance: 0.60 },
      { matId: MAT.COPPER,      qty: 2, chance: 0.50 },
      { matId: MAT.SHADOW_IRON, qty: 1, chance: 0.20 },
      { matId: MAT.LUMINITE,    qty: 1, chance: 0.15 },
    ],
    respawnSec: 900,
  },
  {
    id: 'ore_vein',
    type: 'ore_vein',
    name: 'Rich Ore Vein',
    icon: '⛏',
    description: 'A thick vein of iron and coal running through the rock.',
    interactPrompt: '[F] Mine ore vein',
    lootTable: [
      { matId: MAT.IRON_ORE,    qty: 5, chance: 1.00 },
      { matId: MAT.COAL,        qty: 8, chance: 1.00 },
      { matId: MAT.COPPER_ORE,  qty: 3, chance: 0.60 },
      { matId: MAT.SHADOW_IRON, qty: 2, chance: 0.30 },
    ],
    respawnSec: 240,
  },
]

// ── Module-level state ─────────────────────────────────────────────────────

let activeFeatures: ActiveFeature[] = []

// ── Public API ─────────────────────────────────────────────────────────────

/** Initialize active feature tracking — one entry per feature type. */
export function initCaveFeatures(): void {
  activeFeatures = CAVE_FEATURES.map(f => ({
    featureId: f.id,
    harvestedAt: 0,
  }))
}

/** Returns features not currently in their respawn cooldown. */
export function getAvailableFeatures(): CaveFeature[] {
  return CAVE_FEATURES.filter(f => isFeatureAvailable(f.id))
}

/**
 * Roll loot for the given feature, mark it as harvested, and dispatch
 * the 'cave-feature-harvested' CustomEvent.
 * Returns an empty array if on cooldown or feature not found.
 */
export function harvestFeature(featureId: string): Array<{ matId: number; qty: number }> {
  if (!isFeatureAvailable(featureId)) return []

  const feature = CAVE_FEATURES.find(f => f.id === featureId)
  if (!feature) return []

  // Mark harvested
  const entry = activeFeatures.find(a => a.featureId === featureId)
  if (entry) entry.harvestedAt = Date.now()

  // Roll loot
  const drops: Array<{ matId: number; qty: number }> = []
  for (const row of feature.lootTable) {
    if (Math.random() <= row.chance) {
      // Merge with existing drop of same matId if present
      const existing = drops.find(d => d.matId === row.matId)
      if (existing) {
        existing.qty += row.qty
      } else {
        drops.push({ matId: row.matId, qty: row.qty })
      }
    }
  }

  window.dispatchEvent(
    new CustomEvent('cave-feature-harvested', {
      detail: { featureId, drops },
    })
  )

  return drops
}

/** Returns true if the feature exists and is not in its respawn cooldown. */
export function isFeatureAvailable(featureId: string): boolean {
  const feature = CAVE_FEATURES.find(f => f.id === featureId)
  if (!feature) return false

  const entry = activeFeatures.find(a => a.featureId === featureId)
  if (!entry || entry.harvestedAt === 0) return true

  const elapsed = (Date.now() - entry.harvestedAt) / 1000
  return elapsed >= feature.respawnSec
}

/** Returns seconds until the feature respawns; 0 if already available. */
export function getFeatureTimeRemaining(featureId: string): number {
  const feature = CAVE_FEATURES.find(f => f.id === featureId)
  if (!feature) return 0

  const entry = activeFeatures.find(a => a.featureId === featureId)
  if (!entry || entry.harvestedAt === 0) return 0

  const elapsed = (Date.now() - entry.harvestedAt) / 1000
  const remaining = feature.respawnSec - elapsed
  return Math.max(0, Math.ceil(remaining))
}
