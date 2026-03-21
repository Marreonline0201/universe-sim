// ── WeatherSystem.js ───────────────────────────────────────────────────────────
// M8 Track 1: Emergent weather simulation.
//
// The planet is divided into 8 latitude/longitude sectors. Each sector tracks
// temperature, humidity, pressure, wind direction, and wind speed.
// Every TRANSITION_INTERVAL_MS real milliseconds, a Markov-chain transition fires
// per sector with biome-weighted probabilities.
//
// State machine: CLEAR → CLOUDY → RAIN → STORM → CLEAR
// Biome modifiers applied per sector:
//   - Polar sectors (0, 7): low temp, low rain probability, high snow probability
//   - Desert sectors (3, 4): high temp, very low rain probability
//   - Tropical sectors (1, 6): moderate temp, high rain probability
//   - Temperate sectors (2, 5): balanced probabilities
//
// Broadcasts WEATHER_UPDATE to all clients on every transition.
// Posts Slack when STORM begins in any sector.

export const WEATHER_STATES = ['CLEAR', 'CLOUDY', 'RAIN', 'STORM']

// Real-minutes between weather transitions (configurable via env var)
const TRANSITION_INTERVAL_MS =
  parseInt(process.env.WEATHER_TRANSITION_MS ?? '') || 5 * 60 * 1000

// 8 sectors arranged conceptually as lat/lon grid (2 lat bands × 4 lon bands)
// Sector 0: polar-north, 1: temperate-north-west, 2: temperate-north-east,
// 3: desert-west, 4: desert-east, 5: temperate-south-west, 6: tropical-south,
// 7: polar-south
const SECTOR_BIOMES = [
  'polar',      // 0
  'temperate',  // 1
  'temperate',  // 2
  'desert',     // 3
  'desert',     // 4
  'temperate',  // 5
  'tropical',   // 6
  'polar',      // 7
]

// Base temperature (°C) by biome — used as sector baseline before modifier
const BIOME_BASE_TEMP = {
  polar:     -15,
  temperate:  12,
  desert:     38,
  tropical:   28,
}

// Markov transition matrices [from][to] = probability weight
// Rows: CLEAR, CLOUDY, RAIN, STORM  (must sum to 1.0 per row)
const TRANSITION_TABLES = {
  polar: [
    // CLEAR → {CLEAR, CLOUDY, RAIN, STORM}
    [0.55, 0.35, 0.08, 0.02],
    // CLOUDY → ...
    [0.30, 0.40, 0.22, 0.08],
    // RAIN →
    [0.10, 0.30, 0.40, 0.20],
    // STORM →
    [0.20, 0.35, 0.30, 0.15],
  ],
  temperate: [
    [0.50, 0.32, 0.14, 0.04],
    [0.25, 0.38, 0.28, 0.09],
    [0.08, 0.25, 0.45, 0.22],
    [0.15, 0.30, 0.35, 0.20],
  ],
  desert: [
    // Deserts rarely get rain or storms
    [0.75, 0.20, 0.04, 0.01],
    [0.55, 0.35, 0.09, 0.01],
    [0.40, 0.35, 0.20, 0.05],
    [0.50, 0.35, 0.12, 0.03],
  ],
  tropical: [
    [0.35, 0.30, 0.25, 0.10],
    [0.20, 0.28, 0.35, 0.17],
    [0.05, 0.18, 0.48, 0.29],
    [0.10, 0.22, 0.40, 0.28],
  ],
}

/**
 * Pick the next state from a probability row using a weighted random sample.
 * @param {number[]} row - probability weights for [CLEAR, CLOUDY, RAIN, STORM]
 * @returns {number} index into WEATHER_STATES
 */
function sampleMarkov(row) {
  const r = Math.random()
  let cum = 0
  for (let i = 0; i < row.length; i++) {
    cum += row[i]
    if (r < cum) return i
  }
  return row.length - 1
}

/** Linear interpolate between two values. */
function lerp(a, b, t) {
  return a + (b - a) * t
}

export class WeatherSystem {
  constructor() {
    /** @type {Array<SectorWeather>} */
    this.sectors = []
    this._broadcastFn = null   // set via onBroadcast()
    this._slackFn     = null   // set via onStorm()
    this._interval    = null
    this._init()
  }

  _init() {
    for (let i = 0; i < 8; i++) {
      const biome = SECTOR_BIOMES[i]
      const baseTemp = BIOME_BASE_TEMP[biome]
      this.sectors.push({
        sectorId:    i,
        biome,
        state:       'CLEAR',
        stateIndex:  0,
        temperature: baseTemp + (Math.random() * 10 - 5),  // ±5°C noise
        humidity:    biome === 'desert' ? 0.1 + Math.random() * 0.1
                   : biome === 'polar'  ? 0.4 + Math.random() * 0.2
                   : 0.5 + Math.random() * 0.3,
        pressure:    1000 + Math.random() * 20 - 10,  // hPa around 1010
        windDir:     Math.random() * 360,               // degrees
        windSpeed:   2 + Math.random() * 8,             // m/s
      })
    }
  }

  /** Register the broadcast function (called with a message object). */
  onBroadcast(fn) {
    this._broadcastFn = fn
  }

  /** Register the Slack notify function (called with a text string). */
  onStorm(fn) {
    this._slackFn = fn
  }

  /** Start the periodic transition timer. */
  start() {
    this._interval = setInterval(() => this._tick(), TRANSITION_INTERVAL_MS)
    console.log(`[WeatherSystem] Started — ${TRANSITION_INTERVAL_MS / 60000} min transitions, 8 sectors`)
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  /**
   * Returns weather for the sector that contains world position (x, z).
   * Sector mapping: split longitude into 4 bands and latitude into 2 bands.
   * The planet origin is (0,0,0); player positions are on the sphere surface
   * near the north-pole spawn at approximately (0, PLANET_RADIUS, 0).
   * We use azimuth (atan2 x, z) for lon-band and y sign for lat-band.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {SectorWeather}
   */
  getSectorForPosition(x, y, z) {
    // Normalise to unit sphere
    const len = Math.sqrt(x * x + y * y + z * z) || 1
    const nx = x / len, ny = y / len, nz = z / len

    // Latitude band: polar if |ny| > 0.7, else equatorial
    const isPolar = Math.abs(ny) > 0.7

    if (isPolar) {
      // Polar north = sector 0, polar south = sector 7
      return this.sectors[ny > 0 ? 0 : 7]
    }

    // Longitude band: 4 bands from azimuth angle split into quadrants
    const azimuth = Math.atan2(nx, nz)  // -π to π
    const normalised = (azimuth + Math.PI) / (2 * Math.PI)  // 0 to 1
    const band = Math.min(3, Math.floor(normalised * 4))

    // Two latitude bands: north (y > 0) = sectors 1-2, south = sectors 5-6
    // Non-polar: just map band directly
    // Band 0,1 → north; band 2,3 → south (rough split)
    if (ny >= 0) {
      return this.sectors[1 + (band % 2)]  // sectors 1, 2
    } else {
      return this.sectors[3 + (band % 2)]  // sectors 3, 4 or 5, 6
    }
  }

  /** Return a snapshot of all sectors (for WORLD_SNAPSHOT hydration). */
  getSnapshot() {
    return this.sectors.map(s => ({
      sectorId:    s.sectorId,
      state:       s.state,
      temperature: Math.round(s.temperature * 10) / 10,
      humidity:    Math.round(s.humidity * 100) / 100,
      windDir:     Math.round(s.windDir),
      windSpeed:   Math.round(s.windSpeed * 10) / 10,
    }))
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _tick() {
    for (const sector of this.sectors) {
      const prevState = sector.state
      const table = TRANSITION_TABLES[sector.biome]
      const nextStateIdx = sampleMarkov(table[sector.stateIndex])
      const nextState = WEATHER_STATES[nextStateIdx]

      sector.stateIndex = nextStateIdx
      sector.state = nextState

      // Evolve physical parameters toward state-appropriate values
      this._evolvePhysics(sector, nextStateIdx)

      // Broadcast transition to all clients
      const msg = {
        type:        'WEATHER_UPDATE',
        sectorId:    sector.sectorId,
        state:       sector.state,
        temperature: Math.round(sector.temperature * 10) / 10,
        humidity:    Math.round(sector.humidity * 100) / 100,
        windDir:     Math.round(sector.windDir),
        windSpeed:   Math.round(sector.windSpeed * 10) / 10,
      }

      if (this._broadcastFn) {
        this._broadcastFn(msg)
      }

      console.log(`[WeatherSystem] Sector ${sector.sectorId} (${sector.biome}): ${prevState} → ${nextState} | ${sector.temperature.toFixed(1)}°C | wind ${sector.windSpeed.toFixed(1)} m/s @ ${sector.windDir.toFixed(0)}°`)

      // Alert Slack when a storm forms
      if (nextState === 'STORM' && prevState !== 'STORM' && this._slackFn) {
        this._slackFn(`[WeatherSystem] Storm forming over Sector ${sector.sectorId} (${sector.biome} — ${sector.temperature.toFixed(0)}°C, wind ${sector.windSpeed.toFixed(1)} m/s)`)
      }
    }
  }

  _evolvePhysics(sector, stateIdx) {
    const biome = sector.biome
    const baseTemp = BIOME_BASE_TEMP[biome]

    switch (stateIdx) {
      case 0: { // CLEAR
        sector.temperature = lerp(sector.temperature, baseTemp + 5, 0.4)
        sector.humidity    = lerp(sector.humidity, biome === 'desert' ? 0.1 : 0.4, 0.3)
        sector.pressure    = lerp(sector.pressure, 1015, 0.3)
        sector.windSpeed   = lerp(sector.windSpeed, 3 + Math.random() * 5, 0.4)
        break
      }
      case 1: { // CLOUDY
        sector.temperature = lerp(sector.temperature, baseTemp, 0.3)
        sector.humidity    = lerp(sector.humidity, 0.65, 0.3)
        sector.pressure    = lerp(sector.pressure, 1005, 0.25)
        sector.windSpeed   = lerp(sector.windSpeed, 6 + Math.random() * 6, 0.3)
        break
      }
      case 2: { // RAIN
        sector.temperature = lerp(sector.temperature, baseTemp - 3, 0.4)
        sector.humidity    = lerp(sector.humidity, 0.85, 0.5)
        sector.pressure    = lerp(sector.pressure, 998, 0.35)
        sector.windSpeed   = lerp(sector.windSpeed, 8 + Math.random() * 8, 0.4)
        break
      }
      case 3: { // STORM
        sector.temperature = lerp(sector.temperature, baseTemp - 8, 0.5)
        sector.humidity    = lerp(sector.humidity, 0.95, 0.6)
        sector.pressure    = lerp(sector.pressure, 985, 0.5)
        sector.windSpeed   = lerp(sector.windSpeed, 18 + Math.random() * 12, 0.5)
        break
      }
    }

    // Wind direction slowly drifts each transition
    sector.windDir = (sector.windDir + (Math.random() * 40 - 20) + 360) % 360
  }
}

/**
 * @typedef {Object} SectorWeather
 * @property {number} sectorId
 * @property {string} biome
 * @property {string} state
 * @property {number} stateIndex
 * @property {number} temperature
 * @property {number} humidity
 * @property {number} pressure
 * @property {number} windDir
 * @property {number} windSpeed
 */
