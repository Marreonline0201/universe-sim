// ── AchievementSystem.ts ─────────────────────────────────────────────────────
// M24 Track B: Achievement tracking, unlocking, and persistence.
//
// 25 achievements across 6 categories. Progress tracked via a single tick()
// call from GameLoop that reads game state. Unlock triggers a notification
// via useUiStore.
//
// M47 Track A: Added PlayerStats type, getPlayerStats(), and checkAchievements()
// module-level helpers so GameLoop can perform a periodic (30 s) bulk check.

import { useUiStore } from '../store/uiStore'
import { usePlayerStatsStore } from '../store/playerStatsStore'

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  category: 'exploration' | 'combat' | 'crafting' | 'survival' | 'civilization' | 'secret'
  unlocked: boolean
  unlockedAt: number | null
  progress: number
  target: number
}

// ── Achievement definitions ─────────────────────────────────────────────────

function def(
  id: string, title: string, description: string, icon: string,
  category: Achievement['category'], target: number,
): Achievement {
  return { id, title, description, icon, category, unlocked: false, unlockedAt: null, progress: 0, target }
}

const ACHIEVEMENT_DEFS: Achievement[] = [
  // Exploration (5)
  def('first_steps',   'First Steps',    'Walk 100 meters from spawn',        'FT', 'exploration', 100),
  def('globetrotter',  'Globetrotter',   'Visit all 4 biomes',                'GL', 'exploration', 4),
  def('spelunker',     'Spelunker',       'Go below sea level',                'SP', 'exploration', 1),
  def('summit',        'Summit',          'Reach the highest terrain point',   'SM', 'exploration', 1),
  def('cartographer',  'Cartographer',    'Reveal 80% of the map',            'CT', 'exploration', 80),

  // Combat (5)
  def('first_blood',   'First Blood',     'Kill your first animal',           'FB', 'combat', 1),
  def('big_game',      'Big Game',        'Kill 25 animals',                  'BG', 'combat', 25),
  def('untouchable',   'Untouchable',     'Dodge 10 attacks',                 'UT', 'combat', 10),
  def('overkill',      'Overkill',        'Deal 100+ damage in one hit',     'OK', 'combat', 1),
  def('survivor_hp',   'Last Stand',      'Survive with less than 10% HP',   'LS', 'combat', 1),

  // Crafting (5)
  def('toolmaker',     'Toolmaker',       'Craft 10 tools',                   'TM', 'crafting', 10),
  def('master_chef',   'Master Chef',     'Craft 20 food items',             'MC', 'crafting', 20),
  def('blacksmith',    'Blacksmith',      'Craft 10 metal items',            'BS', 'crafting', 10),
  def('alchemist',     'Alchemist',       'Craft 5 chemical items',          'AL', 'crafting', 5),
  def('legendary_craft','Legendary Crafter','Craft a legendary rarity item', 'LC', 'crafting', 1),

  // Survival (5)
  def('days_10',       '10 Days',         'Survive 10 in-game days',          'D1', 'survival', 10),
  def('days_100',      '100 Days',        'Survive 100 in-game days',         'DH', 'survival', 100),
  def('iron_stomach',  'Iron Stomach',    'Eat 50 food items',               'IS', 'survival', 50),
  def('night_owl',     'Night Owl',       'Spend 10 nights active',          'NO', 'survival', 10),
  def('firekeeper',    'Firekeeper',      'Build 20 fires',                  'FK', 'survival', 20),

  // Civilization (5)
  def('settler',       'Settler',         'Reach Civilization Tier 1',        'S1', 'civilization', 1),
  def('mayor',         'Mayor',           'Reach Civilization Tier 3',        'MY', 'civilization', 3),
  def('space_age',     'Space Age',       'Reach Civilization Tier 5',        'SA', 'civilization', 5),
  def('first_contact', 'First Contact',   'Meet the Velar',                  'FC', 'civilization', 1),
  def('multiverse',    'Multiverse',      'Use the interstellar gateway',    'MV', 'civilization', 1),
]

// ── Achievement toast queue (prevent spam) ──────────────────────────────────
const toastQueue: string[] = []
let lastToastTime = 0
const TOAST_INTERVAL = 1500  // ms between toasts

function processToastQueue(): void {
  const now = Date.now()
  if (toastQueue.length > 0 && now - lastToastTime >= TOAST_INTERVAL) {
    const msg = toastQueue.shift()!
    useUiStore.getState().addNotification(msg, 'discovery')
    lastToastTime = now
  }
}

// ── Achievement System ──────────────────────────────────────────────────────

export class AchievementSystem {
  private achievements: Map<string, Achievement>

  // Accumulator state (tracked across ticks)
  private totalDistanceMoved = 0
  private totalKills = 0
  private totalDodges = 0
  private totalToolsCrafted = 0
  private totalFoodCrafted = 0
  private totalMetalCrafted = 0
  private totalChemCrafted = 0
  private totalFoodEaten = 0
  private totalFiresBuilt = 0
  private totalNightsActive = 0
  private wasNight = false
  private biomesVisited = new Set<string>()
  private lastPx = 0
  private lastPy = 0
  private lastPz = 0
  private hasInitialPos = false

  constructor() {
    this.achievements = new Map()
    for (const a of ACHIEVEMENT_DEFS) {
      this.achievements.set(a.id, { ...a })
    }
  }

  getAll(): Achievement[] {
    return Array.from(this.achievements.values())
  }

  getUnlocked(): Achievement[] {
    return this.getAll().filter(a => a.unlocked)
  }

  private unlock(id: string): void {
    const a = this.achievements.get(id)
    if (!a || a.unlocked) return
    a.unlocked = true
    a.unlockedAt = Date.now()
    a.progress = a.target
    toastQueue.push(`Achievement Unlocked: ${a.title} — ${a.description}`)
  }

  private setProgress(id: string, value: number): void {
    const a = this.achievements.get(id)
    if (!a || a.unlocked) return
    a.progress = Math.min(value, a.target)
    if (a.progress >= a.target) {
      this.unlock(id)
    }
  }

  private increment(id: string, delta = 1): void {
    const a = this.achievements.get(id)
    if (!a || a.unlocked) return
    this.setProgress(id, a.progress + delta)
  }

  // ── Event hooks (called from GameLoop) ────────────────────────────────────

  onKill(_species: string): void {
    this.totalKills++
    this.increment('first_blood')
    this.setProgress('big_game', this.totalKills)
  }

  onDodge(): void {
    this.totalDodges++
    this.setProgress('untouchable', this.totalDodges)
  }

  onDealDamage(amount: number): void {
    if (amount >= 100) {
      this.setProgress('overkill', 1)
    }
  }

  onCraft(recipeId: number, rarity: number, _category: string): void {
    // Determine craft category from recipeId ranges (approximate)
    // Tools: recipeIds 1-20, food: 21-40, metal: 41-75, chemical: 76-100
    if (recipeId <= 20) {
      this.totalToolsCrafted++
      this.setProgress('toolmaker', this.totalToolsCrafted)
    } else if (recipeId <= 40) {
      this.totalFoodCrafted++
      this.setProgress('master_chef', this.totalFoodCrafted)
    } else if (recipeId <= 75) {
      this.totalMetalCrafted++
      this.setProgress('blacksmith', this.totalMetalCrafted)
    } else {
      this.totalChemCrafted++
      this.setProgress('alchemist', this.totalChemCrafted)
    }
    // Legendary craft
    if (rarity >= 4) {
      this.setProgress('legendary_craft', 1)
    }
  }

  onEat(): void {
    this.totalFoodEaten++
    this.setProgress('iron_stomach', this.totalFoodEaten)
  }

  onBuildFire(): void {
    this.totalFiresBuilt++
    this.setProgress('firekeeper', this.totalFiresBuilt)
  }

  onTierReached(tier: number): void {
    if (tier >= 1) this.setProgress('settler', 1)
    if (tier >= 3) this.setProgress('mayor', 3)
    if (tier >= 5) this.setProgress('space_age', 5)
  }

  onVelarContact(): void {
    this.setProgress('first_contact', 1)
  }

  onGatewayUsed(): void {
    this.setProgress('multiverse', 1)
  }

  // ── Per-frame tick (reads game state) ─────────────────────────────────────

  tick(
    _dt: number,
    px: number, py: number, pz: number,
    healthPct: number,
    dayCount: number,
    isNight: boolean,
    _biome: string,
    _mapRevealPct: number,
    _belowSeaLevel: boolean,
  ): void {
    // Process toast queue
    processToastQueue()

    // Distance tracking
    if (this.hasInitialPos) {
      const dx = px - this.lastPx
      const dy = py - this.lastPy
      const dz = pz - this.lastPz
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist < 50) {  // ignore teleports
        this.totalDistanceMoved += dist
        this.setProgress('first_steps', Math.floor(this.totalDistanceMoved))
      }
    }
    this.lastPx = px; this.lastPy = py; this.lastPz = pz
    this.hasInitialPos = true

    // HP tracking
    if (healthPct > 0 && healthPct < 0.1) {
      this.setProgress('survivor_hp', 1)
    }

    // Day count
    this.setProgress('days_10', dayCount)
    this.setProgress('days_100', dayCount)

    // Night tracking — increment once on transition into night
    if (isNight && !this.wasNight) {
      this.totalNightsActive++
      this.setProgress('night_owl', this.totalNightsActive)
    }
    this.wasNight = isNight

    // Below sea level
    if (_belowSeaLevel) {
      this.setProgress('spelunker', 1)
    }

    // Biome tracking
    if (_biome && _biome !== '') {
      this.biomesVisited.add(_biome)
      this.setProgress('globetrotter', this.biomesVisited.size)
    }

    // Map reveal
    if (_mapRevealPct >= 80) {
      this.setProgress('cartographer', 80)
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  serialize(): object {
    const achievements: Record<string, { unlocked: boolean; unlockedAt: number | null; progress: number }> = {}
    for (const [id, a] of this.achievements) {
      achievements[id] = { unlocked: a.unlocked, unlockedAt: a.unlockedAt, progress: a.progress }
    }
    return {
      achievements,
      accumulators: {
        totalDistanceMoved: this.totalDistanceMoved,
        totalKills: this.totalKills,
        totalDodges: this.totalDodges,
        totalToolsCrafted: this.totalToolsCrafted,
        totalFoodCrafted: this.totalFoodCrafted,
        totalMetalCrafted: this.totalMetalCrafted,
        totalChemCrafted: this.totalChemCrafted,
        totalFoodEaten: this.totalFoodEaten,
        totalFiresBuilt: this.totalFiresBuilt,
        totalNightsActive: this.totalNightsActive,
        biomesVisited: Array.from(this.biomesVisited),
      },
    }
  }

  deserialize(data: any): void {
    if (!data) return
    const { achievements, accumulators } = data
    if (achievements) {
      for (const [id, state] of Object.entries(achievements) as [string, any][]) {
        const a = this.achievements.get(id)
        if (a) {
          a.unlocked = state.unlocked ?? false
          a.unlockedAt = state.unlockedAt ?? null
          a.progress = state.progress ?? 0
        }
      }
    }
    if (accumulators) {
      this.totalDistanceMoved = accumulators.totalDistanceMoved ?? 0
      this.totalKills = accumulators.totalKills ?? 0
      this.totalDodges = accumulators.totalDodges ?? 0
      this.totalToolsCrafted = accumulators.totalToolsCrafted ?? 0
      this.totalFoodCrafted = accumulators.totalFoodCrafted ?? 0
      this.totalMetalCrafted = accumulators.totalMetalCrafted ?? 0
      this.totalChemCrafted = accumulators.totalChemCrafted ?? 0
      this.totalFoodEaten = accumulators.totalFoodEaten ?? 0
      this.totalFiresBuilt = accumulators.totalFiresBuilt ?? 0
      this.totalNightsActive = accumulators.totalNightsActive ?? 0
      if (Array.isArray(accumulators.biomesVisited)) {
        this.biomesVisited = new Set(accumulators.biomesVisited)
      }
    }
  }
}

// ── M47 Track A: Module-level helpers ─────────────────────────────────────────
// These wrap the existing class-based system so GameLoop can call a simple
// checkAchievements(getPlayerStats()) every 30 seconds without duplicating logic.

/** Subset of PlayerStats fields used for achievement condition checks. */
export interface AchievementPlayerStats {
  kills: number
  fishCaught: number
  itemsCrafted: number
  distanceTraveled: number
  goldEarned: number
  questsCompleted: number
  settlements: number
}

/** Read live stats from playerStatsStore and map to AchievementPlayerStats. */
export function getPlayerStats(): AchievementPlayerStats {
  const s = usePlayerStatsStore.getState().stats
  return {
    kills:            s.killCount,
    fishCaught:       s.goldenFishCaught,   // golden fish is the trackable fishing stat
    itemsCrafted:     s.itemsCrafted,
    distanceTraveled: s.distanceTraveled,
    goldEarned:       s.totalGoldEarned,
    questsCompleted:  0,                    // quest completions not yet in playerStatsStore
    settlements:      s.settlementsDiscovered,
  }
}

/**
 * Bulk achievement check against the provided stats snapshot.
 * Unlocks any threshold-based achievements not yet unlocked and fires
 * an 'achievement-unlocked' CustomEvent for each new unlock.
 * Returns the names of newly unlocked achievements.
 *
 * NOTE: The class-based AchievementSystem already handles frame-level tracking
 * (kills, dodges, etc.) via event hooks called directly from GameLoop. This
 * function provides a complementary 30-second interval scan for stat-threshold
 * achievements that are easier to express as a one-off check than event hooks.
 */
export function checkAchievements(stats: AchievementPlayerStats): string[] {
  // Note: first_blood and big_game are handled by the class-based AchievementSystem
  // via onKill() hooks. Only stat-threshold checks that the class doesn't cover go here.
  const thresholds: Array<{ id: string; name: string; stat: number; target: number }> = [
    { id: 'angler',       name: 'Angler',          stat: stats.fishCaught,       target: 10 },
    { id: 'master_angler',name: 'Master Angler',   stat: stats.fishCaught,       target: 100 },
    { id: 'craftsman',    name: 'Craftsman',       stat: stats.itemsCrafted,     target: 20 },
    { id: 'artisan',      name: 'Artisan',         stat: stats.itemsCrafted,     target: 100 },
    { id: 'explorer_s',   name: 'Explorer',        stat: stats.settlements,      target: 3 },
    { id: 'wanderer',     name: 'Wanderer',        stat: stats.distanceTraveled, target: 5000 },
    { id: 'wealthy',      name: 'Wealthy',         stat: stats.goldEarned,       target: 500 },
    { id: 'rich',         name: 'Rich',            stat: stats.goldEarned,       target: 5000 },
    { id: 'quester',      name: 'Quester',         stat: stats.questsCompleted,  target: 5 },
    { id: 'hero',         name: 'Hero',            stat: stats.questsCompleted,  target: 25 },
  ]

  const newlyUnlocked: string[] = []

  for (const { id, name, stat, target } of thresholds) {
    if (stat < target) continue
    if (unlockedAchievements.has(id)) continue

    unlockedAchievements.add(id)
    newlyUnlocked.push(name)

    const detail = { achievement: { id, name, stat, target } }
    window.dispatchEvent(new CustomEvent('achievement-unlocked', { detail }))

    // Surface via the existing notification system
    useUiStore.getState().addNotification(`Achievement Unlocked: ${name}`, 'discovery')
  }

  return newlyUnlocked
}

/**
 * Mutable set of unlocked achievement IDs for the stat-threshold achievements
 * managed by checkAchievements(). Separate from the class-based AchievementSystem
 * so there is no risk of collision.
 */
export const unlockedAchievements: Set<string> = new Set()
