// ── weatherStore.ts ────────────────────────────────────────────────────────────
// M8 Track 1: Client-side weather state.
// Populated from WEATHER_UPDATE server messages (via WorldSocket).
// Consumed by WeatherRenderer and HUD.

import { create } from 'zustand'

export type WeatherState = 'CLEAR' | 'CLOUDY' | 'RAIN' | 'STORM' | 'BLIZZARD' | 'TORNADO_WARNING' | 'VOLCANIC_ASH' | 'ACID_RAIN'

export interface SectorWeather {
  sectorId:    number
  state:       WeatherState
  temperature: number   // °C
  humidity:    number   // 0–1
  windDir:     number   // degrees (0 = north, clockwise)
  windSpeed:   number   // m/s
}

interface WeatherStoreState {
  /** All 8 sector weather states */
  sectors: SectorWeather[]
  setSectors: (sectors: SectorWeather[]) => void
  updateSector: (update: SectorWeather) => void

  /** The sector the local player is currently in (updated by GameLoop) */
  playerSectorId: number
  setPlayerSectorId: (id: number) => void

  /** Convenience accessor: returns the weather for the player's sector */
  getPlayerWeather: () => SectorWeather | null

  // Lightning flash state — toggled by WeatherRenderer ticker
  lightningActive: boolean
  setLightningActive: (v: boolean) => void

  // M23: Wetness factor (0-1) for terrain wet surface darkening
  // Ramps up during rain, ramps down after rain stops
  wetness: number
  setWetness: (v: number) => void

  // M35 Track B: Disaster states
  /** Active tornado position, null if no tornado */
  tornadoPos: { x: number; y: number; z: number } | null
  setTornadoPos: (pos: { x: number; y: number; z: number } | null) => void

  /** Whether an earthquake shake is active */
  earthquakeActive: boolean
  earthquakeIntensity: number  // 0–1
  setEarthquake: (active: boolean, intensity?: number) => void

  /** Whether volcanic ash cloud is active */
  volcanicAshActive: boolean
  setVolcanicAshActive: (v: boolean) => void

  // M39 Track A: Weather transition smoothing
  /** The weather state we are transitioning FROM (for lerping effects) */
  prevWeatherState: WeatherState
  /** The weather state we are transitioning TO */
  targetWeatherState: WeatherState
  /** Transition progress 0→1 (0 = fully prevState, 1 = fully targetState) */
  transitionProgress: number
  setWeatherTransition: (from: WeatherState, to: WeatherState) => void
  tickTransition: (delta: number) => void

  // M39 Track A: Rainbow state — appears after rain clears
  rainbowActive: boolean
  rainbowTimer: number   // countdown seconds (0 = gone, up to 60)
  setRainbowActive: (v: boolean) => void
  tickRainbow: (delta: number) => void

  // M42 Track B: Pollution level — drives ACID_RAIN transition when > 0.7
  pollutionLevel: number  // 0-1, increases when player smelts many metals or burns coal
  setPollutionLevel: (lvl: number) => void
}

const DEFAULT_SECTOR: SectorWeather = {
  sectorId:    0,
  state:       'CLEAR',
  temperature: 15,
  humidity:    0.5,
  windDir:     0,
  windSpeed:   3,
}

export const useWeatherStore = create<WeatherStoreState>((set, get) => ({
  sectors: Array.from({ length: 8 }, (_, i) => ({ ...DEFAULT_SECTOR, sectorId: i })),

  setSectors: (sectors) => set({ sectors }),

  updateSector: (update) =>
    set((s) => {
      const next = [...s.sectors]
      const idx = next.findIndex(sec => sec.sectorId === update.sectorId)
      if (idx >= 0) next[idx] = update
      else next.push(update)
      return { sectors: next }
    }),

  playerSectorId: 0,
  setPlayerSectorId: (id) => set({ playerSectorId: id }),

  getPlayerWeather: () => {
    const { sectors, playerSectorId } = get()
    return sectors.find(s => s.sectorId === playerSectorId) ?? sectors[0] ?? null
  },

  lightningActive: false,
  setLightningActive: (v) => set({ lightningActive: v }),

  wetness: 0,
  setWetness: (v) => set({ wetness: v }),

  // M35 Track B: Disaster states
  tornadoPos: null,
  setTornadoPos: (pos) => set({ tornadoPos: pos }),

  earthquakeActive: false,
  earthquakeIntensity: 0,
  setEarthquake: (active, intensity = 0) => set({ earthquakeActive: active, earthquakeIntensity: intensity }),

  volcanicAshActive: false,
  setVolcanicAshActive: (v) => set({ volcanicAshActive: v }),

  // M39 Track A: Weather transition smoothing
  prevWeatherState: 'CLEAR',
  targetWeatherState: 'CLEAR',
  transitionProgress: 1,

  setWeatherTransition: (from, to) => {
    const { targetWeatherState } = get()
    // Only start a new transition if target is actually changing
    if (to === targetWeatherState) return
    set({ prevWeatherState: from, targetWeatherState: to, transitionProgress: 0 })
  },

  tickTransition: (delta) => {
    const { transitionProgress } = get()
    if (transitionProgress >= 1) return
    // 30-second full transition
    const next = Math.min(1, transitionProgress + delta / 30)
    set({ transitionProgress: next })
  },

  // M39 Track A: Rainbow
  rainbowActive: false,
  rainbowTimer: 0,

  setRainbowActive: (v) => set({ rainbowActive: v, rainbowTimer: v ? 60 : 0 }),

  tickRainbow: (delta) => {
    const { rainbowTimer, rainbowActive } = get()
    if (!rainbowActive) return
    const next = Math.max(0, rainbowTimer - delta)
    set({ rainbowTimer: next, rainbowActive: next > 0 })
  },

  // M42 Track B: Pollution
  pollutionLevel: 0,
  setPollutionLevel: (lvl) => set({ pollutionLevel: Math.max(0, Math.min(1, lvl)) }),
}))
