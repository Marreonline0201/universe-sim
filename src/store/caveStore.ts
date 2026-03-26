// ── caveStore.ts ─────────────────────────────────────────────────────────────
// M29 Track A: Underground cave system — tracks whether the player is underground.

import { create } from 'zustand'

interface CaveStoreState {
  underground: boolean
  setUnderground: (v: boolean) => void
}

export const useCaveStore = create<CaveStoreState>((set) => ({
  underground: false,
  setUnderground: (v) => set({ underground: v }),
}))
