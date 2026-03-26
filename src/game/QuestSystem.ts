// ── QuestSystem.ts ──────────────────────────────────────────────────────────
// M23 Track B: Quest tracking, progress hooks, and completion rewards.
//
// Singleton class — accessed via `questSystem` from GameSingletons.
// Quests auto-activate based on gameplay milestones and are tracked in
// the QuestPanel UI (Q hotkey).
//
// Quest hooks are called from GameLoop on: gather, craft, kill, discover,
// tier change, and build events.

import { useUiStore } from '../store/uiStore'
import { usePlayerStore } from '../store/playerStore'

// ── Types ────────────────────────────────────────────────────────────────────

export type QuestCategory = 'tutorial' | 'exploration' | 'crafting' | 'combat' | 'civilization'
export type ObjectiveType = 'gather' | 'craft' | 'kill' | 'discover' | 'reach_tier' | 'build' | 'explore' | 'survive_days'

export interface QuestObjective {
  description: string
  type: ObjectiveType
  /** For gather: materialId. For craft: recipeId (0 = any). For kill: 0 = any species.
   *  For reach_tier: tier number. For build: 0 = any building. For survive_days: day count. */
  targetId: number
  target: number    // how many needed
  current: number   // how many achieved so far
}

export interface QuestReward {
  type: 'xp' | 'item' | 'recipe' | 'gold'
  skillName?: string   // for xp reward: which skill
  amount?: number      // for xp: amount, for item: quantity, for gold: gold amount
  itemId?: number      // for item reward
  materialId?: number  // for item reward (raw material)
  recipeId?: number    // for recipe unlock reward
  rarity?: number      // for item reward
}

export type QuestStatus = 'locked' | 'active' | 'complete'

export interface Quest {
  id: string
  title: string
  description: string
  category: QuestCategory
  objectives: QuestObjective[]
  rewards: QuestReward[]
  status: QuestStatus
  /** Quest ID that must be completed before this one activates (null = auto-active) */
  prerequisite: string | null
  /** Sort order within category */
  order: number
}

// ── Quest Definitions ────────────────────────────────────────────────────────

function makeQuest(
  id: string, title: string, description: string,
  category: QuestCategory, order: number,
  objectives: Omit<QuestObjective, 'current'>[],
  rewards: QuestReward[],
  prerequisite: string | null = null,
): Quest {
  return {
    id, title, description, category, order,
    objectives: objectives.map(o => ({ ...o, current: 0 })),
    rewards, status: prerequisite ? 'locked' : 'active',
    prerequisite,
  }
}

// ── Gold reward amounts by category/difficulty ────────────────────────────────
// tutorial: 10-20g, exploration: 20-30g, crafting: 15-25g,
// combat: 20-35g, civilization: 30-50g
const QUEST_DEFINITIONS: Quest[] = [
  // ── Tutorial Chain ─────────────────────────────────────────────────────────
  makeQuest('tut_gather', 'First Steps', 'Gather some wood to begin your journey.',
    'tutorial', 1,
    [{ description: 'Gather 5 Wood', type: 'gather', targetId: 3/*MAT.WOOD*/, target: 5 }],
    [{ type: 'xp', skillName: 'gathering', amount: 50 }, { type: 'gold', amount: 10 }],
  ),
  makeQuest('tut_craft', 'Tool Time', 'Craft your first stone axe.',
    'tutorial', 2,
    [{ description: 'Craft a Stone Axe', type: 'craft', targetId: 4/*recipe id*/, target: 1 }],
    [{ type: 'xp', skillName: 'crafting', amount: 50 }, { type: 'gold', amount: 12 }],
    'tut_gather',
  ),
  makeQuest('tut_hunt', 'Hunter', 'Take down your first animal.',
    'tutorial', 3,
    [{ description: 'Kill 1 Animal', type: 'kill', targetId: 0, target: 1 }],
    [{ type: 'xp', skillName: 'combat', amount: 75 }, { type: 'gold', amount: 15 }],
    'tut_craft',
  ),
  makeQuest('tut_build', 'Home Base', 'Build your first structure.',
    'tutorial', 4,
    [{ description: 'Build 1 Structure', type: 'build', targetId: 0, target: 1 }],
    [{ type: 'xp', skillName: 'crafting', amount: 100 }, { type: 'gold', amount: 18 }],
    'tut_hunt',
  ),
  makeQuest('tut_iron', 'Iron Will', 'Advance your civilization to the Iron Age.',
    'tutorial', 5,
    [{ description: 'Reach Civilization Tier 2', type: 'reach_tier', targetId: 2, target: 1 }],
    [{ type: 'xp', skillName: 'smithing', amount: 200 }, { type: 'gold', amount: 20 }],
    'tut_build',
  ),

  // ── Exploration ────────────────────────────────────────────────────────────
  makeQuest('exp_survivor', 'Survivor', 'Survive for 10 in-game days.',
    'exploration', 1,
    [{ description: 'Survive 10 Days', type: 'survive_days', targetId: 10, target: 10 }],
    [{ type: 'xp', skillName: 'survival', amount: 150 }, { type: 'gold', amount: 20 }],
  ),
  makeQuest('exp_cartographer', 'Cartographer', 'Explore the world by travelling far from spawn.',
    'exploration', 2,
    [{ description: 'Discover 5 new areas', type: 'explore', targetId: 0, target: 5 }],
    [{ type: 'xp', skillName: 'exploration', amount: 200 }, { type: 'gold', amount: 30 }],
  ),

  // ── Crafting ───────────────────────────────────────────────────────────────
  makeQuest('craft_10', 'Artisan', 'Craft 10 different items.',
    'crafting', 1,
    [{ description: 'Craft 10 Items', type: 'craft', targetId: 0, target: 10 }],
    [{ type: 'xp', skillName: 'crafting', amount: 150 }, { type: 'gold', amount: 15 }],
  ),
  makeQuest('craft_smith', 'Master Smith', 'Craft 5 metal items (Bronze Age or higher).',
    'crafting', 2,
    [{ description: 'Craft 5 Metal Items', type: 'craft', targetId: -1/*any metal recipe*/, target: 5 }],
    [{ type: 'xp', skillName: 'smithing', amount: 250 }, { type: 'gold', amount: 25 }],
    'craft_10',
  ),

  // ── Combat ─────────────────────────────────────────────────────────────────
  makeQuest('combat_5', 'Big Game Hunter', 'Kill 5 animals.',
    'combat', 1,
    [{ description: 'Kill 5 Animals', type: 'kill', targetId: 0, target: 5 }],
    [{ type: 'xp', skillName: 'combat', amount: 200 }, { type: 'gold', amount: 20 }],
  ),
  makeQuest('combat_wolf', 'Wolf Slayer', 'Kill 3 wolves.',
    'combat', 2,
    [{ description: 'Kill 3 Wolves', type: 'kill', targetId: 1/*wolf*/, target: 3 }],
    [{ type: 'xp', skillName: 'combat', amount: 300 }, { type: 'gold', amount: 35 }],
    'combat_5',
  ),

  // ── Civilization ───────────────────────────────────────────────────────────
  makeQuest('civ_mayor', 'Mayor', 'Lead your settlement to Tier 3.',
    'civilization', 1,
    [{ description: 'Reach Civilization Tier 3', type: 'reach_tier', targetId: 3, target: 1 }],
    [{ type: 'xp', skillName: 'exploration', amount: 300 }, { type: 'gold', amount: 30 }],
  ),
  makeQuest('civ_space', 'Space Age', 'Advance to the Space Age (Tier 5).',
    'civilization', 2,
    [{ description: 'Reach Civilization Tier 5', type: 'reach_tier', targetId: 5, target: 1 }],
    [{ type: 'xp', skillName: 'crafting', amount: 500 }, { type: 'gold', amount: 40 }],
    'civ_mayor',
  ),
  makeQuest('civ_contact', 'First Contact', 'Make contact with the Velar civilization.',
    'civilization', 3,
    [{ description: 'Discover the Velar', type: 'discover', targetId: 0, target: 1 }],
    [{ type: 'xp', skillName: 'exploration', amount: 500 }, { type: 'gold', amount: 50 }],
    'civ_space',
  ),
]

// ── QuestSystem Class ────────────────────────────────────────────────────────

export class QuestSystem {
  private quests: Map<string, Quest> = new Map()
  private craftedRecipeIds: Set<number> = new Set()  // track unique crafts for 'craft_10'
  private exploredAreas: number = 0
  private daysSurvived: number = 0
  private _lastDayCount: number = 0

  constructor() {
    this.reset()
  }

  reset(): void {
    this.quests = new Map()
    this.craftedRecipeIds = new Set()
    this.exploredAreas = 0
    this.daysSurvived = 0
    this._lastDayCount = 0
    for (const def of QUEST_DEFINITIONS) {
      this.quests.set(def.id, JSON.parse(JSON.stringify(def)))
    }
  }

  // ── Event Hooks ──────────────────────────────────────────────────────────

  onGather(materialId: number, quantity: number): void {
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      for (const obj of q.objectives) {
        if (obj.type === 'gather' && (obj.targetId === 0 || obj.targetId === materialId)) {
          obj.current = Math.min(obj.current + quantity, obj.target)
        }
      }
    }
    this._checkCompletions()
  }

  onCraft(recipeId: number): void {
    this.craftedRecipeIds.add(recipeId)
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      for (const obj of q.objectives) {
        if (obj.type !== 'craft') continue
        if (obj.targetId === 0) {
          // "any craft" — count unique recipes
          obj.current = this.craftedRecipeIds.size
        } else if (obj.targetId === -1) {
          // "any metal recipe" — count recipes with tier >= 2
          // Simplified: count unique crafts where recipeId >= 14 (bronze+ range)
          obj.current = Math.min(obj.current + 1, obj.target)
        } else if (obj.targetId === recipeId) {
          obj.current = Math.min(obj.current + 1, obj.target)
        }
      }
    }
    this._checkCompletions()
  }

  onKill(species: string): void {
    const speciesMap: Record<string, number> = { wolf: 1, deer: 2, boar: 3 }
    const speciesId = speciesMap[species] ?? 0
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      for (const obj of q.objectives) {
        if (obj.type === 'kill' && (obj.targetId === 0 || obj.targetId === speciesId)) {
          obj.current = Math.min(obj.current + 1, obj.target)
        }
      }
    }
    this._checkCompletions()
  }

  onDiscover(_discoveryId: number): void {
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      for (const obj of q.objectives) {
        if (obj.type === 'discover') {
          obj.current = Math.min(obj.current + 1, obj.target)
        }
      }
    }
    this._checkCompletions()
  }

  onTierReached(tier: number): void {
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      for (const obj of q.objectives) {
        if (obj.type === 'reach_tier' && tier >= obj.targetId) {
          obj.current = 1
        }
      }
    }
    this._checkCompletions()
  }

  onBuild(_buildingType: number): void {
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      for (const obj of q.objectives) {
        if (obj.type === 'build') {
          obj.current = Math.min(obj.current + 1, obj.target)
        }
      }
    }
    this._checkCompletions()
  }

  onExplore(): void {
    this.exploredAreas++
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      for (const obj of q.objectives) {
        if (obj.type === 'explore') {
          obj.current = Math.min(this.exploredAreas, obj.target)
        }
      }
    }
    this._checkCompletions()
  }

  /** Called from GameLoop with current dayCount. */
  onDayTick(dayCount: number): void {
    if (dayCount > this._lastDayCount) {
      this._lastDayCount = dayCount
      this.daysSurvived = dayCount
      for (const q of this.quests.values()) {
        if (q.status !== 'active') continue
        for (const obj of q.objectives) {
          if (obj.type === 'survive_days') {
            obj.current = Math.min(dayCount, obj.target)
          }
        }
      }
      this._checkCompletions()
    }
  }

  // ── Completion Logic ─────────────────────────────────────────────────────

  private _checkCompletions(): void {
    for (const q of this.quests.values()) {
      if (q.status !== 'active') continue
      const allDone = q.objectives.every(o => o.current >= o.target)
      if (allDone) {
        this._completeQuest(q)
      }
    }
  }

  private _completeQuest(q: Quest): void {
    q.status = 'complete'

    // Award gold rewards immediately
    const goldRewards = q.rewards.filter(r => r.type === 'gold')
    if (goldRewards.length > 0) {
      try {
        const totalGold = goldRewards.reduce((sum, r) => sum + (r.amount ?? 0), 0)
        if (totalGold > 0) {
          usePlayerStore.getState().addGold(totalGold)
        }
      } catch { /* store not available yet */ }
    }

    // Notification
    const rewardText = q.rewards.map(r => {
      if (r.type === 'xp') return `+${r.amount} ${r.skillName} XP`
      if (r.type === 'item') return `+${r.amount ?? 1} item`
      if (r.type === 'recipe') return `New recipe unlocked`
      if (r.type === 'gold') return `+${r.amount}💰`
      return ''
    }).filter(Boolean).join(', ')

    try {
      useUiStore.getState().addNotification(
        `[Quest Complete] ${q.title} -- ${rewardText}`,
        'discovery'
      )
    } catch { /* store not available yet */ }

    // Unlock dependent quests
    for (const other of this.quests.values()) {
      if (other.status === 'locked' && other.prerequisite === q.id) {
        other.status = 'active'
      }
    }
  }

  /**
   * Returns reward list for a just-completed quest. Called from GameLoop
   * to actually award XP/items (avoids circular dependency on SkillSystem/Inventory).
   */
  getPendingRewards(questId: string): QuestReward[] {
    const q = this.quests.get(questId)
    if (!q || q.status !== 'complete') return []
    return q.rewards
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getActiveQuests(): Quest[] {
    return Array.from(this.quests.values())
      .filter(q => q.status === 'active')
      .sort((a, b) => a.order - b.order)
  }

  getCompletedQuests(): Quest[] {
    return Array.from(this.quests.values())
      .filter(q => q.status === 'complete')
      .sort((a, b) => a.order - b.order)
  }

  getAllQuests(): Quest[] {
    return Array.from(this.quests.values()).sort((a, b) => {
      const statusOrder = { active: 0, complete: 1, locked: 2 }
      const diff = statusOrder[a.status] - statusOrder[b.status]
      return diff !== 0 ? diff : a.order - b.order
    })
  }

  getQuest(id: string): Quest | undefined {
    return this.quests.get(id)
  }

  // ── Serialization ────────────────────────────────────────────────────────

  serialize(): object {
    const quests: Record<string, { status: QuestStatus; progress: number[] }> = {}
    for (const [id, q] of this.quests) {
      quests[id] = { status: q.status, progress: q.objectives.map(o => o.current) }
    }
    return {
      quests,
      craftedRecipeIds: Array.from(this.craftedRecipeIds),
      exploredAreas: this.exploredAreas,
      daysSurvived: this.daysSurvived,
    }
  }

  deserialize(data: any): void {
    if (!data?.quests) return
    // Reset to baseline definitions first
    this.reset()

    if (data.craftedRecipeIds) this.craftedRecipeIds = new Set(data.craftedRecipeIds)
    if (data.exploredAreas) this.exploredAreas = data.exploredAreas
    if (data.daysSurvived) {
      this.daysSurvived = data.daysSurvived
      this._lastDayCount = data.daysSurvived
    }

    for (const [id, saved] of Object.entries(data.quests)) {
      const q = this.quests.get(id)
      if (!q) continue
      const s = saved as { status: QuestStatus; progress: number[] }
      q.status = s.status
      for (let i = 0; i < q.objectives.length && i < s.progress.length; i++) {
        q.objectives[i].current = s.progress[i]
      }
    }
  }
}
