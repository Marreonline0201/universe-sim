// ── WeatherSpellSystem.ts ──────────────────────────────────────────────────────
// M44 Track C: Weather-Spell Interactions
// Spells interact with the current weather condition.
// Fireball is stronger in dry/sunny weather, weaker in rain.
// Lightning is amplified in storms. Ice spells benefit from blizzards.

import { useWeatherStore } from '../store/weatherStore'
import { useUiStore } from '../store/uiStore'
import type { SpellId } from './SpellSystem'

// ── Modifier Table ─────────────────────────────────────────────────────────────
// Keys are WeatherState values (lowercase), values are damage multipliers.
// Missing entries default to 1.0.

export const SPELL_WEATHER_MODIFIERS: Record<SpellId, Partial<Record<string, number>>> = {
  fireball: {
    clear:    1.2,
    rain:     0.7,
    storm:    0.5,
    blizzard: 0.4,
  },
  lightning: {
    storm:   2.0,
    rain:    1.5,
    clear:   0.8,
  },
  ice_shard: {
    blizzard: 1.5,
    clear:    0.9,
  },
  // Non-damaging or weather-neutral spells — empty tables (always return 1.0)
  heal:         {},
  wind_blast:   {},
  stone_shield: {},
}

// ── Helper: get current weather condition name ─────────────────────────────────

function getPlayerWeatherCondition(): string {
  const weather = useWeatherStore.getState().getPlayerWeather()
  if (!weather) return 'clear'
  return weather.state.toLowerCase()
}

// ── getWeatherSpellMultiplier ──────────────────────────────────────────────────

/**
 * Returns the damage multiplier for a spell given the current weather condition.
 * Returns 1.0 if no specific modifier is defined for this weather/spell pair.
 */
export function getWeatherSpellMultiplier(spellId: SpellId): number {
  const condition = getPlayerWeatherCondition()
  const modifiers = SPELL_WEATHER_MODIFIERS[spellId]
  if (!modifiers) return 1.0
  return modifiers[condition] ?? 1.0
}

// ── onSpellCastWeatherEffect ───────────────────────────────────────────────────

/**
 * Applies optional weather side-effects when a spell is cast.
 * - Fireball during blizzard: notifies that fire melts the blizzard.
 * - Lightning during non-storm: 10% chance to trigger a storm.
 */
export function onSpellCastWeatherEffect(spellId: SpellId): void {
  const condition = getPlayerWeatherCondition()
  const { addNotification } = useUiStore.getState()
  const weatherStore = useWeatherStore.getState()

  if (spellId === 'fireball' && condition === 'blizzard') {
    addNotification('Fire melts the blizzard!', 'info')
  }

  if (spellId === 'lightning' && condition !== 'storm') {
    if (Math.random() < 0.1) {
      // Force the player's current sector into STORM
      const playerSectorId = weatherStore.playerSectorId
      const playerWeather = weatherStore.getPlayerWeather()
      if (playerWeather) {
        weatherStore.updateSector({
          ...playerWeather,
          state: 'STORM',
        })
        addNotification('The lightning strike triggers a storm!', 'warning')
      }
    }
  }
}
