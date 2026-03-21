import { create } from 'zustand'

// ── Wound system (Slice 5) ────────────────────────────────────────────────────
export interface Wound {
  id: number
  /** 0–1: damage severity at time of wounding (affects bacteria seed) */
  severity: number
  /** bacterial count (0 = clean, 100 = septic) */
  bacteriaCount: number
  createdAt: number  // Date.now() ms
}

interface PlayerState {
  entityId: number | null
  setEntityId: (id: number) => void

  evolutionPoints: number
  addEvolutionPoints: (ep: number) => void

  // Vitals (0-1 normalised)
  hunger: number
  thirst: number
  health: number
  energy: number
  fatigue: number
  ambientTemp: number
  updateVitals: (v: Partial<Pick<PlayerState, 'hunger' | 'thirst' | 'health' | 'energy' | 'fatigue'>>) => void
  setAmbientTemp: (t: number) => void

  // Wound system (Slice 5)
  wounds: Wound[]
  addWound: (severity: number) => void
  tickWounds: (dtSeconds: number) => void
  treatWound: (id: number, bacteriaReduction: number) => void
  clearHealedWounds: () => void

  // Discoveries made
  discoveries: string[]
  addDiscovery: (id: string) => void
  hasDiscovery: (id: string) => boolean

  // Current high-level goal (for HUD display)
  currentGoal: string
  setCurrentGoal: (g: string) => void

  // Position cache (updated from ECS each frame)
  x: number; y: number; z: number
  setPosition: (x: number, y: number, z: number) => void

  // Civilization tier the player belongs to
  civTier: number
  setCivTier: (t: number) => void

  // Currently equipped item slot (0–39 into inventory.slots, or null)
  equippedSlot: number | null
  equip: (slotIndex: number) => void
  unequip: () => void

  // Sleep system (Slice 6)
  isSleeping: boolean
  sleepStartTime: number | null
  bedrollPlaced: boolean
  startSleep: () => void
  stopSleep: () => void
  setBedrollPlaced: (v: boolean) => void

  // Death + Respawn system (M5)
  isDead: boolean
  deathCause: 'starvation' | 'infection' | 'combat' | 'drowning' | null
  deathPos: { x: number; y: number; z: number } | null
  bedrollPos: { x: number; y: number; z: number } | null
  murderCount: number
  triggerDeath: (cause: 'starvation' | 'infection' | 'combat' | 'drowning', pos: { x: number; y: number; z: number }) => void
  clearDeath: () => void
  setBedrollPos: (pos: { x: number; y: number; z: number } | null) => void
  incrementMurderCount: () => void
  setMurderCount: (n: number) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  entityId: null,
  setEntityId: (id) => set({ entityId: id }),

  evolutionPoints: 0,
  addEvolutionPoints: (ep) => set((s) => ({ evolutionPoints: Math.max(0, s.evolutionPoints + ep) })),

  hunger: 0,
  thirst: 0,
  health: 1,
  energy: 1,
  fatigue: 0,
  ambientTemp: 15,
  updateVitals: (v) => set((s) => ({
    hunger: v.hunger  !== undefined ? Math.max(0, Math.min(1, v.hunger))  : s.hunger,
    thirst: v.thirst  !== undefined ? Math.max(0, Math.min(1, v.thirst))  : s.thirst,
    health: v.health  !== undefined ? Math.max(0, Math.min(1, v.health))  : s.health,
    energy: v.energy  !== undefined ? Math.max(0, Math.min(1, v.energy))  : s.energy,
    fatigue: v.fatigue !== undefined ? Math.max(0, Math.min(1, v.fatigue)) : s.fatigue,
  })),
  setAmbientTemp: (t) => set({ ambientTemp: t }),

  discoveries: [],
  addDiscovery: (id) => set((s) => {
    if (s.discoveries.includes(id)) return s
    return { discoveries: [...s.discoveries, id] }
  }),
  hasDiscovery: (id) => get().discoveries.includes(id),

  currentGoal: 'survive',
  setCurrentGoal: (g) => set({ currentGoal: g }),

  x: 0, y: 0, z: 0,
  setPosition: (x, y, z) => set({ x, y, z }),

  civTier: 0,
  setCivTier: (t) => set({ civTier: t }),

  equippedSlot: null,
  equip: (slotIndex) => set({ equippedSlot: slotIndex }),
  unequip: () => set({ equippedSlot: null }),

  // ── Wound system ──────────────────────────────────────────────────────────
  wounds: [],
  addWound: (severity) => set((s) => {
    const wound: Wound = {
      id: Date.now(),
      severity: Math.max(0, Math.min(1, severity)),
      // Seed bacteria proportional to severity: mild wound = low infection risk
      bacteriaCount: severity * 20 + Math.random() * 10,
      createdAt: Date.now(),
    }
    return { wounds: [...s.wounds, wound] }
  }),
  tickWounds: (dtSeconds) => set((s) => {
    if (s.wounds.length === 0) return s
    // Logistic bacterial growth: dN/dt = r*N*(1 - N/K)
    // r = 0.02/s (slow), K = 100 (max). Temperature-dependent (ambient temp
    // speeds growth above 30°C). Without treatment a wound goes septic in ~2 min.
    const ambientT = s.ambientTemp
    const tempFactor = ambientT > 30 ? 1.5 : ambientT < 10 ? 0.5 : 1.0
    const r = 0.015 * tempFactor
    const K = 100
    const updated = s.wounds.map(w => {
      const N = w.bacteriaCount
      const dN = r * N * (1 - N / K) * dtSeconds
      return { ...w, bacteriaCount: Math.max(0, Math.min(K, N + dN)) }
    })
    return { wounds: updated }
  }),
  treatWound: (id, bacteriaReduction) => set((s) => ({
    wounds: s.wounds.map(w =>
      w.id === id ? { ...w, bacteriaCount: Math.max(0, w.bacteriaCount - bacteriaReduction) } : w
    ),
  })),
  clearHealedWounds: () => set((s) => ({
    wounds: s.wounds.filter(w => w.bacteriaCount > 0.5),
  })),

  // ── Sleep system ──────────────────────────────────────────────────────────
  isSleeping: false,
  sleepStartTime: null,
  bedrollPlaced: false,
  startSleep: () => set({ isSleeping: true, sleepStartTime: Date.now() }),
  stopSleep: () => set({ isSleeping: false, sleepStartTime: null }),
  setBedrollPlaced: (v) => set({ bedrollPlaced: v }),

  // ── Death + Respawn system (M5) ───────────────────────────────────────────
  isDead: false,
  deathCause: null,
  deathPos: null,
  bedrollPos: null,
  murderCount: 0,
  triggerDeath: (cause, pos) => set({ isDead: true, deathCause: cause, deathPos: pos }),
  clearDeath: () => set({ isDead: false, deathCause: null }),
  setBedrollPos: (pos) => set({ bedrollPos: pos }),
  incrementMurderCount: () => set((s) => ({ murderCount: s.murderCount + 1 })),
  setMurderCount: (n) => set({ murderCount: Math.max(0, n) }),
}))
