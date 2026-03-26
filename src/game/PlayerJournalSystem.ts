// src/game/PlayerJournalSystem.ts
// M62 Track B: Player Journal System — event log with categories and filters.
// Module-level state, event-driven, idempotent init.

// ── Types ─────────────────────────────────────────────────────────────────────

export type JournalCategory =
  | 'combat'
  | 'discovery'
  | 'crafting'
  | 'weather'
  | 'social'
  | 'economy'
  | 'achievement'

export interface JournalEntry {
  id: string          // Date.now() + Math.random()
  simSeconds: number
  timestamp: number   // Date.now()
  category: JournalCategory
  icon: string
  title: string
  body: string
}

// ── Module-level state ────────────────────────────────────────────────────────

const MAX_ENTRIES = 200
let _entries: JournalEntry[] = []
let _initialized = false

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getSimSeconds(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../store/gameStore')
    return useGameStore.getState().simSeconds ?? 0
  } catch {
    return 0
  }
}

function dispatch(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

// ── Public API ────────────────────────────────────────────────────────────────

export function addJournalEntry(entry: Omit<JournalEntry, 'id'>): void {
  const full: JournalEntry = { id: makeId(), ...entry }
  _entries.unshift(full)
  if (_entries.length > MAX_ENTRIES) {
    _entries = _entries.slice(0, MAX_ENTRIES)
  }
  dispatch('journal-entry-added', { entry: full })
}

export function getJournalEntries(filter?: JournalCategory): JournalEntry[] {
  if (!filter) return _entries.slice()
  return _entries.filter(e => e.category === filter)
}

export function getJournalEntry(id: string): JournalEntry | undefined {
  return _entries.find(e => e.id === id)
}

// ── Event listeners ───────────────────────────────────────────────────────────

function onBossSpawned(e: Event): void {
  const detail = (e as CustomEvent).detail as { bossId?: string } | undefined
  const bossId = detail?.bossId ?? 'Unknown Boss'
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'combat',
    icon: '👹',
    title: 'World Boss Appeared',
    body: `${bossId} has appeared!`,
  })
}

function onBossDefeated(e: Event): void {
  const detail = (e as CustomEvent).detail as { bossId?: string } | undefined
  const bossId = detail?.bossId ?? 'Unknown Boss'
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'combat',
    icon: '🏆',
    title: 'Boss Defeated',
    body: `${bossId} slain`,
  })
}

function onWeatherEventStarted(e: Event): void {
  const detail = (e as CustomEvent).detail as { event?: { event?: { icon?: string; name?: string; description?: string } } } | undefined
  const evt = detail?.event?.event
  if (!evt) return
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'weather',
    icon: evt.icon ?? '🌦️',
    title: evt.name ?? 'Weather Event',
    body: evt.description ?? '',
  })
}

function onItemCrafted(e: Event): void {
  const detail = (e as CustomEvent).detail as { recipeId?: string } | undefined
  const recipeId = detail?.recipeId ?? 'Unknown'
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'crafting',
    icon: '⚒️',
    title: 'Item Crafted',
    body: `Recipe ${recipeId}`,
  })
}

function onNpcGift(e: Event): void {
  const detail = (e as CustomEvent).detail as { npcName?: string } | undefined
  const npcName = detail?.npcName ?? 'NPC'
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'social',
    icon: '🎁',
    title: 'Gift Given',
    body: `Gave gift to ${npcName}`,
  })
}

function onNpcTrade(e: Event): void {
  const detail = (e as CustomEvent).detail as { npcName?: string } | undefined
  const npcName = detail?.npcName ?? 'NPC'
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'social',
    icon: '🤝',
    title: 'Trade Completed',
    body: `Traded with ${npcName}`,
  })
}

function onPetLevelup(e: Event): void {
  const detail = (e as CustomEvent).detail as { level?: number } | undefined
  const level = detail?.level ?? '?'
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'achievement',
    icon: '🐾',
    title: 'Pet Leveled Up!',
    body: `Pet reached level ${level}`,
  })
}

function onFactionStandingChanged(e: Event): void {
  const detail = (e as CustomEvent).detail as { factionName?: string; change?: number } | undefined
  const factionName = detail?.factionName ?? 'Faction'
  const change = detail?.change ?? 0
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'social',
    icon: '⚔️',
    title: 'Faction Standing Changed',
    body: `${factionName}: ${change > 0 ? '+' : ''}${change}`,
  })
}

function onLocationDiscovered(e: Event): void {
  const detail = (e as CustomEvent).detail as { locationName?: string } | undefined
  const locationName = detail?.locationName ?? 'Unknown Location'
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'discovery',
    icon: '🗺️',
    title: 'New Location',
    body: `Discovered ${locationName}`,
  })
}

function onHarvestBonus(_e: Event): void {
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'weather',
    icon: '🌾',
    title: 'Perfect Harvest',
    body: 'Autumn sun peaks — yield doubled!',
  })
}

function onDroughtActive(_e: Event): void {
  addJournalEntry({
    simSeconds: getSimSeconds(),
    timestamp: Date.now(),
    category: 'weather',
    icon: '🏜️',
    title: 'Drought Warning',
    body: 'Resource nodes yield 50% for 60s',
  })
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initPlayerJournal(): void {
  if (_initialized) return
  _initialized = true

  window.addEventListener('boss-spawned',              onBossSpawned)
  window.addEventListener('boss-defeated',             onBossDefeated)
  window.addEventListener('weather-event-started',     onWeatherEventStarted)
  window.addEventListener('item-crafted',              onItemCrafted)
  window.addEventListener('npc-gift',                  onNpcGift)
  window.addEventListener('npc-trade',                 onNpcTrade)
  window.addEventListener('pet-levelup',               onPetLevelup)
  window.addEventListener('faction-standing-changed',  onFactionStandingChanged)
  window.addEventListener('location-discovered',       onLocationDiscovered)
  window.addEventListener('harvest-bonus',             onHarvestBonus)
  window.addEventListener('drought-active',            onDroughtActive)
}
