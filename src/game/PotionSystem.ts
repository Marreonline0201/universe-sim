// ── PotionSystem.ts ─────────────────────────────────────────────────────────
// M37 Track B: Alchemy System — Potion Effects
//
// Manages potion consumption and buff application. Potions are distinct from
// food buffs (FoodBuffSystem.ts) — they appear in a separate row in ActiveBuffsBar
// and have different stat effects (damage mult, xpMult, invisibility, fireImmune).
//
// Integration:
//   - consumePotion(matId): call when player drinks a potion item
//   - tickPotionBuffs(dtMs, callbacks): call each game tick for per-frame effects
//   - activePotionBuffs: readable from HUD for display
//   - getPotionSpeedMult(): returns combined speed multiplier from active potion buffs
//   - getPotionDamageMult(): returns combined damage multiplier from active potion buffs
//   - getPotionXpMult(): returns XP multiplier from active potion buffs
//   - isPotionFireImmune(): returns true if fire resist potion is active
//   - isPotionInvisible(): returns true if invisibility potion is active

import { MAT } from '../player/Inventory'
import { usePlayerStore } from '../store/playerStore'
import type { SpellId } from './SpellSystem'

export interface PotionBuff {
  name: string
  icon: string
  durationMs: number
  speedMult?: number       // e.g. 1.4 = +40% movement speed
  damageMult?: number      // e.g. 1.5 = +50% damage dealt
  xpMult?: number          // e.g. 3.0 = 3x XP gain
  animalAggro?: boolean    // false = animals ignore player
  fireImmune?: boolean     // true = immune to lava/fire damage
  instantHeal?: number     // HP to restore immediately (0-1 normalized, or raw HP)
  isInstant?: boolean      // if true, buff has no duration (consumed immediately)
}

// ── Potion buff definitions by MAT ID ─────────────────────────────────────────

const POTION_DEFS: Record<number, PotionBuff> = {
  [MAT.POTION_HEALTH]: {
    name: 'Health Surge',
    icon: '❤',
    durationMs: 0,
    isInstant: true,
    instantHeal: 50,  // 50 HP (health store is 0-1 normalized; /100 at consume time)
  },
  [MAT.POTION_SPEED]: {
    name: 'Speed Boost',
    icon: '⚡',
    durationMs: 60_000,
    speedMult: 1.4,
  },
  [MAT.POTION_STRENGTH]: {
    name: 'Berserker',
    icon: '💪',
    durationMs: 45_000,
    damageMult: 1.5,
  },
  [MAT.POTION_INVISIBILITY]: {
    name: 'Invisible',
    icon: '👻',
    durationMs: 30_000,
    animalAggro: false,
  },
  [MAT.POTION_ANTIDOTE]: {
    name: 'Purified',
    icon: '🌿',
    durationMs: 0,
    isInstant: true,
  },
  [MAT.POTION_FIRE_RESIST]: {
    name: 'Fire Resist',
    icon: '🔥',
    durationMs: 60_000,
    fireImmune: true,
  },
  [MAT.ELIXIR_WISDOM]: {
    name: 'Wisdom',
    icon: '📚',
    durationMs: 120_000,
    xpMult: 3.0,
  },
}

// ── Active potion buff state ───────────────────────────────────────────────────

export interface ActivePotionBuff extends PotionBuff {
  expiresAt: number  // Date.now() ms timestamp (0 for instant buffs)
}

export let activePotionBuffs: ActivePotionBuff[] = []

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Consume a potion item. Applies instant effects (health restore, debuff clear)
 * immediately, and adds timed buffs to the active list.
 * Returns true if the item had a potion definition, false otherwise.
 */
export function consumePotion(matId: number): boolean {
  const def = POTION_DEFS[matId]
  if (!def) return false

  // Instant effects
  if (matId === MAT.POTION_HEALTH && def.instantHeal) {
    // Health store is 0-1 normalized. 50 HP out of ~100 max = +0.5.
    const state = usePlayerStore.getState()
    const delta = def.instantHeal / 100
    state.updateVitals({ health: Math.min(1, state.health + delta) })
    return true
  }

  if (matId === MAT.POTION_ANTIDOTE) {
    // Clear all active potion debuffs (no positive buffs removed — only purge future ones)
    // Currently just clears the active potion list of any negative effects.
    // Extend here when poison/debuff system is added.
    activePotionBuffs = activePotionBuffs.filter(b => b.damageMult !== undefined || b.speedMult !== undefined || b.xpMult !== undefined || b.fireImmune !== undefined)
    return true
  }

  if (def.isInstant) {
    return true
  }

  // Timed buff — remove existing buff of same name (refresh semantics)
  activePotionBuffs = activePotionBuffs.filter(b => b.name !== def.name)
  activePotionBuffs.push({ ...def, expiresAt: Date.now() + def.durationMs })
  return true
}

/**
 * Tick potion buffs each game frame. Prunes expired buffs, then calls the
 * provided callbacks for any still-active buffs.
 *
 * @param dtMs      Elapsed time in milliseconds (dt * 1000)
 * @param applyBuff Callback receives each active buff for this frame
 */
export function tickPotionBuffs(dtMs: number, applyBuff: (buff: ActivePotionBuff) => void): void {
  const now = Date.now()
  activePotionBuffs = activePotionBuffs.filter(b => b.expiresAt > now)
  for (const b of activePotionBuffs) {
    applyBuff(b)
  }
}

/**
 * Returns the combined speed multiplier from all active potion buffs.
 * Multiplies with food speed multiplier in the movement system.
 */
export function getPotionSpeedMult(): number {
  const now = Date.now()
  let mult = 1.0
  for (const b of activePotionBuffs) {
    if (b.expiresAt > now && b.speedMult) {
      mult *= b.speedMult
    }
  }
  return mult
}

/**
 * Returns the combined damage multiplier from all active potion buffs.
 * Apply this in the combat damage calculation.
 */
export function getPotionDamageMult(): number {
  const now = Date.now()
  let mult = 1.0
  for (const b of activePotionBuffs) {
    if (b.expiresAt > now && b.damageMult) {
      mult *= b.damageMult
    }
  }
  return mult
}

/**
 * Returns the XP multiplier from active potion buffs (e.g. Elixir of Wisdom = 3.0).
 * Apply this whenever XP is awarded.
 */
export function getPotionXpMult(): number {
  const now = Date.now()
  let mult = 1.0
  for (const b of activePotionBuffs) {
    if (b.expiresAt > now && b.xpMult) {
      mult *= b.xpMult
    }
  }
  return mult
}

/**
 * Returns true if the player has an active Fire Resist potion.
 * Use in damage calculation to skip fire/lava damage.
 */
export function isPotionFireImmune(): boolean {
  const now = Date.now()
  return activePotionBuffs.some(b => b.expiresAt > now && b.fireImmune === true)
}

/**
 * Returns true if the player has an active Invisibility potion.
 * Use in animal AI aggro checks to skip targeting the player.
 */
export function isPotionInvisible(): boolean {
  const now = Date.now()
  return activePotionBuffs.some(b => b.expiresAt > now && b.animalAggro === false)
}

// ── Alchemy Mutation System ───────────────────────────────────────────────────

/**
 * Discoveries log — list of alchemy mutations the player has found.
 * Max 10 entries (oldest entries dropped when limit exceeded).
 */
export const discoveriesLog: string[] = []

export function addDiscovery(entry: string): void {
  if (!discoveriesLog.includes(entry)) {
    discoveriesLog.push(entry)
    if (discoveriesLog.length > 10) discoveriesLog.shift()
  }
}

/**
 * Check if 3 ingredients (by MAT id) produce a special mutation potion.
 * Ingredient order is ignored — all permutations are matched.
 *
 * Returns:
 *  'fireball'  — COAL + SULFUR + ALCOHOL  (fire explosion potion)
 *  'lightning' — COPPER + SALT + ALCOHOL  (shock potion)
 *  null        — no special mutation
 */
export function checkAlchemyMutation(mat1: number, mat2: number, mat3: number): SpellId | null {
  const combo = new Set([mat1, mat2, mat3])

  // Fire explosion potion: COAL + SULFUR + ALCOHOL
  if (combo.has(MAT.COAL) && combo.has(MAT.SULFUR) && combo.has(MAT.ALCOHOL)) {
    return 'fireball'
  }

  // Shock potion: COPPER + SALT + ALCOHOL
  if (combo.has(MAT.COPPER) && combo.has(MAT.SALT) && combo.has(MAT.ALCOHOL)) {
    return 'lightning'
  }

  return null
}

/**
 * Returns remaining milliseconds for a potion buff by name, or 0 if not active.
 */
export function getPotionBuffRemainingMs(name: string): number {
  const now = Date.now()
  const buff = activePotionBuffs.find(b => b.name === name && b.expiresAt > now)
  return buff ? buff.expiresAt - now : 0
}
