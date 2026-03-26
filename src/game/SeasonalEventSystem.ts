// ── SeasonalEventSystem.ts ───────────────────────────────────────────────────
// M53 Track A: Seasonal Events System
// Manages per-season bonuses and random seasonal events (festivals, hazards, etc.)
// Triggered when season changes; ticked each GameLoop frame to expire events.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export interface SeasonalBonus {
  season: Season
  name: string
  description: string
  icon: string
  effects: string[]
}

const SEASONAL_BONUSES: Record<Season, SeasonalBonus> = {
  spring: {
    season: 'spring',
    name: 'Spring Bloom',
    icon: '🌸',
    description: 'Life returns to the land.',
    effects: ['+20% crop growth speed', '+15% gathering yield', 'Flowers attract traders'],
  },
  summer: {
    season: 'summer',
    name: 'Summer Heat',
    icon: '☀️',
    description: 'Peak productivity season.',
    effects: ['+25% combat XP', '+10% smithing output', 'Extended daylight hours'],
  },
  autumn: {
    season: 'autumn',
    name: 'Harvest Time',
    icon: '🍂',
    description: 'Time to reap what was sown.',
    effects: ['+30% food quality', '+20% crafting XP', 'Rare mushroom spawns'],
  },
  winter: {
    season: 'winter',
    name: 'Deep Winter',
    icon: '❄️',
    description: 'Survival is paramount.',
    effects: ['-20% food/water drain', '+25% survival XP', 'Rare frost resources appear'],
  },
}

export interface SeasonalEvent {
  id: string
  season: Season
  name: string
  description: string
  icon: string
  duration: number    // sim seconds
  startedAt: number
  active: boolean
}

interface SeasonalEventDef {
  name: string
  description: string
  icon: string
  chance: number
  durationSecs: number
}

const SEASONAL_EVENTS_BY_SEASON: Record<Season, SeasonalEventDef[]> = {
  spring: [
    { name: 'Spring Festival',  icon: '🎉', description: 'Traders visit with rare goods.',       chance: 0.3,  durationSecs: 300 },
    { name: 'Planting Moon',    icon: '🌙', description: 'Crops planted tonight grow double.',   chance: 0.15, durationSecs: 180 },
  ],
  summer: [
    { name: 'Midsummer Hunt',   icon: '🏹', description: 'Animals are active and plentiful.',    chance: 0.25, durationSecs: 240 },
    { name: 'Dragon Sighting',  icon: '🐉', description: 'A dragon circles the mountains.',     chance: 0.05, durationSecs: 120 },
  ],
  autumn: [
    { name: 'Harvest Moon',         icon: '🌕', description: 'Crops yield triple tonight.',              chance: 0.4,  durationSecs: 300 },
    { name: 'Wandering Merchant',   icon: '🧳', description: 'A rare merchant passes through.',          chance: 0.2,  durationSecs: 200 },
  ],
  winter: [
    { name: 'Blizzard Warning',  icon: '🌨', description: 'A storm approaches — prepare.',            chance: 0.3,  durationSecs: 180 },
    { name: 'Aurora Borealis',   icon: '🌌', description: 'The northern lights grant visions.',       chance: 0.1,  durationSecs: 240 },
  ],
}

// ── Module state ─────────────────────────────────────────────────────────────

let currentSeason: Season = 'spring'
let activeSeasonalEvents: SeasonalEvent[] = []
let seasonalEventHistory: SeasonalEvent[] = []
let _eventIdCounter = 0

const HISTORY_MAX = 20

// ── Accessors ────────────────────────────────────────────────────────────────

export function getCurrentSeason(): Season {
  return currentSeason
}

export function getCurrentSeasonalBonus(): SeasonalBonus {
  return SEASONAL_BONUSES[currentSeason]
}

export function getActiveSeasonalEvents(): SeasonalEvent[] {
  return activeSeasonalEvents
}

export function getSeasonalEventHistory(): SeasonalEvent[] {
  return seasonalEventHistory
}

// ── Season change hook ───────────────────────────────────────────────────────
// Call whenever the season changes (e.g. from WorldSocket SEASON_CHANGED or
// a local sim transition). Rolls random events for the new season.

export function onSeasonChange(newSeason: Season, simSeconds: number): void {
  currentSeason = newSeason

  const defs = SEASONAL_EVENTS_BY_SEASON[newSeason]
  const triggered: SeasonalEvent[] = []

  for (const def of defs) {
    if (Math.random() < def.chance) {
      const ev: SeasonalEvent = {
        id: `seasonal_${++_eventIdCounter}`,
        season: newSeason,
        name: def.name,
        description: def.description,
        icon: def.icon,
        duration: def.durationSecs,
        startedAt: simSeconds,
        active: true,
      }
      triggered.push(ev)
    }
  }

  activeSeasonalEvents = triggered

  const bonus = SEASONAL_BONUSES[newSeason]

  // Notify listeners
  window.dispatchEvent(new CustomEvent('seasonal-change', {
    detail: { season: newSeason, bonusName: bonus.name },
  }))

  for (const ev of triggered) {
    window.dispatchEvent(new CustomEvent('seasonal-event', { detail: ev }))
  }
}

// ── Tick (call every GameLoop frame) ─────────────────────────────────────────
// Expires events whose duration has elapsed, moving them to history.

export function tickSeasonalEvents(simSeconds: number): void {
  if (activeSeasonalEvents.length === 0) return

  const expired: SeasonalEvent[] = []
  const stillActive: SeasonalEvent[] = []

  for (const ev of activeSeasonalEvents) {
    if (simSeconds > ev.startedAt + ev.duration) {
      expired.push({ ...ev, active: false })
    } else {
      stillActive.push(ev)
    }
  }

  if (expired.length > 0) {
    activeSeasonalEvents = stillActive
    seasonalEventHistory = [...expired, ...seasonalEventHistory].slice(0, HISTORY_MAX)
  }
}

// ── Map server season name → internal Season type ───────────────────────────
// The server uses uppercase 'SPRING' etc; this normalises to lowercase.

export function normaliseSeasonName(serverSeason: string): Season {
  const lower = serverSeason.toLowerCase()
  if (lower === 'spring' || lower === 'summer' || lower === 'autumn' || lower === 'winter') {
    return lower as Season
  }
  return 'spring'
}
