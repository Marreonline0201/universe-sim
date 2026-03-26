// ── TitleProgressionSystem.ts ─────────────────────────────────────────────────
// M59 Track B: Player Title Progression System
// 20+ titles with rarity tiers earned via cumulative playerStats.
// Titles are permanent, persist via serialization, and can be equipped.

import { usePlayerStatsStore } from '../store/playerStatsStore'
import { useUiStore } from '../store/uiStore'

export interface TitleDefinition {
  id: string
  title: string       // display text e.g. "the Wanderer" or "Master Crafter"
  prefix?: string     // shown before player name
  suffix?: string     // shown after player name
  description: string
  icon: string
  requirement: { stat: string; value: number }
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
}

// ── Title catalogue (20+ titles) ─────────────────────────────────────────────

export const TITLE_DEFINITIONS: TitleDefinition[] = [
  // ── Common (4 titles) ────────────────────────────────────────────────────────
  {
    id: 'wanderer',
    title: 'the Wanderer',
    suffix: 'the Wanderer',
    description: 'Travel at least 5,000 meters across the world.',
    icon: '🧭',
    requirement: { stat: 'distanceTraveled', value: 5000 },
    rarity: 'common',
  },
  {
    id: 'slayer',
    title: 'the Slayer',
    suffix: 'the Slayer',
    description: 'Defeat 50 enemies in combat.',
    icon: '⚔️',
    requirement: { stat: 'killCount', value: 50 },
    rarity: 'common',
  },
  {
    id: 'scavenger',
    title: 'Scavenger',
    prefix: 'Scavenger',
    description: 'Gather 50 resources from the world.',
    icon: '🌿',
    requirement: { stat: 'resourcesGathered', value: 50 },
    rarity: 'common',
  },
  {
    id: 'apprentice_crafter',
    title: 'Apprentice Crafter',
    prefix: 'Apprentice',
    description: 'Craft 10 items at a workbench.',
    icon: '🔨',
    requirement: { stat: 'itemsCrafted', value: 10 },
    rarity: 'common',
  },

  // ── Uncommon (6 titles) ──────────────────────────────────────────────────────
  {
    id: 'master_crafter',
    title: 'Master Crafter',
    prefix: 'Master Crafter',
    description: 'Craft 100 items at a workbench.',
    icon: '⚒️',
    requirement: { stat: 'itemsCrafted', value: 100 },
    rarity: 'uncommon',
  },
  {
    id: 'treasure_hunter',
    title: 'Treasure Hunter',
    prefix: 'Treasure Hunter',
    description: 'Accumulate 2,000 total gold earned.',
    icon: '💰',
    requirement: { stat: 'totalGoldEarned', value: 2000 },
    rarity: 'uncommon',
  },
  {
    id: 'world_explorer',
    title: 'World Explorer',
    prefix: 'World Explorer',
    description: 'Discover 6 settlements.',
    icon: '🗺️',
    requirement: { stat: 'settlementsDiscovered', value: 6 },
    rarity: 'uncommon',
  },
  {
    id: 'brewer',
    title: 'the Brewer',
    suffix: 'the Brewer',
    description: 'Brew 25 potions.',
    icon: '🧪',
    requirement: { stat: 'potionsBrewed', value: 25 },
    rarity: 'uncommon',
  },
  {
    id: 'beastfriend',
    title: 'Beastfriend',
    prefix: 'Beastfriend',
    description: 'Tame 5 animals.',
    icon: '🐾',
    requirement: { stat: 'animalsTamed', value: 5 },
    rarity: 'uncommon',
  },
  {
    id: 'footslogger',
    title: 'the Footslogger',
    suffix: 'the Footslogger',
    description: 'Travel 20,000 meters across the world.',
    icon: '👣',
    requirement: { stat: 'distanceTraveled', value: 20000 },
    rarity: 'uncommon',
  },

  // ── Rare (6 titles) ──────────────────────────────────────────────────────────
  {
    id: 'legend',
    title: 'Legend',
    prefix: 'Legend',
    description: 'Defeat 500 enemies in combat.',
    icon: '🏆',
    requirement: { stat: 'killCount', value: 500 },
    rarity: 'rare',
  },
  {
    id: 'boss_hunter',
    title: 'Boss Hunter',
    prefix: 'Boss Hunter',
    description: 'Defeat 3 world bosses.',
    icon: '💀',
    requirement: { stat: 'bossesKilled', value: 3 },
    rarity: 'rare',
  },
  {
    id: 'grand_alchemist',
    title: 'Grand Alchemist',
    prefix: 'Grand Alchemist',
    description: 'Brew 100 potions.',
    icon: '⚗️',
    requirement: { stat: 'potionsBrewed', value: 100 },
    rarity: 'rare',
  },
  {
    id: 'resource_baron',
    title: 'Resource Baron',
    prefix: 'Resource Baron',
    description: 'Gather 300 resources from the world.',
    icon: '🪵',
    requirement: { stat: 'resourcesGathered', value: 300 },
    rarity: 'rare',
  },
  {
    id: 'merchant_lord',
    title: 'Merchant Lord',
    prefix: 'Merchant Lord',
    description: 'Earn 10,000 total gold.',
    icon: '🏪',
    requirement: { stat: 'totalGoldEarned', value: 10000 },
    rarity: 'rare',
  },
  {
    id: 'cartographer',
    title: 'the Cartographer',
    suffix: 'the Cartographer',
    description: 'Discover all 10 settlements.',
    icon: '📍',
    requirement: { stat: 'settlementsDiscovered', value: 10 },
    rarity: 'rare',
  },

  // ── Legendary (5 titles) ──────────────────────────────────────────────────────
  {
    id: 'nature_lord',
    title: 'Lord of Nature',
    suffix: 'Lord of Nature',
    description: 'Gather 500 resources from the natural world.',
    icon: '🌲',
    requirement: { stat: 'resourcesGathered', value: 500 },
    rarity: 'legendary',
  },
  {
    id: 'god_of_war',
    title: 'God of War',
    prefix: 'God of War',
    description: 'Defeat 1,000 enemies in combat.',
    icon: '⚡',
    requirement: { stat: 'killCount', value: 1000 },
    rarity: 'legendary',
  },
  {
    id: 'master_tamer',
    title: 'Master of Beasts',
    suffix: 'Master of Beasts',
    description: 'Tame 15 animals.',
    icon: '🦁',
    requirement: { stat: 'animalsTamed', value: 15 },
    rarity: 'legendary',
  },
  {
    id: 'golden_fisher',
    title: 'the Golden Fisher',
    suffix: 'the Golden Fisher',
    description: 'Catch the legendary Golden Fish.',
    icon: '🐠',
    requirement: { stat: 'goldenFishCaught', value: 1 },
    rarity: 'legendary',
  },
  {
    id: 'titan_of_craft',
    title: 'Titan of Craft',
    prefix: 'Titan of Craft',
    description: 'Craft 500 items total.',
    icon: '🔩',
    requirement: { stat: 'itemsCrafted', value: 500 },
    rarity: 'legendary',
  },
]

// ── Module-level state ─────────────────────────────────────────────────────────

let _initialized = false
let _unlockedTitles: Set<string> = new Set()
let _equippedTitle: string | null = null

// ── Init ──────────────────────────────────────────────────────────────────────

export function initTitleProgressionSystem(): void {
  if (_initialized) return
  _initialized = true
}

// ── Check & unlock ────────────────────────────────────────────────────────────

export function checkTitles(): void {
  if (!_initialized) return
  const stats = usePlayerStatsStore.getState().stats as unknown as Record<string, number>

  for (const def of TITLE_DEFINITIONS) {
    if (_unlockedTitles.has(def.id)) continue
    const statValue = stats[def.requirement.stat] ?? 0
    if (statValue >= def.requirement.value) {
      _unlockedTitles.add(def.id)
      const rarityLabel =
        def.rarity === 'legendary' ? '★ LEGENDARY'
        : def.rarity === 'rare'    ? '◆ RARE'
        : def.rarity === 'uncommon' ? '◇ UNCOMMON'
        : '● COMMON'
      useUiStore.getState().addNotification(
        `Title Unlocked: [${def.title}] — ${def.description} (${rarityLabel})`,
        'discovery'
      )
      window.dispatchEvent(new CustomEvent('title-unlocked', { detail: { titleId: def.id } }))
    }
  }
}

// ── Equip / unequip ───────────────────────────────────────────────────────────

export function equipTitle(id: string): boolean {
  if (!_unlockedTitles.has(id)) return false
  _equippedTitle = id
  return true
}

export function unequipTitle(): void {
  _equippedTitle = null
}

// ── Getters ───────────────────────────────────────────────────────────────────

export function getUnlockedTitles(): TitleDefinition[] {
  return TITLE_DEFINITIONS.filter(def => _unlockedTitles.has(def.id))
}

export function getEquippedTitle(): TitleDefinition | null {
  if (!_equippedTitle) return null
  return TITLE_DEFINITIONS.find(def => def.id === _equippedTitle) ?? null
}

export function getEquippedTitleId(): string | null {
  return _equippedTitle
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeTitles(): string {
  return JSON.stringify({
    unlockedTitles: Array.from(_unlockedTitles),
    equippedTitle: _equippedTitle,
  })
}

export function deserializeTitles(data: string): void {
  if (!data) return
  try {
    const parsed = JSON.parse(data) as {
      unlockedTitles?: string[]
      equippedTitle?: string | null
    }
    if (Array.isArray(parsed.unlockedTitles)) {
      _unlockedTitles = new Set(parsed.unlockedTitles)
    }
    if (parsed.equippedTitle !== undefined) {
      _equippedTitle = parsed.equippedTitle
    }
  } catch {
    // corrupted data — silently ignore
  }
}
