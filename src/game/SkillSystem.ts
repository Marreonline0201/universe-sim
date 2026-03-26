// ── SkillSystem.ts ────────────────────────────────────────────────────────────
// M22 Track B: Player skill tree and progression system.
// M36 Track A: Branching skill tree nodes, skill points, prestige system.
//
// 6 skill categories with 10 levels each. XP awards from gameplay actions.
// Passive bonuses affect gathering speed, craft quality, combat damage,
// survival drain rates, exploration range, and smithing quality.
//
// Singleton pattern matching GameSingletons.ts convention.

import { useUiStore } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'
import { useSkillStore } from '../store/skillStore'
import { festivalSystem } from './FestivalSystem'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SkillId = 'gathering' | 'crafting' | 'combat' | 'survival' | 'exploration' | 'smithing' | 'husbandry'

export interface SkillData {
  xp: number
  level: number
}

export interface SkillBonuses {
  /** Multiplier on harvest time (lower = faster). gathering level 10 = 0.50 */
  harvestTimeMultiplier: number
  /** Additive quality bonus on crafted items. crafting level 10 = +0.20 */
  craftQualityBonus: number
  /** Multiplier on combat damage dealt. combat level 10 = 1.50 */
  combatDamageMultiplier: number
  /** Multiplier on hunger/thirst drain (lower = slower). survival level 10 = 0.70 */
  survivalDrainMultiplier: number
  /** Multiplier on fog-of-war reveal radius. exploration level 10 = 1.50 */
  explorationRangeMultiplier: number
  /** Multiplier on movement speed. exploration level 10 = 1.15 */
  movementSpeedMultiplier: number
  /** Additive quality bonus for smithed items. smithing level 10 = +0.25 */
  smithingQualityBonus: number
  /** Taming success chance bonus per level (additive). husbandry level 10 = +0.05 per level. */
  husbandryTameBonus: number
  // ── M36 Tree node bonuses ──
  critChance: number
  maxHp: number
  lowHpDamageBonus: number
  hpOnKill: number
  executeDamageBonus: number
  gatherYield: number
  gatherSpeed: number
  rareMaterialChance: number
  critGatherMult: number
  craftCostReduction: number
  craftDurabilityBonus: number
  doubleOutputChance: number
  envDamageReduction: number
  animalAggroReduction: number
  movespeedBonus: number
  minimapRevealRadius: number
  tamingFoodFree: boolean
  petDamageBonus: number
  smithingCritChance: number
  smithingSpeedBonus: number
}

// ── Skill tree node ───────────────────────────────────────────────────────────

export interface SkillNode {
  id: string
  skillId: SkillId
  name: string
  description: string
  row: number        // 0=tier1 (req lv5), 1=tier2 (req lv10), 2=tier3 (req lv15 — future)
  col: number        // horizontal position in row
  requires: string[] // node IDs that must be unlocked first
  cost: number       // skill points to unlock (1-3)
  bonus: Partial<SkillBonuses>
}

export const SKILL_TREE: Record<SkillId, SkillNode[]> = {
  combat: [
    { id: 'combat_1a', skillId: 'combat', name: 'Sharp Eye',    description: '+5% crit chance',                     row: 0, col: 0, requires: [],                          cost: 1, bonus: { critChance: 0.05 } },
    { id: 'combat_1b', skillId: 'combat', name: 'Iron Skin',    description: '+10 max HP',                          row: 0, col: 1, requires: [],                          cost: 1, bonus: { maxHp: 10 } },
    { id: 'combat_2a', skillId: 'combat', name: 'Berserker',    description: '+15% damage when HP < 30%',           row: 1, col: 0, requires: ['combat_1a'],               cost: 2, bonus: { lowHpDamageBonus: 0.15 } },
    { id: 'combat_2b', skillId: 'combat', name: 'Second Wind',  description: 'Heal 10 HP on kill',                  row: 1, col: 1, requires: ['combat_1b'],               cost: 2, bonus: { hpOnKill: 10 } },
    { id: 'combat_3a', skillId: 'combat', name: 'Death Mark',   description: '+25% damage to targets below 20% HP', row: 2, col: 0, requires: ['combat_2a', 'combat_2b'],  cost: 3, bonus: { executeDamageBonus: 0.25 } },
  ],
  gathering: [
    { id: 'gather_1a', skillId: 'gathering', name: 'Keen Eye',        description: '+20% resource yield',           row: 0, col: 0, requires: [],             cost: 1, bonus: { gatherYield: 0.2 } },
    { id: 'gather_1b', skillId: 'gathering', name: 'Light Touch',     description: '-20% gather time',              row: 0, col: 1, requires: [],             cost: 1, bonus: { gatherSpeed: 0.2 } },
    { id: 'gather_2a', skillId: 'gathering', name: 'Lucky Find',      description: '+10% rare material chance',     row: 1, col: 0, requires: ['gather_1a'], cost: 2, bonus: { rareMaterialChance: 0.1 } },
    { id: 'gather_3a', skillId: 'gathering', name: 'Master Gatherer', description: 'x2 yield on critical gather',   row: 2, col: 0, requires: ['gather_2a'], cost: 3, bonus: { critGatherMult: 2.0 } },
  ],
  crafting: [
    { id: 'craft_1a', skillId: 'crafting', name: 'Efficient Work', description: '-20% material cost',                      row: 0, col: 0, requires: [],             cost: 1, bonus: { craftCostReduction: 0.2 } },
    { id: 'craft_2a', skillId: 'crafting', name: 'Masterwork',     description: '+25% durability on crafted items',         row: 1, col: 0, requires: ['craft_1a'], cost: 2, bonus: { craftDurabilityBonus: 0.25 } },
    { id: 'craft_3a', skillId: 'crafting', name: 'Artisan',        description: '15% chance to craft 2 items for cost of 1',row: 2, col: 0, requires: ['craft_2a'], cost: 3, bonus: { doubleOutputChance: 0.15 } },
  ],
  survival: [
    { id: 'surv_1a', skillId: 'survival', name: 'Tough Skin',     description: '-15% environmental damage',         row: 0, col: 0, requires: [],            cost: 1, bonus: { envDamageReduction: 0.15 } },
    { id: 'surv_1b', skillId: 'survival', name: 'Forager',        description: '+15% food nutrition value',         row: 0, col: 1, requires: [],            cost: 1, bonus: { gatherYield: 0.15 } },
    { id: 'surv_2a', skillId: 'survival', name: 'Feral Instinct', description: 'Animals 30% less likely to attack', row: 1, col: 0, requires: ['surv_1a'],  cost: 2, bonus: { animalAggroReduction: 0.3 } },
  ],
  exploration: [
    { id: 'expl_1a', skillId: 'exploration', name: 'Swift Feet',  description: '+10% movement speed',               row: 0, col: 0, requires: [],            cost: 1, bonus: { movespeedBonus: 0.1 } },
    { id: 'expl_1b', skillId: 'exploration', name: 'Eagle Eye',   description: '+25% minimap reveal radius',        row: 0, col: 1, requires: [],            cost: 1, bonus: { minimapRevealRadius: 1.25 } },
    { id: 'expl_2a', skillId: 'exploration', name: 'Pathfinder',  description: '+50% minimap reveal radius',        row: 1, col: 0, requires: ['expl_1a'],  cost: 2, bonus: { minimapRevealRadius: 1.5 } },
  ],
  smithing: [
    { id: 'smith_1a', skillId: 'smithing', name: 'Steady Hands',  description: '+10% smithing crit chance',         row: 0, col: 0, requires: [],              cost: 1, bonus: { smithingCritChance: 0.1 } },
    { id: 'smith_1b', skillId: 'smithing', name: 'Hot Forge',     description: '-15% smithing time',                row: 0, col: 1, requires: [],              cost: 1, bonus: { smithingSpeedBonus: 0.15 } },
    { id: 'smith_2a', skillId: 'smithing', name: 'Fine Edge',     description: '+20% weapon quality on craft',      row: 1, col: 0, requires: ['smith_1a'],   cost: 2, bonus: { smithingQualityBonus: 0.2 } },
  ],
  husbandry: [
    { id: 'husb_1a', skillId: 'husbandry', name: 'Beast Friend', description: 'Taming costs no food',               row: 0, col: 0, requires: [],            cost: 1, bonus: { tamingFoodFree: true } },
    { id: 'husb_1b', skillId: 'husbandry', name: 'Gentle Touch', description: '+20% taming success chance',         row: 0, col: 1, requires: [],            cost: 1, bonus: { husbandryTameBonus: 0.2 } },
    { id: 'husb_2a', skillId: 'husbandry', name: 'Pack Leader',  description: 'Tamed animals deal +20% damage',     row: 1, col: 0, requires: ['husb_1a'],  cost: 2, bonus: { petDamageBonus: 0.2 } },
  ],
}

// XP thresholds: exponential curve. Level 1 needs 100 XP, level 10 needs 22,000 cumulative.
const XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000]

const SKILL_NAMES: Record<SkillId, string> = {
  gathering: 'Gathering',
  crafting: 'Crafting',
  combat: 'Combat',
  survival: 'Survival',
  exploration: 'Exploration',
  smithing: 'Smithing',
  husbandry: 'Husbandry',
}

const SKILL_ICONS: Record<SkillId, string> = {
  gathering: '[P]',    // pickaxe
  crafting: '[H]',     // hammer
  combat: '[S]',       // sword
  survival: '[+]',     // heart/cross
  exploration: '[C]',  // compass
  smithing: '[A]',     // anvil
  husbandry: '[~]',   // paw/animal
}

const SKILL_COLORS: Record<SkillId, string> = {
  gathering: '#4caf50',
  crafting: '#ff9800',
  combat: '#f44336',
  survival: '#e91e63',
  exploration: '#2196f3',
  smithing: '#9c27b0',
  husbandry: '#8bc34a',
}

// ── Default bonus values ──────────────────────────────────────────────────────

function defaultBonuses(): SkillBonuses {
  return {
    harvestTimeMultiplier: 1.0,
    craftQualityBonus: 0,
    combatDamageMultiplier: 1.0,
    survivalDrainMultiplier: 1.0,
    explorationRangeMultiplier: 1.0,
    movementSpeedMultiplier: 1.0,
    smithingQualityBonus: 0,
    husbandryTameBonus: 0,
    critChance: 0,
    maxHp: 0,
    lowHpDamageBonus: 0,
    hpOnKill: 0,
    executeDamageBonus: 0,
    gatherYield: 0,
    gatherSpeed: 0,
    rareMaterialChance: 0,
    critGatherMult: 1.0,
    craftCostReduction: 0,
    craftDurabilityBonus: 0,
    doubleOutputChance: 0,
    envDamageReduction: 0,
    animalAggroReduction: 0,
    movespeedBonus: 0,
    minimapRevealRadius: 1.0,
    tamingFoodFree: false,
    petDamageBonus: 0,
    smithingCritChance: 0,
    smithingSpeedBonus: 0,
  }
}

// ── Skill System class ────────────────────────────────────────────────────────

export class SkillSystem {
  private skills: Record<SkillId, SkillData> = {
    gathering: { xp: 0, level: 0 },
    crafting: { xp: 0, level: 0 },
    combat: { xp: 0, level: 0 },
    survival: { xp: 0, level: 0 },
    exploration: { xp: 0, level: 0 },
    smithing: { xp: 0, level: 0 },
    husbandry: { xp: 0, level: 0 },
  }

  // Subscribers notified on any skill change (for React re-renders)
  private _version = 0
  private _listeners: Set<() => void> = new Set()

  subscribe(fn: () => void) { this._listeners.add(fn); return () => { this._listeners.delete(fn) } }
  getVersion() { return this._version }

  private _notify() {
    this._version++
    for (const fn of this._listeners) fn()
  }

  // ── XP ──────────────────────────────────────────────────────────────────────

  addXp(skill: SkillId, amount: number): void {
    const s = this.skills[skill]
    const prevLevel = s.level
    // Apply festival XP multiplier + prestige XP bonus
    const baseMultiplier = useGameStore.getState().xpMultiplier
    const prestigeCount = useSkillStore.getState().prestigeCount
    const prestigeXpBonus = 1.0 + prestigeCount * 0.1
    // M39 Track B: Party XP bonus (+10% when in a party with 2+ members)
    let partyBonus = 1.0
    try {
      const { usePartyStore } = require('../store/partyStore') as typeof import('../store/partyStore')
      partyBonus = usePartyStore.getState().getXpBonus()
    } catch { /* party system not loaded */ }
    let civXpBonus = 1.0
    try {
      const { getSkillXpMultiplier } = require('./CivMilestoneSystem') as typeof import('./CivMilestoneSystem')
      civXpBonus = getSkillXpMultiplier()
    } catch { /* civ system not loaded */ }
    const festBonus = festivalSystem.getXpBonus()
    s.xp += amount * baseMultiplier * prestigeXpBonus * partyBonus * civXpBonus * festBonus

    // Check for level up
    while (s.level < 10 && s.xp >= XP_THRESHOLDS[s.level + 1]) {
      s.level++
    }

    if (s.level > prevLevel) {
      // Award skill point on level-up
      useSkillStore.getState().addSkillPoint()

      // Fire level-up notification
      const bonus = this._getBonusDescription(skill, s.level)
      useUiStore.getState().addNotification(
        `${SKILL_NAMES[skill]} reached level ${s.level}! ${bonus} (+1 skill point)`,
        'discovery'
      )
    }

    this._notify()
  }

  getSkill(skill: SkillId): SkillData {
    return { ...this.skills[skill] }
  }

  getLevel(skill: SkillId): number {
    return this.skills[skill].level
  }

  getXp(skill: SkillId): number {
    return this.skills[skill].xp
  }

  getXpForNextLevel(skill: SkillId): number {
    const level = this.skills[skill].level
    if (level >= 10) return XP_THRESHOLDS[10]
    return XP_THRESHOLDS[level + 1]
  }

  getXpProgress(skill: SkillId): number {
    const s = this.skills[skill]
    if (s.level >= 10) return 1
    const current = s.xp - XP_THRESHOLDS[s.level]
    const needed = XP_THRESHOLDS[s.level + 1] - XP_THRESHOLDS[s.level]
    return Math.max(0, Math.min(1, current / needed))
  }

  getAllSkills(): Record<SkillId, SkillData> {
    const result = {} as Record<SkillId, SkillData>
    for (const key of Object.keys(this.skills) as SkillId[]) {
      result[key] = { ...this.skills[key] }
    }
    return result
  }

  // ── Prestige ─────────────────────────────────────────────────────────────────

  /** Returns true if all 6 skills are at level 10 */
  canPrestige(): boolean {
    return (Object.keys(this.skills) as SkillId[]).every(id => this.skills[id].level >= 10)
  }

  /** Resets all skills to level 0 XP, keeps unlocked nodes, grants +1 prestige */
  prestige(): void {
    if (!this.canPrestige()) return
    for (const key of Object.keys(this.skills) as SkillId[]) {
      this.skills[key] = { xp: 0, level: 0 }
    }
    useSkillStore.getState().incrementPrestige()
    useUiStore.getState().addNotification(
      `PRESTIGE! Skills reset. Prestige ${useSkillStore.getState().prestigeCount}: +${useSkillStore.getState().prestigeCount * 10}% XP permanently`,
      'discovery'
    )
    this._notify()
  }

  // ── Bonuses ─────────────────────────────────────────────────────────────────

  getBonuses(): SkillBonuses {
    const bonuses = defaultBonuses()

    // Base skill level bonuses
    bonuses.harvestTimeMultiplier = Math.max(0.5, 1.0 - this.skills.gathering.level * 0.05)
    bonuses.craftQualityBonus     = this.skills.crafting.level * 0.02
    bonuses.combatDamageMultiplier= 1.0 + this.skills.combat.level * 0.05
    bonuses.survivalDrainMultiplier= Math.max(0.3, 1.0 - this.skills.survival.level * 0.03)
    bonuses.explorationRangeMultiplier = 1.0 + this.skills.exploration.level * 0.05
    bonuses.movementSpeedMultiplier    = 1.0 + this.skills.exploration.level * 0.015
    bonuses.smithingQualityBonus  = this.skills.smithing.level * 0.025
    bonuses.husbandryTameBonus    = this.skills.husbandry.level * 0.05
    bonuses.minimapRevealRadius   = 1.0

    // Apply unlocked skill tree node bonuses
    const unlockedNodes = useSkillStore.getState().unlockedNodes
    for (const skillId of Object.keys(SKILL_TREE) as SkillId[]) {
      for (const node of SKILL_TREE[skillId]) {
        if (!unlockedNodes.includes(node.id)) continue
        const b = node.bonus
        if (b.critChance)           bonuses.critChance           += b.critChance
        if (b.maxHp)                bonuses.maxHp                += b.maxHp
        if (b.lowHpDamageBonus)     bonuses.lowHpDamageBonus     += b.lowHpDamageBonus
        if (b.hpOnKill)             bonuses.hpOnKill             += b.hpOnKill
        if (b.executeDamageBonus)   bonuses.executeDamageBonus   += b.executeDamageBonus
        if (b.gatherYield)          bonuses.gatherYield          += b.gatherYield
        if (b.gatherSpeed)          bonuses.gatherSpeed          += b.gatherSpeed
        if (b.rareMaterialChance)   bonuses.rareMaterialChance   += b.rareMaterialChance
        if (b.critGatherMult)       bonuses.critGatherMult       = Math.max(bonuses.critGatherMult, b.critGatherMult)
        if (b.craftCostReduction)   bonuses.craftCostReduction   += b.craftCostReduction
        if (b.craftDurabilityBonus) bonuses.craftDurabilityBonus += b.craftDurabilityBonus
        if (b.doubleOutputChance)   bonuses.doubleOutputChance   += b.doubleOutputChance
        if (b.envDamageReduction)   bonuses.envDamageReduction   += b.envDamageReduction
        if (b.animalAggroReduction) bonuses.animalAggroReduction += b.animalAggroReduction
        if (b.movespeedBonus)       bonuses.movespeedBonus       += b.movespeedBonus
        if (b.minimapRevealRadius)  bonuses.minimapRevealRadius  *= b.minimapRevealRadius
        if (b.tamingFoodFree)       bonuses.tamingFoodFree       = true
        if (b.petDamageBonus)       bonuses.petDamageBonus       += b.petDamageBonus
        if (b.smithingCritChance)   bonuses.smithingCritChance   += b.smithingCritChance
        if (b.smithingSpeedBonus)   bonuses.smithingSpeedBonus   += b.smithingSpeedBonus
        if (b.smithingQualityBonus) bonuses.smithingQualityBonus += b.smithingQualityBonus
        if (b.husbandryTameBonus)   bonuses.husbandryTameBonus   += b.husbandryTameBonus
      }
    }

    // Apply node speed bonuses into multipliers
    bonuses.harvestTimeMultiplier = Math.max(0.2, bonuses.harvestTimeMultiplier - bonuses.gatherSpeed)
    bonuses.movementSpeedMultiplier += bonuses.movespeedBonus
    bonuses.explorationRangeMultiplier *= bonuses.minimapRevealRadius

    return bonuses
  }

  // ── Serialization ───────────────────────────────────────────────────────────

  serialize(): Record<SkillId, SkillData> {
    return this.getAllSkills()
  }

  deserialize(data: unknown): void {
    if (!data || typeof data !== 'object') return
    const d = data as Record<string, { xp?: number; level?: number }>
    for (const key of Object.keys(this.skills) as SkillId[]) {
      if (d[key]) {
        this.skills[key].xp = typeof d[key].xp === 'number' ? d[key].xp : 0
        this.skills[key].level = typeof d[key].level === 'number' ? d[key].level : 0
      }
    }
    this._notify()
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private _getBonusDescription(skill: SkillId, level: number): string {
    switch (skill) {
      case 'gathering': return `Harvest ${level * 5}% faster`
      case 'crafting': return `+${(level * 0.02 * 100).toFixed(0)}% craft quality`
      case 'combat': return `+${level * 5}% damage`
      case 'survival': return `${level * 3}% less hunger/thirst drain`
      case 'exploration': return `+${level * 5}% reveal range`
      case 'smithing': return `+${(level * 2.5).toFixed(1)}% smithing quality`
      case 'husbandry': return `+${level * 5}% taming success chance`
    }
  }

  static getSkillName(id: SkillId): string { return SKILL_NAMES[id] }
  static getSkillIcon(id: SkillId): string { return SKILL_ICONS[id] }
  static getSkillColor(id: SkillId): string { return SKILL_COLORS[id] }
  static getAllSkillIds(): SkillId[] { return Object.keys(SKILL_NAMES) as SkillId[] }
  static getMaxLevel(): number { return 10 }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const skillSystem = new SkillSystem()
