// ── settlementQuestStore.ts ──────────────────────────────────────────────────
// M33 Track A: Settlement quest board system.
//
// Generates 3-5 random quests per settlement seeded by settlement ID.
// Players accept quests, track progress, complete them for XP + gold.
// Quests are separate from the milestone QuestSystem (QuestSystem.ts).

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BoardQuestType = 'gather' | 'hunt' | 'explore' | 'craft'

export interface BoardQuest {
  id: string
  settlementId: number
  settlementName: string
  title: string
  description: string
  type: BoardQuestType
  /** MAT id for gather/craft, species string for hunt, 0 for explore */
  targetId: number
  targetCount: number
  reward: { xp: number; gold: number }
  accepted: boolean
  progress: number
  completed: boolean
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

// ── Quest templates ───────────────────────────────────────────────────────────

interface QuestTemplate {
  type: BoardQuestType
  title: string
  description: string
  targetId: number
  targetCount: number
  reward: { xp: number; gold: number }
}

// MAT ids referenced by gather quests (matching existing MAT enum)
// MAT.WOOD = 3, MAT.STONE = 1, MAT.IRON_ORE = 6
const GATHER_TEMPLATES: QuestTemplate[] = [
  {
    type: 'gather',
    title: 'Collect Wood',
    description: 'We need timber for construction. Gather 5 wood from nearby trees.',
    targetId: 3,
    targetCount: 5,
    reward: { xp: 50, gold: 20 },
  },
  {
    type: 'gather',
    title: 'Collect Stone',
    description: 'The settlement needs stone for repairs. Gather 5 stone from rocky outcrops.',
    targetId: 1,
    targetCount: 5,
    reward: { xp: 50, gold: 18 },
  },
  {
    type: 'gather',
    title: 'Collect Iron Ore',
    description: 'Our smiths are out of iron. Gather 3 iron ore from veins nearby.',
    targetId: 6,
    targetCount: 3,
    reward: { xp: 60, gold: 25 },
  },
  {
    type: 'gather',
    title: 'Collect Berries',
    description: 'Food stores are low. Gather 8 berries from bushes in the forest.',
    targetId: 10,
    targetCount: 8,
    reward: { xp: 40, gold: 15 },
  },
]

const HUNT_TEMPLATES: QuestTemplate[] = [
  {
    type: 'hunt',
    title: 'Clear the Threats',
    description: 'Hostile creatures have been spotted near the settlement. Slay 3 of them.',
    targetId: 0,
    targetCount: 3,
    reward: { xp: 80, gold: 35 },
  },
  {
    type: 'hunt',
    title: 'Defend the Settlement',
    description: 'Protect the settlement from 5 attackers threatening our people.',
    targetId: 0,
    targetCount: 5,
    reward: { xp: 100, gold: 45 },
  },
  {
    type: 'hunt',
    title: 'Cull the Wolves',
    description: 'Wolves have been preying on our livestock. Slay 2 wolves.',
    targetId: 0,
    targetCount: 2,
    reward: { xp: 80, gold: 30 },
  },
]

const EXPLORE_TEMPLATES: QuestTemplate[] = [
  {
    type: 'explore',
    title: 'Scout Ahead',
    description: 'Chart new territory. Travel far from the settlement to discover new areas.',
    targetId: 0,
    targetCount: 1,
    reward: { xp: 60, gold: 25 },
  },
  {
    type: 'explore',
    title: 'Seek Other Settlements',
    description: 'Make contact with another settlement. The more allies the better.',
    targetId: 0,
    targetCount: 1,
    reward: { xp: 70, gold: 30 },
  },
]

const CRAFT_TEMPLATES: QuestTemplate[] = [
  {
    type: 'craft',
    title: 'Craft a Stone Axe',
    description: 'We need tools. Craft a stone axe for the settlement.',
    targetId: 4,
    targetCount: 1,
    reward: { xp: 40, gold: 15 },
  },
  {
    type: 'craft',
    title: 'Craft Food',
    description: 'Cook something edible. Any cooked food will help the settlement.',
    targetId: 0,
    targetCount: 1,
    reward: { xp: 40, gold: 18 },
  },
]

const ALL_TEMPLATES = [
  ...GATHER_TEMPLATES,
  ...HUNT_TEMPLATES,
  ...EXPLORE_TEMPLATES,
  ...CRAFT_TEMPLATES,
]

// ── Quest generation ──────────────────────────────────────────────────────────

export function generateSettlementQuests(settlementId: number, settlementName: string): BoardQuest[] {
  const rand = seededRand(settlementId * 31337 + 7)
  // Pick 3-5 quests
  const count = 3 + Math.floor(rand() * 3) // 3, 4, or 5
  const shuffled = [...ALL_TEMPLATES].sort(() => rand() - 0.5)
  const selected = shuffled.slice(0, count)

  return selected.map((tmpl, i) => ({
    id: `sq_${settlementId}_${i}`,
    settlementId,
    settlementName,
    title: tmpl.title,
    description: tmpl.description,
    type: tmpl.type,
    targetId: tmpl.targetId,
    targetCount: tmpl.targetCount,
    reward: { ...tmpl.reward },
    accepted: false,
    progress: 0,
    completed: false,
  }))
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface SettlementQuestState {
  /** All quests ever generated, keyed by quest id */
  quests: Record<string, BoardQuest>

  /** Generate quests for a settlement (no-op if already generated) */
  ensureSettlementQuests: (settlementId: number, settlementName: string) => void

  /** Get available (not yet accepted) quests for a settlement */
  getAvailableQuests: (settlementId: number) => BoardQuest[]

  /** Get all accepted (but not completed) quests across all settlements */
  getActiveQuests: () => BoardQuest[]

  /** Accept a quest — moves it from Available to Active */
  acceptQuest: (questId: string) => void

  /** Abandon an active quest — puts it back as available */
  abandonQuest: (questId: string) => void

  /** Increment progress on a quest */
  updateProgress: (questId: string, amount: number) => void

  /** Mark a quest as completed */
  completeQuest: (questId: string) => void
}

export const useSettlementQuestStore = create<SettlementQuestState>((set, get) => ({
  quests: {},

  ensureSettlementQuests: (settlementId, settlementName) => {
    const existing = Object.values(get().quests).some(q => q.settlementId === settlementId)
    if (existing) return
    const generated = generateSettlementQuests(settlementId, settlementName)
    set((s) => {
      const next = { ...s.quests }
      for (const q of generated) next[q.id] = q
      return { quests: next }
    })
  },

  getAvailableQuests: (settlementId) => {
    return Object.values(get().quests).filter(
      q => q.settlementId === settlementId && !q.accepted && !q.completed
    )
  },

  getActiveQuests: () => {
    return Object.values(get().quests).filter(q => q.accepted && !q.completed)
  },

  acceptQuest: (questId) => {
    set((s) => {
      const q = s.quests[questId]
      if (!q || q.accepted || q.completed) return s
      return { quests: { ...s.quests, [questId]: { ...q, accepted: true } } }
    })
  },

  abandonQuest: (questId) => {
    set((s) => {
      const q = s.quests[questId]
      if (!q) return s
      return { quests: { ...s.quests, [questId]: { ...q, accepted: false, progress: 0 } } }
    })
  },

  updateProgress: (questId, amount) => {
    set((s) => {
      const q = s.quests[questId]
      if (!q || !q.accepted || q.completed) return s
      const newProgress = Math.min(q.progress + amount, q.targetCount)
      return { quests: { ...s.quests, [questId]: { ...q, progress: newProgress } } }
    })
  },

  completeQuest: (questId) => {
    set((s) => {
      const q = s.quests[questId]
      if (!q) return s
      return { quests: { ...s.quests, [questId]: { ...q, completed: true, accepted: false } } }
    })
  },
}))
