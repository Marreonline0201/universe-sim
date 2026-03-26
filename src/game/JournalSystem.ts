// ── JournalSystem ─────────────────────────────────────────────────────────────
// M51 Track A: Player journal — auto-records notable game events as diary entries.

export interface JournalEntry {
  id: string           // `j_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
  timestamp: number    // Date.now()
  category: 'combat' | 'exploration' | 'crafting' | 'social' | 'milestone' | 'survival'
  title: string
  body: string         // 1-3 sentences, first-person narrative
  icon: string         // emoji
}

const MAX_ENTRIES = 200

let entries: JournalEntry[] = []

// ── Public API ────────────────────────────────────────────────────────────────

export function addJournalEntry(entry: Omit<JournalEntry, 'id' | 'timestamp'>): void {
  const full: JournalEntry = {
    ...entry,
    id: `j_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  }
  entries = entries.length >= MAX_ENTRIES
    ? [full, ...entries.slice(0, MAX_ENTRIES - 1)]
    : [full, ...entries]
}

/** Returns all entries, newest first. */
export function getJournalEntries(): JournalEntry[] {
  return entries
}

export function getEntriesByCategory(cat: JournalEntry['category']): JournalEntry[] {
  return entries.filter(e => e.category === cat)
}

export function clearJournal(): void {
  entries = []
}

// ── Auto-logging via window events ───────────────────────────────────────────

let _initialized = false

export function initJournalSystem(): void {
  if (_initialized) return
  _initialized = true

  // combat-kill — detail: { enemyName, ... }
  window.addEventListener('combat-kill', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const enemyName = detail.enemyName ?? detail.enemy ?? 'an enemy'
    addJournalEntry({
      category: 'combat',
      icon: '⚔️',
      title: 'Enemy Slain',
      body: `Slew a ${enemyName} in battle.`,
    })
  })

  // skill-level-up — detail: { skillId, newLevel, ... }
  window.addEventListener('skill-level-up', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const skillId = detail.skillId ?? detail.skill ?? 'unknown'
    const newLevel = detail.newLevel ?? detail.level ?? '?'
    addJournalEntry({
      category: 'milestone',
      icon: '⭐',
      title: 'Skill Level Up',
      body: `My ${skillId} skill reached level ${newLevel}.`,
    })
  })

  // housing-upgrade — detail: { upgradeName, ... }
  window.addEventListener('housing-upgrade', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const upgradeName = detail.upgradeName ?? detail.name ?? 'an upgrade'
    addJournalEntry({
      category: 'social',
      icon: '🏠',
      title: 'Home Improved',
      body: `Installed ${upgradeName} in my home.`,
    })
  })

  // restock-event — detail: { merchantName, ... }
  window.addEventListener('restock-event', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const merchantName = detail.merchantName ?? detail.merchant ?? 'a merchant'
    addJournalEntry({
      category: 'social',
      icon: '🛒',
      title: 'Merchant Restock',
      body: `Visited ${merchantName}'s bulk restock event.`,
    })
  })

  // dungeon-floor-advanced — detail: { floor, ... }
  window.addEventListener('dungeon-floor-advanced', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const floor = detail.floor ?? detail.level ?? '?'
    addJournalEntry({
      category: 'exploration',
      icon: '🗝️',
      title: 'Dungeon Descent',
      body: `Descended to dungeon floor ${floor}.`,
    })
  })
}
