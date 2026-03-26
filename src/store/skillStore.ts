// ── skillStore.ts ─────────────────────────────────────────────────────────────
// M36 Track A: Zustand store for skill points, unlocked tree nodes, and prestige.
// Kept separate from playerStore to avoid circular deps with SkillSystem.ts.

import { create } from 'zustand'

interface SkillStoreState {
  // ── Skill points ───────────────────────────────────────────────────────────
  /** Points available to spend in the skill tree. Earned 1 per skill level-up. */
  skillPoints: number
  addSkillPoint: () => void
  /** Spend 1 skill point. Returns false if none available. */
  spendSkillPoints: (cost: number) => boolean

  // ── Unlocked nodes ─────────────────────────────────────────────────────────
  /** Array of node IDs that have been unlocked. */
  unlockedNodes: string[]
  unlockNode: (nodeId: string) => void
  isNodeUnlocked: (nodeId: string) => boolean

  // ── Prestige ───────────────────────────────────────────────────────────────
  prestigeCount: number
  incrementPrestige: () => void

  // ── Serialization ──────────────────────────────────────────────────────────
  serialize: () => { skillPoints: number; unlockedNodes: string[]; prestigeCount: number }
  deserialize: (data: unknown) => void
}

export const useSkillStore = create<SkillStoreState>((set, get) => ({
  // ── Skill points ──────────────────────────────────────────────────────────
  skillPoints: 0,
  addSkillPoint: () => set((s) => ({ skillPoints: s.skillPoints + 1 })),
  spendSkillPoints: (cost) => {
    let success = false
    set((s) => {
      if (s.skillPoints < cost) return s
      success = true
      return { skillPoints: s.skillPoints - cost }
    })
    return success
  },

  // ── Unlocked nodes ────────────────────────────────────────────────────────
  unlockedNodes: [],
  unlockNode: (nodeId) => set((s) => {
    if (s.unlockedNodes.includes(nodeId)) return s
    return { unlockedNodes: [...s.unlockedNodes, nodeId] }
  }),
  isNodeUnlocked: (nodeId) => get().unlockedNodes.includes(nodeId),

  // ── Prestige ──────────────────────────────────────────────────────────────
  prestigeCount: 0,
  incrementPrestige: () => set((s) => ({ prestigeCount: s.prestigeCount + 1 })),

  // ── Serialization ─────────────────────────────────────────────────────────
  serialize: () => {
    const s = get()
    return { skillPoints: s.skillPoints, unlockedNodes: s.unlockedNodes, prestigeCount: s.prestigeCount }
  },
  deserialize: (data) => {
    if (!data || typeof data !== 'object') return
    const d = data as { skillPoints?: number; unlockedNodes?: string[]; prestigeCount?: number }
    set({
      skillPoints: typeof d.skillPoints === 'number' ? d.skillPoints : 0,
      unlockedNodes: Array.isArray(d.unlockedNodes) ? d.unlockedNodes : [],
      prestigeCount: typeof d.prestigeCount === 'number' ? d.prestigeCount : 0,
    })
  },
}))
