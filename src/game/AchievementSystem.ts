// ── AchievementSystem.ts ─────────────────────────────────────────────────────
// M24 Track B: Achievement tracking, unlocking, and persistence.
//
// 25 achievements across 6 categories. Progress tracked via a single tick()
// call from GameLoop that reads game state. Unlock triggers a notification
// via useUiStore.

import { useUiStore } from '../store/uiStore'

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

    // Night tracking (simplified: increment once per night transition)
    if (isNight) {
      // We'll just track total nights based on day count
      this.totalNightsActive = dayCount
      this.setProgress('night_owl', Math.min(this.totalNightsActive, 10))
    }

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
