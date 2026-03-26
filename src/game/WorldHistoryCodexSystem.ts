// src/game/WorldHistoryCodexSystem.ts
// M67 Track A: World History Codex — permanent in-game encyclopedia of
// discovered world lore, historical events, and world facts.

// ── Types ─────────────────────────────────────────────────────────────────────

export type CodexCategory = 'geography' | 'bestiary' | 'history' | 'factions' | 'legends'

export type CodexRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export interface CodexEntry {
  id: string
  category: CodexCategory
  title: string
  icon: string
  description: string    // 1-2 sentence lore blurb
  discoveredAt: number   // simTime when discovered
  rarity: CodexRarity
}

export interface CodexSaveData {
  entries: CodexEntry[]
  seenFactions: string[]
  playerLevelMilestones: number[]
}

// ── Module-level state ────────────────────────────────────────────────────────

let _entries: CodexEntry[] = []
let _initialized = false
let _seenFactions: Set<string> = new Set()
let _playerLevelMilestones: Set<number> = new Set()

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

function hasEntry(id: string): boolean {
  return _entries.some(e => e.id === id)
}

function addEntry(entry: CodexEntry): void {
  if (_entries.some(e => e.id === entry.id)) return
  _entries.push(entry)
  window.dispatchEvent(new CustomEvent('codex-entry-added', { detail: { entry } }))
}

// ── Seed entries (always present from start) ──────────────────────────────────

const SEED_ENTRIES: CodexEntry[] = [
  // Geography
  {
    id: 'geo-known-world',
    category: 'geography',
    title: 'The Known World',
    icon: '🌍',
    description: 'A vast continent of contrasting biomes — plains, forests, deserts, and tundra — stretching further than any single explorer has ever mapped.',
    discoveredAt: 0,
    rarity: 'common',
  },
  {
    id: 'geo-great-plains',
    category: 'geography',
    title: 'The Great Plains',
    icon: '🌾',
    description: 'Endless rolling grasslands that form the heartland of the continent, home to nomadic herders and the most fertile farmland in the known world.',
    discoveredAt: 0,
    rarity: 'common',
  },
  {
    id: 'geo-dark-forest',
    category: 'geography',
    title: 'The Dark Forest',
    icon: '🌲',
    description: 'An ancient woodland where the canopy is so dense that daylight never reaches the floor, sheltering creatures and secrets that civilisation has never tamed.',
    discoveredAt: 0,
    rarity: 'uncommon',
  },
  // History
  {
    id: 'hist-great-spawning',
    category: 'history',
    title: 'The Great Spawning',
    icon: '🌌',
    description: 'The moment this world blinked into existence — when the first creatures stirred in the primordial wilderness and life began its long, violent experiment.',
    discoveredAt: 0,
    rarity: 'common',
  },
  {
    id: 'hist-first-settlement',
    category: 'history',
    title: 'The First Settlement',
    icon: '🏘️',
    description: 'Survivors banded together and built the first permanent settlement, marking the transition from nomadic survival to the beginning of civilisation.',
    discoveredAt: 0,
    rarity: 'common',
  },
  // Factions
  {
    id: 'faction-merchants-guild',
    category: 'factions',
    title: "Merchants Guild",
    icon: '💰',
    description: 'A powerful coalition of traders and merchants who regulate commerce across the known world, ensuring profit flows as freely as the trade roads they maintain.',
    discoveredAt: 0,
    rarity: 'common',
  },
  {
    id: 'faction-adventurers-guild',
    category: 'factions',
    title: "Adventurers Guild",
    icon: '⚔️',
    description: 'A brotherhood of sellswords, scouts, and dungeon delvers who take contracts others dare not touch — for the right price.',
    discoveredAt: 0,
    rarity: 'common',
  },
]

// ── Public API ────────────────────────────────────────────────────────────────

export function initWorldHistoryCodex(): void {
  if (_initialized) return
  _initialized = true

  // Add seed entries
  for (const entry of SEED_ENTRIES) {
    addEntry(entry)
  }

  // Listen for discovery events
  window.addEventListener('settlement-discovered', onSettlementDiscovered)
  window.addEventListener('boss-defeated',         onBossDefeated)
  window.addEventListener('faction-standing-changed', onFactionStandingChanged)
  window.addEventListener('scheduled-event-triggered', onScheduledEventTriggered)
  window.addEventListener('player-levelup',        onPlayerLevelUp)
}

export function getCodexEntries(): CodexEntry[] {
  return _entries.slice()
}

export function getEntriesByCategory(cat: CodexCategory): CodexEntry[] {
  return _entries.filter(e => e.category === cat)
}

export function getCodexStats(): { total: number; byCategory: Record<CodexCategory, number> } {
  const byCategory: Record<CodexCategory, number> = {
    geography: 0,
    bestiary:  0,
    history:   0,
    factions:  0,
    legends:   0,
  }
  for (const e of _entries) {
    byCategory[e.category]++
  }
  return { total: _entries.length, byCategory }
}

export function serializeCodex(): CodexSaveData {
  return {
    entries: _entries.slice(),
    seenFactions: Array.from(_seenFactions),
    playerLevelMilestones: Array.from(_playerLevelMilestones),
  }
}

export function deserializeCodex(data: CodexSaveData): void {
  if (!data || typeof data !== 'object') return
  if (Array.isArray(data.entries)) {
    // Merge: keep seed entries, add any saved ones not already present
    for (const entry of data.entries) {
      if (!_entries.some(e => e.id === entry.id)) {
        _entries.push(entry)
      }
    }
  }
  if (Array.isArray(data.seenFactions)) {
    _seenFactions = new Set(data.seenFactions)
  }
  if (Array.isArray(data.playerLevelMilestones)) {
    _playerLevelMilestones = new Set(data.playerLevelMilestones)
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onSettlementDiscovered(e: Event): void {
  const detail = (e as CustomEvent).detail as {
    name?: string
    id?: string
    type?: string
  } | undefined
  const name = detail?.name ?? 'Unknown Settlement'
  const id = detail?.id ?? name.toLowerCase().replace(/\s+/g, '-')
  const entryId = `geo-settlement-${id}`
  if (hasEntry(entryId)) return

  addEntry({
    id: entryId,
    category: 'geography',
    title: name,
    icon: '🏘️',
    description: `A settlement discovered during exploration. Its people carve a life from the wilderness, building something lasting in an uncertain world.`,
    discoveredAt: getSimSeconds(),
    rarity: 'common',
  })
}

function onBossDefeated(e: Event): void {
  const detail = (e as CustomEvent).detail as { bossId?: string } | undefined
  const bossId = detail?.bossId ?? 'Unknown Boss'
  const entryId = `legend-boss-${bossId.toLowerCase().replace(/\s+/g, '-')}`
  if (hasEntry(entryId)) return

  addEntry({
    id: entryId,
    category: 'legends',
    title: `${bossId} Slain`,
    icon: '🏆',
    description: `The mighty ${bossId} was defeated by a hero of this age — a feat that will echo through the chronicles for generations.`,
    discoveredAt: getSimSeconds(),
    rarity: 'legendary',
  })
}

function onFactionStandingChanged(e: Event): void {
  const detail = (e as CustomEvent).detail as { factionName?: string } | undefined
  const factionName = detail?.factionName
  if (!factionName) return
  if (_seenFactions.has(factionName)) return
  _seenFactions.add(factionName)

  const entryId = `faction-${factionName.toLowerCase().replace(/\s+/g, '-')}`
  if (hasEntry(entryId)) return

  addEntry({
    id: entryId,
    category: 'factions',
    title: factionName,
    icon: '⚔️',
    description: `First contact established with ${factionName}. Their motives, alliances, and reach are only beginning to come into focus.`,
    discoveredAt: getSimSeconds(),
    rarity: 'uncommon',
  })
}

function onScheduledEventTriggered(e: Event): void {
  const detail = (e as CustomEvent).detail as {
    eventId?: string
    name?: string
    description?: string
    icon?: string
  } | undefined
  if (!detail) return

  const eventId = detail.eventId ?? `event-${Date.now()}`
  const entryId = `hist-${eventId}`
  if (hasEntry(entryId)) return

  addEntry({
    id: entryId,
    category: 'history',
    title: detail.name ?? 'World Event',
    icon: detail.icon ?? '📜',
    description: detail.description ?? 'A significant event unfolded in the world, shaping the course of history.',
    discoveredAt: getSimSeconds(),
    rarity: 'uncommon',
  })
}

function onPlayerLevelUp(e: Event): void {
  const detail = (e as CustomEvent).detail as { level?: number } | undefined
  const level = detail?.level ?? 0
  const milestones = [10, 25, 50]
  if (!milestones.includes(level)) return
  if (_playerLevelMilestones.has(level)) return
  _playerLevelMilestones.add(level)

  const labels: Record<number, { title: string; description: string; icon: string }> = {
    10: {
      title: 'Veteran of the Realm',
      icon: '⭐',
      description: 'Having reached level 10, this hero has proven themselves beyond a mere novice — the road ahead is long, but the foundations are strong.',
    },
    25: {
      title: 'Champion of the Age',
      icon: '🌟',
      description: 'Level 25: few adventurers ever reach such heights. This hero has become a legend in the making, feared and respected in equal measure.',
    },
    50: {
      title: 'Immortal Legend',
      icon: '💫',
      description: 'Level 50. A name whispered across the known world. History will remember this hero long after the civilisations they defended have turned to dust.',
    },
  }

  const info = labels[level]
  addEntry({
    id: `legend-level-${level}`,
    category: 'legends',
    title: info.title,
    icon: info.icon,
    description: info.description,
    discoveredAt: getSimSeconds(),
    rarity: 'legendary',
  })
}
