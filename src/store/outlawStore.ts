// ── outlawStore.ts ──────────────────────────────────────────────────────────────
// M7 Track 2: PvP Outlaw System — client-side state.
//
// Tracks active redemption quest, bounty notifications, and wanted player index.

import { create } from 'zustand'

export interface RedemptionQuest {
  questId:      string
  questType:    'escort' | 'resource_delivery' | 'settlement_defense'
  settlementId: number
  progress:     number
  required:     number
  expiresAt:    number
}

export interface BountyEntry {
  playerId:    string
  username:    string
  murderCount: number
  reward:      number
}

interface OutlawState {
  // Active redemption quest (null if none)
  activeQuest: RedemptionQuest | null
  setActiveQuest:   (q: RedemptionQuest | null) => void
  updateQuestProgress: (questId: string, progress: number) => void

  // Index of wanted players by playerId — used by RemotePlayersRenderer
  // for bounty labels and by SceneRoot combat to detect bounty targets
  wantedPlayers: Map<string, BountyEntry>
  upsertWantedPlayer: (entry: BountyEntry) => void
  removeWantedPlayer: (playerId: string) => void
  getWantedEntry:     (playerId: string) => BountyEntry | undefined

  // Pending bounty notification (shown to all clients when a new bounty is posted)
  pendingBountyNotif: BountyEntry | null
  setPendingBountyNotif: (entry: BountyEntry | null) => void
}

export const useOutlawStore = create<OutlawState>((set, get) => ({
  activeQuest: null,
  setActiveQuest: (q) => set({ activeQuest: q }),
  updateQuestProgress: (questId, progress) =>
    set((s) => {
      if (!s.activeQuest || s.activeQuest.questId !== questId) return s
      return { activeQuest: { ...s.activeQuest, progress } }
    }),

  wantedPlayers: new Map(),
  upsertWantedPlayer: (entry) =>
    set((s) => {
      const next = new Map(s.wantedPlayers)
      next.set(entry.playerId, entry)
      return { wantedPlayers: next }
    }),
  removeWantedPlayer: (playerId) =>
    set((s) => {
      const next = new Map(s.wantedPlayers)
      next.delete(playerId)
      return { wantedPlayers: next }
    }),
  getWantedEntry: (playerId) => get().wantedPlayers.get(playerId),

  pendingBountyNotif: null,
  setPendingBountyNotif: (entry) => set({ pendingBountyNotif: entry }),
}))
