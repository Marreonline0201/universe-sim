// ── settlementStore.ts ─────────────────────────────────────────────────────────
// Client-side state for NPC settlements.
// Populated from WORLD_SNAPSHOT on join, updated by SETTLEMENT_UPDATE messages.

import { create } from 'zustand'

export interface SettlementSnapshot {
  id:          number
  name:        string
  x:           number
  y:           number
  z:           number
  civLevel:    number
  npcCount:    number
  resourceInv: Record<string, number>
}

export interface TradeOffer {
  settlementId:   number
  settlementName: string
  civLevel:       number
  offerMats:      Record<string, number>  // what settlement gives
  wantMats:       Record<string, number>  // what settlement wants
  trustScore:     number
}

interface SettlementState {
  settlements:  Map<number, SettlementSnapshot>
  setSettlements: (list: SettlementSnapshot[]) => void
  upsertSettlement: (s: SettlementSnapshot) => void

  // Active trade offer (shown in SettlementHUD)
  pendingOffer: TradeOffer | null
  setPendingOffer: (offer: TradeOffer | null) => void

  // Set of settlement IDs whose gates are closed for the local player
  closedGates: Set<number>
  setGatesClosed: (settlementId: number) => void
  clearGatesClosed: (settlementId: number) => void

  // Last settlement the player was near (for NPC_ATTACKED routing)
  nearSettlementId: number | null
  setNearSettlement: (id: number | null) => void

  // Last trade timestamp per settlement (epoch ms) — used for 💰 activity indicator
  lastTradeTime: Map<number, number>
  recordTrade: (settlementId: number) => void
}

export const useSettlementStore = create<SettlementState>((set) => ({
  settlements: new Map(),
  setSettlements: (list) => {
    const map = new Map<number, SettlementSnapshot>()
    for (const s of list) map.set(s.id, s)
    set({ settlements: map })
  },
  upsertSettlement: (s) =>
    set((state) => {
      const next = new Map(state.settlements)
      next.set(s.id, s)
      return { settlements: next }
    }),

  pendingOffer: null,
  setPendingOffer: (offer) => set({ pendingOffer: offer }),

  closedGates: new Set<number>(),
  setGatesClosed: (id) =>
    set((state) => {
      const next = new Set(state.closedGates)
      next.add(id)
      return { closedGates: next }
    }),
  clearGatesClosed: (id) =>
    set((state) => {
      const next = new Set(state.closedGates)
      next.delete(id)
      return { closedGates: next }
    }),

  nearSettlementId: null,
  setNearSettlement: (id) => set({ nearSettlementId: id }),

  lastTradeTime: new Map(),
  recordTrade: (settlementId) =>
    set((state) => {
      const next = new Map(state.lastTradeTime)
      next.set(settlementId, Date.now())
      return { lastTradeTime: next }
    }),
}))
