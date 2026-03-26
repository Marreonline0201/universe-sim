// ── civStore.ts ─────────────────────────────────────────────────────────────────
// M39 Track C: Civilization Progression System
// Tracks overall civilization level across all settlements.

import { create } from 'zustand'

export type CivLevel =
  | 'stone_age'
  | 'iron_age'
  | 'medieval'
  | 'renaissance'
  | 'industrial'
  | 'advanced'

export interface CivState {
  /** Sum of all settlement tiers across the world */
  totalTier: number
  /** Current civilization age label */
  civLevel: CivLevel
  /** Completed milestone IDs */
  milestones: string[]
  /** Next milestone to reach (null if all milestones done) */
  nextMilestone: string | null
  /** Pending civ-level-up announcement (shown as full-width banner) */
  pendingLevelUp: CivLevel | null

  setTotalTier: (tier: number) => void
  addMilestone: (id: string) => void
  dismissLevelUp: () => void
}

// CivLevel thresholds — totalTier across all settlements
export const CIV_THRESHOLDS: Record<CivLevel, number> = {
  stone_age:   0,
  iron_age:    5,
  medieval:    10,
  renaissance: 15,
  industrial:  20,
  advanced:    25,
}

export const CIV_LEVEL_LABELS: Record<CivLevel, string> = {
  stone_age:   'Stone Age',
  iron_age:    'Iron Age',
  medieval:    'Medieval',
  renaissance: 'Renaissance',
  industrial:  'Industrial',
  advanced:    'Advanced',
}

export const CIV_LEVEL_ICONS: Record<CivLevel, string> = {
  stone_age:   '\u26CF',   // pick
  iron_age:    '\u2692',   // hammer and pick
  medieval:    '\u26EA',   // castle/church
  renaissance: '\uD83C\uDFDB', // classical building
  industrial:  '\u2699',   // gear
  advanced:    '\uD83D\uDE80', // rocket
}

// Ordered list for iteration
export const CIV_LEVELS: CivLevel[] = [
  'stone_age', 'iron_age', 'medieval', 'renaissance', 'industrial', 'advanced',
]

export function getCivLevelFromTier(totalTier: number): CivLevel {
  let result: CivLevel = 'stone_age'
  for (const level of CIV_LEVELS) {
    if (totalTier >= CIV_THRESHOLDS[level]) result = level
  }
  return result
}

export function getNextCivLevel(current: CivLevel): CivLevel | null {
  const idx = CIV_LEVELS.indexOf(current)
  if (idx < 0 || idx >= CIV_LEVELS.length - 1) return null
  return CIV_LEVELS[idx + 1]
}

// Milestone IDs that fire at each civ level
export const CIV_MILESTONE_MAP: Partial<Record<CivLevel, string>> = {
  iron_age:    'iron_tools',
  medieval:    'merchant_guilds',
  renaissance: 'knowledge_spreads',
  industrial:  'steam_power',
  advanced:    'age_of_exploration',
}

export const useCivStore = create<CivState>((set, get) => ({
  totalTier:       0,
  civLevel:        'stone_age',
  milestones:      [],
  nextMilestone:   'iron_tools',
  pendingLevelUp:  null,

  setTotalTier: (tier) => {
    const prev    = get().civLevel
    const next    = getCivLevelFromTier(tier)
    const levelUp = next !== prev ? next : null

    // Determine next milestone
    const nextLevel = getNextCivLevel(next)
    const nextMs    = nextLevel ? (CIV_MILESTONE_MAP[nextLevel] ?? null) : null

    set(state => ({
      totalTier:      tier,
      civLevel:       next,
      pendingLevelUp: levelUp ?? state.pendingLevelUp,
      nextMilestone:  nextMs,
    }))
  },

  addMilestone: (id) => {
    set(state => ({
      milestones: state.milestones.includes(id)
        ? state.milestones
        : [...state.milestones, id],
    }))
  },

  dismissLevelUp: () => set({ pendingLevelUp: null }),
}))
