// ── RecipeDiscoverySystem.ts ──────────────────────────────────────────────────
// M52 Track B: Recipe discovery mechanic.
// All recipes start undiscovered. A few "basic" recipes are auto-discovered on
// init. Discovery happens via: experimentation, recipe scrolls, level-ups, or
// custom events.

import { CRAFTING_RECIPES } from '../player/CraftingRecipes'

const discoveredRecipes = new Set<string>()

// IDs of the first 5 recipes that are auto-discovered (basic primitives)
const BASIC_RECIPE_IDS = [1, 2, 3, 4, 5] // Stone Tool, Knife, Spear, Stone Axe, Rope

let _initialized = false

// ── Init ─────────────────────────────────────────────────────────────────────

export function initRecipeDiscovery(): void {
  if (_initialized) return
  _initialized = true

  for (const id of BASIC_RECIPE_IDS) {
    discoveredRecipes.add(String(id))
  }
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function isRecipeDiscovered(recipeId: string | number): boolean {
  return discoveredRecipes.has(String(recipeId))
}

export function getDiscoveredCount(): number {
  return discoveredRecipes.size
}

export function getTotalRecipeCount(): number {
  return CRAFTING_RECIPES.length
}

// ── Discover ──────────────────────────────────────────────────────────────────

export function discoverRecipe(recipeId: string | number): void {
  const id = String(recipeId)
  if (discoveredRecipes.has(id)) return
  discoveredRecipes.add(id)
  window.dispatchEvent(
    new CustomEvent('recipe-discovered', { detail: { recipeId: id } })
  )
}

// ── Experimentation ───────────────────────────────────────────────────────────
// Spend 3 random materials to attempt discovery of a random undiscovered recipe.
// 25% base chance of success.

export function experimentDiscovery(): { success: boolean; discoveredId?: string } {
  const undiscovered = CRAFTING_RECIPES
    .map(r => String(r.id))
    .filter(id => !discoveredRecipes.has(id))

  if (undiscovered.length === 0) {
    return { success: false }
  }

  const roll = Math.random()
  if (roll >= 0.25) {
    return { success: false }
  }

  const picked = undiscovered[Math.floor(Math.random() * undiscovered.length)]
  discoverRecipe(picked)
  return { success: true, discoveredId: picked }
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeDiscovery(): string {
  return JSON.stringify(Array.from(discoveredRecipes))
}

export function deserializeDiscovery(data: string): void {
  try {
    const ids: unknown = JSON.parse(data)
    if (!Array.isArray(ids)) return
    for (const id of ids) {
      if (typeof id === 'string' || typeof id === 'number') {
        discoveredRecipes.add(String(id))
      }
    }
  } catch {
    // Corrupted data — ignore
  }
}
