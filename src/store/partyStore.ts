/**
 * partyStore — M39 Track B: Party / Group System
 *
 * Manages the local player's party state:
 *  - Invite, accept, leave, kick
 *  - Party chat channel (/p prefix)
 *  - Shared XP bonus tracking (+10% when in party)
 *  - Pending invite (incoming invite from another leader)
 */

import { create } from 'zustand'
import { getWorldSocket } from '../net/useWorldSocket'

export interface PartyMember {
  userId: string
  username: string
  health: number   // 0-1
  title?: string
  titleColor?: string
  x?: number
  y?: number
  z?: number
}

export interface Party {
  leaderId: string
  members: PartyMember[]   // includes leader
  maxSize: 4
}

interface PartyState {
  party: Party | null
  pendingInvite: { leaderId: string; leaderName: string } | null

  // Actions
  setParty: (party: Party | null) => void
  setPendingInvite: (invite: { leaderId: string; leaderName: string } | null) => void
  updateMember: (userId: string, data: Partial<PartyMember>) => void

  // WS-dispatched actions
  invitePlayer: (targetId: string, targetUsername: string) => void
  acceptInvite: (leaderId: string) => void
  declineInvite: () => void
  leaveParty: () => void
  kickMember: (memberId: string, currentUserId: string) => void

  // Derived helpers
  isInParty: () => boolean
  isLeader: (userId: string) => boolean
  getXpBonus: () => number   // 1.0 or 1.1
}

export const usePartyStore = create<PartyState>((set, get) => ({
  party: null,
  pendingInvite: null,

  setParty: (party) => set({ party }),
  setPendingInvite: (invite) => set({ pendingInvite: invite }),

  updateMember: (userId, data) =>
    set((s) => {
      if (!s.party) return s
      const members = s.party.members.map(m =>
        m.userId === userId ? { ...m, ...data } : m
      )
      return { party: { ...s.party, members } }
    }),

  invitePlayer: (targetId, targetUsername) => {
    try {
      getWorldSocket()?.send({ type: 'PARTY_INVITE', targetId, targetUsername } as any)
    } catch { /* offline */ }
    // Optimistically show a notification (handled by caller)
  },

  acceptInvite: (leaderId) => {
    set({ pendingInvite: null })
    try {
      getWorldSocket()?.send({ type: 'PARTY_ACCEPT', leaderId } as any)
    } catch { /* offline */ }
  },

  declineInvite: () => {
    set({ pendingInvite: null })
  },

  leaveParty: () => {
    const state = get()
    if (!state.party) return
    try {
      getWorldSocket()?.send({ type: 'PARTY_LEAVE' } as any)
    } catch { /* offline */ }
    set({ party: null })
  },

  kickMember: (memberId, currentUserId) => {
    const state = get()
    if (!state.party) return
    if (state.party.leaderId !== currentUserId) return   // not leader
    try {
      getWorldSocket()?.send({ type: 'PARTY_KICK', memberId } as any)
    } catch { /* offline */ }
    set((s) => {
      if (!s.party) return s
      return { party: { ...s.party, members: s.party.members.filter(m => m.userId !== memberId) } }
    })
  },

  isInParty: () => {
    const { party } = get()
    return party !== null && party.members.length > 1
  },

  isLeader: (userId) => {
    const { party } = get()
    return party?.leaderId === userId
  },

  getXpBonus: () => {
    const { party } = get()
    if (!party || party.members.length < 2) return 1.0
    return 1.1   // +10% XP bonus in party
  },
}))
