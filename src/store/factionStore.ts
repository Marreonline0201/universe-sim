// ── factionStore.ts ────────────────────────────────────────────────────────────
// M35 Track C: Player faction allegiance, settlement faction assignments,
// settlement health, and active raid events.

import { create } from 'zustand'
import type { FactionId } from '../game/FactionSystem'
import { getFactionForSettlementIndex } from '../game/FactionSystem'

export interface RaidEvent {
  id: number
  attackingFaction: FactionId
  defendingSettlementId: number
  defendingFaction: FactionId
  startedAt: number   // Date.now() ms
  active: boolean
}

interface FactionState {
  // Player faction allegiance
  playerFaction: FactionId | null
  joinedAt: number | null   // Date.now() when joined — for 60s switch cooldown

  // Map of settlementId -> factionId
  settlementFactions: Map<number, FactionId>

  // Map of settlementId -> health (0–100, starts at 100)
  settlementHealth: Map<number, number>

  // Active raid events
  raidEvents: RaidEvent[]

  // Faction XP earned by player (for defending raids etc.)
  factionXp: number

  // Actions
  joinFaction: (id: FactionId) => void
  canSwitchFaction: () => boolean
  assignSettlementFactions: (settlementIds: number[]) => void
  getSettlementFaction: (settlementId: number) => FactionId | null
  getSettlementHealth: (settlementId: number) => number
  damageSettlement: (settlementId: number, amount: number) => void
  healSettlement: (settlementId: number, amount: number) => void
  startRaid: (attackingFaction: FactionId, defendingSettlementId: number, defendingFaction: FactionId) => void
  endRaid: (raidId: number) => void
  addFactionXp: (amount: number) => void
}

let _raidIdCounter = 1

export const useFactionStore = create<FactionState>((set, get) => ({
  playerFaction: null,
  joinedAt: null,
  settlementFactions: new Map(),
  settlementHealth: new Map(),
  raidEvents: [],
  factionXp: 0,

  joinFaction: (id) => set({ playerFaction: id, joinedAt: Date.now() }),

  canSwitchFaction: () => {
    const { joinedAt } = get()
    if (joinedAt === null) return true
    return Date.now() - joinedAt > 60_000  // 60 second cooldown
  },

  assignSettlementFactions: (settlementIds) => set((state) => {
    const factions = new Map(state.settlementFactions)
    const health = new Map(state.settlementHealth)
    settlementIds.forEach((id, index) => {
      if (!factions.has(id)) {
        factions.set(id, getFactionForSettlementIndex(index))
      }
      if (!health.has(id)) {
        health.set(id, 100)
      }
    })
    return { settlementFactions: factions, settlementHealth: health }
  }),

  getSettlementFaction: (settlementId) => {
    return get().settlementFactions.get(settlementId) ?? null
  },

  getSettlementHealth: (settlementId) => {
    return get().settlementHealth.get(settlementId) ?? 100
  },

  damageSettlement: (settlementId, amount) => set((state) => {
    const health = new Map(state.settlementHealth)
    const current = health.get(settlementId) ?? 100
    health.set(settlementId, Math.max(0, current - amount))
    return { settlementHealth: health }
  }),

  healSettlement: (settlementId, amount) => set((state) => {
    const health = new Map(state.settlementHealth)
    const current = health.get(settlementId) ?? 100
    health.set(settlementId, Math.min(100, current + amount))
    return { settlementHealth: health }
  }),

  startRaid: (attackingFaction, defendingSettlementId, defendingFaction) => set((state) => ({
    raidEvents: [
      ...state.raidEvents,
      {
        id: _raidIdCounter++,
        attackingFaction,
        defendingSettlementId,
        defendingFaction,
        startedAt: Date.now(),
        active: true,
      },
    ],
  })),

  endRaid: (raidId) => set((state) => ({
    raidEvents: state.raidEvents.map(r =>
      r.id === raidId ? { ...r, active: false } : r
    ),
  })),

  addFactionXp: (amount) => set((state) => ({ factionXp: state.factionXp + amount })),
}))
