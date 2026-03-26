// ── WeatherForecastSystem.ts ────────────────────────────────────────────────
// M50 Track B: Weather prediction system.
// Accuracy improves with Science/Meteorology unlock.

import type { WeatherState } from '../store/weatherStore'

export type ForecastAccuracy = 'vague' | 'approximate' | 'accurate'

export interface WeatherForecast {
  hoursAhead: number       // 1, 2, 4, 8, 12
  predictedWeather: string // WeatherState string
  confidence: number       // 0-1, shown as fuzzy vs precise
  actualHour: number       // game hour when this forecast applies
}

export interface ForecastSystem {
  forecasts: WeatherForecast[]
  accuracy: ForecastAccuracy
  lastUpdated: number      // simSeconds when last refreshed
}

// All valid weather states — neighbours used for vague/approximate errors
const WEATHER_STATES: WeatherState[] = [
  'CLEAR', 'CLOUDY', 'RAIN', 'STORM', 'BLIZZARD',
  'TORNADO_WARNING', 'VOLCANIC_ASH', 'ACID_RAIN',
]

const FORECAST_HOURS = [1, 2, 4, 8, 12]

// Module-level state
export let forecastState: ForecastSystem = {
  forecasts: [],
  accuracy: 'vague',
  lastUpdated: 0,
}

export function setForecastAccuracy(accuracy: ForecastAccuracy): void {
  forecastState = { ...forecastState, accuracy }
}

/**
 * Returns a random neighbour weather state (±1 in the array, wrapping).
 */
function randomNeighbour(weather: string): string {
  const idx = WEATHER_STATES.indexOf(weather as WeatherState)
  if (idx === -1) return WEATHER_STATES[0]
  const offsets = [-1, 1]
  const offset = offsets[Math.floor(Math.random() * offsets.length)]
  const newIdx = (idx + offset + WEATHER_STATES.length) % WEATHER_STATES.length
  return WEATHER_STATES[newIdx]
}

export function generateForecasts(
  currentHour: number,
  currentWeather: string,
  weatherSequence: string[],  // next N weather states from WeatherSystem
): void {
  const { accuracy } = forecastState

  // Accuracy → correct-prediction probability
  const correctChance =
    accuracy === 'vague'       ? 0.40 :
    accuracy === 'approximate' ? 0.70 :
    /* accurate */               0.95

  const forecasts: WeatherForecast[] = FORECAST_HOURS.map((hoursAhead, i) => {
    const actualHour = currentHour + hoursAhead

    // Use the provided weather sequence if available, else fall back to current
    const trueWeather = weatherSequence[i] ?? currentWeather

    // Apply prediction error based on accuracy
    const hit = Math.random() < correctChance
    const predictedWeather = hit ? trueWeather : randomNeighbour(trueWeather)

    // Confidence degrades with time and accuracy level
    const timeDecay = 1 - (hoursAhead / 14)  // 12h → ~0.14 decay
    const baseConfidence =
      accuracy === 'vague'       ? 0.35 :
      accuracy === 'approximate' ? 0.65 :
      /* accurate */               0.90
    const confidence = Math.max(0.05, baseConfidence * timeDecay)

    return { hoursAhead, predictedWeather, confidence, actualHour }
  })

  forecastState = { ...forecastState, forecasts }
}

export function getForecasts(): WeatherForecast[] {
  return forecastState.forecasts
}

/**
 * Call from GameLoop every ~60 game-seconds to refresh forecast.
 * Generates new forecasts based on current weather, using a simple Markov
 * sequence (each step has a small chance to transition to a random state).
 */
export function updateForecasts(simSeconds: number, currentWeather: string): void {
  // Build a simple projected weather sequence for the next 5 steps
  const weatherSequence: string[] = []
  let w = currentWeather
  for (let i = 0; i < FORECAST_HOURS.length; i++) {
    // 15% chance to transition each step
    if (Math.random() < 0.15) {
      w = WEATHER_STATES[Math.floor(Math.random() * WEATHER_STATES.length)]
    }
    weatherSequence.push(w)
  }

  // Game hour: one in-game day = 1200 simSeconds, 24 hours per day
  const currentHour = Math.floor((simSeconds % 1200) / (1200 / 24))

  generateForecasts(currentHour, currentWeather, weatherSequence)
  forecastState = { ...forecastState, lastUpdated: simSeconds }
}
