import { create } from 'zustand'

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
  updateVitals: (v: Partial<Pick<PlayerState, 'hunger' | 'thirst' | 'health' | 'energy' | 'fatigue'>>) => void

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
  equip: (slotIndex: number | null) => void
  unequip: () => void
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
  updateVitals: (v) => set((s) => ({
    hunger: v.hunger  !== undefined ? Math.max(0, Math.min(1, v.hunger))  : s.hunger,
    thirst: v.thirst  !== undefined ? Math.max(0, Math.min(1, v.thirst))  : s.thirst,
    health: v.health  !== undefined ? Math.max(0, Math.min(1, v.health))  : s.health,
    energy: v.energy  !== undefined ? Math.max(0, Math.min(1, v.energy))  : s.energy,
    fatigue: v.fatigue !== undefined ? Math.max(0, Math.min(1, v.fatigue)) : s.fatigue,
  })),

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
}))
