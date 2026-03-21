// ── seasonStore.ts ──────────────────────────────────────────────────────────────
// M10 Track A: Client-side season state.
// Populated from SEASON_CHANGED server messages (via WorldSocket).
// Consumed by SeasonalTerrainPass, GameLoop (metabolic rate), and HUD.

import { create } from 'zustand'

export type SeasonName = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER'

export interface SeasonState {
  season: SeasonName
  seasonIndex: number       // 0-3
  progress: number          // 0→1 within current season
  tempModifier: number      // additive °C modifier
  rainfallProb: number      // 0-1
  isSnow: boolean
  metabolicMult: number     // hunger rate multiplier
}

interface SeasonStoreState extends SeasonState {
  setSeason: (s: SeasonState) => void
}

export const useSeasonStore = create<SeasonStoreState>((set) => ({
  season: 'SPRING',
  seasonIndex: 0,
  progress: 0,
  tempModifier: 0,
  rainfallProb: 0.6,
  isSnow: false,
  metabolicMult: 1.0,
  setSeason: (s) => set({ ...s }),
}))
