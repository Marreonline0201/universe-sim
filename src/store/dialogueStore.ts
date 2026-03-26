// ── dialogueStore.ts ──────────────────────────────────────────────────────────
// M20 Track B: Zustand store for NPC dialogue state.
//
// Manages the open/close state of the dialogue panel, the target NPC context,
// the message history, and the "waiting for LLM" indicator.

import { create } from 'zustand'
import type { EmotionState } from '../ai/EmotionModel'

export interface DialogueMessage {
  sender: 'player' | 'npc'
  text: string
  timestamp: number
}

export type MerchantArchetypeType = 'general' | 'blacksmith' | 'alchemist'
// ^ Mirrors MerchantArchetype from MerchantSystem — duplicated here to avoid a circular import.

interface DialogueState {
  isOpen: boolean
  targetNpcId: number | null
  targetNpcName: string
  targetNpcRole: string
  targetSettlement: string
  messages: DialogueMessage[]
  isWaiting: boolean
  emotionState: EmotionState | null

  // Merchant archetype — set when opening merchant panel, read by MerchantPanel
  merchantArchetype: MerchantArchetypeType
  setMerchantArchetype: (archetype: MerchantArchetypeType) => void

  // M35: Active settlement ID for market pricing
  merchantSettlementId: string
  setMerchantSettlementId: (id: string) => void

  openDialogue: (npcId: number, name: string, role: string, settlement?: string) => void
  closeDialogue: () => void
  addMessage: (sender: 'player' | 'npc', text: string) => void
  setWaiting: (waiting: boolean) => void
  setEmotion: (emotion: EmotionState) => void
}

export const useDialogueStore = create<DialogueState>((set) => ({
  isOpen: false,
  targetNpcId: null,
  targetNpcName: '',
  targetNpcRole: '',
  targetSettlement: '',
  messages: [],
  isWaiting: false,
  emotionState: null,

  merchantArchetype: 'general',
  setMerchantArchetype: (archetype) => set({ merchantArchetype: archetype }),

  merchantSettlementId: 'default',
  setMerchantSettlementId: (id) => set({ merchantSettlementId: id }),

  openDialogue: (npcId, name, role, settlement = 'Unknown') =>
    set({
      isOpen: true,
      targetNpcId: npcId,
      targetNpcName: name,
      targetNpcRole: role,
      targetSettlement: settlement,
      messages: [],
      isWaiting: false,
      emotionState: null,
    }),

  closeDialogue: () =>
    set({
      isOpen: false,
      targetNpcId: null,
      targetNpcName: '',
      targetNpcRole: '',
      targetSettlement: '',
      messages: [],
      isWaiting: false,
      emotionState: null,
    }),

  addMessage: (sender, text) =>
    set((s) => ({
      messages: [...s.messages, { sender, text, timestamp: Date.now() }],
    })),

  setWaiting: (waiting) => set({ isWaiting: waiting }),

  setEmotion: (emotion) => set({ emotionState: emotion }),
}))
