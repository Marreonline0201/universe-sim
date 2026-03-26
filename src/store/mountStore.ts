import { create } from 'zustand'

interface MountState {
  mountedAnimalId: number | null   // entity ID of the animal being ridden
  mountName: string                // display name (e.g. "Horse")
  mountHealth: number
  mountMaxHealth: number
  mountStamina: number             // 0-100, drains when galloping
  mountSpeed: number               // base speed multiplier (1.4 = 40% faster than walk)
  isGalloping: boolean             // shift key = gallop (2× speed drain)

  mount(animalId: number, name: string, health: number, speed: number): void
  dismount(): void
  setMountHealth(hp: number): void
  setMountStamina(stam: number): void
  setGalloping(g: boolean): void
}

export const useMountStore = create<MountState>((set) => ({
  mountedAnimalId: null,
  mountName: '',
  mountHealth: 100,
  mountMaxHealth: 100,
  mountStamina: 100,
  mountSpeed: 1.4,
  isGalloping: false,

  mount(animalId, name, health, speed) {
    set({
      mountedAnimalId: animalId,
      mountName: name,
      mountHealth: health,
      mountMaxHealth: health,
      mountStamina: 100,
      mountSpeed: speed,
      isGalloping: false,
    })
  },

  dismount() {
    set({
      mountedAnimalId: null,
      mountName: '',
      mountHealth: 100,
      mountMaxHealth: 100,
      mountStamina: 100,
      mountSpeed: 1.4,
      isGalloping: false,
    })
  },

  setMountHealth(hp) {
    set((s) => ({ mountHealth: Math.max(0, Math.min(s.mountMaxHealth, hp)) }))
  },

  setMountStamina(stam) {
    set({ mountStamina: Math.max(0, Math.min(100, stam)) })
  },

  setGalloping(g) {
    set({ isGalloping: g })
  },
}))
