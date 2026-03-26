// ── EnemyVariantSystem.ts ─────────────────────────────────────────────────────
// M49 Track C: Enemy Variety Expansion
// Defines enemy variants with unique behaviors, biome assignments, and loot tables.
// Variants have a 15% chance to spawn instead of a common enemy.
// Elite variants (isElite flag) are derived via getEliteVariant() — 5% of spawns.

import { MAT } from '../player/Inventory'

export interface EnemyVariant {
  id: string
  species: string         // display name
  baseHp: number
  baseDamage: number
  speed: number           // 1.0 = normal
  biome: string[]         // biomes where this enemy spawns
  lootTable: Array<{ matId: number; qty: number; chance: number }>
  xpReward: number
  isElite: boolean        // elites: rare (5% spawn), 2x HP, boosted loot
  icon: string            // emoji for UI display
  description: string
}

// MAT substitutions for missing constants (documented inline):
//   BEAR_CLAW      → MAT.BONE         (hard bone material)
//   VENOM_GLAND    → MAT.MUSHROOM     (toxic organic)
//   CHITIN         → MAT.LEATHER      (tough hide-like material)
//   GOLD_COIN      → MAT.GOLD         (gold currency)
//   TROLL_HIDE     → MAT.HIDE         (raw hide)
//   CRYSTAL        → MAT.DEEP_CORAL   (gemlike material)
//   WING_MEMBRANE  → MAT.LEATHER      (thin flexible hide)
//   ICE_SHARD      → MAT.STONE        (hard brittle material)
//   FROZEN_BONE    → MAT.BONE         (bone material)
//   OBSIDIAN       → MAT.COAL         (dark volcanic material)
//   MOLTEN_CORE    → MAT.IRON_INGOT   (refined metal core)

export const ENEMY_VARIANTS: EnemyVariant[] = [
  // ── Forest enemies ────────────────────────────────────────────────────────
  {
    id: 'forest_wolf_alpha',
    species: 'Alpha Wolf',
    baseHp: 80,
    baseDamage: 18,
    speed: 1.2,
    biome: ['forest', 'taiga'],
    lootTable: [
      { matId: MAT.LEATHER,  qty: 3, chance: 0.9 },
      { matId: MAT.RAW_MEAT, qty: 2, chance: 0.8 },
    ],
    xpReward: 40,
    isElite: false,
    icon: '🐺',
    description: 'Pack leader. More aggressive than common wolves.',
  },
  {
    id: 'giant_bear',
    species: 'Grizzled Bear',
    baseHp: 120,
    baseDamage: 25,
    speed: 0.8,
    biome: ['forest'],
    lootTable: [
      { matId: MAT.LEATHER,  qty: 5, chance: 1.0 },
      { matId: MAT.RAW_MEAT, qty: 4, chance: 1.0 },
      { matId: MAT.BONE,     qty: 1, chance: 0.3 },  // BEAR_CLAW → MAT.BONE
    ],
    xpReward: 60,
    isElite: false,
    icon: '🐻',
    description: 'Territorial and powerful. Charges when threatened.',
  },
  // ── Desert enemies ────────────────────────────────────────────────────────
  {
    id: 'sand_scorpion',
    species: 'Sand Scorpion',
    baseHp: 45,
    baseDamage: 22,
    speed: 1.0,
    biome: ['desert'],
    lootTable: [
      { matId: MAT.MUSHROOM, qty: 1, chance: 0.5 },  // VENOM_GLAND → MAT.MUSHROOM
      { matId: MAT.LEATHER,  qty: 2, chance: 0.7 },  // CHITIN → MAT.LEATHER
    ],
    xpReward: 35,
    isElite: false,
    icon: '🦂',
    description: 'Venomous. Its sting causes poison damage over time.',
  },
  {
    id: 'desert_bandit',
    species: 'Desert Raider',
    baseHp: 65,
    baseDamage: 20,
    speed: 1.0,
    biome: ['desert'],
    lootTable: [
      { matId: MAT.GOLD, qty: 5, chance: 0.8 },  // GOLD_COIN → MAT.GOLD
      { matId: MAT.ROPE, qty: 2, chance: 0.6 },
    ],
    xpReward: 45,
    isElite: false,
    icon: '🗡',
    description: 'Bandit adapted to desert survival. Carries gold.',
  },
  // ── Cave / underground enemies ────────────────────────────────────────────
  {
    id: 'cave_troll',
    species: 'Cave Troll',
    baseHp: 150,
    baseDamage: 30,
    speed: 0.7,
    biome: ['cave', 'underground'],
    lootTable: [
      { matId: MAT.STONE,      qty: 10, chance: 1.0 },
      { matId: MAT.IRON_INGOT, qty: 2,  chance: 0.4 },
      { matId: MAT.HIDE,       qty: 1,  chance: 0.6 },  // TROLL_HIDE → MAT.HIDE
    ],
    xpReward: 80,
    isElite: false,
    icon: '👹',
    description: 'Massive cave-dweller. Slow but devastating attacks.',
  },
  {
    id: 'crystal_bat',
    species: 'Crystal Bat',
    baseHp: 30,
    baseDamage: 12,
    speed: 1.8,
    biome: ['cave'],
    lootTable: [
      { matId: MAT.DEEP_CORAL, qty: 1, chance: 0.4 },  // CRYSTAL → MAT.DEEP_CORAL
      { matId: MAT.LEATHER,    qty: 1, chance: 0.5 },  // WING_MEMBRANE → MAT.LEATHER
    ],
    xpReward: 20,
    isElite: false,
    icon: '🦇',
    description: 'Fast-moving cave creature. Difficult to hit.',
  },
  // ── Snow / arctic enemies ─────────────────────────────────────────────────
  {
    id: 'frost_giant',
    species: 'Frost Giant',
    baseHp: 200,
    baseDamage: 35,
    speed: 0.6,
    biome: ['snow', 'tundra'],
    lootTable: [
      { matId: MAT.STONE,   qty: 3, chance: 0.8 },  // ICE_SHARD → MAT.STONE
      { matId: MAT.BONE,    qty: 2, chance: 0.5 },  // FROZEN_BONE → MAT.BONE
      { matId: MAT.LEATHER, qty: 4, chance: 0.9 },
    ],
    xpReward: 100,
    isElite: false,
    icon: '🧊',
    description: 'Ancient giant of the frozen north.',
  },
  // ── Volcanic enemies ──────────────────────────────────────────────────────
  {
    id: 'magma_golem',
    species: 'Magma Golem',
    baseHp: 180,
    baseDamage: 28,
    speed: 0.5,
    biome: ['volcanic', 'lava'],
    lootTable: [
      { matId: MAT.COAL,       qty: 5, chance: 1.0 },
      { matId: MAT.COAL,       qty: 2, chance: 0.5 },  // OBSIDIAN → MAT.COAL
      { matId: MAT.IRON_INGOT, qty: 1, chance: 0.2 },  // MOLTEN_CORE → MAT.IRON_INGOT
    ],
    xpReward: 90,
    isElite: false,
    icon: '🌋',
    description: 'Forged from volcanic rock. Fire-immune and slow.',
  },
]

// ── Helper: variants by biome ─────────────────────────────────────────────────

/** Returns all variants that can spawn in the given biome. */
export function getVariantsForBiome(biome: string): EnemyVariant[] {
  return ENEMY_VARIANTS.filter(v => v.biome.includes(biome))
}

// ── Helper: weighted spawn roll ───────────────────────────────────────────────

/**
 * 15% chance to return a non-elite variant for the given biome.
 * Selection is weighted: lower xpReward = more common.
 * Returns null on the 85% case (spawn a normal common enemy instead).
 */
export function rollVariantSpawn(biome: string): EnemyVariant | null {
  if (Math.random() > 0.15) return null

  const candidates = getVariantsForBiome(biome)
  if (candidates.length === 0) return null

  // Weight: inverse of xpReward so cheaper enemies are more common
  const maxXp = Math.max(...candidates.map(v => v.xpReward))
  const weights = candidates.map(v => maxXp - v.xpReward + 1)
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  let roll = Math.random() * totalWeight
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

// ── Helper: elite version ─────────────────────────────────────────────────────

/**
 * Returns an elite version of the variant identified by baseId.
 * Elite stats: 2x HP, 1.5x damage, same speed, doubled loot qty, name suffixed with " [ELITE]".
 * Throws if the baseId is not found.
 */
export function getEliteVariant(baseId: string): EnemyVariant {
  const base = ENEMY_VARIANTS.find(v => v.id === baseId)
  if (!base) throw new Error(`EnemyVariantSystem: unknown variant id "${baseId}"`)
  return {
    ...base,
    id: `${base.id}_elite`,
    species: `${base.species} [ELITE]`,
    baseHp: base.baseHp * 2,
    baseDamage: Math.round(base.baseDamage * 1.5),
    lootTable: base.lootTable.map(e => ({ ...e, qty: e.qty * 2 })),
    xpReward: base.xpReward * 2,
    isElite: true,
  }
}
