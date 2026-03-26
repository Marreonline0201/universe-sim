/**
 * ResourceNodeManager — resource node spawning, respawn timers, depletion logic.
 *
 * Extracted from SceneRoot.tsx (lines ~156-389).
 * Exports: ResourceNode type, NODE_TYPES, GEOLOGY_RULES, RESOURCE_NODES,
 *          RESOURCE_NODE_QUATS, gatheredNodeIds, NODE_RESPAWN_AT,
 *          NODE_HITS_TAKEN, NODE_RESPAWN_DELAY, getNodeMaxHits,
 *          generateResourceNodes, rebuildResourceNodes, seededRand.
 */
import * as THREE from 'three'
import { MAT } from '../player/Inventory'
import { terrainHeightAt, getSpawnPosition, PLANET_RADIUS } from './SpherePlanet'
import { getRiverClayPositions } from './RiverSystem'

// ── Resource node definitions ─────────────────────────────────────────────────

export interface ResourceNode {
  id: number
  type: string
  label: string
  matId: number
  color: string
  emissive?: string   // M38: biome-exclusive nodes may have an emissive glow color
  biome?: string      // M38: which biome this node belongs to (for crafting panel icons)
  x: number
  y: number
  z: number
}

// ── M38 Track C: Biome label map for gather prompt display ──────────────────
export const BIOME_NODE_LABELS: Partial<Record<string, string>> = {
  'volcanic_glass': 'Volcano',
  'glacier_ice':    'Tundra',
  'desert_crystal': 'Desert',
  'deep_coral':     'Ocean',
  'ancient_wood':   'Forest',
  'shadow_iron':    'Cave',
  'luminite':       'Cave',
}

// Biome node types that require crafting skill level 3+ to gather
export const BIOME_EXCLUSIVE_TYPES = new Set([
  'volcanic_glass', 'glacier_ice', 'desert_crystal', 'deep_coral',
  'ancient_wood', 'shadow_iron', 'luminite',
])

export const NODE_TYPES = [
  { type: 'stone',       label: 'Stone',       matId: MAT.STONE,      color: '#888888', count: 20 },
  { type: 'flint',       label: 'Flint',       matId: MAT.FLINT,      color: '#556677', count: 10 },
  { type: 'wood',        label: 'Wood',        matId: MAT.WOOD,       color: '#8B5E3C', count: 20 },
  { type: 'clay',        label: 'Clay',        matId: MAT.CLAY,       color: '#CC7744', count: 12 },
  { type: 'fiber',       label: 'Fiber',       matId: MAT.FIBER,      color: '#66BB44', count: 15 },
  { type: 'copper_ore',  label: 'Copper Ore',  matId: MAT.COPPER_ORE, color: '#b87333', count: 8  },
  { type: 'iron_ore',    label: 'Iron Ore',    matId: MAT.IRON_ORE,   color: '#7a6a5a', count: 8  },
  { type: 'coal',        label: 'Coal',        matId: MAT.COAL,       color: '#2a2a2a', count: 6  },
  { type: 'tin_ore',     label: 'Tin Ore',     matId: MAT.TIN_ORE,    color: '#9aacb8', count: 5  },
  { type: 'sand',        label: 'Sand',        matId: MAT.SAND,       color: '#d4c47a', count: 8  },
  { type: 'sulfur',      label: 'Sulfur',      matId: MAT.SULFUR,     color: '#cccc22', count: 4  },
  { type: 'bark',        label: 'Bark',        matId: MAT.BARK,       color: '#7a5a2a', count: 15 },
  { type: 'bone',        label: 'Bone',        matId: MAT.BONE,       color: '#e8e0cc', count: 12 },
  { type: 'hide',        label: 'Hide',        matId: MAT.HIDE,       color: '#c2894a', count: 10 },
  { type: 'leaf',        label: 'Leaf',        matId: MAT.LEAF,       color: '#55aa33', count: 20 },
  { type: 'gold',        label: 'Gold',        matId: MAT.GOLD,       color: '#ffd700', count: 3  },
  { type: 'silver',      label: 'Silver',      matId: MAT.SILVER,     color: '#c0c0c0', count: 4  },
  { type: 'uranium',     label: 'Uranium',     matId: MAT.URANIUM,    color: '#44ff44', count: 2  },
  { type: 'rubber',      label: 'Rubber',      matId: MAT.RUBBER,     color: '#2a2a2a', count: 5  },
  { type: 'saltpeter',   label: 'Saltpeter',   matId: MAT.SALTPETER,  color: '#f0f0e0', count: 4  },
  { type: 'raw_meat',    label: 'Raw Meat',    matId: MAT.RAW_MEAT,   color: '#cc4444', count: 12 },
  // ── M33 Track B: Cooking ingredients ────────────────────────────────────────
  { type: 'berry',       label: 'Berry',       matId: MAT.BERRY,      color: '#cc3388', count: 10 },
  { type: 'mushroom',    label: 'Mushroom',    matId: MAT.MUSHROOM,   color: '#aa8844', count: 8  },
  // ── M38 Track C: Biome-exclusive resources ────────────────────────────────
  { type: 'volcanic_glass',  label: 'Volcanic Glass',  matId: MAT.VOLCANIC_GLASS,  color: '#220011', count: 5,  emissive: '#ff2200', biome: 'volcano'  },
  { type: 'glacier_ice',     label: 'Glacier Ice',     matId: MAT.GLACIER_ICE,     color: '#88ccff', count: 8,  emissive: '#4488ff', biome: 'polar'    },
  { type: 'desert_crystal',  label: 'Desert Crystal',  matId: MAT.DESERT_CRYSTAL,  color: '#cc8833', count: 6,  emissive: '#ffaa44', biome: 'desert'   },
  { type: 'deep_coral',      label: 'Deep Coral',      matId: MAT.DEEP_CORAL,      color: '#cc3366', count: 10, emissive: '',        biome: 'ocean'    },
  { type: 'ancient_wood',    label: 'Ancient Wood',    matId: MAT.ANCIENT_WOOD,    color: '#2a1a0a', count: 4,  emissive: '',        biome: 'forest'   },
  { type: 'shadow_iron',     label: 'Shadow Iron',     matId: MAT.SHADOW_IRON,     color: '#2a2a33', count: 5,  emissive: '',        biome: 'cave'     },
  { type: 'luminite',        label: 'Luminite',        matId: MAT.LUMINITE,        color: '#004422', count: 4,  emissive: '#00ff88', biome: 'cave'     },
]

// ── P2-4: Geology-based ore placement ─────────────────────────────────────────
interface GeologyRule {
  /** Preferred terrain height range (meters above sea level) */
  hMin: number
  hMax: number
  /** Max distance from spawn (m). Rarer ores placed farther out for exploration. */
  maxDist: number
}

export const GEOLOGY_RULES: Partial<Record<string, GeologyRule>> = {
  copper_ore:     { hMin: 60,  hMax: 220, maxDist: 600 },
  iron_ore:       { hMin: 20,  hMax: 90,  maxDist: 500 },
  coal:           { hMin: 5,   hMax: 40,  maxDist: 450 },
  tin_ore:        { hMin: 50,  hMax: 130, maxDist: 550 },
  sulfur:         { hMin: 70,  hMax: 250, maxDist: 650 },
  gold:           { hMin: 130, hMax: 250, maxDist: 700 },
  silver:         { hMin: 100, hMax: 200, maxDist: 650 },
  uranium:        { hMin: 90,  hMax: 220, maxDist: 750 },
  // ── M38 Track C: Biome-exclusive geology rules ─────────────────────────────
  volcanic_glass: { hMin: 180, hMax: 400, maxDist: 800 }, // high volcanic peaks
  glacier_ice:    { hMin: 200, hMax: 500, maxDist: 900 }, // polar high altitude
  desert_crystal: { hMin: 20,  hMax: 120, maxDist: 700 }, // flat warm desert floor
  deep_coral:     { hMin: 0,   hMax: 10,  maxDist: 500 }, // sea level / ocean shore
  ancient_wood:   { hMin: 40,  hMax: 180, maxDist: 600 }, // mid-altitude old-growth
  shadow_iron:    { hMin: 5,   hMax: 60,  maxDist: 550 }, // cave / underground
  luminite:       { hMin: 5,   hMax: 60,  maxDist: 550 }, // cave bioluminescent zone
}

export function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// Resource nodes placed on the sphere surface near the actual land spawn point.
// Ores use geology height-band rules (P2-4). Non-ore types use pure random scatter.
export function generateResourceNodes(seed: number): ResourceNode[] {
  const rand = seededRand((seed ^ 99991) >>> 0)
  const nodes: ResourceNode[] = []
  let id = 0

  const [sx, sy, sz] = getSpawnPosition()
  const spawnDir = new THREE.Vector3(sx, sy, sz).normalize()

  const perpBase = Math.abs(spawnDir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()

  for (const nt of NODE_TYPES) {
    const geoRule = GEOLOGY_RULES[nt.type]

    for (let i = 0; i < nt.count; i++) {
      const maxDist  = geoRule?.maxDist ?? 515
      const maxTries = geoRule ? 60 : 40
      let placed = false

      // Scratch vectors for slope check — reused per attempt to avoid GC pressure
      const _nb = new THREE.Vector3()
      for (let attempt = 0; attempt < maxTries; attempt++) {
        const angle   = rand() * Math.PI * 2
        const arcDist = (15 + rand() * (maxDist - 15)) / PLANET_RADIUS
        const axis    = tangent.clone().applyAxisAngle(spawnDir, angle)
        const dir     = spawnDir.clone().applyAxisAngle(axis, arcDist)
        const h       = terrainHeightAt(dir)

        if (h < 0) continue  // underwater

        // Geology filter: ore must be within its preferred height band
        if (geoRule && (h < geoRule.hMin || h > geoRule.hMax)) {
          // After 40 attempts, relax geology constraint to guarantee placement
          if (attempt < 40) continue
        }

        // Slope / cliff-edge check: all 4 compass neighbours (~8 m away) must
        // also be land (h > 5).  Nodes placed on cliff faces appear to float in
        // the air because the terrain falls away beneath them.
        const SLOPE_D = 0.002  // ≈ 8 m on a 4 000 m sphere
        let onCliff = false
        for (let axis2 = 0; axis2 < 4; axis2++) {
          _nb.set(
            dir.x + (axis2 === 0 ? SLOPE_D : axis2 === 1 ? -SLOPE_D : 0),
            dir.y + (axis2 === 2 ? SLOPE_D : axis2 === 3 ? -SLOPE_D : 0),
            dir.z,
          ).normalize()
          if (terrainHeightAt(_nb) < 5) { onCliff = true; break }
        }
        if (onCliff) continue

        const r = PLANET_RADIUS + h - 0.4
        nodes.push({
          id: id++, type: nt.type, label: nt.label, matId: nt.matId, color: nt.color,
          x: dir.x * r, y: dir.y * r, z: dir.z * r,
        })
        placed = true
        break
      }

      if (!placed) {
        const h = terrainHeightAt(spawnDir)
        const r = PLANET_RADIUS + Math.max(h, 0) - 0.4
        nodes.push({
          id: id++, type: nt.type, label: nt.label, matId: nt.matId, color: nt.color,
          x: spawnDir.x * r, y: spawnDir.y * r, z: spawnDir.z * r,
        })
      }
    }
  }
  return nodes
}

// Module-level mutable arrays so systems can rebuild them when the authoritative
// server world seed changes without changing all call sites.
export const RESOURCE_NODES: ResourceNode[] = []

// Pre-compute surface-normal quaternions for each node once.
// Rotates local Y (tree up) → outward surface normal at that point on the sphere.
const _worldUp = new THREE.Vector3(0, 1, 0)
export const RESOURCE_NODE_QUATS: THREE.Quaternion[] = []

export const gatheredNodeIds = new Set<number>()
export const NODE_RESPAWN_AT = new Map<number, number>()
export const NODE_RESPAWN_DELAY = 60_000

// ── Node health system ────────────────────────────────────────────────────────
// Tracks hits-taken per node. When hits reach the node's max, it is gathered.
// Trees require 3 hits, rocks require 2 hits, other nodes require 1 hit.
// Resets when the node respawns.
export const NODE_HITS_TAKEN = new Map<number, number>()

// harvestPower thresholds:
//   1  = hand (no tool)
//   2  = stone tool / knife
//   3  = stone axe / copper knife
//   4  = iron knife
//   5  = iron axe / iron pickaxe
// Iron axe (harvestPower >= 5) fells trees in 2 hits instead of 3.
export function getNodeMaxHits(nodeType: string, harvestPower = 1): number {
  if (nodeType === 'wood') return harvestPower >= 5 ? 2 : 3
  if (nodeType === 'stone' || nodeType === 'flint' || nodeType === 'copper_ore'
    || nodeType === 'iron_ore' || nodeType === 'coal' || nodeType === 'tin_ore'
    || nodeType === 'sulfur' || nodeType === 'gold' || nodeType === 'silver'
    || nodeType === 'uranium') return 2
  // M38 Track C: biome-exclusive nodes require 2 hits (hard, crystalline)
  if (nodeType === 'volcanic_glass' || nodeType === 'glacier_ice'
    || nodeType === 'desert_crystal' || nodeType === 'shadow_iron'
    || nodeType === 'luminite') return 2
  // ancient_wood requires 3 hits like a tree; deep_coral requires 1 hit
  if (nodeType === 'ancient_wood') return harvestPower >= 5 ? 2 : 3
  return 1
}

export function rebuildResourceNodes(seed: number): void {
  gatheredNodeIds.clear()
  NODE_RESPAWN_AT.clear()
  NODE_HITS_TAKEN.clear()

  const next = generateResourceNodes(seed)
  const clayPositions = getRiverClayPositions()
  let id = next.length
  for (const [cx, cy, cz] of clayPositions) {
    next.push({
      id: id++,
      type: 'clay',
      label: 'River Clay',
      matId: MAT.CLAY,
      color: '#CC7744',
      x: cx, y: cy, z: cz,
    })
  }

  RESOURCE_NODES.length = 0
  RESOURCE_NODES.push(...next)

  RESOURCE_NODE_QUATS.length = 0
  for (const node of RESOURCE_NODES) {
    RESOURCE_NODE_QUATS.push(
      new THREE.Quaternion().setFromUnitVectors(
        _worldUp,
        new THREE.Vector3(node.x, node.y, node.z).normalize(),
      )
    )
  }
}
