// ── TitleSystem.ts ────────────────────────────────────────────────────────────
// M37 Track C: Player title / rank system based on accomplishments.
// 11 titles across common / rare / legendary rarity tiers.
// Titles are earned based on player stats and skill levels.

import { usePlayerStore } from '../store/playerStore'
import { useSkillStore } from '../store/skillStore'
import { skillSystem } from './SkillSystem'
import { useUiStore } from '../store/uiStore'
import { usePlayerStatsStore } from '../store/playerStatsStore'

export interface PlayerTitle {
  id: string
  name: string
  description: string   // How to earn it
  rarity: 'common' | 'rare' | 'legendary'
  color: string
  requirement: () => boolean
}

export const TITLES: PlayerTitle[] = [
  // ── Common ───────────────────────────────────────────────────────────────
  {
    id: 'newcomer',
    name: 'Newcomer',
    description: 'Start your journey',
    rarity: 'common',
    color: '#aaaaaa',
    requirement: () => true,
  },
  {
    id: 'gatherer',
    name: 'Gatherer',
    description: 'Reach level 5 in Gathering',
    rarity: 'common',
    color: '#88cc88',
    requirement: () => skillSystem.getLevel('gathering') >= 5,
  },
  {
    id: 'warrior',
    name: 'Warrior',
    description: 'Reach level 5 in Combat',
    rarity: 'common',
    color: '#cc8888',
    requirement: () => skillSystem.getLevel('combat') >= 5,
  },
  {
    id: 'homesteader',
    name: 'Homesteader',
    description: 'Place your first home',
    rarity: 'common',
    color: '#ccaa66',
    requirement: () => usePlayerStore.getState().homeSet,
  },
  // ── Rare ─────────────────────────────────────────────────────────────────
  {
    id: 'bossslayer',
    name: 'Boss Slayer',
    description: 'Defeat the world boss',
    rarity: 'rare',
    color: '#dd44dd',
    requirement: () => usePlayerStatsStore.getState().stats.bossesKilled >= 1,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Discover 5 settlements',
    rarity: 'rare',
    color: '#44aadd',
    requirement: () => usePlayerStatsStore.getState().stats.settlementsDiscovered >= 5,
  },
  {
    id: 'alchemist',
    name: 'Alchemist',
    description: 'Brew 10 potions',
    rarity: 'rare',
    color: '#44ddaa',
    requirement: () => usePlayerStatsStore.getState().stats.potionsBrewed >= 10,
  },
  {
    id: 'tamer',
    name: 'Beastmaster',
    description: 'Tame 3 animals',
    rarity: 'rare',
    color: '#ddaa44',
    requirement: () => usePlayerStatsStore.getState().stats.animalsTamed >= 3,
  },
  // ── Legendary ────────────────────────────────────────────────────────────
  {
    id: 'prestige',
    name: 'Veteran',
    description: 'Reach prestige level 1',
    rarity: 'legendary',
    color: '#ffdd00',
    requirement: () => useSkillStore.getState().prestigeCount >= 1,
  },
  {
    id: 'allskills',
    name: 'Master',
    description: 'All skills at level 10',
    rarity: 'legendary',
    color: '#ff8800',
    requirement: () => {
      const ids = ['gathering', 'crafting', 'combat', 'survival', 'exploration', 'smithing', 'husbandry'] as const
      return ids.every(id => skillSystem.getLevel(id) >= 10)
    },
  },
  {
    id: 'golden',
    name: 'Lucky Fisher',
    description: 'Catch the legendary Golden Fish',
    rarity: 'legendary',
    color: '#ffff00',
    requirement: () => usePlayerStatsStore.getState().stats.goldenFishCaught >= 1,
  },
]

// ── In-memory state ───────────────────────────────────────────────────────────

let _equippedTitleId: string = 'newcomer'
let _lastEarnedSet: Set<string> = new Set(['newcomer'])

/** Returns all currently earned titles (requirements pass). */
export function getEarnedTitles(): PlayerTitle[] {
  return TITLES.filter(t => t.requirement())
}

/** Returns the currently equipped title (falls back to newcomer). */
export function getEquippedTitle(): PlayerTitle {
  const earned = getEarnedTitles()
  const found = earned.find(t => t.id === _equippedTitleId)
  return found ?? earned[0] ?? TITLES[0]
}

/** Equip a title by id. Silently ignores if not earned. */
export function equipTitle(titleId: string): void {
  const earned = getEarnedTitles()
  if (earned.some(t => t.id === titleId)) {
    _equippedTitleId = titleId
  }
}

/** Returns the equipped title id (for UI reactivity). */
export function getEquippedTitleId(): string {
  return _equippedTitleId
}

/**
 * Call this whenever relevant state changes (stats, skill levels, etc.).
 * Fires toast notifications for newly earned titles.
 */
export function checkNewTitles(): void {
  const earned = getEarnedTitles()
  for (const t of earned) {
    if (!_lastEarnedSet.has(t.id)) {
      _lastEarnedSet.add(t.id)
      const rarityLabel = t.rarity === 'legendary' ? '★ LEGENDARY' : t.rarity === 'rare' ? '◆ RARE' : '● COMMON'
      useUiStore.getState().addNotification(
        `Title Unlocked: [${t.name}] — ${t.description} (${rarityLabel})`,
        'discovery'
      )
    }
  }
}

/** Serialize title state to persist across sessions. */
export function serializeTitles(): { equippedTitleId: string; earnedTitleIds: string[] } {
  return {
    equippedTitleId: _equippedTitleId,
    earnedTitleIds: Array.from(_lastEarnedSet),
  }
}

/** Restore title state from saved data. */
export function deserializeTitles(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as { equippedTitleId?: string; earnedTitleIds?: string[] }
  if (typeof d.equippedTitleId === 'string') _equippedTitleId = d.equippedTitleId
  if (Array.isArray(d.earnedTitleIds)) _lastEarnedSet = new Set(d.earnedTitleIds)
}
