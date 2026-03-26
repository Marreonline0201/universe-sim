// SeasonalEventSystem.ts -- M64 Track A
// 4-season cycle (600 simSeconds), 12 events (3/season)

export type Season = "spring" | "summer" | "autumn" | "winter"

export interface SeasonalEvent {
  id: string; name: string; icon: string; season: Season
  description: string; effect: string; duration: number; triggerChance: number
}

export interface SeasonalBonus {
  season: Season; name: string; description: string; icon: string; effects: string[]
}

export const SEASON_DURATION = 600
const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"]

const SEASONAL_BONUSES: Record<Season, SeasonalBonus> = {
  spring: { season: 'spring', name: 'Spring Bloom', icon: '🌸', description: 'Life returns to the land.', effects: ['+30% gather yield','Water nodes refill faster','NPCs give double affinity'] },
  summer: { season: 'summer', name: 'Summer Heat', icon: '☀️', description: 'Peak productivity season.', effects: ['-25% resource node yield','Player moves 15% slower','-20% crafting costs'] },
  autumn: { season: 'autumn', name: 'Harvest Time', icon: '🍂', description: 'Time to reap what was sown.', effects: ['+100% food drops','More weather events','Rare animal spawns increased'] },
  winter: { season: 'winter', name: 'Deep Winter', icon: '❄️', description: 'Survival is paramount.', effects: ['-30% movement, reduced visibility','+50% XP gains','Water nodes frozen'] },
}

const ALL_SEASONAL_EVENTS: SeasonalEvent[] = [
  { id: 'spring_bloom', name: 'Harvest Bloom', icon: '🌸', season: 'spring', description: 'The land bursts with life, making gathering far more rewarding.', effect: '+30% gather yield', duration: 120, triggerChance: 0.5 },
  { id: 'spring_rain', name: 'Spring Showers', icon: '🌧️', season: 'spring', description: 'Gentle rains replenish the water sources across the land.', effect: 'Water nodes refill faster', duration: 90, triggerChance: 0.5 },
  { id: 'spring_festival', name: 'Spring Festival', icon: '🎪', season: 'spring', description: 'Villagers celebrate the new season with open hearts.', effect: 'NPCs give double affinity', duration: 60, triggerChance: 0.5 },
  { id: 'summer_drought', name: 'Drought', icon: '☀️', season: 'summer', description: 'The scorching sun saps resources from their nodes.', effect: 'Resource nodes yield -25%', duration: 150, triggerChance: 0.5 },
  { id: 'summer_heatwave', name: 'Heatwave', icon: '🌡️', season: 'summer', description: 'Oppressive heat makes movement exhausting.', effect: 'Player moves 15% slower', duration: 90, triggerChance: 0.5 },
  { id: 'summer_abundance', name: 'Summer Abundance', icon: '🌻', season: 'summer', description: 'Materials are plentiful, reducing the cost to craft.', effect: 'Crafting costs -20%', duration: 120, triggerChance: 0.5 },
  { id: 'autumn_harvest', name: 'Harvest Season', icon: '🍂', season: 'autumn', description: 'The autumn harvest is in full swing -- food is everywhere.', effect: 'All food drops doubled', duration: 120, triggerChance: 0.5 },
  { id: 'autumn_storm', name: 'Autumn Storm', icon: '⛈️', season: 'autumn', description: 'Dark clouds roll in, stirring up turbulent weather.', effect: 'Weather events trigger more often', duration: 90, triggerChance: 0.5 },
  { id: 'autumn_migration', name: 'Migration', icon: '🦅', season: 'autumn', description: 'Rare animals travel through the region on their migration.', effect: 'Rare animal spawn rate increased', duration: 60, triggerChance: 0.5 },
  { id: 'winter_blizzard', name: 'Blizzard', icon: '❄️', season: 'winter', description: 'A ferocious blizzard blankets the land in ice and snow.', effect: 'Movement -30%, visibility reduced', duration: 150, triggerChance: 0.5 },
  { id: 'winter_solstice', name: 'Winter Solstice', icon: '🌟', season: 'winter', description: 'On the longest night, the cosmos align to amplify learning.', effect: 'XP gains +50%', duration: 90, triggerChance: 0.5 },
  { id: 'winter_freeze', name: 'Deep Freeze', icon: '🧊', season: 'winter', description: 'Every water source has frozen solid -- fishing is impossible.', effect: 'Water nodes frozen, no fishing', duration: 120, triggerChance: 0.5 },
]

const EVENTS_BY_SEASON: Record<Season, SeasonalEvent[]> = {
  spring: ALL_SEASONAL_EVENTS.filter(e => e.season === 'spring'),
  summer: ALL_SEASONAL_EVENTS.filter(e => e.season === 'summer'),
  autumn: ALL_SEASONAL_EVENTS.filter(e => e.season === 'autumn'),
  winter: ALL_SEASONAL_EVENTS.filter(e => e.season === 'winter'),
}

let _currentSeason: Season = "spring"
let _seasonProgress: number = 0
let _activeSeasonalEvent: SeasonalEvent | null = null
let _eventProgress: number = 0
let _seasonHistory: Array<{ season: Season; startedAt: number; event?: string }> = []
let _initialized = false

export interface LegacySeasonalEvent {
  id: string; season: Season; name: string; description: string
  icon: string; duration: number; startedAt: number; active: boolean
}
let _legacyActiveEvents: LegacySeasonalEvent[] = []
let _legacyHistory: LegacySeasonalEvent[] = []

export function initSeasonalEventSystem(): void {
  if (_initialized) return
  _initialized = true
  _currentSeason = "spring"
  _seasonProgress = 0; _activeSeasonalEvent = null; _eventProgress = 0
  _seasonHistory = []; _legacyActiveEvents = []; _legacyHistory = []
}

export function tickSeasonalEvents(simSeconds: number, delta?: number): void {
  const dt = delta ?? 0
  if (dt > 0) {
    _seasonProgress += dt
    if (_seasonProgress >= SEASON_DURATION) {
      _seasonProgress -= SEASON_DURATION
      const nextIdx = (SEASON_ORDER.indexOf(_currentSeason) + 1) % SEASON_ORDER.length
      const prevSeason = _currentSeason
      _currentSeason = SEASON_ORDER[nextIdx]
      _seasonHistory = [{ season: prevSeason, startedAt: simSeconds }, ..._seasonHistory].slice(0, 8)
      _activeSeasonalEvent = null; _eventProgress = 0; _legacyActiveEvents = []
      window.dispatchEvent(new CustomEvent("season-changed", { detail: { season: _currentSeason, previous: prevSeason } }))
      window.dispatchEvent(new CustomEvent("seasonal-change", { detail: { season: _currentSeason, bonusName: SEASONAL_BONUSES[_currentSeason].name } }))
    }
    if (_activeSeasonalEvent !== null) {
      _eventProgress += dt
      if (_eventProgress >= _activeSeasonalEvent.duration) {
        const ended = _activeSeasonalEvent
        _seasonHistory = [{ season: _currentSeason, startedAt: simSeconds - _eventProgress, event: ended.id }, ..._seasonHistory].slice(0, 8)
        _activeSeasonalEvent = null; _eventProgress = 0; _legacyActiveEvents = []
        window.dispatchEvent(new CustomEvent("seasonal-event-ended", { detail: ended }))
      }
    }
    if (_activeSeasonalEvent === null && Math.random() < 0.005) {
      const candidates = EVENTS_BY_SEASON[_currentSeason]
      const ev = candidates[Math.floor(Math.random() * candidates.length)]
      _activeSeasonalEvent = ev; _eventProgress = 0
      const legacyId = "m64_" + ev.id + "_" + String(simSeconds)
      _legacyActiveEvents = [{ id: legacyId, season: ev.season, name: ev.name, description: ev.description, icon: ev.icon, duration: ev.duration, startedAt: simSeconds, active: true }]
      window.dispatchEvent(new CustomEvent("seasonal-event-started", { detail: ev }))
    }
  } else {
    if (_legacyActiveEvents.length === 0) return
    const expired: LegacySeasonalEvent[] = []
    const stillActive: LegacySeasonalEvent[] = []
    for (const ev of _legacyActiveEvents) {
      if (simSeconds > ev.startedAt + ev.duration) { expired.push({ ...ev, active: false }) }
      else { stillActive.push(ev) }
    }
    if (expired.length > 0) { _legacyActiveEvents = stillActive; _legacyHistory = [...expired, ..._legacyHistory].slice(0, 20) }
  }
}

export function getCurrentSeason(): Season { return _currentSeason }
export function getSeasonProgress(): number { return _seasonProgress }
export function getActiveSeasonalEvent(): SeasonalEvent | null { return _activeSeasonalEvent }
export function getEventProgress(): number { return _eventProgress }
export function getSeasonHistory(): Array<{ season: Season; startedAt: number; event?: string }> { return _seasonHistory }
export function getUpcomingSeasons(): Season[] {
  const idx = SEASON_ORDER.indexOf(_currentSeason)
  return [1, 2, 3].map(i => SEASON_ORDER[(idx + i) % SEASON_ORDER.length])
}
export function getCurrentSeasonalBonus(): SeasonalBonus { return SEASONAL_BONUSES[_currentSeason] }
export function getActiveSeasonalEvents(): LegacySeasonalEvent[] { return _legacyActiveEvents }
export function getSeasonalEventHistory(): LegacySeasonalEvent[] { return _legacyHistory }

export function onSeasonChange(newSeason: Season, simSeconds: number): void {
  if (_currentSeason === newSeason) return
  _currentSeason = newSeason; _seasonProgress = 0
  _activeSeasonalEvent = null; _eventProgress = 0; _legacyActiveEvents = []
  window.dispatchEvent(new CustomEvent("season-changed", { detail: { season: newSeason } }))
  window.dispatchEvent(new CustomEvent("seasonal-change", { detail: { season: newSeason, bonusName: SEASONAL_BONUSES[newSeason].name } }))
  const _unused = simSeconds
}

export function normaliseSeasonName(serverSeason: string): Season {
  const lower = serverSeason.toLowerCase()
  if (lower === "spring" || lower === "summer" || lower === "autumn" || lower === "winter") return lower as Season
  return "spring"
}

interface SeasonsSaveData {
  currentSeason: Season; seasonProgress: number; activeEventId: string | null
  eventProgress: number; seasonHistory: Array<{ season: Season; startedAt: number; event?: string }>
}
export function serializeSeasons(): SeasonsSaveData {
  return { currentSeason: _currentSeason, seasonProgress: _seasonProgress, activeEventId: _activeSeasonalEvent?.id ?? null, eventProgress: _eventProgress, seasonHistory: _seasonHistory }
}
export function deserializeSeasons(data: SeasonsSaveData): void {
  if (!data) return
  _currentSeason = data.currentSeason ?? "spring"
  _seasonProgress = data.seasonProgress ?? 0; _eventProgress = data.eventProgress ?? 0
  _seasonHistory = Array.isArray(data.seasonHistory) ? data.seasonHistory : []
  if (data.activeEventId) { const found = ALL_SEASONAL_EVENTS.find(e => e.id === data.activeEventId); _activeSeasonalEvent = found ?? null }
  else { _activeSeasonalEvent = null }
  _legacyActiveEvents = []
}
