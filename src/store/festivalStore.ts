// ── festivalStore.ts ──────────────────────────────────────────────────────────
// M41 Track C: Zustand store for festival state — React components read from here.
// The festivalSystem singleton is the source of truth; this store is synced each frame.

import { create } from 'zustand'
import { festivalSystem } from '../game/FestivalSystem'
import type { Festival } from '../game/FestivalSystem'

interface FestivalStoreState {
  activeFestival: Festival | null
  festivalDayCount: number
  /** Pull latest values from the FestivalSystem singleton. Called from GameLoop. */
  sync(): void
}

export const useFestivalStore = create<FestivalStoreState>((set) => ({
  activeFestival: null,
  festivalDayCount: 0,
  sync() {
    set({
      activeFestival: festivalSystem.activeFestival,
      festivalDayCount: festivalSystem.festivalDayCount,
    })
  },
}))
