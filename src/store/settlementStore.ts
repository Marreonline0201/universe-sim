// settlementStore — tracks server-synced NPC settlements (core world simulation data)
import { create } from 'zustand'

export interface Settlement {
  id: number
  name: string
  x: number
  y: number
  z: number
  civLevel: number
  npcCount: number
  resourceInv: Record<string, number>
}

export interface PendingTradeOffer {
  settlementId: number
  settlementName: string
  civLevel: number
  offerMats: Record<string, number>
  wantMats: Record<string, number>
  trustScore: number
}

interface SettlementState {
  settlements: Map<number, Settlement>
  upsertSettlement: (s: Settlement) => void
  removeSettlement: (id: number) => void
  setSettlements: (settlements: Settlement[]) => void
  recordTrade: (...args: unknown[]) => void
  setGatesClosed: (...args: unknown[]) => void

  // Near-settlement detection (for UI prompts)
  nearSettlementId: number | null
  setNearSettlementId: (id: number | null) => void

  // Trade offer from server
  pendingOffer: PendingTradeOffer | null
  setPendingOffer: (offer: PendingTradeOffer | null) => void
}

export const useSettlementStore = create<SettlementState>((set) => ({
  settlements: new Map(),
  upsertSettlement: (s) =>
    set((state) => {
      const next = new Map(state.settlements)
      next.set(s.id, s)
      return { settlements: next }
    }),
  removeSettlement: (id) =>
    set((state) => {
      const next = new Map(state.settlements)
      next.delete(id)
      return { settlements: next }
    }),
  setSettlements: (settlements) =>
    set(() => {
      const next = new Map<number, Settlement>()
      for (const s of settlements) next.set(s.id, s)
      return { settlements: next }
    }),
  recordTrade: () => {},
  setGatesClosed: () => {},

  nearSettlementId: null,
  setNearSettlementId: (id) => set({ nearSettlementId: id }),

  pendingOffer: null,
  setPendingOffer: (offer) => set({ pendingOffer: offer }),
}))
