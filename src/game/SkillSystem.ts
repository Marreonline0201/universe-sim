// ── SkillSystem.ts ────────────────────────────────────────────────────────────
// M22 Track B: Player skill tree and progression system.
//
// 6 skill categories with 10 levels each. XP awards from gameplay actions.
// Passive bonuses affect gathering speed, craft quality, combat damage,
// survival drain rates, exploration range, and smithing quality.
//
// Singleton pattern matching GameSingletons.ts convention.

import { useUiStore } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'

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
    // M32 Track A: apply festival XP multiplier
    const mult = useGameStore.getState().xpMultiplier
    s.xp += amount * mult

    // Check for level up
    while (s.level < 10 && s.xp >= XP_THRESHOLDS[s.level + 1]) {
      s.level++
    }

    if (s.level > prevLevel) {
      // Fire level-up notification
      const bonus = this._getBonusDescription(skill, s.level)
      useUiStore.getState().addNotification(
        `${SKILL_NAMES[skill]} reached level ${s.level}! ${bonus}`,
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

  // ── Bonuses ─────────────────────────────────────────────────────────────────

  getBonuses(): SkillBonuses {
    return {
      harvestTimeMultiplier: 1.0 - this.skills.gathering.level * 0.05,    // 5% per level, min 0.50
      craftQualityBonus: this.skills.crafting.level * 0.02,                // +0.02 per level
      combatDamageMultiplier: 1.0 + this.skills.combat.level * 0.05,      // +5% per level
      survivalDrainMultiplier: 1.0 - this.skills.survival.level * 0.03,   // -3% per level
      explorationRangeMultiplier: 1.0 + this.skills.exploration.level * 0.05,
      movementSpeedMultiplier: 1.0 + this.skills.exploration.level * 0.015, // +1.5% per level
      smithingQualityBonus: this.skills.smithing.level * 0.025,            // +0.025 per level
    }
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
