import { create } from 'zustand'

interface GameState {
  engineReady: boolean
  setEngineReady: (r: boolean) => void

  paused: boolean
  togglePause: () => void

  timeScale: number
  setTimeScale: (s: number) => void

  epoch: string
  setEpoch: (e: string) => void

  simTime: string
  setSimTime: (t: string) => void

  // Cumulative raw sim seconds (for internal use)
  simSeconds: number
  addSimSeconds: (dt: number) => void
}

export const useGameStore = create<GameState>((set) => ({
  engineReady: false,
  setEngineReady: (r) => set({ engineReady: r }),

  paused: false,
  togglePause: () => set((s) => ({ paused: !s.paused })),

  timeScale: 1,
  setTimeScale: (ts) => set({ timeScale: ts }),

  epoch: 'stellar',
  setEpoch: (e) => set({ epoch: e }),

  simTime: '0 s',
  setSimTime: (t) => set({ simTime: t }),

  simSeconds: 0,
  addSimSeconds: (dt) =>
    set((s) => {
      const next = s.simSeconds + dt
      return {
        simSeconds: next,
        simTime: formatSimTime(next),
        epoch: epochFromSeconds(next),
      }
    }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format simulation seconds into a human-readable string */
function formatSimTime(secs: number): string {
  if (secs < 60)          return `${secs.toFixed(1)} s`
  if (secs < 3600)        return `${(secs / 60).toFixed(1)} min`
  if (secs < 86400)       return `${(secs / 3600).toFixed(1)} hr`
  if (secs < 31_557_600)  return `${(secs / 86400).toFixed(1)} days`
  const years = secs / 31_557_600
  if (years < 1000)       return `${years.toFixed(1)} yr`
  if (years < 1e6)        return `${(years / 1000).toFixed(2)} kyr`
  if (years < 1e9)        return `${(years / 1e6).toFixed(2)} Myr`
  return `${(years / 1e9).toFixed(2)} Gyr`
}

/**
 * Map sim time to a cosmological epoch name.
 * Based on real Big Bang cosmology timeline.
 */
function epochFromSeconds(secs: number): string {
  const years = secs / 31_557_600
  if (years < 1e-10)    return 'planck'
  if (years < 1e-6)     return 'grand_unification'
  if (years < 1e-4)     return 'electroweak'
  if (years < 1e-2)     return 'quark_epoch'
  if (years < 1)        return 'nucleosynthesis'
  if (years < 380_000)  return 'photon_epoch'
  if (years < 1e8)      return 'dark_ages'
  if (years < 1e9)      return 'reionization'
  if (years < 4e9)      return 'stellar'
  if (years < 10e9)     return 'galactic'
  if (years < 14e9)     return 'contemporary'
  if (years < 1e14)     return 'stellar_late'
  if (years < 1e40)     return 'degenerate'
  return 'dark_era'
}
