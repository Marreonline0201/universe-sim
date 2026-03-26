// ── FestivalSystem.ts ─────────────────────────────────────────────────────────
// M41 Track C: Seasonal festival events — one per season, XP/craft/loot bonuses.
// Singleton that GameLoop ticks each frame. React components read via festivalStore.

import { MAT } from '../player/Inventory'
import type { SeasonName } from '../store/seasonStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type FestivalId = 'harvest_feast' | 'winter_solstice' | 'spring_bloom' | 'summer_hunt'

export interface Festival {
  id: FestivalId
  name: string
  season: SeasonName         // uppercase: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER'
  durationDays: number       // in-game days the festival lasts
  bonuses: {
    xpMultiplier?: number        // multiplier on all XP gain
    craftSpeedMultiplier?: number // multiplier on crafting time (< 1 = faster)
    lootQualityBonus?: number    // additive bonus to loot quality rolls (0-1)
    goldDropMultiplier?: number  // multiplier on gold drops from enemies/chests
  }
  specialDrops: number[]         // materialIds with increased drop rates
  description: string
}

// ── Festival definitions ──────────────────────────────────────────────────────

export const FESTIVALS: Record<FestivalId, Festival> = {
  harvest_feast: {
    id: 'harvest_feast',
    name: 'Harvest Feast',
    season: 'AUTUMN',
    durationDays: 3,
    bonuses: { xpMultiplier: 1.2, goldDropMultiplier: 1.5 },
    specialDrops: [MAT.BERRY, MAT.MUSHROOM, MAT.FIBER],
    description: 'Autumn abundance — XP +20%, gold drops +50%, extra forageables',
  },
  winter_solstice: {
    id: 'winter_solstice',
    name: 'Winter Solstice',
    season: 'WINTER',
    durationDays: 3,
    bonuses: { craftSpeedMultiplier: 0.5 },  // 50% faster crafting (half the time)
    specialDrops: [MAT.COAL, MAT.IRON_ORE, MAT.VELAR_CRYSTAL],
    description: 'Long nights for crafting — crafting speed x2, rare crystal drops',
  },
  spring_bloom: {
    id: 'spring_bloom',
    name: 'Spring Bloom',
    season: 'SPRING',
    durationDays: 3,
    bonuses: { xpMultiplier: 1.3, lootQualityBonus: 0.1 },
    specialDrops: [MAT.FIBER, MAT.MUSHROOM, MAT.LEAF],
    description: 'Rebirth season — XP +30%, loot quality +10%, herbs everywhere',
  },
  summer_hunt: {
    id: 'summer_hunt',
    name: 'Summer Hunt',
    season: 'SUMMER',
    durationDays: 3,
    bonuses: { xpMultiplier: 1.25, goldDropMultiplier: 1.3 },
    specialDrops: [MAT.LEATHER, MAT.RAW_MEAT, MAT.BONE],
    description: 'Peak hunting season — XP +25%, gold +30%, more animal drops',
  },
}

// Map seasons to their festivals for quick O(1) lookup
const SEASON_TO_FESTIVAL: Record<SeasonName, FestivalId> = {
  AUTUMN: 'harvest_feast',
  WINTER: 'winter_solstice',
  SPRING: 'spring_bloom',
  SUMMER: 'summer_hunt',
}

// ── Festival system singleton ─────────────────────────────────────────────────

class FestivalSystemClass {
  activeFestival: Festival | null = null
  festivalDayCount: number = 0

  /** Tracks which season the festival was last started for (avoids re-triggering). */
  private _lastActiveSeason: SeasonName | null = null
  /** Accumulated seconds within the current in-game day for day counting. */
  private _dayAccum: number = 0

  /**
   * Called every frame from GameLoop.
   * @param dt - frame delta time in seconds (wall-clock, unscaled)
   * @param currentSeason - current season from seasonStore
   * @param dayDurationSeconds - how many real seconds one in-game day takes
   */
  tick(dt: number, currentSeason: SeasonName, dayDurationSeconds: number): void {
    const expectedFestival = SEASON_TO_FESTIVAL[currentSeason]

    // Start festival when season changes (and it hasn't been started yet this season)
    if (this._lastActiveSeason !== currentSeason) {
      this._lastActiveSeason = currentSeason
      if (!this.activeFestival || this.activeFestival.id !== expectedFestival) {
        this.startFestival(expectedFestival)
      }
    }

    // Count in-game days while festival is active
    if (this.activeFestival) {
      this._dayAccum += dt
      const safeDayDuration = dayDurationSeconds > 0 ? dayDurationSeconds : 1200
      if (this._dayAccum >= safeDayDuration) {
        this._dayAccum -= safeDayDuration
        this.festivalDayCount++
        if (this.festivalDayCount >= this.activeFestival.durationDays) {
          this.endFestival()
        }
      }
    }
  }

  startFestival(id: FestivalId): void {
    this.activeFestival = FESTIVALS[id]
    this.festivalDayCount = 0
    this._dayAccum = 0
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('festival-start', { detail: this.activeFestival }))
    }
  }

  endFestival(): void {
    const ending = this.activeFestival
    this.activeFestival = null
    this.festivalDayCount = 0
    this._dayAccum = 0
    if (typeof window !== 'undefined' && ending) {
      window.dispatchEvent(new CustomEvent('festival-end', { detail: ending }))
    }
  }

  /** Returns XP multiplier from active festival (1.0 if none). */
  getXpBonus(): number {
    return this.activeFestival?.bonuses.xpMultiplier ?? 1.0
  }

  /** Returns craft speed multiplier from active festival (1.0 if none). */
  getCraftSpeedMultiplier(): number {
    return this.activeFestival?.bonuses.craftSpeedMultiplier ?? 1.0
  }

  /** Returns gold drop multiplier from active festival (1.0 if none). */
  getGoldMultiplier(): number {
    return this.activeFestival?.bonuses.goldDropMultiplier ?? 1.0
  }

  /** Returns loot quality bonus from active festival (0 if none). */
  getLootQualityBonus(): number {
    return this.activeFestival?.bonuses.lootQualityBonus ?? 0
  }
}

export const festivalSystem = new FestivalSystemClass()
