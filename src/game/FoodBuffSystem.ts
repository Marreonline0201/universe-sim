// ── FoodBuffSystem.ts ──────────────────────────────────────────────────────────
// M33 Track B: Cooking + Food Buffs
//
// Players cook raw ingredients at campfires into meals. Consuming a cooked meal
// applies a temporary stat buff (speed, hp regen, warmth regen, max HP bonus).
// Multiple different buffs stack; consuming the same buff type resets its timer.
//
// Integration points:
//   - consumeFood(matId): call when player eats a food item
//   - tickFoodBuffs(dt, applyBuff): call each game tick to apply active buff effects
//   - activeFoodBuffs: readable from HUD for display

import { MAT } from '../player/Inventory'

export interface FoodBuff {
  name: string
  icon: string
  durationMs: number
  speedMult?: number          // e.g. 1.15 = +15% movement speed
  hpRegenPerSec?: number      // HP restored per second
  warmthRegenPerSec?: number  // warmth points per second
  maxHpBonus?: number         // flat max-HP addition while active
}

// ── Buff definitions by MAT ID ────────────────────────────────────────────────

const FOOD_BUFFS: Record<number, FoodBuff> = {
  [MAT.COOKED_FISH]: {
    name: 'Well Fed',
    icon: '🐟',
    durationMs: 120_000,
    hpRegenPerSec: 1,
  },
  [MAT.COOKED_MEAT]: {
    name: 'Strength Fed',
    icon: '🥩',
    durationMs: 180_000,
    maxHpBonus: 20,
  },
  [MAT.MUSHROOM_SOUP]: {
    name: 'Steady Footing',
    icon: '🍄',
    durationMs: 90_000,
    speedMult: 1.1,
  },
  [MAT.BERRY_JAM]: {
    name: 'Sugar Rush',
    icon: '🍓',
    durationMs: 60_000,
    speedMult: 1.15,
  },
  [MAT.HERBAL_TEA]: {
    name: 'Warmth Brew',
    icon: '🌿',
    durationMs: 150_000,
    warmthRegenPerSec: 2,
  },
  [MAT.HEARTY_STEW]: {
    name: 'Full Meal',
    icon: '🥘',
    durationMs: 240_000,
    hpRegenPerSec: 2,
    warmthRegenPerSec: 1,
    speedMult: 1.05,
  },
}

// ── Active buff state ─────────────────────────────────────────────────────────

export interface ActiveFoodBuff extends FoodBuff {
  expiresAt: number  // Date.now() ms timestamp
}

export let activeFoodBuffs: ActiveFoodBuff[] = []

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Consume a food item. Looks up the buff for matId, removes any existing buff
 * of the same name (refresh), and adds the new buff with a fresh timer.
 * Returns true if the item had a buff definition, false if not a buff food.
 */
export function consumeFood(matId: number): boolean {
  const buff = FOOD_BUFFS[matId]
  if (!buff) return false
  // Remove existing buff of the same type (refresh semantics)
  activeFoodBuffs = activeFoodBuffs.filter(b => b.name !== buff.name)
  activeFoodBuffs.push({ ...buff, expiresAt: Date.now() + buff.durationMs })
  return true
}

/**
 * Tick food buffs each game frame. Prunes expired buffs, then calls applyBuff
 * for each still-active buff so the caller can apply hp/warmth/speed effects.
 *
 * @param dtMs    - elapsed time in milliseconds (dt * 1000)
 * @param applyBuff - callback receives each active buff for this frame
 */
export function tickFoodBuffs(dtMs: number, applyBuff: (buff: ActiveFoodBuff) => void): void {
  const now = Date.now()
  activeFoodBuffs = activeFoodBuffs.filter(b => b.expiresAt > now)
  for (const b of activeFoodBuffs) {
    applyBuff(b)
  }
}

/**
 * Returns the combined speed multiplier from all active food buffs.
 * Call this when computing the player's final movement speed.
 */
export function getFoodSpeedMult(): number {
  const now = Date.now()
  let mult = 1.0
  for (const b of activeFoodBuffs) {
    if (b.expiresAt > now && b.speedMult) {
      mult *= b.speedMult
    }
  }
  return mult
}

/**
 * Returns remaining milliseconds for a buff by name, or 0 if not active.
 */
export function getBuffRemainingMs(name: string): number {
  const now = Date.now()
  const buff = activeFoodBuffs.find(b => b.name === name && b.expiresAt > now)
  return buff ? buff.expiresAt - now : 0
}
