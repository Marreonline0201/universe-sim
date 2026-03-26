import { create } from 'zustand'
import { usePlayerStatsStore } from './playerStatsStore'

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

  // Vitals (0-1 normalised)
  hunger: number
  thirst: number
  health: number
  energy: number
  fatigue: number
  ambientTemp: number
  updateVitals: (v: Partial<Pick<PlayerState, 'hunger' | 'thirst' | 'health' | 'energy' | 'fatigue'>>) => void
  setAmbientTemp: (t: number) => void

  // M29 Track B: Warmth stat (0–100)
  warmth: number
  addWarmth: (delta: number) => void

  // M27: Gold currency
  gold: number
  addGold: (amount: number) => void
  spendGold: (amount: number) => boolean

  // Wound system (Slice 5)
  wounds: Wound[]
  addWound: (severity: number) => void
  tickWounds: (dtSeconds: number) => void
  treatWound: (id: number, bacteriaReduction: number) => void
  clearHealedWounds: () => void

  // Discoveries made
  discoveries: Set<string>
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

  // M7: Smithing XP — used for iron tool quality calculation
  // 0 = novice (quality 0.5-0.7), 100 = experienced (0.8-0.95), 300+ = master (0.95-1.0)
  smithingXp: number
  addSmithingXp: (xp: number) => void

  // M8: Armor slot — chest only for now (Steel Chestplate)
  // Slot index into inventory.slots, or null if nothing equipped in armor slot.
  equippedArmorSlot: number | null
  equipArmor: (slotIndex: number) => void
  unequipArmor: () => void

  // M31: Weapon durability — keyed by slot index. Max durability = 100.
  weaponDurability: Record<number, number>
  setWeaponDurability: (slotIndex: number, value: number) => void
  reduceWeaponDurability: (slotIndex: number, amount: number) => void
  repairWeaponDurability: (slotIndex: number, amount: number) => void

  // M8: Quenching countdown — seconds remaining to quench hot_steel_ingot
  // Set to 30 when a hot_steel_ingot enters inventory. Counts down each real second.
  // Hits 0 → hot_steel automatically converts to soft_steel in SurvivalSystems.
  quenchSecondsRemaining: number | null
  setQuenchTimer: (seconds: number | null) => void
  tickQuenchTimer: (dtSeconds: number) => void

  // Death + Respawn system (M5)
  isDead: boolean
  deathCause: 'starvation' | 'infection' | 'combat' | 'drowning' | 'hypothermia' | null
  deathPos: { x: number; y: number; z: number } | null
  bedrollPos: { x: number; y: number; z: number } | null
  murderCount: number
  triggerDeath: (cause: 'starvation' | 'infection' | 'combat' | 'drowning' | 'hypothermia', pos: { x: number; y: number; z: number }) => void
  clearDeath: () => void
  setBedrollPos: (pos: { x: number; y: number; z: number } | null) => void
  incrementMurderCount: () => void
  setMurderCount: (n: number) => void

  // M34 Track A: Player Home Base
  homePosition: [number, number, number] | null  // null = not placed yet
  homeSet: boolean
  setHomePosition: (pos: [number, number, number]) => void
  homeStorage: number[]  // array of MAT IDs stored at home
  addToHomeStorage: (matId: number) => void
  removeFromHomeStorage: (matId: number) => boolean
  homeTier: 0 | 1 | 2  // 0=Cozy (default), 1=Upgraded (+10 slots), 2=Fortified
  setHomeTier: (tier: 0 | 1 | 2) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  entityId: null,
  setEntityId: (id) => set({ entityId: id }),

  hunger: 0,
  thirst: 0,
  health: 1,
  energy: 1,
  fatigue: 0,
  ambientTemp: 15,

  // M29 Track B: Warmth
  warmth: 80,
  addWarmth: (delta) => set((s) => ({ warmth: Math.max(0, Math.min(100, s.warmth + delta)) })),

  // M27: Gold currency
  gold: 0,
  addGold: (amount) => {
    const earned = Math.max(0, amount)
    if (earned > 0) {
      usePlayerStatsStore.getState().incrementStat('totalGoldEarned', earned)
    }
    set((s) => ({ gold: s.gold + earned }))
  },
  spendGold: (amount) => {
    let success = false
    set((s) => {
      if (s.gold < amount) return s
      success = true
      return { gold: s.gold - amount }
    })
    return success
  },
  updateVitals: (v) => set((s) => ({
    hunger: v.hunger  !== undefined ? Math.max(0, Math.min(1, v.hunger))  : s.hunger,
    thirst: v.thirst  !== undefined ? Math.max(0, Math.min(1, v.thirst))  : s.thirst,
    health: v.health  !== undefined ? Math.max(0, Math.min(1, v.health))  : s.health,
    energy: v.energy  !== undefined ? Math.max(0, Math.min(1, v.energy))  : s.energy,
    fatigue: v.fatigue !== undefined ? Math.max(0, Math.min(1, v.fatigue)) : s.fatigue,
  })),
  setAmbientTemp: (t) => set({ ambientTemp: t }),

  discoveries: new Set<string>(),
  addDiscovery: (id) => set((s) => {
    if (s.discoveries.has(id)) return s
    const next = new Set(s.discoveries)
    next.add(id)
    return { discoveries: next }
  }),
  hasDiscovery: (id) => get().discoveries.has(id),

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

  // ── M7: Smithing XP ───────────────────────────────────────────────────────
  smithingXp: 0,
  addSmithingXp: (xp) => set((s) => ({ smithingXp: s.smithingXp + xp })),

  // ── M8: Armor slot ────────────────────────────────────────────────────────
  equippedArmorSlot: null,
  equipArmor:   (slotIndex) => set({ equippedArmorSlot: slotIndex }),
  unequipArmor: () => set({ equippedArmorSlot: null }),

  // ── M31: Weapon durability ────────────────────────────────────────────────
  weaponDurability: {},
  setWeaponDurability: (slotIndex, value) => set((s) => ({
    weaponDurability: { ...s.weaponDurability, [slotIndex]: Math.max(0, Math.min(100, value)) },
  })),
  reduceWeaponDurability: (slotIndex, amount) => set((s) => {
    const current = s.weaponDurability[slotIndex] ?? 100
    const next = Math.max(0, current - amount)
    return { weaponDurability: { ...s.weaponDurability, [slotIndex]: next } }
  }),
  repairWeaponDurability: (slotIndex, amount) => set((s) => {
    const current = s.weaponDurability[slotIndex] ?? 100
    const next = Math.min(100, current + amount)
    return { weaponDurability: { ...s.weaponDurability, [slotIndex]: next } }
  }),

  // ── M8: Quench countdown ──────────────────────────────────────────────────
  quenchSecondsRemaining: null,
  setQuenchTimer: (seconds) => set({ quenchSecondsRemaining: seconds }),
  tickQuenchTimer: (dtSeconds) => set((s) => {
    if (s.quenchSecondsRemaining === null) return s
    const next = s.quenchSecondsRemaining - dtSeconds
    return { quenchSecondsRemaining: next > 0 ? next : null }
  }),

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

  // ── M34 Track A: Player Home Base ─────────────────────────────────────────
  homePosition: null,
  homeSet: false,
  setHomePosition: (pos) => set({ homePosition: pos, homeSet: true }),
  homeStorage: [],
  addToHomeStorage: (matId) => set((s) => ({ homeStorage: [...s.homeStorage, matId] })),
  removeFromHomeStorage: (matId) => {
    let removed = false
    set((s) => {
      const idx = s.homeStorage.indexOf(matId)
      if (idx < 0) return s
      removed = true
      const next = [...s.homeStorage]
      next.splice(idx, 1)
      return { homeStorage: next }
    })
    return removed
  },
  homeTier: 0,
  setHomeTier: (tier) => set({ homeTier: tier }),
}))
