// ── playerStatsStore.ts ────────────────────────────────────────────────────────
// M37 Track C: Tracks lifetime player statistics used for title requirements,
// the progression panel, and leaderboard data.

import { create } from 'zustand'

export interface PlayerStats {
  killCount: number
  resourcesGathered: number
  itemsCrafted: number
  distanceTraveled: number
  totalGoldEarned: number
  potionsBrewed: number
  animalsTamed: number
  settlementsDiscovered: number
  bossesKilled: number
  goldenFishCaught: number
}

interface PlayerStatsState {
  stats: PlayerStats
  incrementStat: (key: keyof PlayerStats, amount?: number) => void
  resetStats: () => void
  serialize: () => PlayerStats
  deserialize: (data: unknown) => void
}

const DEFAULT_STATS: PlayerStats = {
  killCount: 0,
  resourcesGathered: 0,
  itemsCrafted: 0,
  distanceTraveled: 0,
  totalGoldEarned: 0,
  potionsBrewed: 0,
  animalsTamed: 0,
  settlementsDiscovered: 0,
  bossesKilled: 0,
  goldenFishCaught: 0,
}

export const usePlayerStatsStore = create<PlayerStatsState>((set, get) => ({
  stats: { ...DEFAULT_STATS },

  incrementStat: (key, amount = 1) =>
    set((s) => ({
      stats: {
        ...s.stats,
        [key]: s.stats[key] + amount,
      },
    })),

  resetStats: () => set({ stats: { ...DEFAULT_STATS } }),

  serialize: () => ({ ...get().stats }),

  deserialize: (data) => {
    if (!data || typeof data !== 'object') return
    const d = data as Partial<PlayerStats>
    set((s) => ({
      stats: {
        killCount:              typeof d.killCount === 'number'              ? d.killCount              : s.stats.killCount,
        resourcesGathered:      typeof d.resourcesGathered === 'number'      ? d.resourcesGathered      : s.stats.resourcesGathered,
        itemsCrafted:           typeof d.itemsCrafted === 'number'           ? d.itemsCrafted           : s.stats.itemsCrafted,
        distanceTraveled:       typeof d.distanceTraveled === 'number'       ? d.distanceTraveled       : s.stats.distanceTraveled,
        totalGoldEarned:        typeof d.totalGoldEarned === 'number'        ? d.totalGoldEarned        : s.stats.totalGoldEarned,
        potionsBrewed:          typeof d.potionsBrewed === 'number'          ? d.potionsBrewed          : s.stats.potionsBrewed,
        animalsTamed:           typeof d.animalsTamed === 'number'           ? d.animalsTamed           : s.stats.animalsTamed,
        settlementsDiscovered:  typeof d.settlementsDiscovered === 'number'  ? d.settlementsDiscovered  : s.stats.settlementsDiscovered,
        bossesKilled:           typeof d.bossesKilled === 'number'           ? d.bossesKilled           : s.stats.bossesKilled,
        goldenFishCaught:       typeof d.goldenFishCaught === 'number'       ? d.goldenFishCaught       : s.stats.goldenFishCaught,
      },
    }))
  },
}))
