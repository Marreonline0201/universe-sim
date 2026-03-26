// M57 Track A: Achievement Showcase — milestone tracking with gold/XP rewards

import { usePlayerStatsStore } from '../store/playerStatsStore'
import { usePlayerStore } from '../store/playerStore'
import { skillSystem } from './SkillSystem'
import type { SkillId } from './SkillSystem'

export interface ShowcaseMilestone {
  id: string
  title: string
  description: string
  icon: string
  requirement: { stat: string; value: number }
  reward: { gold: number; xp: number; skill?: string }
  claimed: boolean
  unlocked: boolean
}

const MILESTONES: ShowcaseMilestone[] = [
  { id: 'first_blood',    title: 'First Blood',    description: 'Slay your first enemy',    icon: '⚔️',  requirement: { stat: 'killCount',           value: 1    }, reward: { gold: 20,  xp: 50  },            claimed: false, unlocked: false },
  { id: 'hunter',         title: 'Hunter',         description: 'Slay 25 enemies',          icon: '🗡',  requirement: { stat: 'killCount',           value: 25   }, reward: { gold: 75,  xp: 150, skill: 'combat' }, claimed: false, unlocked: false },
  { id: 'warrior',        title: 'Warrior',        description: 'Slay 100 enemies',         icon: '⚔️',  requirement: { stat: 'killCount',           value: 100  }, reward: { gold: 200, xp: 500, skill: 'combat' }, claimed: false, unlocked: false },
  { id: 'gatherer',       title: 'Gatherer',       description: 'Gather 10 resources',      icon: '🌿',  requirement: { stat: 'resourcesGathered',   value: 10   }, reward: { gold: 15,  xp: 30  },            claimed: false, unlocked: false },
  { id: 'forager',        title: 'Forager',        description: 'Gather 100 resources',     icon: '🪵',  requirement: { stat: 'resourcesGathered',   value: 100  }, reward: { gold: 60,  xp: 120, skill: 'gathering' }, claimed: false, unlocked: false },
  { id: 'explorer',       title: 'Explorer',       description: 'Travel 1000m',             icon: '🗺️',  requirement: { stat: 'distanceTraveled',    value: 1000 }, reward: { gold: 30,  xp: 80  },            claimed: false, unlocked: false },
  { id: 'wanderer',       title: 'Wanderer',       description: 'Travel 10000m',            icon: '🧭',  requirement: { stat: 'distanceTraveled',    value: 10000 }, reward: { gold: 100, xp: 300, skill: 'exploration' }, claimed: false, unlocked: false },
  { id: 'crafter',        title: 'Crafter',        description: 'Craft 5 items',            icon: '⚒️',  requirement: { stat: 'itemsCrafted',        value: 5    }, reward: { gold: 25,  xp: 60  },            claimed: false, unlocked: false },
  { id: 'artisan',        title: 'Artisan',        description: 'Craft 50 items',           icon: '🔨',  requirement: { stat: 'itemsCrafted',        value: 50   }, reward: { gold: 100, xp: 250, skill: 'crafting' }, claimed: false, unlocked: false },
  { id: 'diplomat',       title: 'Diplomat',       description: 'Visit 3 settlements',      icon: '🏘️',  requirement: { stat: 'settlementsDiscovered', value: 3  }, reward: { gold: 50,  xp: 100 },            claimed: false, unlocked: false },
  { id: 'world_traveler', title: 'World Traveler', description: 'Visit 8 settlements',      icon: '🌍',  requirement: { stat: 'settlementsDiscovered', value: 8  }, reward: { gold: 150, xp: 400, skill: 'exploration' }, claimed: false, unlocked: false },
  { id: 'survivor',       title: 'Survivor',       description: 'Earn 500 gold total',      icon: '❤️',  requirement: { stat: 'totalGoldEarned',     value: 500  }, reward: { gold: 100, xp: 200, skill: 'survival' }, claimed: false, unlocked: false },
]

let _milestones: ShowcaseMilestone[] = []
let _initialized = false

export function initAchievementShowcase(): void {
  if (_initialized) return
  _initialized = true
  _milestones = MILESTONES.map(m => ({ ...m, reward: { ...m.reward } }))
}

export function getMilestones(): ShowcaseMilestone[] {
  return _milestones.map(m => ({ ...m, reward: { ...m.reward } }))
}

export function checkAndUpdateMilestones(): void {
  if (!_initialized) return
  const stats = usePlayerStatsStore.getState().stats as unknown as Record<string, number>

  for (const m of _milestones) {
    if (m.unlocked) continue
    const statValue = stats[m.requirement.stat] ?? 0
    if (statValue >= m.requirement.value) {
      m.unlocked = true
      window.dispatchEvent(new CustomEvent('milestone-unlocked', { detail: { milestone: { ...m, reward: { ...m.reward } } } }))
    }
  }
}

export function claimMilestone(id: string): boolean {
  const m = _milestones.find(ms => ms.id === id)
  if (!m || !m.unlocked || m.claimed) return false

  // Award gold
  usePlayerStore.getState().addGold(m.reward.gold)

  // Award skill XP — use specified skill or fall back to 'survival' as general XP
  skillSystem.addXp((m.reward.skill ?? 'survival') as SkillId, m.reward.xp)

  m.claimed = true
  window.dispatchEvent(new CustomEvent('milestone-claimed', { detail: { milestone: { ...m, reward: { ...m.reward } } } }))
  return true
}

export function serializeMilestones(): string {
  return JSON.stringify(
    _milestones.map(m => ({ id: m.id, unlocked: m.unlocked, claimed: m.claimed }))
  )
}

export function deserializeMilestones(data: string): void {
  if (!data) return
  try {
    const saved: Array<{ id: string; unlocked: boolean; claimed: boolean }> = JSON.parse(data)
    for (const entry of saved) {
      const m = _milestones.find(ms => ms.id === entry.id)
      if (m) {
        m.unlocked = entry.unlocked ?? false
        m.claimed  = entry.claimed  ?? false
      }
    }
  } catch {
    // corrupted data — silently ignore
  }
}
