// ── BlueprintUnlockSystem.ts ──────────────────────────────────────────────────
// M63 Track A: Crafting Blueprint Unlock Tree
// Players earn Blueprint Points (BP) from crafting and spend them to unlock
// recipe blueprints organized in a 3-tier dependency tree.

import { useUiStore } from '../store/uiStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlueprintNode {
  id: string
  name: string
  icon: string
  category: 'tools' | 'weapons' | 'armor' | 'alchemy' | 'structures' | 'advanced'
  description: string
  cost: number
  requires: string[]
  unlocked: boolean
  recipeIds: number[]
  tier: 1 | 2 | 3
}

export interface BlueprintState {
  bp: number
  maxBp: number
  nodes: BlueprintNode[]
}

// ── Blueprint node definitions ────────────────────────────────────────────────

const INITIAL_NODES: Omit<BlueprintNode, 'unlocked'>[] = [
  // ── Tier 1 (no prerequisites, cost 1-2 BP) ──────────────────────────────
  {
    id: 'basic_tools',
    name: 'Basic Tools',
    icon: '🔨',
    category: 'tools',
    description: 'Hammer, pickaxe, and axe recipes. The foundation of all crafting.',
    cost: 1,
    requires: [],
    recipeIds: [1, 4],
    tier: 1,
  },
  {
    id: 'basic_armor',
    name: 'Leather Armor',
    icon: '🛡️',
    category: 'armor',
    description: 'Basic protective leather gear to weather the dangers ahead.',
    cost: 1,
    requires: [],
    recipeIds: [],
    tier: 1,
  },
  {
    id: 'herbalism',
    name: 'Herbalism',
    icon: '🌿',
    category: 'alchemy',
    description: 'Herb gathering techniques and introductory potion recipes.',
    cost: 1,
    requires: [],
    recipeIds: [],
    tier: 1,
  },
  {
    id: 'stonecraft',
    name: 'Stonecraft',
    icon: '🪨',
    category: 'structures',
    description: 'Stone construction basics — walls, floors, and simple fortifications.',
    cost: 2,
    requires: [],
    recipeIds: [10],
    tier: 1,
  },
  {
    id: 'fishing_gear',
    name: 'Fishing Gear',
    icon: '🎣',
    category: 'tools',
    description: 'Rod and bait recipes to catch fish from rivers and lakes.',
    cost: 1,
    requires: [],
    recipeIds: [],
    tier: 1,
  },
  {
    id: 'campfire_cooking',
    name: 'Camp Cooking',
    icon: '🍳',
    category: 'alchemy',
    description: 'Open-fire food recipes that restore hunger and grant buffs.',
    cost: 1,
    requires: [],
    recipeIds: [6, 7],
    tier: 1,
  },
  {
    id: 'basic_alchemy',
    name: 'Basic Alchemy',
    icon: '⚗️',
    category: 'alchemy',
    description: 'Simple potions using common materials. A gateway to greater power.',
    cost: 2,
    requires: [],
    recipeIds: [],
    tier: 1,
  },

  // ── Tier 2 (require 1-2 tier-1 nodes, cost 3-4 BP) ──────────────────────
  {
    id: 'iron_smithing',
    name: 'Iron Smithing',
    icon: '⚒️',
    category: 'tools',
    description: 'Forge iron tools and weapons with superior durability.',
    cost: 3,
    requires: ['basic_tools'],
    recipeIds: [],
    tier: 2,
  },
  {
    id: 'chainmail',
    name: 'Chainmail Armor',
    icon: '⛓️',
    category: 'armor',
    description: 'Interlocked metal rings offering serious protection.',
    cost: 4,
    requires: ['basic_armor', 'iron_smithing'],
    recipeIds: [],
    tier: 2,
  },
  {
    id: 'advanced_potions',
    name: 'Advanced Potions',
    icon: '🧪',
    category: 'alchemy',
    description: 'Potent brews that heal wounds, boost stats, and resist elements.',
    cost: 3,
    requires: ['basic_alchemy', 'herbalism'],
    recipeIds: [],
    tier: 2,
  },
  {
    id: 'engineering',
    name: 'Engineering',
    icon: '⚙️',
    category: 'structures',
    description: 'Mechanical devices, traps, and complex structures.',
    cost: 4,
    requires: ['basic_tools', 'stonecraft'],
    recipeIds: [],
    tier: 2,
  },
  {
    id: 'hunting_mastery',
    name: 'Hunting Mastery',
    icon: '🏹',
    category: 'weapons',
    description: 'Advanced hunting tools and traps for all prey sizes.',
    cost: 3,
    requires: ['basic_tools', 'fishing_gear'],
    recipeIds: [3, 8, 9],
    tier: 2,
  },
  {
    id: 'siege_weapons',
    name: 'Siege Weapons',
    icon: '🗜️',
    category: 'weapons',
    description: 'Ballistae, catapults, and other engines of war.',
    cost: 4,
    requires: ['engineering', 'iron_smithing'],
    recipeIds: [],
    tier: 2,
  },
  {
    id: 'cooking_mastery',
    name: 'Cooking Mastery',
    icon: '👨‍🍳',
    category: 'alchemy',
    description: 'Master recipes with medicinal herbs and rare ingredients.',
    cost: 3,
    requires: ['campfire_cooking', 'herbalism'],
    recipeIds: [],
    tier: 2,
  },
  {
    id: 'enchanting',
    name: 'Enchanting',
    icon: '✨',
    category: 'advanced',
    description: 'Imbue items with magical properties using rare reagents.',
    cost: 4,
    requires: ['basic_alchemy', 'advanced_potions'],
    recipeIds: [],
    tier: 2,
  },

  // ── Tier 3 (require 2 tier-2 nodes, cost 5-8 BP) ────────────────────────
  {
    id: 'master_smithing',
    name: 'Master Smithing',
    icon: '🔥',
    category: 'tools',
    description: 'The pinnacle of metalwork — legendary-grade tools and components.',
    cost: 5,
    requires: ['iron_smithing', 'chainmail'],
    recipeIds: [],
    tier: 3,
  },
  {
    id: 'legendary_weapons',
    name: 'Legendary Weapons',
    icon: '⚔️',
    category: 'weapons',
    description: 'Mythic blades and siege engines that reshape battlefields.',
    cost: 7,
    requires: ['master_smithing', 'siege_weapons'],
    recipeIds: [2],
    tier: 3,
  },
  {
    id: 'master_alchemy',
    name: 'Master Alchemy',
    icon: '🌟',
    category: 'alchemy',
    description: 'Transmutations and philosopher-grade elixirs beyond mortal ken.',
    cost: 6,
    requires: ['advanced_potions', 'enchanting'],
    recipeIds: [],
    tier: 3,
  },
  {
    id: 'arcane_engineering',
    name: 'Arcane Engineering',
    icon: '🔮',
    category: 'advanced',
    description: 'Magitech constructs that blend mechanics with enchantment.',
    cost: 8,
    requires: ['engineering', 'enchanting'],
    recipeIds: [],
    tier: 3,
  },
  {
    id: 'survival_mastery',
    name: 'Survival Mastery',
    icon: '🌲',
    category: 'advanced',
    description: 'Ultimate wilderness expertise — track, hunt, and feast like a legend.',
    cost: 5,
    requires: ['hunting_mastery', 'cooking_mastery'],
    recipeIds: [],
    tier: 3,
  },
]

// ── Module state ──────────────────────────────────────────────────────────────

const MAX_BP = 50
const CRAFTS_PER_BP = 5

let _initialized = false
let _bp = 0
let _craftCount = 0
const _nodes = new Map<string, BlueprintNode>()

function _ensureNodes(): void {
  if (_nodes.size === 0) {
    for (const def of INITIAL_NODES) {
      _nodes.set(def.id, { ...def, unlocked: false })
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initBlueprintSystem(): void {
  if (_initialized) return
  _initialized = true
  _ensureNodes()
  window.addEventListener('item-crafted', _onItemCrafted)
}

function _onItemCrafted(): void {
  _craftCount += 1
  if (_craftCount % CRAFTS_PER_BP === 0) {
    _addBp(1)
  }
}

function _addBp(amount: number): void {
  const prev = _bp
  _bp = Math.min(MAX_BP, _bp + amount)
  if (_bp > prev) {
    window.dispatchEvent(new CustomEvent('blueprint-bp-changed', { detail: { bp: _bp, maxBp: MAX_BP } }))
    if (_bp === MAX_BP) {
      useUiStore.getState().addNotification('Blueprint Points: storage full! (50/50) — unlock blueprints now.', 'info')
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getBlueprintState(): BlueprintState {
  _ensureNodes()
  return {
    bp: _bp,
    maxBp: MAX_BP,
    nodes: Array.from(_nodes.values()),
  }
}

export function unlockBlueprint(nodeId: string): boolean {
  _ensureNodes()
  const node = _nodes.get(nodeId)
  if (!node) return false
  if (node.unlocked) return false

  // Check prerequisites
  for (const reqId of node.requires) {
    const req = _nodes.get(reqId)
    if (!req || !req.unlocked) return false
  }

  // Check BP
  if (_bp < node.cost) return false

  // Deduct BP and unlock
  _bp -= node.cost
  node.unlocked = true

  useUiStore.getState().addNotification(
    `Blueprint Unlocked: ${node.icon} ${node.name}`,
    'discovery',
  )

  window.dispatchEvent(
    new CustomEvent('blueprint-unlocked', {
      detail: { nodeId, name: node.name, category: node.category },
    }),
  )

  return true
}

export function isBlueprintUnlocked(nodeId: string): boolean {
  _ensureNodes()
  const node = _nodes.get(nodeId)
  return node ? node.unlocked : false
}

// ── Serialization ─────────────────────────────────────────────────────────────

export interface BlueprintSaveData {
  bp: number
  craftCount: number
  unlocked: string[]
}

export function serializeBlueprints(): BlueprintSaveData {
  _ensureNodes()
  const unlocked: string[] = []
  for (const [id, node] of _nodes) {
    if (node.unlocked) unlocked.push(id)
  }
  return { bp: _bp, craftCount: _craftCount, unlocked }
}

export function deserializeBlueprints(data: BlueprintSaveData): void {
  if (!data) return
  _ensureNodes()
  _bp = Math.min(MAX_BP, Math.max(0, data.bp ?? 0))
  _craftCount = data.craftCount ?? 0
  const unlockedSet = new Set<string>(data.unlocked ?? [])
  for (const [id, node] of _nodes) {
    node.unlocked = unlockedSet.has(id)
  }
}
