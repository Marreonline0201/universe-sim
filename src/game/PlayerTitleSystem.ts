// ── PlayerTitleSystem.ts ──────────────────────────────────────────────────────
// M66 Track B: Player Reputation & Title System
// 20 titles across 4 rarity tiers. Unlock via stats + game events.
// Active (equipped) title shown in HUD.

import { usePlayerStatsStore } from '../store/playerStatsStore'

export interface PlayerTitle {
  id: string
  name: string
  prefix: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt?: number   // simSeconds when unlocked
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

// ── Title definitions (20 total) ─────────────────────────────────────────────

const TITLE_DEFINITIONS: Omit<PlayerTitle, 'unlocked' | 'unlockedAt'>[] = [
  // Common (5)
  {
    id: 'wanderer',
    name: 'The Wanderer',
    prefix: 'The Wanderer',
    description: 'Travel 1,000 meters on foot.',
    icon: '🥾',
    rarity: 'common',
  },
  {
    id: 'gatherer',
    name: 'The Gatherer',
    prefix: 'The Gatherer',
    description: 'Gather 100 resources from the world.',
    icon: '🌿',
    rarity: 'common',
  },
  {
    id: 'merchant',
    name: 'Merchant',
    prefix: 'Merchant',
    description: 'Complete 10 trades.',
    icon: '💰',
    rarity: 'common',
  },
  {
    id: 'builder',
    name: 'The Builder',
    prefix: 'The Builder',
    description: 'Place 5 buildings.',
    icon: '🔨',
    rarity: 'common',
  },
  {
    id: 'cook',
    name: 'The Cook',
    prefix: 'The Cook',
    description: 'Craft 5 food items.',
    icon: '🍳',
    rarity: 'common',
  },

  // Rare (7)
  {
    id: 'hunter',
    name: 'The Hunter',
    prefix: 'The Hunter',
    description: 'Defeat 50 enemies.',
    icon: '🏹',
    rarity: 'rare',
  },
  {
    id: 'dungeon_delver',
    name: 'Dungeon Delver',
    prefix: 'Dungeon Delver',
    description: 'Complete 3 dungeon delves.',
    icon: '⛏️',
    rarity: 'rare',
  },
  {
    id: 'alchemist',
    name: 'The Alchemist',
    prefix: 'The Alchemist',
    description: 'Craft 20 alchemy items.',
    icon: '⚗️',
    rarity: 'rare',
  },
  {
    id: 'faction_friend',
    name: 'Faction Friend',
    prefix: 'Faction Friend',
    description: 'Reach Friendly standing with any faction.',
    icon: '🤝',
    rarity: 'rare',
  },
  {
    id: 'sailor',
    name: 'The Sailor',
    prefix: 'The Sailor',
    description: 'Travel 500 meters by raft.',
    icon: '⛵',
    rarity: 'rare',
  },
  {
    id: 'tamer',
    name: 'The Tamer',
    prefix: 'The Tamer',
    description: 'Tame 3 animals.',
    icon: '🐾',
    rarity: 'rare',
  },
  {
    id: 'weather_watcher',
    name: 'Weather Watcher',
    prefix: 'Weather Watcher',
    description: 'Survive 5 weather events.',
    icon: '🌩️',
    rarity: 'rare',
  },

  // Epic (5)
  {
    id: 'boss_slayer',
    name: 'Boss Slayer',
    prefix: 'Boss Slayer',
    description: 'Defeat 5 world bosses.',
    icon: '⚔️',
    rarity: 'epic',
  },
  {
    id: 'master_crafter',
    name: 'Master Crafter',
    prefix: 'Master Crafter',
    description: 'Craft 100 items total.',
    icon: '🛠️',
    rarity: 'epic',
  },
  {
    id: 'diplomat',
    name: 'The Diplomat',
    prefix: 'The Diplomat',
    description: 'Reach Exalted standing with 2 factions.',
    icon: '🕊️',
    rarity: 'epic',
  },
  {
    id: 'dragon_friend',
    name: 'Dragon Friend',
    prefix: 'Dragon Friend',
    description: 'Pet the dragon at castle civilization tier.',
    icon: '🐉',
    rarity: 'epic',
  },
  {
    id: 'the_rich',
    name: 'The Rich',
    prefix: 'The Rich',
    description: 'Accumulate 10,000 gold.',
    icon: '💎',
    rarity: 'epic',
  },

  // Legendary (3)
  {
    id: 'world_savior',
    name: 'World Savior',
    prefix: 'World Savior',
    description: 'Defeat 20 world bosses.',
    icon: '🌟',
    rarity: 'legendary',
  },
  {
    id: 'architect',
    name: 'The Architect',
    prefix: 'The Architect',
    description: 'Place 20 buildings.',
    icon: '🏛️',
    rarity: 'legendary',
  },
  {
    id: 'legend_of_the_realm',
    name: 'Legend of the Realm',
    prefix: 'Legend of the Realm',
    description: 'Unlock 15 other titles.',
    icon: '👑',
    rarity: 'legendary',
  },
]

// ── Module state ──────────────────────────────────────────────────────────────

let _initialized = false
let _titles: PlayerTitle[] = []
let _equippedTitleId: string | null = null

// Extra counters not directly in playerStatsStore
let _tradesCompleted = 0
let _buildingsPlaced = 0
let _foodItemsCrafted = 0
let _dungeonsCompleted = 0
let _factionFriendlyCount = 0    // factions at Friendly+
let _factionExaltedCount = 0     // factions at Exalted
let _raftDistanceTraveled = 0
let _weatherEventsSurvived = 0
let _dragonPetted = false
let _currentGold = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSimSeconds(): number {
  try {
    // Avoid circular dep — read directly from localStorage snapshot if gameStore unavailable
    const raw = localStorage.getItem('universe_save_state')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.simSeconds === 'number') return parsed.simSeconds
    }
  } catch { /* ignore */ }
  return 0
}

function unlockTitle(id: string): void {
  const title = _titles.find(t => t.id === id)
  if (!title || title.unlocked) return
  title.unlocked = true
  title.unlockedAt = getSimSeconds()
  window.dispatchEvent(new CustomEvent('title-unlocked', { detail: { titleId: id, title } }))
}

// ── Check conditions ──────────────────────────────────────────────────────────

export function checkTitleUnlocks(): void {
  if (!_initialized) return
  const stats = usePlayerStatsStore.getState().stats

  // Common
  if (stats.distanceTraveled >= 1000)       unlockTitle('wanderer')
  if (stats.resourcesGathered >= 100)       unlockTitle('gatherer')
  if (_tradesCompleted >= 10)               unlockTitle('merchant')
  if (_buildingsPlaced >= 5)                unlockTitle('builder')
  if (_foodItemsCrafted >= 5)               unlockTitle('cook')

  // Rare
  if (stats.killCount >= 50)                unlockTitle('hunter')
  if (_dungeonsCompleted >= 3)              unlockTitle('dungeon_delver')
  if (stats.potionsBrewed >= 20)            unlockTitle('alchemist')
  if (_factionFriendlyCount >= 1)           unlockTitle('faction_friend')
  if (_raftDistanceTraveled >= 500)         unlockTitle('sailor')
  if (stats.animalsTamed >= 3)              unlockTitle('tamer')
  if (_weatherEventsSurvived >= 5)          unlockTitle('weather_watcher')

  // Epic
  if (stats.bossesKilled >= 5)             unlockTitle('boss_slayer')
  if (stats.itemsCrafted >= 100)            unlockTitle('master_crafter')
  if (_factionExaltedCount >= 2)            unlockTitle('diplomat')
  if (_dragonPetted)                        unlockTitle('dragon_friend')
  if (_currentGold >= 10000)               unlockTitle('the_rich')

  // Legendary
  if (stats.bossesKilled >= 20)            unlockTitle('world_savior')
  if (_buildingsPlaced >= 20)              unlockTitle('architect')

  // "Legend of the Realm" — unlock 15 other titles
  const unlockedCount = _titles.filter(t => t.unlocked && t.id !== 'legend_of_the_realm').length
  if (unlockedCount >= 15)                 unlockTitle('legend_of_the_realm')
}

// ── Event listeners ───────────────────────────────────────────────────────────

function onBossDefeated() {
  checkTitleUnlocks()
}

function onItemCrafted(e: Event) {
  const detail = (e as CustomEvent).detail as { category?: string; isFoodItem?: boolean } | undefined
  if (detail?.isFoodItem || detail?.category === 'food') {
    _foodItemsCrafted++
  }
  checkTitleUnlocks()
}

function onPlayerLevelUp() {
  checkTitleUnlocks()
}

function onNpcGift(e: Event) {
  const detail = (e as CustomEvent).detail as { gold?: number } | undefined
  if (typeof detail?.gold === 'number') {
    _currentGold += detail.gold
  }
  checkTitleUnlocks()
}

function onFactionStandingChanged(e: Event) {
  const detail = (e as CustomEvent).detail as {
    standing?: string
    friendlyCount?: number
    exaltedCount?: number
  } | undefined
  if (typeof detail?.friendlyCount === 'number') {
    _factionFriendlyCount = detail.friendlyCount
  }
  if (typeof detail?.exaltedCount === 'number') {
    _factionExaltedCount = detail.exaltedCount
  }
  checkTitleUnlocks()
}

function onDelveCompleted() {
  _dungeonsCompleted++
  checkTitleUnlocks()
}

function onTradeCompleted() {
  _tradesCompleted++
  checkTitleUnlocks()
}

function onBuildingPlaced() {
  _buildingsPlaced++
  checkTitleUnlocks()
}

function onRaftTravel(e: Event) {
  const detail = (e as CustomEvent).detail as { distance?: number } | undefined
  if (typeof detail?.distance === 'number') {
    _raftDistanceTraveled += detail.distance
  }
  checkTitleUnlocks()
}

function onWeatherEventSurvived() {
  _weatherEventsSurvived++
  checkTitleUnlocks()
}

function onDragonPetted() {
  _dragonPetted = true
  checkTitleUnlocks()
}

function onGoldChanged(e: Event) {
  const detail = (e as CustomEvent).detail as { gold?: number } | undefined
  if (typeof detail?.gold === 'number') {
    _currentGold = detail.gold
    checkTitleUnlocks()
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initPlayerTitleSystem(): void {
  if (_initialized) return
  _initialized = true

  // Build title list from definitions (all start locked)
  _titles = TITLE_DEFINITIONS.map(def => ({ ...def, unlocked: false }))

  // Register event listeners
  window.addEventListener('boss-defeated', onBossDefeated)
  window.addEventListener('item-crafted', onItemCrafted)
  window.addEventListener('player-levelup', onPlayerLevelUp)
  window.addEventListener('npc-gift', onNpcGift)
  window.addEventListener('faction-standing-changed', onFactionStandingChanged)
  window.addEventListener('delve-completed', onDelveCompleted)
  window.addEventListener('trade-completed', onTradeCompleted)
  window.addEventListener('building-placed', onBuildingPlaced)
  window.addEventListener('raft-travel', onRaftTravel)
  window.addEventListener('weather-event-survived', onWeatherEventSurvived)
  window.addEventListener('dragon-petted', onDragonPetted)
  window.addEventListener('gold-changed', onGoldChanged)

  // Initial check
  checkTitleUnlocks()
}

export function getAllTitles(): PlayerTitle[] {
  return _titles
}

export function getEquippedTitle(): PlayerTitle | null {
  if (!_equippedTitleId) return null
  return _titles.find(t => t.id === _equippedTitleId && t.unlocked) ?? null
}

export function equipTitle(id: string): boolean {
  const title = _titles.find(t => t.id === id)
  if (!title || !title.unlocked) return false
  _equippedTitleId = id
  window.dispatchEvent(new CustomEvent('title-equipped', { detail: { titleId: id } }))
  return true
}

// ── Serialization ─────────────────────────────────────────────────────────────

export interface PlayerTitleSaveData {
  titles: Array<{ id: string; unlocked: boolean; unlockedAt?: number }>
  equippedTitleId: string | null
  tradesCompleted: number
  buildingsPlaced: number
  foodItemsCrafted: number
  dungeonsCompleted: number
  factionFriendlyCount: number
  factionExaltedCount: number
  raftDistanceTraveled: number
  weatherEventsSurvived: number
  dragonPetted: boolean
  currentGold: number
}

export function serializeTitles(): PlayerTitleSaveData {
  return {
    titles: _titles.map(t => ({ id: t.id, unlocked: t.unlocked, unlockedAt: t.unlockedAt })),
    equippedTitleId: _equippedTitleId,
    tradesCompleted: _tradesCompleted,
    buildingsPlaced: _buildingsPlaced,
    foodItemsCrafted: _foodItemsCrafted,
    dungeonsCompleted: _dungeonsCompleted,
    factionFriendlyCount: _factionFriendlyCount,
    factionExaltedCount: _factionExaltedCount,
    raftDistanceTraveled: _raftDistanceTraveled,
    weatherEventsSurvived: _weatherEventsSurvived,
    dragonPetted: _dragonPetted,
    currentGold: _currentGold,
  }
}

export function deserializeTitles(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as Partial<PlayerTitleSaveData>

  if (Array.isArray(d.titles)) {
    for (const saved of d.titles) {
      const title = _titles.find(t => t.id === saved.id)
      if (title) {
        title.unlocked = saved.unlocked ?? false
        title.unlockedAt = saved.unlockedAt
      }
    }
  }

  if (typeof d.equippedTitleId === 'string' || d.equippedTitleId === null) {
    _equippedTitleId = d.equippedTitleId
  }
  if (typeof d.tradesCompleted === 'number')       _tradesCompleted = d.tradesCompleted
  if (typeof d.buildingsPlaced === 'number')       _buildingsPlaced = d.buildingsPlaced
  if (typeof d.foodItemsCrafted === 'number')      _foodItemsCrafted = d.foodItemsCrafted
  if (typeof d.dungeonsCompleted === 'number')     _dungeonsCompleted = d.dungeonsCompleted
  if (typeof d.factionFriendlyCount === 'number')  _factionFriendlyCount = d.factionFriendlyCount
  if (typeof d.factionExaltedCount === 'number')   _factionExaltedCount = d.factionExaltedCount
  if (typeof d.raftDistanceTraveled === 'number')  _raftDistanceTraveled = d.raftDistanceTraveled
  if (typeof d.weatherEventsSurvived === 'number') _weatherEventsSurvived = d.weatherEventsSurvived
  if (typeof d.dragonPetted === 'boolean')         _dragonPetted = d.dragonPetted
  if (typeof d.currentGold === 'number')           _currentGold = d.currentGold
}
