// ── weatherStore.ts ────────────────────────────────────────────────────────────
// M8 Track 1: Client-side weather state.
// Populated from WEATHER_UPDATE server messages (via WorldSocket).
// Consumed by WeatherRenderer and HUD.

import { create } from 'zustand'

export type WeatherState = 'CLEAR' | 'CLOUDY' | 'RAIN' | 'STORM'

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
}))
