// ── PlayerAchievementJournalSystem ────────────────────────────────────────────
// M67 Track B: Personal Adventure Log — story moments, personal records, milestones.
// Distinct from AchievementShowcaseSystem (which tracks stats/rewards).
// This is the player's personal narrative log.

import { usePlayerStore } from '../store/playerStore'
import { useGameStore } from '../store/gameStore'

export type JournalEntryType =
  | 'first_time'    // First time player did something
  | 'personal_best' // New personal record
  | 'milestone'     // Level/gold/playtime milestones
  | 'story'         // Major story moments (bosses, world events, dungeons)
  | 'social'        // NPC relationship milestones, title earns

export interface AchievementJournalEntry {
  id: string
  type: JournalEntryType
  title: string
  description: string
  icon: string
  timestamp: number   // simSeconds at time of entry
  value?: number      // for personal bests (the record number)
  highlight?: boolean
}

export interface JournalSaveData {
  entries: AchievementJournalEntry[]
  craftedItems: string[]
  bondedNpcs: string[]
  goldMilestonesHit: number[]
  levelMilestonesHit: number[]
}

// ── Module state ──────────────────────────────────────────────────────────────

let _initialized = false
let _entries: AchievementJournalEntry[] = []
let _goldUnsub: (() => void) | null = null

// Tracking sets to deduplicate entries
const _craftedItems = new Set<string>()
const _bondedNpcs   = new Set<string>()
const _goldMilestonesHit  = new Set<number>()
const _levelMilestonesHit = new Set<number>()

const LEVEL_MILESTONES  = [5, 10, 20, 30, 50]
const GOLD_MILESTONES   = [1000, 5000, 10000, 50000]
const MAX_CRAFTED_ITEMS = 10

// ── Internal helpers ──────────────────────────────────────────────────────────

function simNow(): number {
  return useGameStore.getState().simSeconds
}

function makeId(): string {
  return `aj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function addEntry(entry: Omit<AchievementJournalEntry, 'id' | 'timestamp'>): void {
  const full: AchievementJournalEntry = {
    ...entry,
    id: makeId(),
    timestamp: simNow(),
  }
  _entries = [full, ..._entries]
}

function formatDay(simSeconds: number): string {
  const day = Math.floor(simSeconds / 86400) + 1
  return `Day ${day}`
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function getJournalEntries(): AchievementJournalEntry[] {
  return _entries
}

export function getJournalEntriesByType(type: JournalEntryType): AchievementJournalEntry[] {
  return _entries.filter(e => e.type === type)
}

export function getHighlightEntries(): AchievementJournalEntry[] {
  return _entries.filter(e => e.highlight === true)
}

// ── Serialization ──────────────────────────────────────────────────────────────

export function serializeAchievementJournal(): JournalSaveData {
  return {
    entries: [..._entries],
    craftedItems: Array.from(_craftedItems),
    bondedNpcs: Array.from(_bondedNpcs),
    goldMilestonesHit: Array.from(_goldMilestonesHit),
    levelMilestonesHit: Array.from(_levelMilestonesHit),
  }
}

export function deserializeAchievementJournal(data: JournalSaveData): void {
  if (!data) return
  try {
    _entries = Array.isArray(data.entries) ? data.entries : []
    if (Array.isArray(data.craftedItems))       data.craftedItems.forEach(v => _craftedItems.add(v))
    if (Array.isArray(data.bondedNpcs))         data.bondedNpcs.forEach(v => _bondedNpcs.add(v))
    if (Array.isArray(data.goldMilestonesHit))  data.goldMilestonesHit.forEach(v => _goldMilestonesHit.add(v))
    if (Array.isArray(data.levelMilestonesHit)) data.levelMilestonesHit.forEach(v => _levelMilestonesHit.add(v))
    _initialized = true
  } catch {
    // Corrupted data — silently ignore
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────

export function initPlayerAchievementJournal(): void {
  if (_initialized) return
  _initialized = true

  // Seed: always present journey start entry (only if no entries loaded from save)
  if (_entries.length === 0) {
    _entries = [{
      id: makeId(),
      type: 'story',
      title: 'Your Journey Begins',
      description: 'You took your first steps into a vast, unknown world.',
      icon: '🌟',
      timestamp: 0,
      highlight: true,
    }]
  }

  // ── player-levelup ─────────────────────────────────────────────────────────
  window.addEventListener('player-levelup', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const level: number = detail.level ?? detail.newLevel ?? 0
    if (!LEVEL_MILESTONES.includes(level)) return
    if (_levelMilestonesHit.has(level)) return
    _levelMilestonesHit.add(level)
    addEntry({
      type: 'milestone',
      title: `Level ${level} Reached`,
      description: `You have grown to level ${level}. Your legend grows stronger.`,
      icon: '⭐',
      highlight: level >= 30,
    })
  })

  // ── boss-defeated ──────────────────────────────────────────────────────────
  window.addEventListener('boss-defeated', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const name: string = detail.name ?? detail.bossName ?? 'a mighty boss'
    addEntry({
      type: 'story',
      title: `Boss Vanquished: ${name}`,
      description: `Defeated ${name} in an epic battle. Songs will be sung of this day.`,
      icon: '💀',
      highlight: true,
    })
  })

  // ── item-crafted ───────────────────────────────────────────────────────────
  window.addEventListener('item-crafted', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const itemName: string = detail.itemName ?? detail.name ?? detail.item ?? 'an item'
    if (_craftedItems.has(itemName)) return
    if (_craftedItems.size >= MAX_CRAFTED_ITEMS) return
    _craftedItems.add(itemName)
    addEntry({
      type: 'first_time',
      title: `First Craft: ${itemName}`,
      description: `You crafted your first ${itemName}. A new skill mastered.`,
      icon: '⚒️',
    })
  })

  // ── npc-gift ───────────────────────────────────────────────────────────────
  window.addEventListener('npc-gift', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const npcName: string = detail.npcName ?? detail.name ?? detail.npc ?? 'an NPC'
    if (_bondedNpcs.has(npcName)) return
    _bondedNpcs.add(npcName)
    addEntry({
      type: 'social',
      title: `Bond Formed: ${npcName}`,
      description: `You formed a bond with ${npcName}. They will remember your kindness.`,
      icon: '🤝',
    })
  })

  // ── title-unlocked ─────────────────────────────────────────────────────────
  window.addEventListener('title-unlocked', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const rarity: string = detail.rarity ?? ''
    if (rarity !== 'rare' && rarity !== 'legendary') return
    const titleName: string = detail.title ?? detail.name ?? 'a title'
    addEntry({
      type: 'social',
      title: `Title Earned: ${titleName}`,
      description: `Earned the ${rarity} title "${titleName}". Your reputation precedes you.`,
      icon: '👑',
      highlight: rarity === 'legendary',
    })
  })

  // ── scheduled-event-triggered ──────────────────────────────────────────────
  window.addEventListener('scheduled-event-triggered', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const eventName: string = detail.name ?? detail.eventName ?? 'a world event'
    addEntry({
      type: 'story',
      title: `World Event: ${eventName}`,
      description: `Witnessed the world event "${eventName}". History is being made.`,
      icon: '🌍',
    })
  })

  // ── dungeon-completed ──────────────────────────────────────────────────────
  window.addEventListener('dungeon-completed', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const dungeonName: string = detail.name ?? detail.dungeonName ?? 'a dungeon'
    addEntry({
      type: 'story',
      title: `Dungeon Conquered: ${dungeonName}`,
      description: `Cleared ${dungeonName} and emerged victorious from the depths.`,
      icon: '🗝️',
      highlight: true,
    })
  })

  // ── player-gold-changed (subscribe to playerStore) ─────────────────────────
  if (!_goldUnsub) {
    _goldUnsub = usePlayerStore.subscribe((state) => {
      const gold = state.gold
      for (const milestone of GOLD_MILESTONES) {
        if (gold >= milestone && !_goldMilestonesHit.has(milestone)) {
          _goldMilestonesHit.add(milestone)
          addEntry({
            type: 'milestone',
            title: `${milestone.toLocaleString()} Gold Accumulated`,
            description: `Your coffers hold ${milestone.toLocaleString()} gold. Wealth beyond measure.`,
            icon: '💰',
            value: milestone,
            highlight: milestone >= 10000,
          })
        }
      }
    })
  }
}

// ── Utility: format simSeconds as "Day X" for display ─────────────────────────
export { formatDay }
