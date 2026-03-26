// ── RecipeBookSystem.ts ────────────────────────────────────────────────────────
// M68 Track A: Crafting Recipe Book
// Maintains a visual browser for all known crafting recipes with discovery state,
// material requirements, and category organization.

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecipeCategory = 'weapons' | 'armor' | 'tools' | 'consumables' | 'materials' | 'structures' | 'misc'

export interface RecipeIngredient {
  item: string
  icon: string
  amount: number
}

export interface RecipeBookEntry {
  id: string
  name: string
  icon: string
  category: RecipeCategory
  description: string
  ingredients: RecipeIngredient[]
  result: { item: string; icon: string; amount: number }
  discovered: boolean
  discoveredAt?: number  // simTime
  masteryLevel?: number  // 0-3: novice/apprentice/journeyman/master
  timesCrafted: number
}

export interface RecipeBookSaveData {
  entries: Array<{
    id: string
    discovered: boolean
    discoveredAt?: number
    masteryLevel?: number
    timesCrafted: number
  }>
}

// ── Seed Recipes (35 total, 5 per category) ───────────────────────────────────

const SEED_RECIPES: Omit<RecipeBookEntry, 'discovered' | 'discoveredAt' | 'masteryLevel' | 'timesCrafted'>[] = [
  // WEAPONS
  {
    id: 'weapons_iron_sword',
    name: 'Iron Sword',
    icon: '⚔️',
    category: 'weapons',
    description: 'A sturdy iron sword, reliable in close combat.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 3 },
      { item: 'Lumber', icon: '🪵', amount: 1 },
    ],
    result: { item: 'Iron Sword', icon: '⚔️', amount: 1 },
  },
  {
    id: 'weapons_wooden_bow',
    name: 'Wooden Bow',
    icon: '🏹',
    category: 'weapons',
    description: 'A flexible bow carved from sturdy wood.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 2 },
      { item: 'Rope', icon: '🪢', amount: 1 },
    ],
    result: { item: 'Wooden Bow', icon: '🏹', amount: 1 },
  },
  {
    id: 'weapons_stone_axe',
    name: 'Stone Axe',
    icon: '🪓',
    category: 'weapons',
    description: 'A primitive axe made from sharpened stone.',
    ingredients: [
      { item: 'Stone', icon: '🪨', amount: 2 },
      { item: 'Lumber', icon: '🪵', amount: 1 },
      { item: 'Rope', icon: '🪢', amount: 1 },
    ],
    result: { item: 'Stone Axe', icon: '🪓', amount: 1 },
  },
  {
    id: 'weapons_dagger',
    name: 'Dagger',
    icon: '🗡️',
    category: 'weapons',
    description: 'A short blade for quick, precise strikes.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 1 },
      { item: 'Leather', icon: '🦎', amount: 1 },
    ],
    result: { item: 'Dagger', icon: '🗡️', amount: 1 },
  },
  {
    id: 'weapons_war_hammer',
    name: 'War Hammer',
    icon: '🔨',
    category: 'weapons',
    description: 'A heavy hammer that delivers crushing blows.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 4 },
      { item: 'Lumber', icon: '🪵', amount: 2 },
    ],
    result: { item: 'War Hammer', icon: '🔨', amount: 1 },
  },

  // ARMOR
  {
    id: 'armor_leather_vest',
    name: 'Leather Vest',
    icon: '🥋',
    category: 'armor',
    description: 'Light armor that offers modest protection.',
    ingredients: [
      { item: 'Leather', icon: '🦎', amount: 4 },
      { item: 'Rope', icon: '🪢', amount: 1 },
    ],
    result: { item: 'Leather Vest', icon: '🥋', amount: 1 },
  },
  {
    id: 'armor_iron_helm',
    name: 'Iron Helm',
    icon: '⛑️',
    category: 'armor',
    description: 'A solid iron helmet to protect your head.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 2 },
      { item: 'Leather', icon: '🦎', amount: 1 },
    ],
    result: { item: 'Iron Helm', icon: '⛑️', amount: 1 },
  },
  {
    id: 'armor_chain_mail',
    name: 'Chain Mail',
    icon: '🛡️',
    category: 'armor',
    description: 'Interlocking iron rings form flexible armor.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 6 },
      { item: 'Leather', icon: '🦎', amount: 2 },
    ],
    result: { item: 'Chain Mail', icon: '🛡️', amount: 1 },
  },
  {
    id: 'armor_boots',
    name: 'Boots',
    icon: '👢',
    category: 'armor',
    description: 'Sturdy leather boots for traversing rough terrain.',
    ingredients: [
      { item: 'Leather', icon: '🦎', amount: 3 },
      { item: 'Cloth', icon: '🧵', amount: 1 },
    ],
    result: { item: 'Boots', icon: '👢', amount: 1 },
  },
  {
    id: 'armor_gauntlets',
    name: 'Gauntlets',
    icon: '🧤',
    category: 'armor',
    description: 'Iron-plated gauntlets protecting your hands.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 2 },
      { item: 'Leather', icon: '🦎', amount: 2 },
    ],
    result: { item: 'Gauntlets', icon: '🧤', amount: 1 },
  },

  // TOOLS
  {
    id: 'tools_pickaxe',
    name: 'Pickaxe',
    icon: '⛏️',
    category: 'tools',
    description: 'Essential for mining ore and stone.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 2 },
      { item: 'Lumber', icon: '🪵', amount: 2 },
    ],
    result: { item: 'Pickaxe', icon: '⛏️', amount: 1 },
  },
  {
    id: 'tools_fishing_rod',
    name: 'Fishing Rod',
    icon: '🎣',
    category: 'tools',
    description: 'Cast your line and catch fish from lakes and rivers.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 2 },
      { item: 'Rope', icon: '🪢', amount: 2 },
    ],
    result: { item: 'Fishing Rod', icon: '🎣', amount: 1 },
  },
  {
    id: 'tools_torch',
    name: 'Torch',
    icon: '🕯️',
    category: 'tools',
    description: 'Provides light in dark places.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 1 },
      { item: 'Cloth', icon: '🧵', amount: 1 },
    ],
    result: { item: 'Torch', icon: '🕯️', amount: 3 },
  },
  {
    id: 'tools_rope',
    name: 'Rope',
    icon: '🪢',
    category: 'tools',
    description: 'Braided fiber rope, useful for many crafting recipes.',
    ingredients: [
      { item: 'Cloth', icon: '🧵', amount: 3 },
    ],
    result: { item: 'Rope', icon: '🪢', amount: 2 },
  },
  {
    id: 'tools_lantern',
    name: 'Lantern',
    icon: '🏮',
    category: 'tools',
    description: 'A glass lantern that provides steady, lasting light.',
    ingredients: [
      { item: 'Glass', icon: '💎', amount: 2 },
      { item: 'Iron Ingot', icon: '🪨', amount: 1 },
      { item: 'Cloth', icon: '🧵', amount: 1 },
    ],
    result: { item: 'Lantern', icon: '🏮', amount: 1 },
  },

  // CONSUMABLES
  {
    id: 'consumables_health_potion',
    name: 'Health Potion',
    icon: '🧪',
    category: 'consumables',
    description: 'Restores a significant portion of health when consumed.',
    ingredients: [
      { item: 'Herb', icon: '🌿', amount: 2 },
      { item: 'Water', icon: '💧', amount: 1 },
      { item: 'Glass', icon: '💎', amount: 1 },
    ],
    result: { item: 'Health Potion', icon: '🧪', amount: 1 },
  },
  {
    id: 'consumables_stamina_brew',
    name: 'Stamina Brew',
    icon: '⚗️',
    category: 'consumables',
    description: 'Temporarily boosts stamina regeneration.',
    ingredients: [
      { item: 'Herb', icon: '🌿', amount: 1 },
      { item: 'Mushroom', icon: '🍄', amount: 1 },
      { item: 'Water', icon: '💧', amount: 1 },
    ],
    result: { item: 'Stamina Brew', icon: '⚗️', amount: 1 },
  },
  {
    id: 'consumables_antidote',
    name: 'Antidote',
    icon: '💊',
    category: 'consumables',
    description: 'Cures poison and disease effects.',
    ingredients: [
      { item: 'Herb', icon: '🌿', amount: 3 },
      { item: 'Glass', icon: '💎', amount: 1 },
    ],
    result: { item: 'Antidote', icon: '💊', amount: 1 },
  },
  {
    id: 'consumables_bread',
    name: 'Bread',
    icon: '🍞',
    category: 'consumables',
    description: 'A hearty loaf that satisfies hunger.',
    ingredients: [
      { item: 'Grain', icon: '🌾', amount: 3 },
      { item: 'Water', icon: '💧', amount: 1 },
    ],
    result: { item: 'Bread', icon: '🍞', amount: 2 },
  },
  {
    id: 'consumables_cooked_meat',
    name: 'Cooked Meat',
    icon: '🍖',
    category: 'consumables',
    description: 'Grilled meat that restores health and hunger.',
    ingredients: [
      { item: 'Raw Meat', icon: '🥩', amount: 1 },
    ],
    result: { item: 'Cooked Meat', icon: '🍖', amount: 1 },
  },

  // MATERIALS
  {
    id: 'materials_iron_ingot',
    name: 'Iron Ingot',
    icon: '🪨',
    category: 'materials',
    description: 'Smelted iron, the backbone of metalworking.',
    ingredients: [
      { item: 'Iron Ore', icon: '⛏️', amount: 2 },
    ],
    result: { item: 'Iron Ingot', icon: '🪨', amount: 1 },
  },
  {
    id: 'materials_lumber',
    name: 'Lumber',
    icon: '🪵',
    category: 'materials',
    description: 'Processed wooden planks ready for construction.',
    ingredients: [
      { item: 'Log', icon: '🌳', amount: 1 },
    ],
    result: { item: 'Lumber', icon: '🪵', amount: 3 },
  },
  {
    id: 'materials_cloth',
    name: 'Cloth',
    icon: '🧵',
    category: 'materials',
    description: 'Woven fabric used in armor and clothing.',
    ingredients: [
      { item: 'Fiber', icon: '🌱', amount: 4 },
    ],
    result: { item: 'Cloth', icon: '🧵', amount: 2 },
  },
  {
    id: 'materials_leather',
    name: 'Leather',
    icon: '🦎',
    category: 'materials',
    description: 'Tanned hide, flexible and durable.',
    ingredients: [
      { item: 'Hide', icon: '🐄', amount: 1 },
      { item: 'Salt', icon: '🧂', amount: 1 },
    ],
    result: { item: 'Leather', icon: '🦎', amount: 2 },
  },
  {
    id: 'materials_glass',
    name: 'Glass',
    icon: '💎',
    category: 'materials',
    description: 'Clear glass made from smelted sand.',
    ingredients: [
      { item: 'Sand', icon: '🏖️', amount: 3 },
    ],
    result: { item: 'Glass', icon: '💎', amount: 1 },
  },

  // STRUCTURES
  {
    id: 'structures_campfire',
    name: 'Campfire',
    icon: '🔥',
    category: 'structures',
    description: 'A basic fire for warmth and cooking.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 3 },
      { item: 'Stone', icon: '🪨', amount: 2 },
    ],
    result: { item: 'Campfire', icon: '🔥', amount: 1 },
  },
  {
    id: 'structures_chest',
    name: 'Chest',
    icon: '📦',
    category: 'structures',
    description: 'A wooden chest for storing items.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 6 },
      { item: 'Iron Ingot', icon: '🪨', amount: 1 },
    ],
    result: { item: 'Chest', icon: '📦', amount: 1 },
  },
  {
    id: 'structures_crafting_table',
    name: 'Crafting Table',
    icon: '🔧',
    category: 'structures',
    description: 'A workbench that enables advanced crafting.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 8 },
      { item: 'Iron Ingot', icon: '🪨', amount: 2 },
    ],
    result: { item: 'Crafting Table', icon: '🔧', amount: 1 },
  },
  {
    id: 'structures_bed',
    name: 'Bed',
    icon: '🛏️',
    category: 'structures',
    description: 'Sleep here to restore energy and set your respawn point.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 4 },
      { item: 'Cloth', icon: '🧵', amount: 4 },
    ],
    result: { item: 'Bed', icon: '🛏️', amount: 1 },
  },
  {
    id: 'structures_fence',
    name: 'Fence',
    icon: '🌿',
    category: 'structures',
    description: 'A simple fence for marking territory or keeping animals.',
    ingredients: [
      { item: 'Lumber', icon: '🪵', amount: 2 },
    ],
    result: { item: 'Fence', icon: '🌿', amount: 4 },
  },

  // MISC
  {
    id: 'misc_rope_bridge',
    name: 'Rope Bridge',
    icon: '🌉',
    category: 'misc',
    description: 'A suspension bridge for crossing gaps and rivers.',
    ingredients: [
      { item: 'Rope', icon: '🪢', amount: 8 },
      { item: 'Lumber', icon: '🪵', amount: 6 },
    ],
    result: { item: 'Rope Bridge', icon: '🌉', amount: 1 },
  },
  {
    id: 'misc_signal_flare',
    name: 'Signal Flare',
    icon: '🔴',
    category: 'misc',
    description: 'Fires a bright flare visible from great distances.',
    ingredients: [
      { item: 'Cloth', icon: '🧵', amount: 1 },
      { item: 'Sulfur', icon: '🟡', amount: 1 },
    ],
    result: { item: 'Signal Flare', icon: '🔴', amount: 3 },
  },
  {
    id: 'misc_map',
    name: 'Map',
    icon: '🗺️',
    category: 'misc',
    description: 'A detailed map of the surrounding area.',
    ingredients: [
      { item: 'Leather', icon: '🦎', amount: 1 },
      { item: 'Ink', icon: '🖋️', amount: 1 },
    ],
    result: { item: 'Map', icon: '🗺️', amount: 1 },
  },
  {
    id: 'misc_compass',
    name: 'Compass',
    icon: '🧭',
    category: 'misc',
    description: 'Always points north, a reliable navigation tool.',
    ingredients: [
      { item: 'Iron Ingot', icon: '🪨', amount: 1 },
      { item: 'Glass', icon: '💎', amount: 1 },
    ],
    result: { item: 'Compass', icon: '🧭', amount: 1 },
  },
  {
    id: 'misc_spyglass',
    name: 'Spyglass',
    icon: '🔭',
    category: 'misc',
    description: 'See distant objects and enemies with clarity.',
    ingredients: [
      { item: 'Glass', icon: '💎', amount: 2 },
      { item: 'Iron Ingot', icon: '🪨', amount: 1 },
      { item: 'Leather', icon: '🦎', amount: 1 },
    ],
    result: { item: 'Spyglass', icon: '🔭', amount: 1 },
  },
]

// ── Module state ───────────────────────────────────────────────────────────────

let _initialized = false
const _recipes = new Map<string, RecipeBookEntry>()

// ── Init ──────────────────────────────────────────────────────────────────────

export function initRecipeBook(): void {
  if (_initialized) return
  _initialized = true

  // Populate with seed recipes — all start as discovered
  for (const seed of SEED_RECIPES) {
    _recipes.set(seed.id, {
      ...seed,
      discovered: true,
      discoveredAt: 0,
      masteryLevel: 0,
      timesCrafted: 0,
    })
  }

  // Listen for item-crafted events
  window.addEventListener('item-crafted', _onItemCrafted)
  // Listen for recipe-discovered events
  window.addEventListener('recipe-discovered', _onRecipeDiscovered)
  // Listen for crafting mastery updates
  window.addEventListener('crafting-mastery-levelup', _onMasteryLevelUp)
}

function _onItemCrafted(e: Event): void {
  const detail = (e as CustomEvent<{ recipeId?: string; name?: string; category?: string }>).detail
  if (!detail) return

  // Try to find recipe by id
  if (detail.recipeId) {
    const entry = _recipes.get(detail.recipeId)
    if (entry) {
      entry.discovered = true
      entry.timesCrafted += 1
      return
    }
  }

  // Fallback: try to find by name match
  if (detail.name) {
    for (const entry of _recipes.values()) {
      if (entry.name.toLowerCase() === detail.name.toLowerCase()) {
        entry.discovered = true
        entry.timesCrafted += 1
        return
      }
    }
  }
}

function _onRecipeDiscovered(e: Event): void {
  const detail = (e as CustomEvent<{ recipeId?: string }>).detail
  if (!detail?.recipeId) return
  const entry = _recipes.get(detail.recipeId)
  if (entry) {
    entry.discovered = true
  }
}

function _onMasteryLevelUp(e: Event): void {
  const detail = (e as CustomEvent<{ category?: string; level?: number }>).detail
  if (!detail?.category || detail.level === undefined) return

  // Convert mastery level (1-10) to 0-3 stars
  const masteryLevel = Math.min(3, Math.floor((detail.level - 1) / 3))

  for (const entry of _recipes.values()) {
    if (entry.category === detail.category) {
      entry.masteryLevel = masteryLevel
    }
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getAllRecipes(): RecipeBookEntry[] {
  return Array.from(_recipes.values())
}

export function getRecipesByCategory(cat: RecipeCategory): RecipeBookEntry[] {
  return Array.from(_recipes.values()).filter(r => r.category === cat)
}

export function getDiscoveredRecipes(): RecipeBookEntry[] {
  return Array.from(_recipes.values()).filter(r => r.discovered)
}

export function searchRecipes(query: string): RecipeBookEntry[] {
  const lower = query.toLowerCase()
  return Array.from(_recipes.values()).filter(r =>
    r.name.toLowerCase().includes(lower) ||
    r.description.toLowerCase().includes(lower) ||
    r.category.toLowerCase().includes(lower)
  )
}

export function getRecipeBookStats(): {
  total: number
  discovered: number
  byCategory: Record<RecipeCategory, { total: number; discovered: number }>
} {
  const categories: RecipeCategory[] = ['weapons', 'armor', 'tools', 'consumables', 'materials', 'structures', 'misc']
  const byCategory = {} as Record<RecipeCategory, { total: number; discovered: number }>
  for (const cat of categories) {
    byCategory[cat] = { total: 0, discovered: 0 }
  }

  let total = 0
  let discovered = 0

  for (const entry of _recipes.values()) {
    total++
    byCategory[entry.category].total++
    if (entry.discovered) {
      discovered++
      byCategory[entry.category].discovered++
    }
  }

  return { total, discovered, byCategory }
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeRecipeBook(): RecipeBookSaveData {
  const entries = Array.from(_recipes.values()).map(e => ({
    id: e.id,
    discovered: e.discovered,
    discoveredAt: e.discoveredAt,
    masteryLevel: e.masteryLevel,
    timesCrafted: e.timesCrafted,
  }))
  return { entries }
}

export function deserializeRecipeBook(data: RecipeBookSaveData): void {
  _initialized = true

  // Ensure all seed recipes exist first
  if (_recipes.size === 0) {
    for (const seed of SEED_RECIPES) {
      _recipes.set(seed.id, {
        ...seed,
        discovered: true,
        discoveredAt: 0,
        masteryLevel: 0,
        timesCrafted: 0,
      })
    }
    window.addEventListener('item-crafted', _onItemCrafted)
    window.addEventListener('recipe-discovered', _onRecipeDiscovered)
    window.addEventListener('crafting-mastery-levelup', _onMasteryLevelUp)
  }

  if (!data?.entries) return
  for (const saved of data.entries) {
    const entry = _recipes.get(saved.id)
    if (!entry) continue
    entry.discovered = saved.discovered
    if (saved.discoveredAt !== undefined) entry.discoveredAt = saved.discoveredAt
    if (saved.masteryLevel !== undefined) entry.masteryLevel = saved.masteryLevel
    entry.timesCrafted = saved.timesCrafted ?? 0
  }
}
