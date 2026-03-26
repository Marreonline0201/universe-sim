// ── ResourceDepletionSystem.ts ────────────────────────────────────────────────
// M55 Track B: Resource node depletion & respawn system.
// Tracks harvesting charges per node; depletes and respawns with cooldown.

export type ResourceNodeType =
  | 'tree'
  | 'ore_vein'
  | 'herb_patch'
  | 'berry_bush'
  | 'stone_deposit'
  | 'mushroom_ring'

export interface ResourceNode {
  id: string
  type: ResourceNodeType
  name: string
  icon: string
  position: { x: number; z: number }
  maxCharges: number
  currentCharges: number
  depleted: boolean
  depletedAt: number | null  // sim seconds
  respawnTime: number        // sim seconds to respawn
  lastHarvestedAt: number | null
}

// ── Node type definitions ─────────────────────────────────────────────────────

const NODE_DEFINITIONS: Record<
  ResourceNodeType,
  { name: string; icon: string; maxCharges: number; respawnTime: number }
> = {
  tree:           { name: 'Ancient Tree',   icon: '🌲', maxCharges: 5,  respawnTime: 120 },
  ore_vein:       { name: 'Ore Vein',       icon: '⛏',  maxCharges: 8,  respawnTime: 300 },
  herb_patch:     { name: 'Herb Patch',     icon: '🌿', maxCharges: 3,  respawnTime: 60  },
  berry_bush:     { name: 'Berry Bush',     icon: '🫐', maxCharges: 4,  respawnTime: 90  },
  stone_deposit:  { name: 'Stone Deposit',  icon: '🪨', maxCharges: 10, respawnTime: 200 },
  mushroom_ring:  { name: 'Mushroom Ring',  icon: '🍄', maxCharges: 3,  respawnTime: 45  },
}

// ── Pre-placed world nodes (12 total) ─────────────────────────────────────────

const INITIAL_NODES: Array<Omit<ResourceNode, 'depleted' | 'depletedAt' | 'lastHarvestedAt'>> = [
  { id: 'tree_1',   type: 'tree',          ...NODE_DEFINITIONS.tree,          currentCharges: 5,  maxCharges: 5,  position: { x: 40,   z: -30  } },
  { id: 'tree_2',   type: 'tree',          ...NODE_DEFINITIONS.tree,          currentCharges: 5,  maxCharges: 5,  position: { x: -70,  z: 60   } },
  { id: 'ore_1',    type: 'ore_vein',      ...NODE_DEFINITIONS.ore_vein,      currentCharges: 8,  maxCharges: 8,  position: { x: 100,  z: -50  } },
  { id: 'ore_2',    type: 'ore_vein',      ...NODE_DEFINITIONS.ore_vein,      currentCharges: 8,  maxCharges: 8,  position: { x: -120, z: 80   } },
  { id: 'herb_1',   type: 'herb_patch',    ...NODE_DEFINITIONS.herb_patch,    currentCharges: 3,  maxCharges: 3,  position: { x: 20,   z: 90   } },
  { id: 'herb_2',   type: 'herb_patch',    ...NODE_DEFINITIONS.herb_patch,    currentCharges: 3,  maxCharges: 3,  position: { x: -40,  z: -80  } },
  { id: 'berry_1',  type: 'berry_bush',    ...NODE_DEFINITIONS.berry_bush,    currentCharges: 4,  maxCharges: 4,  position: { x: 60,   z: 120  } },
  { id: 'berry_2',  type: 'berry_bush',    ...NODE_DEFINITIONS.berry_bush,    currentCharges: 4,  maxCharges: 4,  position: { x: -90,  z: -20  } },
  { id: 'stone_1',  type: 'stone_deposit', ...NODE_DEFINITIONS.stone_deposit, currentCharges: 10, maxCharges: 10, position: { x: 150,  z: 30   } },
  { id: 'mush_1',   type: 'mushroom_ring', ...NODE_DEFINITIONS.mushroom_ring, currentCharges: 3,  maxCharges: 3,  position: { x: -30,  z: 140  } },
  { id: 'mush_2',   type: 'mushroom_ring', ...NODE_DEFINITIONS.mushroom_ring, currentCharges: 3,  maxCharges: 3,  position: { x: 80,   z: -100 } },
  { id: 'stone_2',  type: 'stone_deposit', ...NODE_DEFINITIONS.stone_deposit, currentCharges: 10, maxCharges: 10, position: { x: -200, z: 50   } },
]

// ── Module state ──────────────────────────────────────────────────────────────

let nodes: ResourceNode[] = []
let _initialized = false

// ── Public API ────────────────────────────────────────────────────────────────

export function initResourceDepletion(): void {
  if (_initialized) return
  _initialized = true
  nodes = INITIAL_NODES.map(n => ({
    ...n,
    depleted: false,
    depletedAt: null,
    lastHarvestedAt: null,
  }))
}

export function getNodes(): ResourceNode[] {
  return nodes
}

export function getNearbyNodes(px: number, pz: number, radius: number): ResourceNode[] {
  const r2 = radius * radius
  return nodes.filter(n => {
    const dx = n.position.x - px
    const dz = n.position.z - pz
    return dx * dx + dz * dz <= r2
  })
}

/**
 * Attempt to harvest a node.
 * Returns true if harvest succeeded, false if the node is already depleted.
 */
export function harvestNode(nodeId: string): boolean {
  const node = nodes.find(n => n.id === nodeId)
  if (!node || node.depleted) return false

  node.currentCharges -= 1
  node.lastHarvestedAt = Date.now()   // wall-clock ms; simSeconds not available here

  if (node.currentCharges <= 0) {
    node.currentCharges = 0
    node.depleted = true
    // depletedAt is recorded as simSeconds — caller must set it via tickResourceRespawn context
    // We dispatch the event and let the panel record the simSeconds
    window.dispatchEvent(new CustomEvent('resource-depleted', {
      detail: { nodeId: node.id, nodeType: node.type, nodeName: node.name, icon: node.icon },
    }))
  }
  return true
}

/**
 * Record the simSeconds at which a node was depleted.
 * Call this right after harvestNode() when you have simSeconds available.
 */
export function recordDepletedAt(nodeId: string, simSeconds: number): void {
  const node = nodes.find(n => n.id === nodeId)
  if (node && node.depleted && node.depletedAt === null) {
    node.depletedAt = simSeconds
  }
}

/**
 * Check all depleted nodes and respawn those whose cooldown has elapsed.
 * Call every 5 sim-seconds from GameLoop.
 */
export function tickResourceRespawn(simSeconds: number): void {
  for (const node of nodes) {
    if (!node.depleted) continue
    // If depletedAt was never set (e.g., loaded from old save), seed it now
    if (node.depletedAt === null) {
      node.depletedAt = simSeconds
      continue
    }
    if (simSeconds - node.depletedAt >= node.respawnTime) {
      node.currentCharges = node.maxCharges
      node.depleted = false
      node.depletedAt = null
    }
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeNodes(): string {
  return JSON.stringify(nodes)
}

export function deserializeNodes(data: string): void {
  try {
    const parsed: ResourceNode[] = JSON.parse(data)
    if (Array.isArray(parsed)) {
      nodes = parsed
      _initialized = true
    }
  } catch {
    // Corrupted data — leave nodes as-is
  }
}
