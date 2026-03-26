// src/game/WeatherEventSystem.ts
// M59 Track A: Dynamic weather events — triggered by weather conditions with gameplay consequences.
// Distinct from WeatherSystem (picks weather types) and WeatherEffectsSystem (applies modifiers).
// This system fires named events with specific gameplay consequences.

import { useWeatherStore } from '../store/weatherStore'
import { useSeasonStore } from '../store/seasonStore'
import { useGameStore } from '../store/gameStore'

// Map server WeatherState values to lowercase for trigger matching
// Server enum: 'CLEAR' | 'CLOUDY' | 'RAIN' | 'STORM' | 'BLIZZARD' | 'TORNADO_WARNING' | 'VOLCANIC_ASH' | 'ACID_RAIN'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeatherEvent {
  id: string
  name: string
  icon: string
  /** Lower-cased weather trigger key (matches weather-changed event detail) */
  weatherTrigger: string | string[]
  /** Optional season filter — undefined means any season */
  seasonTrigger?: string | string[]
  /** Optional: only during night (hour < 6 or hour >= 20) */
  nightOnly?: boolean
  /** 0-1 probability per tick this event fires when conditions are met */
  probability: number
  /** Duration in seconds */
  duration: number
  description: string
}

export interface ActiveWeatherEvent {
  id: string
  startedAt: number   // simSeconds
  endsAt: number      // simSeconds
  event: WeatherEvent
}

// ── Event definitions ─────────────────────────────────────────────────────────

export const WEATHER_EVENTS: WeatherEvent[] = [
  {
    id: 'lightning_strike',
    name: 'Lightning Strike',
    icon: '⚡',
    weatherTrigger: 'storm',
    probability: 0.35,
    duration: 10,
    description: 'A nearby resource node is struck — depleted instantly, but +50 XP awarded.',
  },
  {
    id: 'flash_flood',
    name: 'Flash Flood',
    icon: '🌊',
    weatherTrigger: 'rain',
    probability: 0.25,
    duration: 30,
    description: 'Rising waters slow movement for 30 seconds.',
  },
  {
    id: 'volcanic_haze',
    name: 'Volcanic Haze',
    icon: '🌫️',
    weatherTrigger: 'volcanic_ash',
    probability: 0.40,
    duration: 60,
    description: 'Ash clouds shrink visibility to 50 m for 60 seconds.',
  },
  {
    id: 'blizzard_gust',
    name: 'Blizzard Gust',
    icon: '❄️',
    weatherTrigger: 'blizzard',
    probability: 0.30,
    duration: 8,
    description: 'A violent gust staggers the player for 2 seconds.',
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    icon: '🌈',
    weatherTrigger: 'clear',
    probability: 0.20,
    duration: 45,
    description: 'A rainbow appears after the rain — a pile of gold materialises nearby.',
  },
  {
    id: 'heatwave',
    name: 'Heat Wave',
    icon: '🔥',
    weatherTrigger: 'clear',
    seasonTrigger: ['SUMMER'],
    probability: 0.28,
    duration: 60,
    description: 'Intense heat drains stamina gradually over 60 seconds.',
  },
  {
    id: 'drought_warning',
    name: 'Drought Warning',
    icon: '🏜️',
    weatherTrigger: 'clear',
    probability: 0.20,
    duration: 60,
    description: 'Prolonged sun scorches the land — resource nodes yield 50% for 60 seconds.',
  },
  {
    id: 'perfect_harvest',
    name: 'Perfect Harvest',
    icon: '🌾',
    weatherTrigger: 'clear',
    seasonTrigger: ['AUTUMN'],
    probability: 0.30,
    duration: 30,
    description: 'Autumn sun peaks — gathering yield is doubled for 30 seconds.',
  },
  {
    id: 'night_frost',
    name: 'Night Frost',
    icon: '🧊',
    weatherTrigger: 'clear',
    nightOnly: true,
    probability: 0.35,
    duration: 45,
    description: 'A hard frost freezes all herb nodes — yield 0 for 45 seconds.',
  },
  {
    id: 'electric_storm_surge',
    name: 'Electric Storm Surge',
    icon: '⛈️',
    weatherTrigger: 'storm',
    probability: 0.22,
    duration: 30,
    description: 'Storm energy supercharges spells — all spell cooldowns halved for 30 seconds.',
  },
  {
    id: 'acid_rain_burn',
    name: 'Acid Rain Burn',
    icon: '☠️',
    weatherTrigger: 'acid_rain',
    probability: 0.50,
    duration: 40,
    description: 'Toxic rain causes periodic damage over 40 seconds.',
  },
  {
    id: 'tornado_chase',
    name: 'Tornado Chase',
    icon: '🌪️',
    weatherTrigger: 'tornado_warning',
    probability: 0.60,
    duration: 20,
    description: 'A tornado nearby — wind knocks back the player and boosts speed.',
  },
]

// ── Module-level state (transient — not serialised) ────────────────────────

let _activeEvents: ActiveWeatherEvent[] = []
let _initialized = false
let _currentWeather = 'clear'
let _sunnyTickCount = 0   // consecutive sunny/clear ticks for drought_warning
const EVENT_LOG_MAX = 20

// Event log — last N ended events (exported for panel use)
export const weatherEventLog: Array<{ eventId: string; name: string; icon: string; endedAt: number }> = []

// ── Helpers ────────────────────────────────────────────────────────────────────

function getCurrentSeason(): string {
  return useSeasonStore.getState().season   // 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER'
}

function getCurrentHour(): number {
  const dayAngle = useGameStore.getState().dayAngle ?? 0
  const norm = ((dayAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return (norm / (2 * Math.PI)) * 24
}

function isNight(): boolean {
  const h = getCurrentHour()
  return h < 6 || h >= 20
}

function matchesWeather(trigger: string | string[], weather: string): boolean {
  const w = weather.toLowerCase()
  if (Array.isArray(trigger)) return trigger.some(t => t.toLowerCase() === w)
  return trigger.toLowerCase() === w
}

function matchesSeason(trigger: string | string[], season: string): boolean {
  if (Array.isArray(trigger)) return trigger.includes(season)
  return trigger === season
}

function dispatch(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getActiveWeatherEvents(): ActiveWeatherEvent[] {
  return _activeEvents
}

export function isWeatherEventActive(id: string): boolean {
  return _activeEvents.some(e => e.id === id)
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initWeatherEventSystem(): void {
  if (_initialized) return
  _initialized = true
  // _currentWeather is read from the store directly in tickWeatherEvents
}

// ── Tick ──────────────────────────────────────────────────────────────────────

export function tickWeatherEvents(simSeconds: number): void {
  const now = simSeconds

  // Read current weather directly from the store (lowercase for trigger matching)
  _currentWeather = (useWeatherStore.getState().getPlayerWeather()?.state ?? 'CLEAR').toLowerCase()

  // Reset sunny tick counter when weather changes away from clear
  if (_currentWeather !== 'clear') {
    _sunnyTickCount = 0
  }

  // 1. Expire old events
  const toExpire = _activeEvents.filter(ae => now >= ae.endsAt)
  for (const ae of toExpire) {
    _activeEvents = _activeEvents.filter(x => x.id !== ae.id)
    dispatch('weather-event-ended', { eventId: ae.id })
    weatherEventLog.unshift({ eventId: ae.id, name: ae.event.name, icon: ae.event.icon, endedAt: now })
    if (weatherEventLog.length > EVENT_LOG_MAX) weatherEventLog.length = EVENT_LOG_MAX
  }

  // 2. Track clear ticks for drought_warning
  if (_currentWeather === 'clear') {
    _sunnyTickCount++
  }

  const season = getCurrentSeason()
  const night  = isNight()

  // 3. Roll new events
  for (const evt of WEATHER_EVENTS) {
    // Already active — skip
    if (_activeEvents.some(ae => ae.id === evt.id)) continue

    // Weather match
    if (!matchesWeather(evt.weatherTrigger, _currentWeather)) continue

    // Season match (if specified)
    if (evt.seasonTrigger && !matchesSeason(evt.seasonTrigger, season)) continue

    // Night-only check
    if (evt.nightOnly && !night) continue

    // Special rule: drought_warning only fires after 3+ consecutive ticks
    if (evt.id === 'drought_warning' && _sunnyTickCount < 3) continue

    // Probability roll
    if (Math.random() > evt.probability) continue

    // Activate event
    const ae: ActiveWeatherEvent = {
      id: evt.id,
      startedAt: now,
      endsAt: now + evt.duration,
      event: evt,
    }
    _activeEvents.push(ae)
    dispatch('weather-event-started', { event: ae })

    // Fire gameplay consequence dispatches
    _fireConsequences(evt, now)
  }
}

// ── Gameplay consequence dispatches ──────────────────────────────────────────

function _fireConsequences(evt: WeatherEvent, _now: number): void {
  switch (evt.id) {
    case 'lightning_strike':
      dispatch('lightning-resource-strike', { xpBonus: 50 })
      break
    case 'flash_flood':
      dispatch('weather-flood-start', { durationSeconds: evt.duration })
      break
    case 'fog_of_war':
      dispatch('fog-vision-reduced', { visibilityMeters: 50, durationSeconds: evt.duration })
      break
    case 'blizzard_gust':
      dispatch('blizzard-gust', {})
      dispatch('player-stunned', { durationSeconds: 2 })
      break
    case 'rainbow':
      dispatch('rainbow-appeared', { goldAmount: 100 })
      break
    case 'heatwave':
      dispatch('heatwave-active', { durationSeconds: evt.duration })
      break
    case 'drought_warning':
      dispatch('drought-active', { yieldMult: 0.5, durationSeconds: evt.duration })
      break
    case 'perfect_harvest':
      dispatch('harvest-bonus', { yieldMult: 2.0, durationSeconds: evt.duration })
      break
    case 'night_frost':
      dispatch('frost-active', { durationSeconds: evt.duration })
      break
    case 'electric_storm_surge':
      dispatch('spell-surge', { cooldownMult: 0.5, durationSeconds: evt.duration })
      break
    case 'acid_rain_burn':
      dispatch('acid-mist-active', { durationSeconds: evt.duration })
      break
    case 'volcanic_haze':
      dispatch('fog-vision-reduced', { visibilityMeters: 50, durationSeconds: evt.duration })
      break
    case 'tornado_chase':
      dispatch('wind-boost-active', { speedMult: 1.3, durationSeconds: evt.duration })
      dispatch('player-stunned', { durationSeconds: 1 })
      break
    default:
      break
  }
}
