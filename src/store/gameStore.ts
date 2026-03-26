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
  setSimSeconds: (n: number) => void

  // Blocks WASD/mouse game input while a UI panel is open
  inputBlocked: boolean
  setInputBlocked: (b: boolean) => void

  // Admin spectate: set to move camera to a world position
  spectateTarget: { x: number; y: number; z: number } | null
  setSpectateTarget: (pos: { x: number; y: number; z: number } | null) => void

  // HUD prompt shown when player is near a gatherable resource
  gatherPrompt: string | null
  setGatherPrompt: (s: string | null) => void

  // Building placement mode — typeId of building being placed, or null
  placementMode: string | null
  setPlacementMode: (typeId: string | null) => void

  // Incremented when a building is placed (triggers re-render of placed buildings)
  buildVersion: number
  bumpBuildVersion: () => void

  // M22: Day/night cycle state (set by DayNightCycle.tsx for HUD widget)
  dayAngle: number
  dayCount: number
  setDayAngle: (a: number) => void
  setDayCount: (c: number) => void

  // M32 Track A: XP multiplier — 1.0 normally, 2.0 during seasonal festival
  xpMultiplier: number
  setXpMultiplier: (v: number) => void

  // Admin/dev controls
  flyMode: boolean
  setFlyMode: (v: boolean) => void
  adminSpeedMult: number
  setAdminSpeedMult: (v: number) => void

  // M69 Track B: Graphics quality settings
  graphicsQuality: 'low' | 'medium' | 'high' | 'ultra'
  setGraphicsQuality: (q: 'low' | 'medium' | 'high' | 'ultra') => void
  showFps: boolean
  setShowFps: (v: boolean) => void
  renderScale: number
  setRenderScale: (v: number) => void
  shadowsEnabled: boolean
  setShadowsEnabled: (v: boolean) => void
  bloomEnabled: boolean
  setBloomEnabled: (v: boolean) => void
  vignetteEnabled: boolean
  setVignetteEnabled: (v: boolean) => void
}

export const useGameStore = create<GameState>((set) => ({
  engineReady: false,
  setEngineReady: (r) => set({ engineReady: r }),

  paused: false,
  togglePause: () => set((s) => ({ paused: !s.paused })),

  timeScale: 1,   // server overrides this on first WORLD_SNAPSHOT
  setTimeScale: (ts) => set({ timeScale: ts }),

  epoch: 'planck',
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
  setSimSeconds: (n) =>
    set({
      simSeconds: n,
      simTime: formatSimTime(n),
      epoch: epochFromSeconds(n),
    }),

  inputBlocked: false,
  setInputBlocked: (b) => set({ inputBlocked: b }),

  spectateTarget: null,
  setSpectateTarget: (pos) => set({ spectateTarget: pos }),

  gatherPrompt: null,
  setGatherPrompt: (s) => set({ gatherPrompt: s }),

  placementMode: null,
  setPlacementMode: (typeId) => set({ placementMode: typeId }),

  buildVersion: 0,
  bumpBuildVersion: () => set((s) => ({ buildVersion: s.buildVersion + 1 })),

  dayAngle: Math.PI * 0.6,
  dayCount: 1,
  setDayAngle: (a) => set({ dayAngle: a }),
  setDayCount: (c) => set({ dayCount: c }),

  xpMultiplier: 1.0,
  setXpMultiplier: (v) => set({ xpMultiplier: v }),

  flyMode: false,
  setFlyMode: (v) => set({ flyMode: v }),
  adminSpeedMult: 1,
  setAdminSpeedMult: (v) => set({ adminSpeedMult: v }),

  // M69 Track B: Graphics quality settings — defaults to high
  graphicsQuality: 'high',
  setGraphicsQuality: (q) => {
    const presets: Record<string, { renderScale: number; shadowsEnabled: boolean; bloomEnabled: boolean; vignetteEnabled: boolean }> = {
      low:    { renderScale: 0.5,  shadowsEnabled: false, bloomEnabled: false, vignetteEnabled: false },
      medium: { renderScale: 0.75, shadowsEnabled: true,  bloomEnabled: false, vignetteEnabled: true },
      high:   { renderScale: 1.0,  shadowsEnabled: true,  bloomEnabled: true,  vignetteEnabled: true },
      ultra:  { renderScale: 1.5,  shadowsEnabled: true,  bloomEnabled: true,  vignetteEnabled: true },
    }
    set({ graphicsQuality: q, ...presets[q] })
  },
  showFps: false,
  setShowFps: (v) => set({ showFps: v }),
  renderScale: 1.0,
  setRenderScale: (v) => set({ renderScale: v }),
  shadowsEnabled: true,
  setShadowsEnabled: (v) => set({ shadowsEnabled: v }),
  bloomEnabled: true,
  setBloomEnabled: (v) => set({ bloomEnabled: v }),
  vignetteEnabled: true,
  setVignetteEnabled: (v) => set({ vignetteEnabled: v }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

// Absolute sim-seconds at which bootstrap completes (9.3 Gyr since Big Bang = Earth formation).
// Server counts from this origin at 1× real-time after bootstrap.
// Client subtracts this so the HUD shows "0" the moment Earth forms.
const EARTH_EPOCH_SECS = 9.3e9 * 31_557_600  // ≈ 2.935e17 s

/** Format simulation seconds into a human-readable string */
function formatSimTime(secs: number): string {
  // ── Post-bootstrap: show time since Earth formed ─────────────────────────
  if (secs >= EARTH_EPOCH_SECS) {
    const t = secs - EARTH_EPOCH_SECS
    if (t < 60)         return `${t.toFixed(1)} s`
    if (t < 3600)       return `${(t / 60).toFixed(1)} min`
    if (t < 86400)      return `${(t / 3600).toFixed(1)} hr`
    if (t < 31_557_600) return `Day ${Math.floor(t / 86400) + 1}`
    const years = t / 31_557_600
    if (years < 1000)   return `Yr ${years.toFixed(1)}`
    if (years < 1e6)    return `${(years / 1000).toFixed(2)} kyr`
    if (years < 1e9)    return `${(years / 1e6).toFixed(2)} Myr`
    return `${(years / 1e9).toFixed(3)} Gyr`
  }
  // ── Bootstrap phase: show cosmological time ──────────────────────────────
  if (secs < 60)          return `${secs.toFixed(1)} s`
  if (secs < 3600)        return `${(secs / 60).toFixed(1)} min`
  if (secs < 86400)       return `${(secs / 3600).toFixed(1)} hr`
  if (secs < 31_557_600)  return `${(secs / 86400).toFixed(1)} days`
  const years = secs / 31_557_600
  if (years < 1000)       return `${years.toFixed(1)} yr`
  if (years < 1e6)        return `${(years / 1000).toFixed(2)} kyr`
  if (years < 1e9)        return `${(years / 1e6).toFixed(2)} Myr`
  return `${(years / 1e9).toFixed(3)} Gyr`
}

/**
 * Map sim time to an epoch label.
 * - Before bootstrap (secs < EARTH_EPOCH_SECS): Big Bang cosmological epoch.
 * - After bootstrap (secs >= EARTH_EPOCH_SECS): Earth geological eon.
 */
function epochFromSeconds(secs: number): string {
  // ── Post-bootstrap: Earth geological eons ────────────────────────────────
  if (secs >= EARTH_EPOCH_SECS) {
    const earthYears = (secs - EARTH_EPOCH_SECS) / 31_557_600
    if (earthYears < 600e6)  return 'hadean'        //   0 – 600 Myr: molten, heavy bombardment
    if (earthYears < 2500e6) return 'archaean'      // 600 Myr – 2.5 Gyr: first life, prokaryotes
    if (earthYears < 4000e6) return 'proterozoic'   // 2.5 Gyr – 4 Gyr: eukaryotes, oxygen
    return 'contemporary'                            // 4 Gyr+: complex life, present day
  }
  // ── Bootstrap phase: Big Bang cosmology ─────────────────────────────────
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
