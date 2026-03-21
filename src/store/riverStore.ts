// ── riverStore.ts ─────────────────────────────────────────────────────────────
// M9 Track 1: River proximity state consumed by HUD and GameLoop.

import { create } from 'zustand'

interface RiverStoreState {
  /** True when player is within 20m of a river (fresh water available) */
  nearRiver: boolean
  setNearRiver: (v: boolean) => void

  /** Current velocity vector pushing the player (world-space, m/s) */
  riverCurrentX: number
  riverCurrentY: number
  riverCurrentZ: number
  setRiverCurrent: (x: number, y: number, z: number) => void
  clearRiverCurrent: () => void

  /** True when player is standing inside the river channel (< width/2 from centreline) */
  inRiver: boolean
  setInRiver: (v: boolean) => void
}

export const useRiverStore = create<RiverStoreState>((set) => ({
  nearRiver: false,
  setNearRiver: (v) => set({ nearRiver: v }),

  riverCurrentX: 0,
  riverCurrentY: 0,
  riverCurrentZ: 0,
  setRiverCurrent: (x, y, z) => set({ riverCurrentX: x, riverCurrentY: y, riverCurrentZ: z }),
  clearRiverCurrent: () => set({ riverCurrentX: 0, riverCurrentY: 0, riverCurrentZ: 0 }),

  inRiver: false,
  setInRiver: (v) => set({ inRiver: v }),
}))
