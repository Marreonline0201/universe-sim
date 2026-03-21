// ── SeasonSystem ────────────────────────────────────────────────────────────────
// M10 Track A: Seasonal cycle — SPRING / SUMMER / AUTUMN / WINTER
//
// One full year = 40 minutes real time (10 minutes per season).
// Progress within current season: 0.0 → 1.0 continuously.
// Broadcasts SEASON_CHANGED every 30 real seconds.
// Survival impacts are communicated via payload so client can apply them.

export const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']

const SEASON_DURATION_MS = 10 * 60 * 1000   // 10 minutes per season
const BROADCAST_INTERVAL_MS = 30_000         // broadcast every 30 s

// Temperature modifier per season (additive on top of biome base)
export const SEASON_TEMP_MODIFIER = {
  SPRING: 0,
  SUMMER: 10,
  AUTUMN: 0,
  WINTER: -15,
}

// Rainfall probability per season (0-1, checked at each weather transition)
export const SEASON_RAINFALL_PROB = {
  SPRING: 0.60,
  SUMMER: 0.30,
  AUTUMN: 0.40,
  WINTER: 0.50,  // snow, not rain
}

// Does this season produce snow instead of rain?
export const SEASON_IS_SNOW = {
  SPRING: false,
  SUMMER: false,
  AUTUMN: false,
  WINTER: true,
}

// Winter metabolic rate multiplier (player needs more food)
export const SEASON_METABOLIC_MULT = {
  SPRING: 1.0,
  SUMMER: 1.0,
  AUTUMN: 1.0,
  WINTER: 1.2,  // +20%
}

export class SeasonSystem {
  constructor() {
    // Start from a fixed epoch so all server boots are in sync
    this._epochMs = Date.now()
    this._onBroadcast = null
    this._lastBroadcastMs = 0
    this._intervalId = null
  }

  /** Register a broadcast callback: (msg) => void */
  onBroadcast(cb) {
    this._onBroadcast = cb
  }

  /** Start the 30-second broadcast ticker. */
  start() {
    this._intervalId = setInterval(() => this._tick(), BROADCAST_INTERVAL_MS)
    // Broadcast immediately on start so joining clients get current season
    this._tick()
  }

  stop() {
    if (this._intervalId) clearInterval(this._intervalId)
  }

  /** Returns current season snapshot for WORLD_SNAPSHOT join payload. */
  getSnapshot() {
    return this._computeSnapshot()
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _computeSnapshot() {
    const elapsed = Date.now() - this._epochMs
    const yearDuration = SEASON_DURATION_MS * 4
    const posInYear = elapsed % yearDuration
    const seasonIndex = Math.floor(posInYear / SEASON_DURATION_MS)
    const progress = (posInYear % SEASON_DURATION_MS) / SEASON_DURATION_MS
    const season = SEASONS[seasonIndex]

    return {
      season,
      seasonIndex,
      progress,                                  // 0 → 1 within current season
      tempModifier:   SEASON_TEMP_MODIFIER[season],
      rainfallProb:   SEASON_RAINFALL_PROB[season],
      isSnow:         SEASON_IS_SNOW[season],
      metabolicMult:  SEASON_METABOLIC_MULT[season],
    }
  }

  _tick() {
    if (!this._onBroadcast) return
    const snap = this._computeSnapshot()
    this._onBroadcast({
      type: 'SEASON_CHANGED',
      ...snap,
    })
    this._lastBroadcastMs = Date.now()
  }
}
