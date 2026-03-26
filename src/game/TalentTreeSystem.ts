// ── TalentTreeSystem.ts ───────────────────────────────────────────────────────
// M65 Track A: Player Talent Tree
// 3 branches (Combat / Crafting / Survival), 5 nodes each = 15 total talents.
// Players earn 1 talent point per level-up via 'player-levelup' custom event.
// Talents are permanent passive bonuses.

// ── Types ─────────────────────────────────────────────────────────────────────

export type TalentBranch = 'combat' | 'crafting' | 'survival'

export interface TalentNode {
  id: string
  name: string
  branch: TalentBranch
  position: number   // 1-5 within the branch (1 = root, 5 = capstone)
  effect: string     // human-readable passive bonus description
  cost: number       // always 1 talent point
  unlocked: boolean
}

export interface TalentTreeState {
  nodes: TalentNode[]
  availablePoints: number
  totalPointsEarned: number
}

// ── Module-level state ────────────────────────────────────────────────────────

let _initialized = false
let _state: TalentTreeState = {
  nodes: [],
  availablePoints: 0,
  totalPointsEarned: 0,
}

// ── Node definitions ──────────────────────────────────────────────────────────

const NODE_DEFINITIONS: Omit<TalentNode, 'unlocked'>[] = [
  // Combat branch
  { id: 'combat_1', branch: 'combat', position: 1, cost: 1, name: "Warrior's Edge",    effect: '+10% melee damage' },
  { id: 'combat_2', branch: 'combat', position: 2, cost: 1, name: 'Iron Skin',          effect: '+15% max HP' },
  { id: 'combat_3', branch: 'combat', position: 3, cost: 1, name: 'Battle Fury',        effect: '+20% attack speed' },
  { id: 'combat_4', branch: 'combat', position: 4, cost: 1, name: 'Executioner',        effect: '+25% damage vs low-HP enemies' },
  { id: 'combat_5', branch: 'combat', position: 5, cost: 1, name: 'War God',            effect: '+50% all combat stats' },

  // Crafting branch
  { id: 'craft_1',  branch: 'crafting', position: 1, cost: 1, name: "Apprentice's Touch", effect: '-10% crafting cost' },
  { id: 'craft_2',  branch: 'crafting', position: 2, cost: 1, name: 'Material Saver',      effect: '15% chance to not consume materials' },
  { id: 'craft_3',  branch: 'crafting', position: 3, cost: 1, name: 'Master Crafter',      effect: '+25% crafting XP' },
  { id: 'craft_4',  branch: 'crafting', position: 4, cost: 1, name: 'Legendary Tools',     effect: 'unlock tier-5 recipes' },
  { id: 'craft_5',  branch: 'crafting', position: 5, cost: 1, name: 'Alchemical Mind',     effect: 'potions are 2x effective' },

  // Survival branch
  { id: 'surv_1',   branch: 'survival', position: 1, cost: 1, name: 'Forager',              effect: '+20% gathering yield' },
  { id: 'surv_2',   branch: 'survival', position: 2, cost: 1, name: 'Toughness',            effect: '+30% stamina' },
  { id: 'surv_3',   branch: 'survival', position: 3, cost: 1, name: "Hunter's Instinct",    effect: 'animals drop rare loot 15% more often' },
  { id: 'surv_4',   branch: 'survival', position: 4, cost: 1, name: 'Pathfinder',           effect: '+25% movement speed' },
  { id: 'surv_5',   branch: 'survival', position: 5, cost: 1, name: 'One With Nature',      effect: '+100% all gathering and survival bonuses' },
]

// ── Init ──────────────────────────────────────────────────────────────────────

export function initTalentTree(): void {
  if (_initialized) return
  _initialized = true

  _state = {
    nodes: NODE_DEFINITIONS.map(def => ({ ...def, unlocked: false })),
    availablePoints: 0,
    totalPointsEarned: 0,
  }

  // Listen for player level-ups to award talent points
  window.addEventListener('player-levelup', _onLevelUp)
}

function _onLevelUp(): void {
  _state = {
    ..._state,
    availablePoints: _state.availablePoints + 1,
    totalPointsEarned: _state.totalPointsEarned + 1,
  }
  window.dispatchEvent(new CustomEvent('talent-points-changed', { detail: { availablePoints: _state.availablePoints } }))
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getTalentTree(): TalentTreeState {
  return _state
}

export function getAvailableTalentPoints(): number {
  return _state.availablePoints
}

/** Returns true if the node at (branch, position-1) is unlocked, or position === 1 (root). */
export function isTalentAvailable(nodeId: string): boolean {
  const node = _state.nodes.find(n => n.id === nodeId)
  if (!node) return false
  if (node.unlocked) return false // already unlocked
  if (_state.availablePoints < node.cost) return false

  // Root nodes (position 1) are always purchasable if points exist
  if (node.position === 1) return true

  // Require the previous node in the same branch to be unlocked
  const prev = _state.nodes.find(n => n.branch === node.branch && n.position === node.position - 1)
  return !!prev?.unlocked
}

// ── Unlock ────────────────────────────────────────────────────────────────────

export function unlockTalent(nodeId: string): boolean {
  if (!isTalentAvailable(nodeId)) return false

  const nodeIndex = _state.nodes.findIndex(n => n.id === nodeId)
  if (nodeIndex === -1) return false

  const updatedNodes = _state.nodes.map((n, i) =>
    i === nodeIndex ? { ...n, unlocked: true } : n
  )

  _state = {
    ..._state,
    nodes: updatedNodes,
    availablePoints: _state.availablePoints - _state.nodes[nodeIndex].cost,
  }

  window.dispatchEvent(new CustomEvent('talent-unlocked', {
    detail: { nodeId, node: updatedNodes[nodeIndex] },
  }))

  return true
}

// ── Serialization ─────────────────────────────────────────────────────────────

export interface TalentSaveData {
  unlockedIds: string[]
  availablePoints: number
  totalPointsEarned: number
}

export function serializeTalents(): TalentSaveData {
  return {
    unlockedIds: _state.nodes.filter(n => n.unlocked).map(n => n.id),
    availablePoints: _state.availablePoints,
    totalPointsEarned: _state.totalPointsEarned,
  }
}

export function deserializeTalents(data: TalentSaveData): void {
  if (!data || typeof data !== 'object') return

  const unlockedSet = new Set<string>(data.unlockedIds ?? [])
  _state = {
    nodes: _state.nodes.map(n => ({ ...n, unlocked: unlockedSet.has(n.id) })),
    availablePoints: data.availablePoints ?? 0,
    totalPointsEarned: data.totalPointsEarned ?? 0,
  }
}
