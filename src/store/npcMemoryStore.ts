// ── npcMemoryStore.ts ─────────────────────────────────────────────────────────
// M38 Track A: NPC persistent memory — tracks player interactions per NPC.
//
// Each NPC gets a memory record keyed by npcId (settlementId * 100 + roleIndex).
// Memory persists as long as the game session is active (Zustand in-memory store).

import { create } from 'zustand'
import type { FactionId } from '../game/FactionSystem'

export interface NPCMemory {
  npcId:                number
  playerGreeted:        boolean
  timesSpokenTo:        number
  lastTopicDiscussed:   string | null
  questGiven:           string | null
  playerFactionKnown:   FactionId | null
  reputationScore:      number   // -100 to 100; affects dialogue options
}

interface NPCMemoryState {
  memories: Map<number, NPCMemory>

  /** Get or create memory for an NPC */
  getMemory: (npcId: number) => NPCMemory

  /** Record that the player has spoken to this NPC */
  recordGreeting: (npcId: number) => void

  /** Record a player message (increments timesSpokenTo, updates last topic) */
  recordMessage: (npcId: number, topic: string) => void

  /** Adjust reputation score (clamped to -100…100) */
  adjustReputation: (npcId: number, delta: number) => void

  /** Set that this NPC knows the player's faction */
  setFactionKnown: (npcId: number, factionId: FactionId) => void

  /** Mark a quest as given */
  setQuestGiven: (npcId: number, questName: string) => void
}

function defaultMemory(npcId: number): NPCMemory {
  return {
    npcId,
    playerGreeted:      false,
    timesSpokenTo:      0,
    lastTopicDiscussed: null,
    questGiven:         null,
    playerFactionKnown: null,
    reputationScore:    0,
  }
}

export const useNPCMemoryStore = create<NPCMemoryState>((set, get) => ({
  memories: new Map(),

  getMemory(npcId) {
    const existing = get().memories.get(npcId)
    if (existing) return existing
    const fresh = defaultMemory(npcId)
    set(state => {
      const next = new Map(state.memories)
      next.set(npcId, fresh)
      return { memories: next }
    })
    return fresh
  },

  recordGreeting(npcId) {
    set(state => {
      const next = new Map(state.memories)
      const mem = next.get(npcId) ?? defaultMemory(npcId)
      next.set(npcId, {
        ...mem,
        playerGreeted: true,
        timesSpokenTo: mem.timesSpokenTo + 1,
      })
      return { memories: next }
    })
  },

  recordMessage(npcId, topic) {
    set(state => {
      const next = new Map(state.memories)
      const mem = next.get(npcId) ?? defaultMemory(npcId)
      next.set(npcId, {
        ...mem,
        timesSpokenTo: mem.timesSpokenTo + 1,
        lastTopicDiscussed: topic,
      })
      return { memories: next }
    })
  },

  adjustReputation(npcId, delta) {
    set(state => {
      const next = new Map(state.memories)
      const mem = next.get(npcId) ?? defaultMemory(npcId)
      next.set(npcId, {
        ...mem,
        reputationScore: Math.max(-100, Math.min(100, mem.reputationScore + delta)),
      })
      return { memories: next }
    })
  },

  setFactionKnown(npcId, factionId) {
    set(state => {
      const next = new Map(state.memories)
      const mem = next.get(npcId) ?? defaultMemory(npcId)
      next.set(npcId, { ...mem, playerFactionKnown: factionId })
      return { memories: next }
    })
  },

  setQuestGiven(npcId, questName) {
    set(state => {
      const next = new Map(state.memories)
      const mem = next.get(npcId) ?? defaultMemory(npcId)
      next.set(npcId, { ...mem, questGiven: questName })
      return { memories: next }
    })
  },
}))
