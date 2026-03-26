// ── RecipeUnlockSystem.ts ──────────────────────────────────────────────────────
// M46 Track C: Recipe unlock layer on top of the crafting system.
//
// Recipes can be unlocked via:
//  1. Always unlocked (default for basic/primitive recipes)
//  2. Skill level threshold (e.g., Crafting Lv.3)
//  3. Discovery (found during exploration, chest loot, or level-up milestone)
//
// Usage:
//   isRecipeUnlocked(recipeId, getSkillLevel) → boolean
//   getUnlockDescription(recipeId)             → string | null
//   discoverRecipe(recipeId)                   → marks as discovered
//   unlockedDiscoveries                        → Set<number>

import { useUiStore } from '../store/uiStore'
import { CRAFTING_RECIPES } from '../player/CraftingRecipes'

// ── Types ─────────────────────────────────────────────────────────────────────

export type UnlockCondition =
  | { type: 'always' }
  | { type: 'discovered' }
  | { type: 'skill_level'; skillId: string; level: number }

// Human-readable skill names for UI display
const SKILL_DISPLAY_NAMES: Record<string, string> = {
  crafting:    'Crafting',
  gathering:   'Gathering',
  combat:      'Combat',
  survival:    'Survival',
  exploration: 'Exploration',
  smithing:    'Smithing',
  husbandry:   'Husbandry',
}

// ── Unlock condition map (keyed by recipe ID) ────────────────────────────────
//
// Recipe tiers and names (from CraftingRecipes.ts):
//   Tier 0 (primitive): ids 1-10, 51-53, 63-66, 76-82 etc.  → always unlocked
//   Tier 1 (bronze):    ids 11-17, 54                        → crafting lv 2
//   Tier 2 (iron):      ids 18-21, 55, 67-75, 83             → crafting lv 3
//   Tier 3 (classical): ids 22-26, 56, 71-73 (steel)         → crafting lv 3+
//   Steel weapons (71-73): combat lv 3 to craft
//   Tier 4+:            ids 27+                              → skill_level gates
//   Alchemy/gunpowder:  id 34                                → discovered
//   High-tier weapons:  ids 19, 23, 71, 72, 73               → combat lv 3+
//   Tier 5+ machines:   ids 28-33, 35+                       → crafting lv 5+

export const RECIPE_UNLOCK_CONDITIONS: Record<number, UnlockCondition> = {
  // ── Tier 1 Bronze Age — requires basic crafting skill ─────────────────────
  11: { type: 'skill_level', skillId: 'crafting', level: 2 },  // Kiln
  12: { type: 'skill_level', skillId: 'crafting', level: 2 },  // Brick
  13: { type: 'skill_level', skillId: 'crafting', level: 2 },  // Bronze
  14: { type: 'skill_level', skillId: 'combat',   level: 2 },  // Bronze Sword
  15: { type: 'skill_level', skillId: 'combat',   level: 2 },  // Bronze Armor
  16: { type: 'skill_level', skillId: 'gathering', level: 2 }, // Plow
  17: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Boat (carpentry gate)
  54: { type: 'skill_level', skillId: 'crafting', level: 2 },  // Smelt Copper

  // ── Tier 2 Iron Age — requires intermediate crafting skill ─────────────────
  18: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Furnace
  19: { type: 'skill_level', skillId: 'combat',   level: 3 },  // Iron Sword
  20: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Wheel
  21: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Cart
  55: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Smelt Iron
  67: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Blast Furnace
  68: { type: 'skill_level', skillId: 'combat',   level: 2 },  // Iron Knife
  69: { type: 'skill_level', skillId: 'gathering', level: 3 }, // Iron Axe
  70: { type: 'skill_level', skillId: 'gathering', level: 3 }, // Iron Pickaxe
  83: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Sailing Boat

  // ── Steel Age — high crafting + combat requirements ────────────────────────
  22: { type: 'skill_level', skillId: 'crafting', level: 4 },  // Forge
  23: { type: 'skill_level', skillId: 'combat',   level: 3 },  // Steel Sword (tier 3)
  56: { type: 'skill_level', skillId: 'smithing', level: 2 },  // Smelt Steel
  71: { type: 'skill_level', skillId: 'combat',   level: 3 },  // Steel Sword (M8)
  72: { type: 'skill_level', skillId: 'combat',   level: 3 },  // Steel Chestplate
  73: { type: 'skill_level', skillId: 'combat',   level: 3 },  // Steel Crossbow

  // ── Classical Tier 3 — mid-game machines ──────────────────────────────────
  24: { type: 'skill_level', skillId: 'crafting', level: 3 },  // Glass
  25: { type: 'skill_level', skillId: 'crafting', level: 4 },  // Windmill
  26: { type: 'skill_level', skillId: 'crafting', level: 4 },  // Watermill

  // ── Alchemy / Gunpowder — discovered recipes ──────────────────────────────
  34: { type: 'discovered' },  // Gunpowder (discovered via exploration)
  58: { type: 'discovered' },  // Charcoal Powder (chemistry knowledge)

  // ── Industrial Tier 5 — requires advanced crafting ────────────────────────
  27: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Printing Press
  28: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Steam Engine
  29: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Locomotive
  30: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Steamship
  31: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Dynamo
  32: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Telegraph
  33: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Lightbulb
  57: { type: 'skill_level', skillId: 'crafting', level: 4 },  // Copper Wire

  // ── Modern Tier 6+ — late game, high crafting ─────────────────────────────
  35: { type: 'skill_level', skillId: 'crafting', level: 6 },  // Internal Combustion Engine
  36: { type: 'skill_level', skillId: 'crafting', level: 6 },  // Automobile
  37: { type: 'skill_level', skillId: 'crafting', level: 7 },  // Airplane
  38: { type: 'skill_level', skillId: 'crafting', level: 6 },  // Radio
  39: { type: 'skill_level', skillId: 'crafting', level: 8 },  // Nuclear Reactor
  59: { type: 'skill_level', skillId: 'crafting', level: 6 },  // Silicon
  60: { type: 'skill_level', skillId: 'crafting', level: 5 },  // Fuel
  61: { type: 'skill_level', skillId: 'crafting', level: 6 },  // Plastic
  62: { type: 'skill_level', skillId: 'crafting', level: 7 },  // Plutonium

  // ── Information Age Tier 7 ─────────────────────────────────────────────────
  40: { type: 'skill_level', skillId: 'crafting', level: 7 },  // Computer
  41: { type: 'skill_level', skillId: 'crafting', level: 7 },  // Circuit Board
  42: { type: 'skill_level', skillId: 'crafting', level: 8 },  // Satellite
  43: { type: 'skill_level', skillId: 'crafting', level: 8 },  // Rocket

  // ── Fusion Age Tier 8+ ────────────────────────────────────────────────────
  44: { type: 'skill_level', skillId: 'crafting', level: 9 },  // Fusion Reactor
  45: { type: 'skill_level', skillId: 'crafting', level: 9 },  // Nanobot Assembler
  46: { type: 'skill_level', skillId: 'crafting', level: 9 },  // Quantum Computer
  47: { type: 'skill_level', skillId: 'crafting', level: 10 }, // Warp Drive

  // ── Simulation Age Tier 9 ─────────────────────────────────────────────────
  48: { type: 'skill_level', skillId: 'crafting', level: 10 }, // Dyson Sphere
  49: { type: 'skill_level', skillId: 'crafting', level: 10 }, // Matrioshka Brain
  50: { type: 'skill_level', skillId: 'crafting', level: 10 }, // Simulation Engine
}

// ── Discovery state ───────────────────────────────────────────────────────────

/** Recipe IDs that have been discovered via exploration, chests, or level-up milestones */
export const unlockedDiscoveries: Set<number> = new Set()

/**
 * Mark a recipe as discovered. Fires a notification and dispatches a custom
 * 'recipe-discovered' DOM event so other systems can react.
 */
export function discoverRecipe(recipeId: number): void {
  if (unlockedDiscoveries.has(recipeId)) return
  unlockedDiscoveries.add(recipeId)

  // Find recipe name for the notification
  const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId)
  const name = recipe?.name ?? `Recipe #${recipeId}`

  // Show a notification via the UI store (safe to call outside React)
  try {
    useUiStore.getState().addNotification(
      `New recipe discovered: ${name}!`,
      'discovery'
    )
  } catch {
    // UI store not ready (e.g. called during module init) — silently skip
  }

  // Dispatch custom DOM event so any interested listeners can react
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('recipe-discovered', { detail: { recipeId, name } }))
  }
}

// ── Core unlock check ─────────────────────────────────────────────────────────

/**
 * Returns true if the given recipe is unlocked for the player.
 *
 * @param recipeId      - The recipe's numeric ID from CraftingRecipes.ts
 * @param getSkillLevel - A function that returns the player's current level for a skill ID
 */
export function isRecipeUnlocked(
  recipeId: number,
  getSkillLevel: (skillId: string) => number
): boolean {
  const condition = RECIPE_UNLOCK_CONDITIONS[recipeId]

  // No entry → always unlocked (primitive / basic recipes)
  if (!condition || condition.type === 'always') return true

  if (condition.type === 'discovered') {
    return unlockedDiscoveries.has(recipeId)
  }

  if (condition.type === 'skill_level') {
    return getSkillLevel(condition.skillId) >= condition.level
  }

  return true
}

// ── Unlock description for UI ─────────────────────────────────────────────────

/**
 * Returns a human-readable lock description, e.g. "Requires Crafting Lv.3",
 * or null if the recipe is always unlocked.
 */
export function getUnlockDescription(recipeId: number): string | null {
  const condition = RECIPE_UNLOCK_CONDITIONS[recipeId]
  if (!condition || condition.type === 'always') return null

  if (condition.type === 'discovered') {
    return 'Requires discovery'
  }

  if (condition.type === 'skill_level') {
    const skillName = SKILL_DISPLAY_NAMES[condition.skillId] ?? condition.skillId
    return `Requires ${skillName} Lv.${condition.level}`
  }

  return null
}

// ── Serialization helpers (called by OfflineSaveManager if needed) ────────────

export function serializeDiscoveries(): number[] {
  return [...unlockedDiscoveries]
}

export function deserializeDiscoveries(ids: unknown): void {
  if (!Array.isArray(ids)) return
  for (const id of ids) {
    if (typeof id === 'number') unlockedDiscoveries.add(id)
  }
}
