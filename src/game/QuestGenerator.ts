// ── QuestGenerator.ts ────────────────────────────────────────────────────────
// M45 Track B: Dynamic quest generation from templates.
// Generates quests scaled to a settlement's civLevel (tier).
// Unlike the static seeded quests in settlementQuestStore, these are freshly
// generated on-demand and can be added to the board at any time.

import type { BoardQuest, BoardQuestType } from '../store/settlementQuestStore'
import { MAT } from '../player/Inventory'

// ── Template type ─────────────────────────────────────────────────────────────

export interface QuestTemplate {
  type: BoardQuestType
  /** Generates a title scaled to tier (civLevel) */
  titleFn: (tier: number) => string
  /** Generates a description scaled to tier */
  descFn: (tier: number) => string
  /** Goal count scaled to tier */
  goalFn: (tier: number) => number
  /** Rewards scaled to tier */
  rewardFn: (tier: number) => { gold: number; xp: number }
  /** MAT id for gather quests, 0 for hunt/explore */
  targetId: number
}

// ── Quest templates ───────────────────────────────────────────────────────────

export const QUEST_TEMPLATES: QuestTemplate[] = [
  // Gather: wood
  {
    type: 'gather',
    titleFn: (tier) => tier >= 3 ? 'Lumber Supply Contract' : 'Gather Timber',
    descFn: (tier) => {
      const n = 10 + tier * 5
      return `The settlement needs ${n} wood for construction. Gather timber from nearby trees.`
    },
    goalFn: (tier) => 10 + tier * 5,
    rewardFn: (tier) => ({ gold: 20 + tier * 10, xp: 50 + tier * 25 }),
    targetId: MAT.WOOD,
  },
  // Gather: stone
  {
    type: 'gather',
    titleFn: (tier) => tier >= 3 ? 'Quarry Stone Order' : 'Collect Stone Blocks',
    descFn: (tier) => {
      const n = 8 + tier * 4
      return `Deliver ${n} stone blocks to the settlement for road and wall repairs.`
    },
    goalFn: (tier) => 8 + tier * 4,
    rewardFn: (tier) => ({ gold: 18 + tier * 9, xp: 45 + tier * 22 }),
    targetId: MAT.STONE,
  },
  // Gather: food (cooked meat)
  {
    type: 'gather',
    titleFn: (tier) => tier >= 2 ? 'Provision the Larder' : 'Supply Food Rations',
    descFn: (tier) => {
      const n = 5 + tier * 3
      return `Food stores are critically low. Supply ${n} cooked meat rations to the settlement.`
    },
    goalFn: (tier) => 5 + tier * 3,
    rewardFn: (tier) => ({ gold: 15 + tier * 8, xp: 40 + tier * 20 }),
    targetId: MAT.COOKED_MEAT,
  },
  // Hunt: wolves
  {
    type: 'hunt',
    titleFn: (tier) => tier >= 3 ? 'Wolf Eradication Order' : 'Hunt Wolves Near the Settlement',
    descFn: (tier) => {
      const n = 2 + tier
      return `Wolves have been preying on livestock and settlers. Hunt ${n} wolves near the settlement.`
    },
    goalFn: (tier) => 2 + tier,
    rewardFn: (tier) => ({ gold: 30 + tier * 15, xp: 70 + tier * 35 }),
    targetId: 0,
  },
  // Hunt: bandits
  {
    type: 'hunt',
    titleFn: (tier) => tier >= 3 ? 'Bandit Suppression Campaign' : 'Eliminate Nearby Bandits',
    descFn: (tier) => {
      const n = 3 + tier
      return `A bandit camp has formed nearby. Eliminate ${n} bandits threatening our trade routes.`
    },
    goalFn: (tier) => 3 + tier,
    rewardFn: (tier) => ({ gold: 40 + tier * 20, xp: 90 + tier * 45 }),
    targetId: 0,
  },
  // Explore: caves
  {
    type: 'explore',
    titleFn: (tier) => tier >= 3 ? 'Cartographic Survey' : 'Map Cave Systems',
    descFn: (tier) => {
      const n = 1 + Math.floor(tier / 2)
      return `Map ${n} cave system${n > 1 ? 's' : ''} in the region. The settlement needs to know what lurks underground.`
    },
    goalFn: (tier) => 1 + Math.floor(tier / 2),
    rewardFn: (tier) => ({ gold: 25 + tier * 12, xp: 60 + tier * 30 }),
    targetId: 0,
  },
  // Gather: iron ingots
  {
    type: 'gather',
    titleFn: (tier) => tier >= 3 ? 'Iron Ingot Requisition' : 'Bring Iron to the Blacksmith',
    descFn: (tier) => {
      const n = 3 + tier * 2
      return `Our blacksmith is running low. Bring ${n} iron ingots to the settlement forge.`
    },
    goalFn: (tier) => 3 + tier * 2,
    rewardFn: (tier) => ({ gold: 35 + tier * 18, xp: 80 + tier * 40 }),
    targetId: MAT.IRON_INGOT,
  },
  // Gather: herbs (mushrooms as medicinal herbs)
  {
    type: 'gather',
    titleFn: (tier) => tier >= 2 ? 'Medicinal Supply Run' : 'Collect Medicinal Herbs',
    descFn: (tier) => {
      const n = 6 + tier * 3
      return `The settlement healer needs supplies. Collect ${n} mushrooms from caves and forests for medicinal use.`
    },
    goalFn: (tier) => 6 + tier * 3,
    rewardFn: (tier) => ({ gold: 22 + tier * 11, xp: 55 + tier * 27 }),
    targetId: MAT.MUSHROOM,
  },
]

// ── Generator function ────────────────────────────────────────────────────────

/**
 * Generate `count` random quests for a settlement using the template system.
 * Quest rewards and goals scale with civLevel (used as tier).
 */
export function generateQuestsForSettlement(
  settlementId: number,
  settlementName: string,
  civLevel: number,
  count: number,
): BoardQuest[] {
  const tier = Math.max(0, civLevel)
  // Shuffle templates with Math.random and pick `count`
  const shuffled = [...QUEST_TEMPLATES].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(count, shuffled.length))
  const now = Date.now()

  return selected.map((tmpl, i): BoardQuest => ({
    id: `gen_${settlementId}_${now}_${i}`,
    settlementId,
    settlementName,
    title: tmpl.titleFn(tier),
    description: tmpl.descFn(tier),
    type: tmpl.type,
    targetId: tmpl.targetId,
    targetCount: tmpl.goalFn(tier),
    reward: { xp: tmpl.rewardFn(tier).xp, gold: tmpl.rewardFn(tier).gold },
    accepted: false,
    progress: 0,
    completed: false,
  }))
}
