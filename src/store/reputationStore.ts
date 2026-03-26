// ── reputationStore.ts ────────────────────────────────────────────────────────
// M42 Track C: Per-settlement reputation system.
// Tracks player standing with each settlement, with tiers and unlock bonuses.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ReputationTier = 'hostile' | 'neutral' | 'friendly' | 'honored' | 'revered'

export interface SettlementReputation {
  settlementId: number
  settlementName: string
  points: number   // -1000 to 1000
  tier: ReputationTier
}

// Tier thresholds — points needed to reach this tier
export const REP_THRESHOLDS: Record<ReputationTier, number> = {
  hostile:  -100,
  neutral:    0,
  friendly:  200,
  honored:   500,
  revered:   800,
}

export interface ReputationBonus {
  tradeDiscount: number
  questXpBonus: number
  canAccessBuildings: boolean
  gatesOpen: boolean
}

function calcTier(points: number): ReputationTier {
  if (points >= REP_THRESHOLDS.revered)  return 'revered'
  if (points >= REP_THRESHOLDS.honored)  return 'honored'
  if (points >= REP_THRESHOLDS.friendly) return 'friendly'
  if (points >= REP_THRESHOLDS.neutral)  return 'neutral'
  return 'hostile'
}

interface ReputationState {
  settlements: Record<number, SettlementReputation>

  getReputation: (settlementId: number) => SettlementReputation | null
  getTier: (settlementId: number) => ReputationTier
  addPoints: (settlementId: number, settlementName: string, points: number) => void
}

export const useReputationStore = create<ReputationState>()(
  persist(
    (set, get) => ({
      settlements: {},

      getReputation(settlementId) {
        return get().settlements[settlementId] ?? null
      },

      getTier(settlementId) {
        return get().settlements[settlementId]?.tier ?? 'neutral'
      },

      addPoints(settlementId, settlementName, points) {
        const existing = get().settlements[settlementId]
        const oldPoints = existing?.points ?? 0
        const oldTier   = existing?.tier ?? calcTier(oldPoints)

        const newPoints = Math.max(-1000, Math.min(1000, oldPoints + points))
        const newTier   = calcTier(newPoints)

        set(state => ({
          settlements: {
            ...state.settlements,
            [settlementId]: {
              settlementId,
              settlementName,
              points: newPoints,
              tier: newTier,
            },
          },
        }))

        // Dispatch tier-change events
        if (newTier !== oldTier) {
          const TIER_ORDER: ReputationTier[] = ['hostile', 'neutral', 'friendly', 'honored', 'revered']
          const oldIdx = TIER_ORDER.indexOf(oldTier)
          const newIdx = TIER_ORDER.indexOf(newTier)
          const eventName = newIdx > oldIdx ? 'reputation-tier-up' : 'reputation-tier-down'
          window.dispatchEvent(
            new CustomEvent(eventName, {
              detail: { settlementName, tier: newTier },
            })
          )
        }
      },
    }),
    {
      name: 'universe-sim-reputation',
    }
  )
)

// ── Reputation unlock bonuses ─────────────────────────────────────────────────

export function getReputationBonus(settlementId: number): ReputationBonus {
  const tier = useReputationStore.getState().getTier(settlementId)

  switch (tier) {
    case 'revered':
      return { tradeDiscount: 0.20, questXpBonus: 0.50, canAccessBuildings: true,  gatesOpen: true }
    case 'honored':
      return { tradeDiscount: 0.10, questXpBonus: 0.25, canAccessBuildings: true,  gatesOpen: true }
    case 'friendly':
      return { tradeDiscount: 0.05, questXpBonus: 0.10, canAccessBuildings: true,  gatesOpen: true }
    case 'neutral':
      return { tradeDiscount: 0.00, questXpBonus: 0.00, canAccessBuildings: true,  gatesOpen: true }
    case 'hostile':
    default:
      return { tradeDiscount: 0.00, questXpBonus: 0.00, canAccessBuildings: false, gatesOpen: false }
  }
}
