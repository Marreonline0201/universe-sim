// ── CivMilestoneSystem.ts ───────────────────────────────────────────────────────
// M39 Track C: Civilization Milestone System
// Permanent civilization-wide bonuses that fire when civ level thresholds are crossed.
// Milestones are stored in civStore, announced once, and never re-fire.

import { useCivStore, CIV_MILESTONE_MAP, type CivLevel } from '../store/civStore'

// ── Milestone definitions ──────────────────────────────────────────────────────

export interface MilestoneDef {
  id:          string
  civLevel:    CivLevel
  title:       string
  description: string
  /** Multiplier applied to relevant game systems (see applyMilestoneBonus) */
  bonus: {
    craftCostMultiplier?:    number  // 0.9 = 10% cheaper
    marketPriceStability?:   boolean
    skillXpMultiplier?:      number  // 1.15 = +15%
    fastTravelCostMultiplier?: number // 0.5 = halved
    biomeSpawnMultiplier?:   number  // 2.0 = double
  }
}

export const MILESTONE_DEFS: Record<string, MilestoneDef> = {
  iron_tools: {
    id:          'iron_tools',
    civLevel:    'iron_age',
    title:       'Iron Tools',
    description: 'Iron tools available — crafting costs reduced 10%',
    bonus:       { craftCostMultiplier: 0.9 },
  },
  merchant_guilds: {
    id:          'merchant_guilds',
    civLevel:    'medieval',
    title:       'Merchant Guilds',
    description: 'Merchant guilds form — market prices stabilize faster',
    bonus:       { marketPriceStability: true },
  },
  knowledge_spreads: {
    id:          'knowledge_spreads',
    civLevel:    'renaissance',
    title:       'Knowledge Spreads',
    description: 'Knowledge spreads — all skill XP gain +15%',
    bonus:       { skillXpMultiplier: 1.15 },
  },
  steam_power: {
    id:          'steam_power',
    civLevel:    'industrial',
    title:       'Steam Power',
    description: 'Steam power — fast travel costs halved',
    bonus:       { fastTravelCostMultiplier: 0.5 },
  },
  age_of_exploration: {
    id:          'age_of_exploration',
    civLevel:    'advanced',
    title:       'Age of Exploration',
    description: 'Age of Exploration — new biome resources double spawn',
    bonus:       { biomeSpawnMultiplier: 2.0 },
  },
}

// ── Active bonus cache (queried by other systems) ──────────────────────────────

/** Returns the combined craft cost multiplier from all active milestones. */
export function getCraftCostMultiplier(): number {
  const { milestones } = useCivStore.getState()
  let m = 1.0
  for (const id of milestones) {
    const def = MILESTONE_DEFS[id]
    if (def?.bonus.craftCostMultiplier !== undefined) m *= def.bonus.craftCostMultiplier
  }
  return m
}

/** Returns true if merchant guild market stabilization is active. */
export function isMarketStabilized(): boolean {
  return useCivStore.getState().milestones.includes('merchant_guilds')
}

/** Returns combined skill XP multiplier from active milestones. */
export function getSkillXpMultiplier(): number {
  const { milestones } = useCivStore.getState()
  let m = 1.0
  for (const id of milestones) {
    const def = MILESTONE_DEFS[id]
    if (def?.bonus.skillXpMultiplier !== undefined) m *= def.bonus.skillXpMultiplier
  }
  return m
}

/** Returns fast travel cost multiplier from active milestones. */
export function getFastTravelCostMultiplier(): number {
  const { milestones } = useCivStore.getState()
  let m = 1.0
  for (const id of milestones) {
    const def = MILESTONE_DEFS[id]
    if (def?.bonus.fastTravelCostMultiplier !== undefined) m *= def.bonus.fastTravelCostMultiplier
  }
  return m
}

/** Returns biome spawn multiplier from active milestones. */
export function getBiomeSpawnMultiplier(): number {
  const { milestones } = useCivStore.getState()
  let m = 1.0
  for (const id of milestones) {
    const def = MILESTONE_DEFS[id]
    if (def?.bonus.biomeSpawnMultiplier !== undefined) m *= def.bonus.biomeSpawnMultiplier
  }
  return m
}

// ── Milestone checker — call after any civ level change ───────────────────────

/**
 * Checks if a milestone should fire for the given civ level and fires it once.
 * Dispatches 'civ-milestone' CustomEvent for UI announcement.
 */
export function checkAndFireMilestones(civLevel: CivLevel): void {
  const state = useCivStore.getState()
  const milestoneId = CIV_MILESTONE_MAP[civLevel]
  if (!milestoneId) return
  if (state.milestones.includes(milestoneId)) return  // already fired

  const def = MILESTONE_DEFS[milestoneId]
  if (!def) return

  state.addMilestone(milestoneId)

  // Dispatch event for HUD banner
  window.dispatchEvent(new CustomEvent('civ-milestone', {
    detail: { id: milestoneId, title: def.title, description: def.description },
  }))
}
