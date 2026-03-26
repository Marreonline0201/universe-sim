// src/game/WorldChronicleSystem.ts
// M63 Track C: World Event Chronicle — severity-ranked world history timeline.
// Distinct from PlayerJournalSystem (personal log). This records the world's history.

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChronicleCategory = 'boss' | 'weather' | 'faction' | 'settlement' | 'disaster' | 'milestone'
export type ChronicleSeverity = 'minor' | 'notable' | 'major' | 'legendary'

export interface ChronicleEntry {
  id: string
  simSeconds: number
  category: ChronicleCategory
  severity: ChronicleSeverity
  headline: string      // short title, like a newspaper headline
  detail: string        // 1-2 sentence description
  icon: string
}

// ── Module-level state ────────────────────────────────────────────────────────

const MAX_ENTRIES = 100
let _entries: ChronicleEntry[] = []
let _initialized = false
let _bossDefeatCount = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return `chr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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

export function addChronicleEntry(entry: Omit<ChronicleEntry, 'id'>): void {
  const full: ChronicleEntry = { id: makeId(), ...entry }
  _entries.unshift(full)
  if (_entries.length > MAX_ENTRIES) {
    _entries = _entries.slice(0, MAX_ENTRIES)
  }
  dispatch('chronicle-entry-added', { entry: full })
}

export function getChronicleEntries(
  category?: ChronicleCategory,
  severity?: ChronicleSeverity,
): ChronicleEntry[] {
  let result = _entries.slice()
  if (category) result = result.filter(e => e.category === category)
  if (severity) {
    const ORDER: ChronicleSeverity[] = ['minor', 'notable', 'major', 'legendary']
    const minIdx = ORDER.indexOf(severity)
    result = result.filter(e => ORDER.indexOf(e.severity) >= minIdx)
  }
  return result
}

export function serializeChronicle(): unknown {
  return { entries: _entries, bossDefeatCount: _bossDefeatCount }
}

export function deserializeChronicle(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as { entries?: unknown; bossDefeatCount?: unknown }
  if (Array.isArray(d.entries)) {
    _entries = d.entries as ChronicleEntry[]
  }
  if (typeof d.bossDefeatCount === 'number') {
    _bossDefeatCount = d.bossDefeatCount
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onBossSpawned(e: Event): void {
  const detail = (e as CustomEvent).detail as { bossId?: string } | undefined
  const bossId = detail?.bossId ?? 'Unknown Boss'
  addChronicleEntry({
    simSeconds: getSimSeconds(),
    category: 'boss',
    severity: 'notable',
    headline: `${bossId} Rises`,
    detail: `A powerful ${bossId} has appeared in the world.`,
    icon: '👹',
  })
}

function onBossDefeated(e: Event): void {
  const detail = (e as CustomEvent).detail as { bossId?: string } | undefined
  const bossId = detail?.bossId ?? 'Unknown Boss'
  _bossDefeatCount++

  addChronicleEntry({
    simSeconds: getSimSeconds(),
    category: 'boss',
    severity: 'major',
    headline: `${bossId} Slain`,
    detail: `The mighty ${bossId} has been defeated by a hero.`,
    icon: '🏆',
  })

  // Every 10 boss defeats → legendary milestone
  if (_bossDefeatCount % 10 === 0) {
    addChronicleEntry({
      simSeconds: getSimSeconds(),
      category: 'milestone',
      severity: 'legendary',
      headline: 'Heroic Legacy',
      detail: `10 world bosses have been vanquished.`,
      icon: '⭐',
    })
  }
}

function onBossExpired(e: Event): void {
  const detail = (e as CustomEvent).detail as { bossId?: string } | undefined
  const bossId = detail?.bossId ?? 'Unknown Boss'
  addChronicleEntry({
    simSeconds: getSimSeconds(),
    category: 'boss',
    severity: 'minor',
    headline: `${bossId} Retreats`,
    detail: `The ${bossId} has retreated without being challenged.`,
    icon: '💨',
  })
}

function onWeatherEventStarted(e: Event): void {
  const detail = (e as CustomEvent).detail as {
    event?: { event?: { icon?: string; name?: string; description?: string; probability?: number } }
  } | undefined
  const evt = detail?.event?.event
  if (!evt) return
  // Only high-probability events (> 0.4)
  if ((evt.probability ?? 0) <= 0.4) return
  addChronicleEntry({
    simSeconds: getSimSeconds(),
    category: 'weather',
    severity: 'minor',
    headline: evt.name ?? 'Weather Event',
    detail: evt.description ?? 'A significant weather event has occurred.',
    icon: evt.icon ?? '🌦️',
  })
}

function onFactionStandingChanged(e: Event): void {
  const detail = (e as CustomEvent).detail as {
    factionName?: string
    change?: number
  } | undefined
  const factionName = detail?.factionName ?? 'Unknown Faction'
  const change = detail?.change ?? 0
  if (Math.abs(change) < 50) return
  addChronicleEntry({
    simSeconds: getSimSeconds(),
    category: 'faction',
    severity: 'notable',
    headline: `Faction Shift: ${factionName}`,
    detail: `Standing changed by ${change > 0 ? '+' : ''}${change}`,
    icon: '⚔️',
  })
}

function onDelveCompleted(e: Event): void {
  const detail = (e as CustomEvent).detail as { floorsCleared?: number } | undefined
  const floorsCleared = detail?.floorsCleared ?? 1
  addChronicleEntry({
    simSeconds: getSimSeconds(),
    category: 'milestone',
    severity: 'minor',
    headline: 'Dungeon Cleared',
    detail: `A dungeon delve completed on floor ${floorsCleared}`,
    icon: '⚔️',
  })
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initWorldChronicle(): void {
  if (_initialized) return
  _initialized = true

  window.addEventListener('boss-spawned',             onBossSpawned)
  window.addEventListener('boss-defeated',            onBossDefeated)
  window.addEventListener('boss-expired',             onBossExpired)
  window.addEventListener('weather-event-started',    onWeatherEventStarted)
  window.addEventListener('faction-standing-changed', onFactionStandingChanged)
  window.addEventListener('delve-completed',          onDelveCompleted)
}
