// ── diplomacyStore.ts ──────────────────────────────────────────────────────
// M11 Track C: Civilization Diplomacy — war/peace/alliance state per settlement pair.
//
// Populated from server WS messages:
//   MAYOR_APPOINTED    → settlement has elected a mayor NPC
//   DIPLOMATIC_ENVOY   → settlement A sent an envoy to settlement B (improves relations)
//   WAR_DECLARED       → settlement A declared war on settlement B
//   PEACE_DECLARED     → war ended between A and B
//
// Player criminal alignment is affected:
//   - If player is in a settlement's territory during WAR_DECLARED against another
//     settlement, player gains 0 criminal effect (war is political, not personal).
//   - If player attacks a settlement's NPCs during peace, outlaw score increases as normal.
//   - If player kills an NPC during active war between settlements, no bounty from that pair.

import { create } from 'zustand'

export type DiplomacyStatus = 'neutral' | 'allied' | 'war' | 'trade_partner'

export interface MayorRecord {
  settlementId: number
  settlementName: string
  mayorNpcId: number
  mayorName: string
  appointedAt: number   // server real time ms
}

export interface DiplomacyRelation {
  settlementA: number
  settlementB: number
  status: DiplomacyStatus
  updatedAt: number
}

export interface DiplomacyNotification {
  id: string
  type: 'war' | 'peace' | 'envoy' | 'mayor'
  message: string
  timestamp: number
  read: boolean
}

interface DiplomacyState {
  // Mayor records keyed by settlement ID
  mayors: Map<number, MayorRecord>
  setMayor: (record: MayorRecord) => void

  // Relations: key = `${minId}-${maxId}`
  relations: Map<string, DiplomacyRelation>
  setRelation: (relation: DiplomacyRelation) => void
  getRelation: (a: number, b: number) => DiplomacyStatus

  // Active war pairs (for fast lookup by settlement ID)
  activeWars: Set<string>
  isAtWar: (a: number, b: number) => boolean

  // Notification queue (shown in DiplomacyHUD)
  notifications: DiplomacyNotification[]
  addNotification: (n: Omit<DiplomacyNotification, 'id' | 'read'>) => void
  markRead: (id: string) => void
  clearOld: () => void
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`
}

export const useDiplomacyStore = create<DiplomacyState>((set, get) => ({
  mayors: new Map(),
  setMayor: (record) =>
    set((state) => {
      const next = new Map(state.mayors)
      next.set(record.settlementId, record)
      return { mayors: next }
    }),

  relations: new Map(),
  setRelation: (relation) =>
    set((state) => {
      const key = pairKey(relation.settlementA, relation.settlementB)
      const nextRelations = new Map(state.relations)
      nextRelations.set(key, relation)

      // Maintain activeWars set
      const nextWars = new Set(state.activeWars)
      if (relation.status === 'war') {
        nextWars.add(key)
      } else {
        nextWars.delete(key)
      }

      return { relations: nextRelations, activeWars: nextWars }
    }),

  getRelation: (a, b) => {
    const key = pairKey(a, b)
    return get().relations.get(key)?.status ?? 'neutral'
  },

  activeWars: new Set(),
  isAtWar: (a, b) => {
    const key = pairKey(a, b)
    return get().activeWars.has(key)
  },

  notifications: [],
  addNotification: (n) =>
    set((state) => ({
      notifications: [
        {
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          read: false,
        },
        ...state.notifications,
      ].slice(0, 50),  // keep last 50 notifications
    })),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  clearOld: () =>
    set((state) => ({
      notifications: state.notifications.filter(
        (n) => Date.now() - n.timestamp < 300_000  // keep last 5 minutes
      ),
    })),
}))
