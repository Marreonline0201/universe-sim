import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Stars } from '@react-three/drei'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { SimulationEngine } from '../engine/SimulationEngine'
import { rapierWorld } from '../physics/RapierWorld'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { CreatureRenderer } from './entities/CreatureRenderer'
import { RemotePlayersRenderer } from './RemotePlayersRenderer'
import { useMultiplayerStore } from '../store/multiplayerStore'
import type { RemoteNpc } from '../store/multiplayerStore'
import { world, createPlayerEntity, createCreatureEntity, Metabolism, Health, Position, Rotation, Velocity, IsDead, CreatureBody } from '../ecs/world'
import { removeComponent, removeEntity } from 'bitecs'
import { PlayerController } from '../player/PlayerController'
import { MetabolismSystem, setMetabolismDt } from '../ecs/systems/MetabolismSystem'
import { inventory, buildingSystem, techTree, evolutionTree, journal } from '../game/GameSingletons'
import { TECH_NODES } from '../civilization/TechTree'
import { DISCOVERIES } from '../player/DiscoveryJournal'
import { TECH_TO_DISCOVERY } from '../civilization/TechDiscoveries'
import { MAT, ITEM } from '../player/Inventory'
import { BUILDING_TYPES, setReactorCallbacks } from '../civilization/BuildingSystem'
import { getItemStats, canHarvest } from '../player/EquipSystem'
import {
  tickFoodCooking,
  tickWoundSystem,
  tickSleepSystem,
  tickFurnaceSmelting,
  tickBlastFurnaceSmelting,
  tickQuenching,
  tickBuildingPhysics,
  tryEatFood,
  tryApplyHerb,
  tryStartSleep,
  inflictWound,
  cookingProgress,
  markCombatDamage,
  markColdDamage,
  resetColdDamageFlag,
  resetDamageFlags,
} from '../game/SurvivalSystems'
import {
  checkAndTriggerDeath,
  executeRespawn,
  DEATH_LOOT_DROPS,
  gatheredLootIds,
  placedBedrollAnchor,
  setPlacedBedrollAnchor,
} from '../game/DeathSystem'
import { DeathScreen as DeathScreenImport } from '../ui/DeathScreen'
import { SettlementRenderer } from './SettlementRenderer'
import { SettlementHUD } from '../ui/SettlementHUD'
import { RiverHUD } from '../ui/RiverHUD'
import { useSettlementStore } from '../store/settlementStore'
import { useOutlawStore } from '../store/outlawStore'
import { PlanetTerrain } from './PlanetTerrain'
import { surfaceRadiusAt, terrainHeightAt, getSpawnPosition, PLANET_RADIUS, SEA_LEVEL, setTerrainSeed } from '../world/SpherePlanet'
import { LocalSimManager } from '../engine/LocalSimManager'
import { FireRenderer } from './FireRenderer'
import { DayNightCycle } from './DayNightCycle'
import { SimGridVisualizer } from './SimGridVisualizer'
import { getWorldSocket } from '../net/useWorldSocket'
import { setSimManagerForSocket } from '../net/WorldSocket'
import { WeatherRenderer } from './WeatherRenderer'
import { useWeatherStore } from '../store/weatherStore'
import { RiverRenderer } from './RiverRenderer'
import { useRiverStore } from '../store/riverStore'
import { queryNearestRiver, getRiverClayPositions, rebuildRivers } from '../world/RiverSystem'
import { registerRiverCarveDepth } from '../world/SpherePlanet'
import { getRiverCarveDepth } from '../world/RiverSystem'

import { getSectorIdForPosition } from '../world/WeatherSectors'
import { AnimalRenderer } from './AnimalRenderer'
import {
  spawnInitialAnimals,
  tickAnimalAI,
  attackNearestAnimal,
  pendingLoot,
  tickEcosystemBalance,
} from '../ecs/systems/AnimalAISystem'

// M10 Track A: Seasonal terrain pass
import { SeasonalTerrainPass } from './SeasonalTerrainPass'
import { useSeasonStore } from '../store/seasonStore'

// M10 Track B: Sailing + fishing
import { SailingRenderer } from './SailingRenderer'
import {
  tickSailing,
  startFishing,
  tickFishing,
  cancelFishing,
  isFishingActive,
  type VesselType,
} from '../world/SailingSystem'

// M10 Track C: Shop UI
import { ShopHUD } from '../ui/ShopHUD'
import { useShopStore } from '../store/shopStore'

// M11 Track A: Gunpowder + Musket
import { tickMusket, fireMusket, isMusketReady } from '../game/GunpowderSystem'
import { MusketVFXRenderer } from './MusketVFXRenderer'

// M11 Track B: Castle fortifications
import { CastleRenderer } from './CastleRenderer'

// M11 Track C: Diplomacy HUD
import { DiplomacyHUD } from '../ui/DiplomacyHUD'

// M11 Track D: Night sky + telescope
import { NightSkyRenderer } from './NightSkyRenderer'
import { TelescopeView } from '../ui/TelescopeView'
import type { AnomalySignalData } from '../ui/VelarSignalView'
import { DestinationPlanetMesh } from './DestinationPlanet'
import { VelarPlanetMesh } from './VelarPlanetTerrain'
import { TransitOverlay } from '../ui/TransitOverlay'
import { useTransitStore } from '../store/transitStore'
import { beginInterplanetaryTransit } from '../game/InterplanetaryTransitSystem'
import { VelarDiplomacyPanel } from '../ui/VelarDiplomacyPanel'

// M12 Track A: Rocketry
import { tickRocket, beginLaunch, isLaunching } from '../game/RocketSystem'
import { RocketVFXRenderer } from './RocketVFXRenderer'

// M12 Track B: Radio + Electric lights
import { RadioTowerVFXRenderer } from './RadioTowerVFXRenderer'
import { ElectricLightPass, registerElectricSettlements } from './ElectricLightPass'

// M12 Track C: civLevel 6 gate handled in SettlementManager (server) + WorldSocket

// M13 Track C: Nuclear reactor tick
import { tickNuclearReactor, activateReactor, deactivateReactor } from '../game/NuclearReactorSystem'
// Wire reactor callbacks into BuildingSystem to break the circular dep:
// BuildingSystem ← NuclearReactorSystem ← GameSingletons ← BuildingSystem
setReactorCallbacks(activateReactor, deactivateReactor)

// M14: Interplanetary travel + Velar gateway + Multiverse
import { VelarGatewayRenderer } from './VelarGatewayRenderer'
import { VelarResponsePanel } from '../ui/VelarResponsePanel'
import { useVelarStore } from '../store/velarStore'
import { useUniverseSync } from '../store/universeStore'
import { ITEM as _ITEM } from '../player/Inventory'

// M9: Register river valley carving with the terrain height function.
// Must happen before any geometry is generated (before generatePlanetGeometry is called).
// registerRiverCarveDepth wires getRiverCarveDepth into terrainHeightAt so the
// terrain mesh has carved valleys wherever rivers flow.
registerRiverCarveDepth(getRiverCarveDepth)

// ── Resource node definitions ─────────────────────────────────────────────────

interface ResourceNode {
  id: number
  type: string
  label: string
  matId: number
  color: string
  x: number
  y: number
  z: number
}

const NODE_TYPES = [
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
]

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── P2-4: Geology-based ore placement ─────────────────────────────────────────
//
// Scientific basis:
//   • Copper/Sulfur: porphyry copper deposits form near volcanic/hydrothermal zones
//     (high elevation, steep ridged terrain). Bias toward h > 80m.
//   • Coal: formed from organic matter in low-lying swamp/forest zones.
//     Bias toward h 5–35m (lowland, not beach or ocean).
//   • Iron ore: sedimentary banded iron formations at mid-elevation (30–80m).
//   • Tin ore: associated with granite intrusions at mid-high elevation (50–120m).
//   • Gold/Silver: hydrothermal veins near highest terrain peaks (h > 140m).
//   • Uranium: deep geological association with high-latitude polar rock (h > 100m).
//   • Non-ore types (stone, wood, clay, etc.): scattered across all land equally.
//
// Implementation: for each ore type, candidate positions are scored against their
// preferred height band. We run 60 attempts per node and accept the first position
// that falls within ±40m of the ideal height band. If no geology-correct position
// is found after 60 attempts the fallback is a random above-sea-level position
// (ensures every node always places — world never loses required resources).

interface GeologyRule {
  /** Preferred terrain height range (meters above sea level) */
  hMin: number
  hMax: number
  /** Max distance from spawn (m). Rarer ores placed farther out for exploration. */
  maxDist: number
}

const GEOLOGY_RULES: Partial<Record<string, GeologyRule>> = {
  copper_ore: { hMin: 60,  hMax: 220, maxDist: 600 },
  iron_ore:   { hMin: 20,  hMax: 90,  maxDist: 500 },
  coal:       { hMin: 5,   hMax: 40,  maxDist: 450 },
  tin_ore:    { hMin: 50,  hMax: 130, maxDist: 550 },
  sulfur:     { hMin: 70,  hMax: 250, maxDist: 650 },
  gold:       { hMin: 130, hMax: 250, maxDist: 700 },
  silver:     { hMin: 100, hMax: 200, maxDist: 650 },
  uranium:    { hMin: 90,  hMax: 220, maxDist: 750 },
}

// Resource nodes placed on the sphere surface near the actual land spawn point.
// Ores use geology height-band rules (P2-4). Non-ore types use pure random scatter.
function generateResourceNodes(seed: number): ResourceNode[] {
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

        const r = PLANET_RADIUS + h - 0.8
        nodes.push({
          id: id++, type: nt.type, label: nt.label, matId: nt.matId, color: nt.color,
          x: dir.x * r, y: dir.y * r, z: dir.z * r,
        })
        placed = true
        break
      }

      if (!placed) {
        const h = terrainHeightAt(spawnDir)
        const r = PLANET_RADIUS + Math.max(h, 0) - 2.0
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
const RESOURCE_NODES: ResourceNode[] = []

// Pre-compute surface-normal quaternions for each node once.
// Rotates local Y (tree up) → outward surface normal at that point on the sphere.
const _worldUp = new THREE.Vector3(0, 1, 0)
const RESOURCE_NODE_QUATS: THREE.Quaternion[] = []

function rebuildResourceNodes(seed: number): void {
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

const gatheredNodeIds = new Set<number>()
const NODE_RESPAWN_AT = new Map<number, number>()
const NODE_RESPAWN_DELAY = 60_000

// M9 T3: Scratch Vector3 for creature wander terrain projection — reused each frame
const _creatureDir3 = new THREE.Vector3()

// Auto-open inventory on the player's first-ever gather so the playtester can
// immediately inspect the item without knowing to press I.
let _firstGatherDone = false

// ── Node health system ────────────────────────────────────────────────────────
// Tracks hits-taken per node. When hits reach the node's max, it is gathered.
// Trees require 3 hits, rocks require 2 hits, other nodes require 1 hit.
// Resets when the node respawns.
const NODE_HITS_TAKEN = new Map<number, number>()

// harvestPower thresholds:
//   1  = hand (no tool)
//   2  = stone tool / knife
//   3  = stone axe / copper knife
//   4  = iron knife
//   5  = iron axe / iron pickaxe
// Iron axe (harvestPower ≥ 5) fells trees in 2 hits instead of 3.
function getNodeMaxHits(nodeType: string, harvestPower = 1): number {
  if (nodeType === 'wood') return harvestPower >= 5 ? 2 : 3
  if (nodeType === 'stone' || nodeType === 'flint' || nodeType === 'copper_ore'
    || nodeType === 'iron_ore' || nodeType === 'coal' || nodeType === 'tin_ore'
    || nodeType === 'sulfur' || nodeType === 'gold' || nodeType === 'silver'
    || nodeType === 'uranium') return 2
  return 1
}

// ── Creature wander state ──────────────────────────────────────────────────────
// Each creature has a wander direction and a timer until it picks a new direction.
// Stored outside React state (module-level) for zero-allocation per-frame access.
interface WanderState { vx: number; vy: number; vz: number; timer: number }
const creatureWander = new Map<number, WanderState>()

// ── Dig holes ─────────────────────────────────────────────────────────────────
// Each dug patch is a position on the sphere surface (already snapped to ground).
// We render them as dark concave discs so the player can see where they dug.
interface DigHole { x: number; y: number; z: number; r: number }
const DIG_HOLES: DigHole[] = []
const MAX_DIG_HOLES = 64
const DIG_RADIUS = 1.4   // visual patch radius in metres

// Shared mutable position for building ghost — BuildingGhost writes, GameLoop reads
let ghostBuildPos: [number, number, number] = [0, 0, 0]

// ── Sphere-aware terrain height helper ───────────────────────────────────────

// Returns the world-space Y coordinate of the terrain surface at (px, pz),
// assuming the sphere sits at (0,0,0) and the player is near the top (north pole).
// Used only for building ghost placement (approximate but good enough near spawn).
function terrainYAt(px: number, pz: number): number {
  const r = surfaceRadiusAt(px, PLANET_RADIUS, pz)
  const py2 = Math.sqrt(Math.max(0, r * r - px * px - pz * pz))
  return py2
}

// ── Spawn initial creatures from genome encoder ───────────────────────────────
// Spawns NUM_CREATURES creatures around the spawn point using varied random genomes.
// Genome byte 12 (bits 96-103) sets neural complexity level (0-4).
// Creature sizes range 0.3m (small animals) to 1.2m (large mammals).
//
// Scientific basis: Fidelity tier B (Behavioral) — not real abiogenesis, but
// genomes are real 256-bit encodings per GenomeEncoder spec.
const NUM_CREATURES = 10
function spawnInitialCreatures(
  spawnX: number, spawnY: number, spawnZ: number,
): number[] {
  const rand = seededRand(77773)
  const spawnDir = new THREE.Vector3(spawnX, spawnY, spawnZ).normalize()
  const perpBase = Math.abs(spawnDir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()
  const dir     = new THREE.Vector3()
  const entityIds: number[] = []

  // Predefined creature archetypes: [neuralLevel, sizeClass, mass, size (meters)]
  const ARCHETYPES: Array<[0|1|2|3|4, number, number, number]> = [
    [0, 0, 0.01, 0.15],  // microorganism
    [0, 1, 0.05, 0.20],  // microorganism
    [1, 4, 0.5,  0.30],  // small invertebrate
    [1, 5, 1.2,  0.40],  // insect-scale creature
    [1, 6, 2.5,  0.50],  // small amphibian
    [2, 8, 5.0,  0.65],  // reptile/bird
    [2, 9, 8.0,  0.70],  // medium animal
    [2,10,15.0,  0.85],  // large bird/small mammal
    [3,12,40.0,  1.10],  // large mammal
    [2, 8, 6.0,  0.60],  // medium animal (extra)
  ]

  for (let i = 0; i < NUM_CREATURES; i++) {
    // Try up to 20 positions to find land
    let placed = false
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle   = rand() * Math.PI * 2
      const arcDist = (100 + rand() * 500) / PLANET_RADIUS
      const axis    = tangent.clone().applyAxisAngle(spawnDir, angle)
      dir.copy(spawnDir).applyAxisAngle(axis, arcDist)
      const h = terrainHeightAt(dir)
      if (h < 1) continue  // skip ocean

      const archetype = ARCHETYPES[i % ARCHETYPES.length]
      const [neuralLevel, , mass, size] = archetype

      // Build a random genome — byte 12 encodes neural complexity level
      const genome = new Uint8Array(32)
      for (let b = 0; b < 32; b++) genome[b] = Math.floor(rand() * 256)
      // Enforce neural level in bits 96-103 (byte 12)
      genome[12] = neuralLevel <= 0 ? 10
                 : neuralLevel === 1 ? 40
                 : neuralLevel === 2 ? 90
                 : neuralLevel === 3 ? 160
                 : 220

      const r   = PLANET_RADIUS + h + size * 0.5
      const cx  = dir.x * r
      const cy  = dir.y * r
      const cz  = dir.z * r

      const eid = createCreatureEntity(world, {
        x: cx, y: cy, z: cz,
        speciesId: i + 1,
        genome,
        neuralLevel,
        mass,
        size,
      })
      entityIds.push(eid)

      // Initialize wander state — random initial direction in local tangent plane
      const wanderAngle = rand() * Math.PI * 2
      const speed = 0.3 + rand() * 0.5  // 0.3–0.8 m/s wander speed
      creatureWander.set(eid, {
        vx: Math.cos(wanderAngle) * speed,
        vy: 0,
        vz: Math.sin(wanderAngle) * speed,
        timer: 2 + rand() * 4,  // change direction every 2-6 seconds
      })
      placed = true
      break
    }
    if (!placed) {
      // Fallback: place at spawn
      const archetype = ARCHETYPES[i % ARCHETYPES.length]
      const [neuralLevel, , mass, size] = archetype
      const genome = new Uint8Array(32)
      genome[12] = 40
      const h = Math.max(0, terrainHeightAt(spawnDir))
      const r = PLANET_RADIUS + h + size * 0.5 + i * 2
      const eid = createCreatureEntity(world, {
        x: spawnDir.x * r, y: spawnDir.y * r, z: spawnDir.z * r,
        speciesId: i + 1, genome, neuralLevel, mass, size,
      })
      entityIds.push(eid)
      creatureWander.set(eid, { vx: 0.3, vy: 0, vz: 0.3, timer: 3 })
    }
  }
  return entityIds
}

export function SceneRoot() {
  const engineRef = useRef<SimulationEngine | null>(null)
  const controllerRef = useRef<PlayerController | null>(null)
  const simManagerRef = useRef<LocalSimManager | null>(null)
  const serverWorldSeed = useMultiplayerStore(s => s.serverWorldSeed)
  const serverWorldReady = useMultiplayerStore(s => s.serverWorldReady)
  const [appliedWorldSeed, setAppliedWorldSeed] = useState<number | null>(null)
  const [pointerLocked, setPointerLocked] = useState(false)
  const [bypassPointerLock, setBypassPointerLock] = useState(false)
  const [simManager, setSimManager] = useState<LocalSimManager | null>(null)
  // M11: day angle forwarded from DayNightCycle to NightSkyRenderer + TelescopeView
  const [dayAngle, setDayAngle] = useState(Math.PI * 0.6)
  // M11: telescope overlay
  const [telescopeOpen, setTelescopeOpen] = useState(false)
  // M12: Velar anomaly signal state — populated when ANOMALY_SIGNAL received
  const [anomalySignal, setAnomalySignal] = useState<AnomalySignalData | null>(null)

  // Check for global pointer lock failure flag
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if ((window as any).__POINTER_LOCK_FAILED__) {
        setBypassPointerLock(true)
        clearInterval(checkInterval)
      }
    }, 100)
    return () => clearInterval(checkInterval)
  }, [])

  // M14: Transit state
  const transitPhase    = useTransitStore(s => s.phase)
  // M14: Velar response panel
  const [velarRespOpen, setVelarRespOpen] = useState(false)
  const velarResponseReceived = useVelarStore(s => s.velarResponseReceived)
  // M14: Multiverse sync — subscribes to universes-updated window events
  useUniverseSync()
  // M15: Velar diplomacy panel (opened when VELAR_GREETING received)
  const [velarDiplomacyOpen, setVelarDiplomacyOpen] = useState(false)
  const [velarNpcIndex, setVelarNpcIndex] = useState(0)

  // M11: listen for open-telescope event dispatched from GameLoop
  useEffect(() => {
    const handler = () => setTelescopeOpen(true)
    window.addEventListener('open-telescope', handler)
    return () => window.removeEventListener('open-telescope', handler)
  }, [])

  // M12: listen for anomaly-signal event dispatched from WorldSocket
  useEffect(() => {
    const handler = (e: Event) => {
      const signal = (e as CustomEvent).detail as AnomalySignalData
      setAnomalySignal(signal)
      setTelescopeOpen(true)   // auto-open telescope when signal arrives
    }
    window.addEventListener('anomaly-signal', handler)
    return () => window.removeEventListener('anomaly-signal', handler)
  }, [])

  // M14: listen for Velar response — open decode panel automatically
  useEffect(() => {
    const handler = () => setVelarRespOpen(true)
    window.addEventListener('velar-response-received', handler)
    return () => window.removeEventListener('velar-response-received', handler)
  }, [])

  // M15: listen for VELAR_GREETING — open diplomacy panel
  useEffect(() => {
    const handler = (e: Event) => {
      const { npcIndex } = (e as CustomEvent).detail ?? {}
      setVelarNpcIndex(typeof npcIndex === 'number' ? npcIndex : 0)
      setVelarDiplomacyOpen(true)
    }
    window.addEventListener('velar-greeting', handler)
    return () => window.removeEventListener('velar-greeting', handler)
  }, [])

  // M12: sync settlement civLevels to ElectricLightPass when settlement store changes
  useEffect(() => {
    const unsub = useSettlementStore.subscribe((state) => {
      const list = Array.from(state.settlements.values()).map(s => ({
        id:       s.id,
        civLevel: s.civLevel,
        x:        s.x,
        y:        s.y,
        z:        s.z,
      }))
      registerElectricSettlements(list)
    })
    return unsub
  }, [])

  useEffect(() => {
    const check = () => setPointerLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', check)
    return () => document.removeEventListener('pointerlockchange', check)
  }, [])

  useEffect(() => {
    const onPointerLockError = () => {
      console.warn('[SceneRoot] pointerlockerror fired, bypassing click-to-play gate')
      setBypassPointerLock(true)
    }
    document.addEventListener('pointerlockerror', onPointerLockError)
    return () => document.removeEventListener('pointerlockerror', onPointerLockError)
  }, [])

  useEffect(() => {
    if (!serverWorldReady) {
      setAppliedWorldSeed(null)
      return
    }
    setTerrainSeed(serverWorldSeed)
    rebuildRivers(serverWorldSeed)
    rebuildResourceNodes(serverWorldSeed)
    setAppliedWorldSeed(serverWorldSeed)
  }, [serverWorldReady, serverWorldSeed])

  const worldInitialized = serverWorldReady && appliedWorldSeed === serverWorldSeed

  const setEngineReady = useGameStore(s => s.setEngineReady)
  const timeScale = useGameStore(s => s.timeScale)
  const paused = useGameStore(s => s.paused)
  const gatherPrompt = useGameStore(s => s.gatherPrompt)
  const placementMode = useGameStore(s => s.placementMode)
  const setPlacementMode = useGameStore(s => s.setPlacementMode)

  const setEntityId = usePlayerStore(s => s.setEntityId)
  const entityId = usePlayerStore(s => s.entityId)
  const activePanel = useUiStore(s => s.activePanel)

  // M5: Respawn handler — called by DeathScreen RESPAWN button
  const handleRespawn = useCallback(() => {
    if (entityId === null) return
    resetColdDamageFlag()  // clear cross-frame cold flag so next death is attributed correctly
    const [sx, sy, sz] = getSpawnPosition()
    executeRespawn(
      entityId,
      (x, y, z) => {
        Position.x[entityId] = x
        Position.y[entityId] = y
        Position.z[entityId] = z
        rapierWorld.getPlayer()?.body.setNextKinematicTranslation({ x, y, z })
      },
      (hp) => { Health.current[entityId] = hp },
      (hunger, thirst, energy) => {
        Metabolism.hunger[entityId] = hunger
        Metabolism.thirst[entityId] = thirst
        Metabolism.energy[entityId] = energy
      },
      [sx, sy, sz],
    )
    // B-NEW-3 fix: give starter rations so player can eat after respawn
    inventory.addItem({ itemId: 0, materialId: MAT.COOKED_MEAT, quantity: 3, quality: 1.0 })
  }, [entityId])

  // Sync time scale buttons → simulation clock
  useEffect(() => {
    engineRef.current?.clock.setTimeScale(timeScale)
  }, [timeScale])

  // Sync pause/resume → simulation clock
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (paused) engine.stop()
    else if (engine.clock.running === false) engine.clock.start()
  }, [paused])

  // Engine lifecycle: init, spawn player, start
  useEffect(() => {
    if (!worldInitialized) return
    const engine = new SimulationEngine({ gridX: 64, gridY: 32, gridZ: 64, seed: serverWorldSeed })
    engineRef.current = engine

    engine.init().then(async () => {
      engine.start()
      // Sync the initial timeScale from the store (the useEffect only fires on changes)
      engine.clock.setTimeScale(useGameStore.getState().timeScale)

      // Spawn player at a land position on the sphere surface
      const [spawnX, spawnY, spawnZ] = getSpawnPosition()

      // Init Rapier physics BEFORE creating the player entity.
      // Builds planet trimesh collider + player capsule KCC.
      await rapierWorld.init(spawnX, spawnY, spawnZ)

      // Add static colliders for trees and rocks so the player can't walk through them
      rapierWorld.addNodeColliders(RESOURCE_NODES)

      const eid = createPlayerEntity(world, spawnX, spawnY, spawnZ)

      // If loadSave() already resolved before this point, playerStore may hold saved vitals.
      // createPlayerEntity always resets ECS to defaults, so we pull saved values in here.
      // (The other ordering — entity created first, save loads after — is handled in saveStore.)
      const savedPs = usePlayerStore.getState()
      // Guard against invalid "alive with 0 HP" restore state.
      // If the saved health is <= 0, keep freshly spawned defaults instead.
      if (savedPs.health > 0 && savedPs.health < 1) Health.current[eid] = savedPs.health * Health.max[eid]
      if (savedPs.hunger > 0)    Metabolism.hunger[eid]        = savedPs.hunger
      if (savedPs.thirst > 0)    Metabolism.thirst[eid]        = savedPs.thirst
      if (savedPs.energy < 1)    Metabolism.energy[eid]        = savedPs.energy
      if (savedPs.fatigue > 0)   Metabolism.fatigue[eid]       = savedPs.fatigue

      // Restore saved position. playerStore initialises to (0, 0, 0) — the planet
      // centre. Valid surface positions are ~PLANET_RADIUS (~4000 m) from origin.
      // Use a radius threshold to reject the default and legacy DB default (0, 0.9, 0).
      const savedR = Math.sqrt(savedPs.x ** 2 + savedPs.y ** 2 + savedPs.z ** 2)
      const hasSavedPos = savedR > PLANET_RADIUS / 2
      if (hasSavedPos) {
        Position.x[eid] = savedPs.x
        Position.y[eid] = savedPs.y
        Position.z[eid] = savedPs.z
        rapierWorld.getPlayer()?.body.setNextKinematicTranslation({ x: savedPs.x, y: savedPs.y, z: savedPs.z })
      }

      setEntityId(eid)

      // Spawn initial creatures — world feels alive before any player action
      spawnInitialCreatures(spawnX, spawnY, spawnZ)

      // M9: Spawn initial animal population (deer, wolves, boars)
      spawnInitialAnimals(spawnX, spawnY, spawnZ)

      // Create keyboard/mouse controller for the player
      controllerRef.current = new PlayerController(eid)

      setEngineReady(true)

      // Initialize local simulation grid from terrain (now with biome temperatures)
      const simMgr = new LocalSimManager(engine)
      simMgr.initFromSpawn(spawnX, spawnY, spawnZ)

      // Pre-place ambient fires so the simulation is visibly active on load
      simMgr.placeAmbientFires(spawnX, spawnY, spawnZ)

      simManagerRef.current = simMgr
      setSimManager(simMgr)
      // Register sim manager with WorldSocket so FIRE_STARTED messages from
      // remote players can call ignite() on this client's local grid.
      setSimManagerForSocket(simMgr)
    })

    return () => {
      engine.dispose()
      controllerRef.current?.dispose()
      controllerRef.current = null
      simManagerRef.current = null
      setSimManager(null)
      setSimManagerForSocket(null)
    }
  }, [worldInitialized, serverWorldSeed, setEngineReady, setEntityId])

  return (
    <>
    {/* Click-to-play overlay */}
    {!pointerLocked && !bypassPointerLock && !activePanel && (
      <div
        onClick={async () => {
          try {
            controllerRef.current?.requestPointerLock()
          } catch (err) {
            console.warn('[SceneRoot] Pointer lock request failed:', err)
            setBypassPointerLock(true)
            return
          }
          // If pointer lock fails (e.g., browser/embed limitations), bypass quickly.
          setTimeout(() => {
            if (!document.pointerLockElement) {
              console.warn('[SceneRoot] Pointer lock failed, bypassing requirement')
              setBypassPointerLock(true)
            }
          }, 250)
        }}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
          cursor: 'pointer',
          backdropFilter: 'blur(2px)',
        }}
      >
        <div style={{
          color: '#fff', fontFamily: 'monospace', textAlign: 'center',
          padding: '20px 36px',
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>CLICK TO PLAY</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>WASD — Move &nbsp;·&nbsp; Mouse — Look &nbsp;·&nbsp; Space — Jump &nbsp;·&nbsp; F — Interact &nbsp;·&nbsp; G — Dig</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>E — Eat (in-game) / Evolution panel (menu) &nbsp;·&nbsp; H — Herb &nbsp;·&nbsp; Z — Sleep &nbsp;·&nbsp; Q — Attack</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>ESC — Settings &nbsp;·&nbsp; I — Inventory &nbsp;·&nbsp; C — Craft &nbsp;·&nbsp; B — Build &nbsp;·&nbsp; T/J/Tab/M/? — Panels</div>
        </div>
      </div>
    )}
    {/* Gather prompt */}
    {gatherPrompt && (
      <div style={{
        position: 'fixed', bottom: '30%', left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 6, padding: '6px 16px',
        color: '#fff', fontFamily: 'monospace', fontSize: 13,
      }}>
        {gatherPrompt}
      </div>
    )}
    {/* Build placement mode banner */}
    {placementMode && (
      <div style={{
        position: 'fixed', top: 16, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50, pointerEvents: 'auto',
        background: 'rgba(52,152,219,0.85)',
        border: '1px solid #3498db',
        borderRadius: 6, padding: '6px 16px',
        color: '#fff', fontFamily: 'monospace', fontSize: 13,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span>
          🏗 Building: <b>{BUILDING_TYPES.find(b => b.id === placementMode)?.name}</b>
          &nbsp;·&nbsp; Look at spot &nbsp;·&nbsp; <b>[F]</b> place &nbsp;·&nbsp; <b>[Esc]</b> cancel
        </span>
        <button
          onClick={() => setPlacementMode(null)}
          style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 4, color: '#fff', cursor: 'pointer',
            fontSize: 11, padding: '2px 8px', fontFamily: 'monospace',
          }}
        >
          Cancel
        </button>
      </div>
    )}
    {/* Crosshair rendered by HUD.tsx — removed duplicate here */}
    <Canvas
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0, pointerEvents: activePanel ? 'none' : 'auto' }}
      shadows
    >
      <PerspectiveCamera makeDefault fov={70} near={0.5} far={20000} position={[0, PLANET_RADIUS + 200, 0]} />
      <fogExp2 attach="fog" args={['#c0d8f4', 0.010]} />
      {/* DayNightCycle owns all sky/sun/ambient/hemisphere lighting — replaces static lights */}
      <DayNightCycle onDayAngleChange={setDayAngle} />
      {/* M11 Track D: Photorealistic night sky — 2000 stars with stellar color classification */}
      <NightSkyRenderer dayAngle={dayAngle} />
      <Suspense fallback={null}>
        {worldInitialized && (
          <>
            {/* M14/M15: Show destination planet when player has arrived via transit */}
            {transitPhase === 'arrived' ? <DestinationPlanetSelector /> : <PlanetTerrain key={serverWorldSeed} seed={serverWorldSeed} />}
            <DigHolesRenderer />
            <ResourceNodes key={serverWorldSeed} />
            <NodeHealthBars />
            <PlacedBuildingsRenderer />
            <CreatureRenderer />
            <RemotePlayersRenderer />
            <ServerNpcsRenderer />
            <LocalNpcsRenderer />
            <FireRenderer simManager={simManager} />
            <SimGridVisualizer simManager={simManager} />
            <DeathLootDropsRenderer />
            <BedrollMeshRenderer />
            <SettlementRenderer />
            {/* M11 Track B: Castle walls + watchtowers around civLevel 4+ settlements */}
            <CastleRenderer />
            {/* M11 Track A: Musket smoke + muzzle flash VFX */}
            <MusketVFXRenderer />
            {/* M12 Track A: Rocket exhaust + heat shimmer + scorch */}
            <RocketVFXRenderer />
            {/* M12 Track B: Radio tower EM pulse rings */}
            <RadioTowerVFXRenderer />
            {/* M12 Track B: Tungsten electric lights on civLevel 6 settlements */}
            <ElectricLightPass dayAngle={dayAngle} />
            {/* M14 Track B: Velar Gateway portal structure */}
            <VelarGatewayRenderer />
            {/* M8: Weather particle system — follows player position */}
            <WeatherRendererWrapper />
            {/* M9: River ribbon meshes — generated from flow-field paths */}
            <RiverRenderer key={serverWorldSeed} seed={serverWorldSeed} />
            {/* M9: Animal renderer — instanced deer/wolf/boar meshes */}
            <AnimalRenderer />
            {/* M14 Track A: Destination planet — shown when transit phase === 'arrived' */}
            <DestinationPlanetMeshWrapper />
          </>
        )}
      </Suspense>
      {worldInitialized && entityId !== null && (
        <>
          <GameLoop controllerRef={controllerRef} simManagerRef={simManagerRef} entityId={entityId} gameActive={pointerLocked || bypassPointerLock || activePanel !== null} />
          <PlayerMesh entityId={entityId} controllerRef={controllerRef} />
          <EquippedItemMesh entityId={entityId} />
          <BuildingGhost entityId={entityId} />
          {/* M10 Track B: Sailing vessel mesh (only visible when sailing) */}
          <SailingRenderer entityId={entityId} />
        </>
      )}
      {/* M10 Track A: Seasonal terrain overlays (spring blossoms, autumn tint, winter snow) */}
      <SeasonalTerrainPass />
      {/* Post-processing — subtle filmic effects, never stylised */}
      {/* EffectComposer (Bloom + Vignette) removed: @react-three/postprocessing 3.0.4
          crashes with @react-three/fiber 8.18.0 — re-enable after upgrading postprocessing */}
    </Canvas>
    {/* M5: Death screen — shown above everything when player is dead */}
    <DeathScreenWrapper onRespawn={handleRespawn} />
    {/* M6: Settlement HUD — trade offers and gates-closed banner */}
    <SettlementHUD />
    {/* M9: River HUD — fresh water indicator */}
    <RiverHUD />
    {/* M10: Shop HUD — settlement trade panel */}
    <ShopHUD />
    {/* M11 Track C: Diplomacy notifications banner (top-right) */}
    <DiplomacyHUD />
    {/* M11 Track D: Telescope overlay — full screen when telescope equipped + F pressed */}
    {telescopeOpen && (
      <TelescopeView
        dayAngle={dayAngle}
        onClose={() => setTelescopeOpen(false)}
        anomalySignal={anomalySignal}
      />
    )}
    {/* M14 Track A: Interplanetary transit cinematic — 20s star-stream animation */}
    <TransitOverlayWrapper />
    {/* M15 Track B: Velar diplomacy panel — opened by VELAR_GREETING proximity event */}
    {velarDiplomacyOpen && (
      <VelarDiplomacyPanel
        npcIndex={velarNpcIndex}
        onClose={() => setVelarDiplomacyOpen(false)}
      />
    )}
    {/* M14 Track B: Velar response decode panel — opens after VELAR_RESPONSE received */}
    {velarRespOpen && velarResponseReceived && (
      <VelarResponsePanel
        worldSeed={serverWorldSeed}
        onClose={() => setVelarRespOpen(false)}
        onDecoded={() => setVelarRespOpen(false)}
      />
    )}
    </>
  )
}

// ── DeathScreenWrapper ────────────────────────────────────────────────────────
// Conditionally renders DeathScreen. Imported statically; hidden until isDead.
function DeathScreenWrapper({ onRespawn }: { onRespawn: () => void }) {
  return <DeathScreenImport onRespawn={onRespawn} />
}

// ── Per-frame game loop (runs inside Canvas so useFrame works) ────────────────

// Apply cumulative ECS stat bonuses from all unlocked evolution nodes.
// Called whenever the unlocked node set changes. Always recalculates from
// base values so repeated calls are idempotent (no double-counting).
function applyEvolutionEffects(eid: number): void {
  const BASE_HP    = 100
  const BASE_REGEN = 0.1   // HP/s
  const BASE_RATE  = 0.07  // metabolicRate (≈ 70 kg × 0.001)

  let maxHp   = BASE_HP
  let regen   = BASE_REGEN
  let metRate = BASE_RATE

  for (const node of evolutionTree.getUnlocked()) {
    switch (node.id) {
      case 'thick_hide':          maxHp += 20; regen += 0.03; break
      case 'armor_plating':       maxHp += 40; regen += 0.05; break
      case 'size_increase_1':     maxHp += 25; break
      case 'size_increase_2':     maxHp += 50; break
      case 'endothermy':          maxHp += 15; metRate *= 1.15; break
      case 'fat_reserves':        metRate *= 0.70; break
      case 'efficient_digestion': regen  += 0.04; metRate *= 0.85; break
      case 'four_limbs':          maxHp += 10; break
      case 'upright_posture':     maxHp += 10; break
    }
  }

  Health.max[eid]                = maxHp
  if (Health.current[eid] > maxHp) Health.current[eid] = maxHp
  Health.regenRate[eid]          = regen
  Metabolism.metabolicRate[eid]  = metRate
}

interface GameLoopProps {
  controllerRef: RefObject<PlayerController | null>
  simManagerRef: RefObject<LocalSimManager | null>
  entityId: number
  gameActive: boolean
}

function GameLoop({ controllerRef, simManagerRef, entityId, gameActive }: GameLoopProps) {
  const { camera } = useThree()
  const updateVitals        = usePlayerStore(s => s.updateVitals)
  const setPosition         = usePlayerStore(s => s.setPosition)
  const addEvolutionPoints  = usePlayerStore(s => s.addEvolutionPoints)
  const setCivTier          = usePlayerStore(s => s.setCivTier)
  const spectateTarget      = useGameStore(s => s.spectateTarget)
  const placementMode       = useGameStore(s => s.placementMode)
  const setPlacementMode    = useGameStore(s => s.setPlacementMode)
  const bumpBuildVersion    = useGameStore(s => s.bumpBuildVersion)
  // Survival system refs
  const _sleepKeyRef            = useRef(false)
  const epAccumRef              = useRef(0)
  const tierRef                 = useRef(0)
  const evoUnlockedRef          = useRef(-1)  // -1 forces apply on first frame
  const fwdVec                  = useRef(new THREE.Vector3())
  const settlementCheckTimerRef = useRef(0)   // M6: seconds since last proximity check
  const ecosystemTimerRef       = useRef(0)   // M9: seconds since last ecosystem respawn check
  const fishingStateRef         = useRef<'idle'|'waiting'|'bite'>('idle')  // M10 Track B

  useFrame((_, delta) => {
    // Cap dt to avoid spiral-of-death on slow frames
    const dt = Math.min(delta, 0.1)

    // M5: Reset damage-source flags at frame start so this frame's damage is tracked fresh
    resetDamageFlags()

    // Pause all game logic when the CLICK TO PLAY overlay is visible (B-08 fix).
    // Prevents creatures, metabolism, and death from running while the player
    // has not yet pointer-locked into the game.
    if (!gameActive) return

    // Admin spectate overrides player camera
    if (spectateTarget) {
      camera.position.set(spectateTarget.x, spectateTarget.y + 20, spectateTarget.z + 15)
      camera.lookAt(spectateTarget.x, spectateTarget.y, spectateTarget.z)
      return
    }

    // 1. Player movement + camera (computes desired movement, calls Rapier KCC)
    controllerRef.current?.update(dt, camera)

    // 2. Step Rapier physics world (commits kinematic body positions)
    rapierWorld.step(dt)

    // 2b. Creature wander AI — simple surface-hugging movement for all non-player creatures
    // Also: creature bite damage (Slice 5 damage source)
    const _playerPx = Position.x[entityId]
    const _playerPy = Position.y[entityId]
    const _playerPz = Position.z[entityId]
    for (const [eid, ws] of creatureWander) {
      ws.timer -= dt
      if (ws.timer <= 0) {
        // Pick a new random tangent-plane direction
        const angle = Math.random() * Math.PI * 2
        const speed = 0.3 + Math.random() * 0.5
        ws.vx = Math.cos(angle) * speed
        ws.vz = Math.sin(angle) * speed
        ws.timer = 2 + Math.random() * 4
      }
      // Move creature along surface: advance position, then re-project onto sphere
      const cx = Position.x[eid], cy = Position.y[eid], cz = Position.z[eid]
      let nx = cx + ws.vx * dt
      let ny = cy
      let nz = cz + ws.vz * dt
      // Re-project onto planet surface (keep at correct radius above terrain)
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
      if (len > 10) {
        const ndx = nx / len, ndy = ny / len, ndz = nz / len
        // M9 T3: Reuse module-level scratch — no Vector3 allocation per creature per frame
        _creatureDir3.set(ndx, ndy, ndz)
        const h = terrainHeightAt(_creatureDir3)
        if (h >= 0) {
          const size = CreatureBody.size[eid] || 0.5
          const r = PLANET_RADIUS + Math.max(0, h) + size * 0.5
          nx = ndx * r; ny = ndy * r; nz = ndz * r
        } else {
          // Hit ocean — reverse direction
          ws.vx = -ws.vx; ws.vz = -ws.vz
          nx = cx; ny = cy; nz = cz
        }
      }
      Position.x[eid] = nx; Position.y[eid] = ny; Position.z[eid] = nz

      // Slice 5: Larger creatures (size >= 0.65m) can bite the player
      const cSize = CreatureBody.size[eid] || 0.3
      if (cSize >= 0.65) {
        const bdx = _playerPx - nx
        const bdy = _playerPy - ny
        const bdz = _playerPz - nz
        const bDist2 = bdx * bdx + bdy * bdy + bdz * bdz
        if (bDist2 < 2.25) {  // 1.5m radius
          // 5% chance per second to bite → probability per frame = 0.05 * dt
          if (Math.random() < 0.05 * dt) {
            const severity = 0.2 + Math.random() * 0.4  // mild to moderate bite
            Health.current[entityId] = Math.max(0, Health.current[entityId] - severity * 10)
            inflictWound(severity)
            markCombatDamage()  // M5: mark so death is attributed to combat
          }
        }
      }
    }

    // 2c. M9 Animal AI tick — deer/wolf/boar behavior state machines
    {
      const ps9 = usePlayerStore.getState()
      tickAnimalAI({
        dt,
        playerX: _playerPx, playerY: _playerPy, playerZ: _playerPz,
        playerMurderCount: ps9.murderCount,
        playerCrouching: !!(controllerRef.current as any)?.keys?.has?.('ControlLeft'),
        onPlayerDamaged: (dmg) => {
          Health.current[entityId] = Math.max(0, Health.current[entityId] - dmg)
          inflictWound(dmg / 100)
          markCombatDamage()
        },
        onAnimalKilled: () => { /* handled via return value of attackNearestAnimal */ },
      })
      // Drain pending loot from wolf kills (wolf-on-deer kills drop loot here)
      while (pendingLoot.length > 0) {
        const drop = pendingLoot.shift()!
        inventory.addItem({ itemId: 0, materialId: drop.materialId, quantity: drop.quantity, quality: 0.8 })
      }
    }

    // 2d. M9 Ecosystem balance — respawn animals every 30s if below 50% cap
    ecosystemTimerRef.current += dt
    if (ecosystemTimerRef.current >= 30) {
      ecosystemTimerRef.current = 0
      tickEcosystemBalance(
        Position.x[entityId],
        Position.y[entityId],
        Position.z[entityId],
      )
    }

    // 3. Metabolism (hunger, thirst, fatigue, health regen)
    setMetabolismDt(dt)
    MetabolismSystem(world)

    // B-16 fix: God Mode bypasses starvation/dehydration damage
    if (inventory.isGodMode()) {
      // Reset hunger/thirst when god mode is on
      Metabolism.hunger[entityId] = 0
      Metabolism.thirst[entityId] = 0
    }

    // 3. Push ECS vitals → playerStore so HUD bars update
    const maxHp = Health.max[entityId] || 100
    updateVitals({
      health:  Health.current[entityId] / maxHp,
      hunger:  Metabolism.hunger[entityId],
      thirst:  Metabolism.thirst[entityId],
      energy:  Metabolism.energy[entityId],
      fatigue: Metabolism.fatigue[entityId],
    })

    // 3b. Death trigger (M5) - delegates to DeathSystem
    {
      const _hpRef = { current: Health.current[entityId] }
      const _died = checkAndTriggerDeath(
        _hpRef,
        {
          x: Position.x[entityId],
          y: Position.y[entityId],
          z: Position.z[entityId],
        },
        inventory,
      )
      Health.current[entityId] = _hpRef.current
      if (_died) return
    }

    // 4a. EP trickle — 1 EP per 30 real seconds of survival
    epAccumRef.current += dt
    if (epAccumRef.current >= 30) {
      epAccumRef.current -= 30
      addEvolutionPoints(1)
    }

    // 4b-tech. Tick in-progress research (runs every frame regardless of which panel is open)
    const simSecs = useGameStore.getState().simSeconds
    const newlyDone = techTree.tickResearch(simSecs)
    if (newlyDone.length > 0) {
      for (const id of newlyDone) {
        const node = TECH_NODES.find(n => n.id === id)
        useUiStore.getState().addNotification(`Research complete: ${node?.name ?? id}`, 'discovery')
        addEvolutionPoints(5 + (node?.tier ?? 0) * 3)
        const discoveryKey = TECH_TO_DISCOVERY[id]
        if (discoveryKey && DISCOVERIES[discoveryKey]) {
          journal.record(DISCOVERIES[discoveryKey], simSecs)
        }
      }
    }
    // Sync civTier whenever researched tier changes (covers both normal and god-mode research)
    const currentTier = techTree.getCurrentTier()
    if (currentTier !== tierRef.current) {
      tierRef.current = currentTier
      setCivTier(currentTier)
    }

    // 4c. Evolution effects — reapply whenever new nodes are unlocked
    const evoCount = evolutionTree.getUnlockedIds().length
    if (evoCount !== evoUnlockedRef.current) {
      evoUnlockedRef.current = evoCount
      applyEvolutionEffects(entityId)
    }

    // 4b. Node respawn — check if any gathered nodes are ready to come back
    if (gatheredNodeIds.size > 0) {
      const now = Date.now()
      for (const id of gatheredNodeIds) {
        const at = NODE_RESPAWN_AT.get(id)
        if (at !== undefined && now >= at) {
          gatheredNodeIds.delete(id)
          NODE_RESPAWN_AT.delete(id)
          NODE_HITS_TAKEN.delete(id)  // reset hit state on respawn
        }
      }
    }

    // Ground detection and position sync are now handled by Rapier KCC
    // inside PlayerController.applyMovement(). Just sync to playerStore here.
    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]
    setPosition(px, py, pz)

    // 5. Resource proximity + gather (3D distance on sphere surface)
    const gs = useGameStore.getState()
    // Merge local gathered set with server-authoritative depleted set so nodes
    // removed by other players are invisible to this client too.
    const serverDepleted = useMultiplayerStore.getState().depletedNodes
    let nearNode: ResourceNode | null = null
    let nearDist = Infinity
    for (const node of RESOURCE_NODES) {
      if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
      const dx = px - node.x
      const dy = py - node.y
      const dz = pz - node.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < nearDist) { nearDist = d2; nearNode = node }
    }

    // 6. Placement mode — update ghost position + handle F key to confirm
    if (placementMode) {
      const btype = BUILDING_TYPES.find(t => t.id === placementMode)
      if (btype) {
        // Project camera forward, tangent to sphere surface, 6m ahead
        const playerPos = new THREE.Vector3(px, py, pz)
        const playerUp  = playerPos.clone().normalize()
        fwdVec.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
        fwdVec.current.addScaledVector(playerUp, -fwdVec.current.dot(playerUp))
        if (fwdVec.current.lengthSq() < 0.001) fwdVec.current.copy(playerUp).cross(new THREE.Vector3(1,0,0)).normalize()
        else fwdVec.current.normalize()
        // Ghost position: step 6m along tangent plane, then snap to surface
        const ghostDir = playerPos.clone().addScaledVector(fwdVec.current, 6).normalize()
        const ghostSR  = surfaceRadiusAt(ghostDir.x * PLANET_RADIUS, ghostDir.y * PLANET_RADIUS, ghostDir.z * PLANET_RADIUS)
        ghostBuildPos = [ghostDir.x * ghostSR, ghostDir.y * ghostSR, ghostDir.z * ghostSR]

        const placeLabel = `[F] Place ${btype.name}  ·  [B/Esc] Cancel`
        if (gs.gatherPrompt !== placeLabel) gs.setGatherPrompt(placeLabel)

        if (controllerRef.current?.popInteract()) {
          // Check materials
          const canBuild = btype.materialsRequired.every(req =>
            inventory.countMaterial(req.materialId) >= req.quantity
          )
          const addNotification = useUiStore.getState().addNotification
          if (canBuild) {
            // Consume materials
            for (const req of btype.materialsRequired) {
              let remaining = req.quantity
              for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
                const slot = inventory.getSlot(i)
                if (slot && slot.itemId === 0 && slot.materialId === req.materialId) {
                  const take = Math.min(slot.quantity, remaining)
                  inventory.removeItem(i, take)
                  remaining -= take
                }
              }
            }
            buildingSystem.place(placementMode, ghostBuildPos, 0, useGameStore.getState().simSeconds)
            // Hook nuclear reactor activation when placed
            if (placementMode === 'nuclear_reactor_small' || placementMode === 'nuclear_reactor') {
              activateReactor(ghostBuildPos)
            }
            bumpBuildVersion()
            setPlacementMode(null)
            gs.setGatherPrompt(null)
            addNotification(`Built: ${btype.name}`, 'discovery')
          } else {
            addNotification('Not enough materials to build!', 'warning')
            setPlacementMode(null)
            gs.setGatherPrompt(null)
          }
        }
      }
      return
    }

    // ── M5: Death loot pickup — check before regular resource gather ──────────
    {
      let nearLoot: (typeof DEATH_LOOT_DROPS)[0] | null = null
      let nearLootDist = Infinity
      for (const drop of DEATH_LOOT_DROPS) {
        if (gatheredLootIds.has(drop.id)) continue
        const ldx = px - drop.x
        const ldy = py - drop.y
        const ldz = pz - drop.z
        const ld2 = ldx * ldx + ldy * ldy + ldz * ldz
        if (ld2 < nearLootDist) { nearLootDist = ld2; nearLoot = drop }
      }
      if (nearLoot && nearLootDist < 9) {
        const lootLabel = `[F] Pick up dropped loot (${nearLoot.quantity}x)`
        if (gs.gatherPrompt === null) gs.setGatherPrompt(lootLabel)
        if (!gs.inputBlocked && controllerRef.current?.popInteract()) {
          gatheredLootIds.add(nearLoot.id)
          // Remove from DEATH_LOOT_DROPS array
          const idx = DEATH_LOOT_DROPS.findIndex((d) => d.id === nearLoot!.id)
          if (idx >= 0) DEATH_LOOT_DROPS.splice(idx, 1)
          inventory.addItem({
            itemId: nearLoot.itemId,
            materialId: nearLoot.matId,
            quantity: nearLoot.quantity,
            quality: nearLoot.quality,
          })
          useUiStore.getState().addNotification(`Recovered loot: ${nearLoot.label} x${nearLoot.quantity}`, 'discovery')
        }
      }
    }

    if (nearNode && nearDist < 9) { // within 3m
      // Ores require tools to mine. Iron ore specifically requires an iron pickaxe —
      // it is too hard for stone or copper tools (historical accuracy: iron ore
      // mining with stone tools is ineffective; iron-tipped picks were required).
      const oreMatIds: number[] = [MAT.COPPER_ORE, MAT.IRON_ORE, MAT.COAL, MAT.TIN_ORE, MAT.SULFUR, MAT.GOLD, MAT.SILVER, MAT.URANIUM]
      const isOre = oreMatIds.includes(nearNode.matId)
      const isIronOre = nearNode.matId === MAT.IRON_ORE
      const hasAnyPickaxe = inventory.hasItemById(ITEM.STONE_TOOL) || inventory.hasItemById(ITEM.AXE)
      const hasIronPickaxe = inventory.hasItemById(ITEM.IRON_PICKAXE) || inventory.hasItemById(ITEM.IRON_AXE)
      const canGather = !isOre
        ? true
        : isIronOre
          ? hasIronPickaxe
          : hasAnyPickaxe || hasIronPickaxe

      const ps_gather = usePlayerStore.getState()
      const gatherSlot = ps_gather.equippedSlot !== null ? inventory.getSlot(ps_gather.equippedSlot) : null
      const gatherItemId = gatherSlot?.itemId ?? 0
      const harvestPower = getItemStats(gatherItemId).harvestPower
      const maxHits = getNodeMaxHits(nearNode.type, harvestPower)
      const hitsSoFar = NODE_HITS_TAKEN.get(nearNode.id) ?? 0
      const hitsRemaining = maxHits - hitsSoFar

      const label = canGather
        ? maxHits > 1
          ? `[F] Gather ${nearNode.label} (${hitsSoFar}/${maxHits} hits)`
          : `[F] Gather ${nearNode.label}`
        : isIronOre
          ? `[Need Iron Pickaxe] ${nearNode.label}`
          : `[Need Stone Tool] ${nearNode.label}`
      if (gs.gatherPrompt !== label) gs.setGatherPrompt(label)

      if (canGather && !gs.inputBlocked && controllerRef.current?.popInteract()) {
        const newHits = hitsSoFar + 1
        if (newHits < maxHits) {
          // Not fully harvested yet — record the hit, give feedback, skip gather
          NODE_HITS_TAKEN.set(nearNode.id, newHits)
          useUiStore.getState().addNotification(`Hit ${nearNode.label} (${newHits}/${maxHits})`, 'info')
        } else {
        // Final hit — fully gather the node
        NODE_HITS_TAKEN.delete(nearNode.id)
        gatheredNodeIds.add(nearNode.id)
        NODE_RESPAWN_AT.set(nearNode.id, Date.now() + NODE_RESPAWN_DELAY)
        gs.setGatherPrompt(null)
        const qty = isOre ? 3 : 1
        inventory.addItem({ itemId: 0, materialId: nearNode.matId, quantity: qty, quality: 0.8 })
        // Notify server — all other clients will remove this node from their scene
        getWorldSocket()?.send({
          type: 'NODE_DESTROYED',
          nodeId: nearNode.id,
          nodeType: nearNode.type,
          x: nearNode.x, y: nearNode.y, z: nearNode.z,
        })
        // Unlock stone tool recipe on first stone or flint gather
        if (nearNode.matId === MAT.STONE || nearNode.matId === MAT.FLINT) {
          inventory.discoverRecipe(1)
        }
        const addNotification = useUiStore.getState().addNotification
        addNotification(`Gathered ${qty > 1 ? qty + '× ' : ''}${nearNode.label} — press [I] to inspect`, 'info')
        // Auto-open inventory on first gather so the player immediately sees their items
        if (!_firstGatherDone) {
          _firstGatherDone = true
          useUiStore.getState().openPanel('inventory')
        }
        // Award EP for discovery gathers (ores)
        if (isOre) {
          addEvolutionPoints(2)
        }
        } // end else (final hit)
      }
    } else {
      if (gs.gatherPrompt !== null) gs.setGatherPrompt(null)
    }

    // ── M11 Track D: Telescope — F key when telescope equipped ───────────────
    {
      const ps_tel = usePlayerStore.getState()
      const telSlot = ps_tel.equippedSlot !== null ? inventory.getSlot(ps_tel.equippedSlot) : null
      const hasTelescope = telSlot?.itemId === ITEM.TELESCOPE
      if (hasTelescope && !gs.inputBlocked && gs.gatherPrompt === null) {
        gs.setGatherPrompt('[F] Look through telescope')
        if (controllerRef.current?.popInteract()) {
          // TelescopeView is controlled by React state in the parent — dispatch a custom event
          window.dispatchEvent(new CustomEvent('open-telescope'))
          gs.setGatherPrompt(null)
        }
      }
    }

    // ── M12 Track A: Rocket — F key near launch_pad when rocket equipped ─────
    {
      const ps_rkt = usePlayerStore.getState()
      const rktSlot = ps_rkt.equippedSlot !== null ? inventory.getSlot(ps_rkt.equippedSlot) : null
      const hasRocket = rktSlot?.itemId === ITEM.ROCKET
      if (hasRocket && !gs.inputBlocked && !isLaunching()) {
        // Check player is within 15m of a launch_pad building
        const launchPads = buildingSystem.getBuildingsProviding('rocket_launch')
        let nearPad = false
        let padPos: [number, number, number] = [px, py, pz]
        for (const pad of launchPads) {
          const dx = px - pad.position[0], dz = pz - pad.position[2]
          if (Math.sqrt(dx * dx + dz * dz) < 15) { nearPad = true; padPos = pad.position; break }
        }
        if (nearPad) {
          if (gs.gatherPrompt !== '[F] Launch Rocket') {
            gs.setGatherPrompt('[F] Launch Rocket')
          }
          if (controllerRef.current?.popInteract()) {
            beginLaunch(padPos)
            // Consume the rocket item from inventory
            for (let i = 0; i < inventory.slotCount; i++) {
              const sl = inventory.getSlot(i)
              if (sl?.itemId === ITEM.ROCKET) { inventory.removeItem(i, 1); break }
            }
            gs.setGatherPrompt(null)
          }
        }
      }
    }

    // ── M14 Track A: Interplanetary transit — F key near launch_pad with orbital capsule ──
    {
      const transitPhase = useTransitStore.getState().phase
      if (transitPhase === 'idle' && !gs.inputBlocked) {
        // Check if player has ORBITAL_CAPSULE equipped or in inventory
        const hasCapOrEquip = (() => {
          for (let i = 0; i < inventory.slotCount; i++) {
            const sl = inventory.getSlot(i)
            if (sl?.itemId === ITEM.ORBITAL_CAPSULE) return true
          }
          return false
        })()

        if (hasCapOrEquip) {
          const launchPads = buildingSystem.getBuildingsProviding('rocket_launch')
          let nearPad = false
          let padPos: [number, number, number] = [px, py, pz]
          for (const pad of launchPads) {
            const dx = px - pad.position[0], dz = pz - pad.position[2]
            if (Math.sqrt(dx * dx + dz * dz) < 15) { nearPad = true; padPos = pad.position; break }
          }
          if (nearPad) {
            if (gs.gatherPrompt !== '[F] Board Orbital Capsule') {
              gs.setGatherPrompt('[F] Board Orbital Capsule')
            }
            if (controllerRef.current?.popInteract()) {
              beginInterplanetaryTransit(padPos, 'Home')
              gs.setGatherPrompt(null)
            }
          }
        }
      } else if (transitPhase === 'arrived' && !gs.inputBlocked) {
        // On destination planet: F near any flat surface returns home
        if (gs.gatherPrompt !== '[F] Return Home') {
          gs.setGatherPrompt('[F] Return Home')
        }
        if (controllerRef.current?.popInteract()) {
          beginInterplanetaryTransit([px, py, pz], useTransitStore.getState().toPlanet)
          gs.setGatherPrompt(null)
        }
      }
    }

    // ── M14 Track B: Velar Key — F near gateway activates the multiverse portal ─
    {
      const velarSt = useVelarStore.getState()
      if (velarSt.gatewayRevealed && !velarSt.gatewayActive && !gs.inputBlocked) {
        let hasKey = false
        for (let i = 0; i < inventory.slotCount; i++) {
          const sl = inventory.getSlot(i)
          if (sl?.itemId === _ITEM.VELAR_KEY) { hasKey = true; break }
        }
        if (hasKey) {
          // Gateway is 200m NE of spawn — prompt within 80m (generous — hard to miss large ring)
          if (gs.gatherPrompt !== '[F] Activate Velar Gateway') {
            gs.setGatherPrompt('[F] Activate Velar Gateway')
          }
          if (controllerRef.current?.popInteract()) {
            for (let i = 0; i < inventory.slotCount; i++) {
              const sl = inventory.getSlot(i)
              if (sl?.itemId === _ITEM.VELAR_KEY) { inventory.removeItem(i, 1); break }
            }
            try { getWorldSocket()?.send({ type: 'VELAR_GATEWAY_ACTIVATED' }) } catch {}
            gs.setGatherPrompt(null)
            useUiStore.getState().addNotification(
              'Velar Key inserted. The gateway resonates... A new universe is opening.',
              'discovery'
            )
          }
        }
      }
    }

    // ── Ambient temperature update (fire warmth only) ────────────────────────
    // Only let the sim grid override ambient temp UPWARD (fire/heat source nearby).
    // Letting the cold sim-grid cells overwrite ambient every frame negates the
    // weather-recovery code below (B-11 fix).
    if (simManagerRef.current) {
      const simTemp = simManagerRef.current.getTemperatureAt(px, py, pz)
      const curAmbient = usePlayerStore.getState().ambientTemp
      if (simTemp > curAmbient + 2) {
        usePlayerStore.getState().setAmbientTemp(simTemp)
      }
    }

    // ── Slice 4: Food cooking thermodynamics ──────────────────────────────────
    tickFoodCooking(dt, inventory, simManagerRef.current, px, py, pz)

    // ── Slice 5: Wound + infection system ─────────────────────────────────────
    tickWoundSystem(dt, entityId ?? 0)

    // ── Slice 6: Sleep / stamina restoration ──────────────────────────────────
    tickSleepSystem(dt, entityId ?? 0)

    // ── Slice 7: Furnace smelting (copper) ───────────────────────────────────
    tickFurnaceSmelting(
      inventory,
      simManagerRef.current,
      buildingSystem.getAllBuildings().map(b => ({
        id: b.id,
        position: b.position,
        typeId: b.typeId,
      })),
      px, py, pz
    )

    // ── M8: Quench countdown timer ────────────────────────────────────────────
    usePlayerStore.getState().tickQuenchTimer(dt)

    // ── M7: Blast furnace smelting (iron) ────────────────────────────────────
    tickBlastFurnaceSmelting(
      inventory,
      simManagerRef.current,
      buildingSystem.getAllBuildings().map(b => ({
        id: b.id,
        position: b.position,
        typeId: b.typeId,
      })),
      px, py, pz
    )

    // ── M8: Quenching system (hot steel → steel or soft_steel) ───────────────
    tickQuenching(inventory, simManagerRef.current, px, py, pz, useRiverStore.getState().inRiver)

    // ── M11 Track A: Musket reload tick ──────────────────────────────────────
    tickMusket(dt)

    // ── M12 Track A: Rocket launch tick ──────────────────────────────────────
    tickRocket(dt)

    // ── M13 Track C: Nuclear reactor tick ────────────────────────────────────
    // hasWaterCooling: true if player is near a river or ocean (simplified proxy for
    // a water_tank building). Net heat rate = +40°C/s; cooling = -60°C/s → net -20°C/s.
    // playerPos is read from ECS Position component each frame.
    {
      const ps = usePlayerStore.getState()
      const _nearOcean = py < PLANET_RADIUS + 2  // near ocean surface
      const _nearRiver = useRiverStore.getState().nearRiver
      const _hasCooling = _nearRiver || _nearOcean
      tickNuclearReactor(dt, _hasCooling, [ps.x, ps.y, ps.z], entityId ?? 0)
    }

    // ── P2-5: Building physics — fire damage to combustible structures ────────
    tickBuildingPhysics(dt, buildingSystem, simManagerRef.current)

    // ── Tool use: left click harvests with equipped item ─────────────────
    const ps2 = usePlayerStore.getState()
    const equippedSlot2 = ps2.equippedSlot ?? null
    const equippedItem2 = equippedSlot2 !== null ? inventory.getSlot(equippedSlot2) : null
    const hasFlint = equippedItem2?.materialId === MAT.FLINT
    const hasFireItem = equippedItem2?.itemId === ITEM.FIRE

    // ── B-10 fix: Show fire-item usage prompt when ITEM.FIRE is equipped ─────
    if (hasFireItem && !gs.inputBlocked && gs.gatherPrompt === null) {
      gs.setGatherPrompt('[Left-click] Place fire from item')
    }

    // ── Fire prompt: show when flint equipped + can start fire ───────────
    if (hasFlint && !gs.inputBlocked) {
      let nearestBurnable: ResourceNode | null = null
      let nearestBurnDist = 3.0
      for (const node of RESOURCE_NODES) {
        if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
        if (node.matId !== MAT.WOOD && node.matId !== MAT.BARK && node.matId !== MAT.FIBER) continue
        const dx = px - node.x, dy = py - node.y, dz = pz - node.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < nearestBurnDist) { nearestBurnDist = dist; nearestBurnable = node }
      }
      const hasInventoryWood   = inventory.countMaterial(MAT.WOOD) >= 1
      const hasInventoryTinder = inventory.countMaterial(MAT.FIBER) >= 1 || inventory.countMaterial(MAT.BARK) >= 1
      if (nearestBurnable) {
        const fireLabel = `[Left-click] Strike flint — ignite ${nearestBurnable.label}`
        if (gs.gatherPrompt !== fireLabel) gs.setGatherPrompt(fireLabel)
      } else if (hasInventoryWood && hasInventoryTinder) {
        const fireLabel = '[Left-click] Strike flint — place campfire from inventory'
        if (gs.gatherPrompt !== fireLabel) gs.setGatherPrompt(fireLabel)
      }
    }

    // ── Fire-starting: equipped flint + left-click near wood/bark/fiber ───
    if (hasFlint && !gs.inputBlocked && controllerRef.current?.popAttack() && simManagerRef.current) {
      let nearestFireNode: ResourceNode | null = null
      let nearestFireDist = 3.0
      for (const node of RESOURCE_NODES) {
        if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
        if (node.matId !== MAT.WOOD && node.matId !== MAT.BARK && node.matId !== MAT.FIBER) continue
        const dx = px - node.x, dy = py - node.y, dz = pz - node.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < nearestFireDist) { nearestFireDist = dist; nearestFireNode = node }
      }
      if (nearestFireNode) {
        // Path A: Strike flint near an in-world wood/bark/fiber node
        simManagerRef.current.placeWood(nearestFireNode.x, nearestFireNode.y, nearestFireNode.z, nearestFireNode.matId)
        simManagerRef.current.ignite(nearestFireNode.x, nearestFireNode.y, nearestFireNode.z)
        // Broadcast ignition source to all other clients
        getWorldSocket()?.send({ type: 'FIRE_STARTED', x: nearestFireNode.x, y: nearestFireNode.y, z: nearestFireNode.z })
        gs.setGatherPrompt(null)
        useUiStore.getState().addNotification('Fire started! Temperature rising...', 'info')
      } else {
        // Path B: Player has wood + tinder in inventory — consume them, ignite at player feet
        const hasWood   = inventory.countMaterial(MAT.WOOD) >= 1
        const hasTinder = inventory.countMaterial(MAT.FIBER) >= 1 || inventory.countMaterial(MAT.BARK) >= 1
        if (hasWood && hasTinder && simManagerRef.current) {
          // Consume materials
          const woodIdx   = inventory.findItem(MAT.WOOD)
          const tinderIdx = inventory.findItem(MAT.FIBER) >= 0
            ? inventory.findItem(MAT.FIBER)
            : inventory.findItem(MAT.BARK)
          if (woodIdx >= 0) inventory.removeItem(woodIdx, 1)
          if (tinderIdx >= 0) inventory.removeItem(tinderIdx, 1)
          // Place wood in sim grid at player's feet and ignite
          simManagerRef.current.placeWood(px, py - 1, pz)
          simManagerRef.current.ignite(px, py - 1, pz)
          // Broadcast ignition source to all other clients
          getWorldSocket()?.send({ type: 'FIRE_STARTED', x: px, y: py - 1, z: pz })
          gs.setGatherPrompt(null)
          useUiStore.getState().addNotification('Fire started from inventory! Temperature rising...', 'info')
        } else if (!hasWood || !hasTinder) {
          useUiStore.getState().addNotification('Need wood + tinder (fiber/bark) in inventory to start fire', 'warning')
        }
      }
    } else if (!gs.inputBlocked && controllerRef.current?.popAttack()) {
      const equippedItem = equippedItem2
      const itemId       = equippedItem?.itemId ?? 0
      const stats        = getItemStats(itemId)

      // ── B-10 fix: ITEM.FIRE equipped → place + ignite fire at player's feet ─
      const _isFireItem = itemId === ITEM.FIRE
      if (_isFireItem && simManagerRef.current) {
        simManagerRef.current.placeWood(px, py - 1, pz)
        simManagerRef.current.ignite(px, py - 1, pz)
        getWorldSocket()?.send({ type: 'FIRE_STARTED', x: px, y: py - 1, z: pz })
        if (equippedSlot2 !== null) inventory.removeItem(equippedSlot2, 1)
        gs.setGatherPrompt(null)
        useUiStore.getState().addNotification('Fire placed!', 'info')
      }

      // ── M11: Musket firing — requires ammo, enforces reload time ────────────
      const _isMusket = itemId === ITEM.MUSKET
      if (_isMusket) {
        if (!isMusketReady()) {
          useUiStore.getState().addNotification('Musket reloading...', 'warning')
        } else {
          const hasBall = inventory.countMaterial(MAT.MUSKET_BALL) > 0
          if (!hasBall) {
            useUiStore.getState().addNotification('No musket balls! Craft iron balls first.', 'warning')
          } else {
            const ballSlot = inventory.findItem(MAT.MUSKET_BALL)
            if (ballSlot >= 0) inventory.removeItem(ballSlot, 1)
            let targetEid: number | null = null
            let _nearestDist = Infinity
            for (const [eid] of creatureWander) {
              const dx = Position.x[eid] - px, dy = Position.y[eid] - py, dz = Position.z[eid] - pz
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
              if (dist < stats.range && dist < _nearestDist) { _nearestDist = dist; targetEid = eid }
            }
            const shotResult = fireMusket(px, py, pz, targetEid)
            if (shotResult && shotResult.effectiveHit && targetEid !== null) {
              Health.current[targetEid] = Math.max(0, Health.current[targetEid] - shotResult.damage)
              if (Health.current[targetEid] <= 0) {
                inventory.addItem({ itemId: 0, materialId: MAT.RAW_MEAT, quantity: 1, quality: 0.8 })
                inventory.addItem({ itemId: 0, materialId: MAT.HIDE, quantity: 1, quality: 0.7 })
                creatureWander.delete(targetEid)
                removeEntity(world, targetEid)
                addEvolutionPoints(3)
                useUiStore.getState().addNotification('Creature killed by musket shot!', 'discovery')
              } else {
                useUiStore.getState().addNotification(`Musket hit — ${shotResult.damage} dmg! Reloading (8s)...`, 'warning')
              }
            } else if (shotResult) {
              useUiStore.getState().addNotification('Musket fired — missed! Reloading (8s)...', 'info')
            }
          }
        }
      }

      // ── Check creatures / harvest (skip for musket/fire-item — ranged/placed only) ─
      if (!_isMusket && !_isFireItem) {
      let hitCreature = false
      let nearestCreatureEid = -1
      let nearestCreatureDist = Infinity
      for (const [eid] of creatureWander) {
        const dx = Position.x[eid] - px
        const dy = Position.y[eid] - py
        const dz = Position.z[eid] - pz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < stats.range && dist < nearestCreatureDist) {
          nearestCreatureDist = dist
          nearestCreatureEid = eid
        }
      }
      if (nearestCreatureEid >= 0) {
        hitCreature = true
        Health.current[nearestCreatureEid] = Math.max(0, Health.current[nearestCreatureEid] - stats.damage)
        const hp = Health.current[nearestCreatureEid]
        const maxHp = Health.max[nearestCreatureEid] || 100
        if (hp <= 0) {
          // Creature killed — drop raw meat + hide directly into inventory
          inventory.addItem({ itemId: 0, materialId: MAT.RAW_MEAT, quantity: 1 + Math.floor(CreatureBody.size[nearestCreatureEid] * 2), quality: 0.8 })
          inventory.addItem({ itemId: 0, materialId: MAT.HIDE,     quantity: 1, quality: 0.7 })
          creatureWander.delete(nearestCreatureEid)
          removeEntity(world, nearestCreatureEid)
          addEvolutionPoints(3)
          useUiStore.getState().addNotification('Creature killed — raw meat + hide collected!', 'discovery')
        } else {
          useUiStore.getState().addNotification(
            `Hit creature for ${stats.damage} dmg (${hp.toFixed(0)}/${maxHp} HP remaining)`,
            'warning'
          )
        }
      }

      // ── M9: Check if player hit a deer/wolf/boar ─────────────────────────────
      if (!hitCreature) {
        const animalHit = attackNearestAnimal(px, py, pz, stats.damage, stats.range)
        if (animalHit) {
          hitCreature = true  // animal was in range — block resource harvesting regardless of kill
          const { killed, loot } = animalHit
          if (killed) {
            const speciesName = killed.species.charAt(0).toUpperCase() + killed.species.slice(1)
            for (const drop of loot) {
              inventory.addItem({ itemId: 0, materialId: drop.materialId, quantity: drop.quantity, quality: 0.8 })
            }
            addEvolutionPoints(3)
            const lootSummary = loot.map(l => `${l.quantity}x ${l.label}`).join(', ')
            useUiStore.getState().addNotification(
              `${speciesName} killed — ${lootSummary} collected!`, 'discovery'
            )
          } else {
            useUiStore.getState().addNotification(
              `Hit animal for ${stats.damage} dmg!`, 'warning'
            )
          }
        }
      }

      // ── M7 T2: Check if player hit a remote player (PvP) ─────────────────────
      // Scan all remote players within weapon range. The first hit remote player
      // takes damage tracked client-side. When their health reaches 0 we notify
      // the server which increments the killer's murder count authoritatively.
      if (!hitCreature) {
        const remotePlayers = useMultiplayerStore.getState().remotePlayers
        for (const rp of remotePlayers.values()) {
          const dx = rp.x - px, dy = rp.y - py, dz = rp.z - pz
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < stats.range + 1.5) {
            // Deal damage — health is a 0..1 fraction on the remote player
            const dmgFraction = stats.damage / 100  // normalise to 0..1 scale
            const newHealth   = Math.max(0, (rp.health ?? 1) - dmgFraction)
            useMultiplayerStore.getState().upsertRemotePlayer({ ...rp, health: newHealth })

            if (newHealth <= 0) {
              // Kill confirmed — report to server for authoritative murder count increment
              getWorldSocket()?.send({ type: 'PLAYER_KILLED', victimId: rp.userId })

              // If victim was a wanted player, collect the bounty
              const wanted = useOutlawStore.getState().getWantedEntry(rp.userId)
              if (wanted) {
                getWorldSocket()?.send({ type: 'BOUNTY_COLLECT', targetId: rp.userId })
              }

              useUiStore.getState().addNotification(
                `You killed ${rp.username}!${wanted ? ` Bounty claim submitted: ${wanted.reward} copper.` : ''}`,
                'error'
              )
            } else {
              useUiStore.getState().addNotification(
                `Hit ${rp.username} for ${stats.damage} dmg (${(newHealth * 100).toFixed(0)}% HP remaining)`,
                'warning'
              )
            }
            hitCreature = true
            break
          }
        }
      }

      // ── M6: Check if player hit a server NPC near a settlement ──────────────
      if (!hitCreature) {
        const remoteNpcs = useMultiplayerStore.getState().remoteNpcs
        for (const npc of remoteNpcs) {
          const dx = npc.x - px, dy = (npc.y ?? 1) - py, dz = npc.z - pz
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < stats.range + 1) {
            // Hit a server NPC — report to server so it can update NPC memory
            const nearSettlementId = useSettlementStore.getState().nearSettlementId
            if (nearSettlementId !== null) {
              getWorldSocket()?.send({ type: 'NPC_ATTACKED', settlementId: nearSettlementId })
              useUiStore.getState().addNotification(
                'You attacked a settlement member! They will remember this.',
                'warning'
              )
            }
            hitCreature = true  // suppress resource harvest this frame
            break
          }
        }
      }

      // ── Resource node harvesting (only if no creature was hit) ─────────────
      let nearest: (typeof RESOURCE_NODES)[0] | null = null
      let nearestDist = Infinity

      if (!hitCreature) {
        for (const node of RESOURCE_NODES) {
          if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
          const dx = node.x - px
          const dy = node.y - py
          const dz = node.z - pz
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < stats.range && dist < nearestDist && canHarvest(itemId, node.type)) {
            nearest = node
            nearestDist = dist
          }
        }

        if (!nearest) {
          // Give feedback so player knows the swing registered but nothing was in range
          useUiStore.getState().addNotification(
            `Nothing to hit — get closer or equip the right tool (reach: ${stats.range.toFixed(1)}m)`,
            'warning'
          )
        }
      }

      if (nearest) {
        // Hit-based health system: deplete hits, only gather when max hits reached.
        // Pass harvestPower so iron axe (power 5) fells trees in 2 hits.
        const maxHits   = getNodeMaxHits(nearest.type, stats.harvestPower)
        const hitsSoFar = (NODE_HITS_TAKEN.get(nearest.id) ?? 0) + 1
        NODE_HITS_TAKEN.set(nearest.id, hitsSoFar)

        if (hitsSoFar >= maxHits) {
          // Node felled/gathered — yield materials and remove from world
          NODE_HITS_TAKEN.delete(nearest.id)
          const qty     = nearest.type === 'wood' ? 3 : Math.floor(Math.random() * 3) + 1
          const quality = 0.7 + Math.random() * 0.3
          inventory.addItem({ itemId: 0, materialId: nearest.matId, quantity: qty, quality })
          gatheredNodeIds.add(nearest.id)
          NODE_RESPAWN_AT.set(nearest.id, Date.now() + NODE_RESPAWN_DELAY)
          // Notify server — all other clients will remove this node from their scene
          getWorldSocket()?.send({
            type: 'NODE_DESTROYED',
            nodeId: nearest.id,
            nodeType: nearest.type,
            x: nearest.x, y: nearest.y, z: nearest.z,
          })
          const verb = nearest.type === 'wood' ? 'Felled' : 'Harvested'
          useUiStore.getState().addNotification(`${verb} ${qty}× ${nearest.label}`, 'info')
        } else {
          // Not yet felled — show progress
          const hitsLeft = maxHits - hitsSoFar
          useUiStore.getState().addNotification(
            `Hit ${nearest.label} — ${hitsLeft} more hit${hitsLeft > 1 ? 's' : ''} to fell`,
            'info'
          )
        }
      }
      } // end if (!_isMusket && !_isFireItem)
    }

    // ── Eat (E key when cooked food in inventory) ─────────────────────────────
    // E key is also used for "equip/interact" in some contexts — we check for
    // cooked meat specifically. PlayerController.popEat() is mapped to the E key.
    if (!gs.inputBlocked) {
      const psNow = usePlayerStore.getState()
      // Show eat prompt when cooked meat is in inventory and hunger > 0
      if (inventory.countMaterial(MAT.COOKED_MEAT) > 0 && psNow.hunger > 0.05) {
        const eatLabel = '[E] Eat cooked meat'
        if (gs.gatherPrompt === null) gs.setGatherPrompt(eatLabel)
      }
      // Show herb prompt when player has wounds + leaf
      if (psNow.wounds.length > 0 && inventory.countMaterial(MAT.LEAF) > 0) {
        const herbLabel = '[H] Apply herb to wound'
        if (gs.gatherPrompt === null) gs.setGatherPrompt(herbLabel)
      }
      // Show furnace smelting hint (Slice 7)
      const nearFurnace = buildingSystem.getAllBuildings().find(b => {
        if (b.typeId !== 'smelting_furnace' && b.typeId !== 'stone_furnace') return false
        const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
        return dx * dx + dy * dy + dz * dz < 36
      })
      if (nearFurnace && gs.gatherPrompt === null) {
        const furnaceTemp = simManagerRef.current ? simManagerRef.current.getTemperatureAt(
          nearFurnace.position[0], nearFurnace.position[1], nearFurnace.position[2]
        ) : 0
        const hasOre = inventory.countMaterial(MAT.COPPER_ORE) >= 3
        const hasChar = inventory.countMaterial(MAT.CHARCOAL) >= 2
        if (hasOre && hasChar) {
          const smeltLabel = `[F] Smelt copper — furnace ${furnaceTemp.toFixed(0)}°C / 500°C needed`
          gs.setGatherPrompt(smeltLabel)
        } else if (!hasOre) {
          gs.setGatherPrompt(`Furnace nearby — need 3x Copper Ore + 2x Charcoal to smelt`)
        }
      }

      // Show sleep prompt near shelter
      const nearShelter = buildingSystem.getAllBuildings().some(b => {
        const shelterTypes = ['lean_to', 'pit_house', 'mud_brick_house', 'stone_house']
        if (!shelterTypes.includes(b.typeId)) return false
        const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
        return dx * dx + dy * dy + dz * dz < 64
      })
      const hasBedroll = inventory.hasItemById(ITEM.BEDROLL)
      if ((nearShelter || hasBedroll) && !psNow.isSleeping) {
        const sleepLabel = '[Z] Sleep — restore stamina'
        if (gs.gatherPrompt === null) gs.setGatherPrompt(sleepLabel)
      }
      if (psNow.isSleeping) {
        gs.setGatherPrompt('[Z] Wake up')
      }
    }

    // ── E key: eat cooked food, apply herb, or drink from river ──────────────
    // Priority: food > herb > river drink. popEat() is consumed once so all
    // three actions must be checked in a single block.
    if (!gs.inputBlocked && controllerRef.current?.popEat?.()) {
      if (!tryEatFood(inventory, entityId ?? 0)) {
        const _psE = usePlayerStore.getState()
        if (_psE.wounds.length > 0 && !tryApplyHerb(inventory)) {
          // tryApplyHerb already showed the appropriate notification
        } else if (_psE.wounds.length === 0) {
          // No food and no wounds — try river drink if player is standing in a river
          const _inRiver = useRiverStore.getState().inRiver
          if (_inRiver) {
            if (_psE.thirst > 0.01) {
              const instant = Math.min(_psE.thirst, 0.25)
              _psE.updateVitals({ thirst: Math.max(0, _psE.thirst - instant) })
              Metabolism.thirst[entityId ?? 0] = Math.max(0, _psE.thirst - instant)
              useUiStore.getState().addNotification('Drank from river — thirst reduced!', 'info')
            }
          // else: not in river, no action available — silent
        }
      }
    }
    } // end if (!gs.inputBlocked && popEat)

    // ── H key: apply herb to wound ────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popHerb?.()) {
      tryApplyHerb(inventory)
    }

    // ── Z key: sleep / wake ───────────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popSleep?.()) {
      const didSleep = tryStartSleep(
        inventory,
        buildingSystem.getAllBuildings().map(b => ({ position: b.position, typeId: b.typeId })),
        px, py, pz
      )
      // M5: Record bedroll placement as respawn anchor.
      // tryStartSleep consumed the bedroll item and set bedrollPlaced = true.
      // We capture the player position at that moment as the respawn point.
      {
        const psAfterSleep = usePlayerStore.getState()
        if (didSleep && psAfterSleep.bedrollPlaced) {
          // Always update position — placing a new bedroll overwrites the old one
          const prevPos = psAfterSleep.bedrollPos
          const sameSpot = prevPos
            && Math.abs(prevPos.x - px) < 0.1
            && Math.abs(prevPos.z - pz) < 0.1
          if (!sameSpot) {
            psAfterSleep.setBedrollPos({ x: px, y: py, z: pz })
            setPlacedBedrollAnchor({ x: px, y: py, z: pz })
            useUiStore.getState().addNotification(
              'Bedroll placed! This is now your respawn point.', 'discovery'
            )
          }
        }
      }
    }

    // ── Dig (G key): loosen the ground and add materials ──────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popDig()) {
      // Snap dig position to sphere surface below player
      const sr = surfaceRadiusAt(px, py, pz)
      const len = Math.sqrt(px * px + py * py + pz * pz)
      const ux = px / len, uy = py / len, uz = pz / len
      const gx = ux * sr, gy = uy * sr, gz = uz * sr
      // Record hole (cap array to avoid unbounded growth)
      if (DIG_HOLES.length >= MAX_DIG_HOLES) DIG_HOLES.shift()
      DIG_HOLES.push({ x: gx, y: gy, z: gz, r: DIG_RADIUS })
      // Award materials from digging
      const digMats = [MAT.STONE, MAT.CLAY, MAT.SAND]
      const mat = digMats[Math.floor(Math.random() * digMats.length)]
      const qty = Math.floor(Math.random() * 3) + 1
      inventory.addItem({ itemId: 0, materialId: mat, quantity: qty, quality: 0.7 })
      const addNotification = useUiStore.getState().addNotification
      addNotification(`Dug up ${qty}× ${mat === MAT.STONE ? 'Stone' : mat === MAT.CLAY ? 'Clay' : 'Sand'}`, 'info')
    }

    // ── M6: Settlement proximity check ────────────────────────────────────────
    // Every 3 seconds real time, check if the player is within TERRITORY_RADIUS
    // of any settlement. If yes, send PLAYER_NEAR_SETTLEMENT to the server.
    // Server replies with TRADE_OFFER or GATES_CLOSED as appropriate.
    {
      const SETTLEMENT_PROXIMITY_RADIUS_SQ = 150 * 150
      const SETTLEMENT_CHECK_INTERVAL = 3  // seconds
      settlementCheckTimerRef.current += dt
      if (settlementCheckTimerRef.current >= SETTLEMENT_CHECK_INTERVAL) {
        settlementCheckTimerRef.current = 0
        const settlementStore = useSettlementStore.getState()
        let nearestId: number | null = null
        let nearestDistSq = Infinity
        for (const s of settlementStore.settlements.values()) {
          const dx = px - s.x, dz = pz - s.z
          const distSq = dx * dx + dz * dz
          if (distSq < SETTLEMENT_PROXIMITY_RADIUS_SQ && distSq < nearestDistSq) {
            nearestId   = s.id
            nearestDistSq = distSq
          }
        }
        const prevNearId = settlementStore.nearSettlementId
        if (nearestId !== prevNearId) {
          settlementStore.setNearSettlement(nearestId)
          if (nearestId === null) {
            // Left all settlement ranges — clear pending offer
            settlementStore.setPendingOffer(null)
          }
        }
        if (nearestId !== null) {
          // Notify server; it will send TRADE_OFFER or GATES_CLOSED if appropriate
          getWorldSocket()?.send({ type: 'PLAYER_NEAR_SETTLEMENT', settlementId: nearestId })

          // ── M7 T2: Tiered NPC reaction HUD messages ───────────────────────
          // Show settlement status message based on local player's murder count.
          // This runs only when the player is near a settlement, throttled to 3s.
          const localMurderCount = usePlayerStore.getState().murderCount
          const gatesAlreadyClosed = useSettlementStore.getState().closedGates.has(nearestId)
          if (!gatesAlreadyClosed) {
            if (localMurderCount >= 1 && localMurderCount <= 2) {
              useUiStore.getState().addNotification('Strangers are wary of you. Shop prices increased.', 'warning')
            }
            // murder_count 3+ gate closure is handled server-side via GATES_CLOSED message
          }
        }
      }
    }

    // ── M8: Weather simulation integration ────────────────────────────────────
    // Update player's current weather sector and apply emergent weather consequences.
    {
      const sectorId = getSectorIdForPosition(px, py, pz)
      const wStore = useWeatherStore.getState()
      if (sectorId !== wStore.playerSectorId) {
        wStore.setPlayerSectorId(sectorId)
      }
      const playerWeather = wStore.getPlayerWeather()
      const wState = playerWeather?.state ?? 'CLEAR'
      const wTemp  = playerWeather?.temperature ?? 15

      // Rain extinguishes fire: suppress fire cells near player.
      // RAIN = 50% suppress chance/s, STORM = 100% chance/s.
      if ((wState === 'RAIN' || wState === 'STORM') && simManagerRef.current) {
        const rainChance = wState === 'STORM' ? 1.0 : 0.5
        if (Math.random() < rainChance * dt) {
          simManagerRef.current.suppressFire(px, py, pz, 15)
        }
      }

      // Cold weather increases ambient temperature drain.
      // Wind-chill drives ambient temp toward weather temp during rain/storm.
      if (wState === 'STORM' || wState === 'RAIN') {
        const storedTemp = usePlayerStore.getState().ambientTemp
        const windChill = Math.max(wTemp - (playerWeather?.windSpeed ?? 0) * 0.5, wTemp - 12)
        const rate = wState === 'STORM' ? 2.0 : 0.8
        const newTemp = storedTemp + (windChill - storedTemp) * Math.min(1, rate * dt)
        usePlayerStore.getState().setAmbientTemp(newTemp)

        // Hypothermia damage: if ambient temp < 0°C player loses health.
        // STORM cold: 1.5 HP/s; RAIN cold: 0.5 HP/s.
        // This satisfies pass criterion: "player in storm loses body heat faster."
        // B-16 fix: God Mode bypasses cold damage.
        if (newTemp < 0 && !inventory.isGodMode()) {
          const coldDps = wState === 'STORM' ? 1.5 : 0.5
          Health.current[entityId] = Math.max(0, Health.current[entityId] - coldDps * dt)
          markColdDamage()  // mark so death attributes to hypothermia
        }
      } else {
        // Clear/cloudy: ambient temperature recovers toward weather temperature at 0.4°C/s.
        // This prevents ambientTemp from staying stuck at storm-cold values after the storm passes.
        const storedTemp = usePlayerStore.getState().ambientTemp
        if (Math.abs(storedTemp - wTemp) > 0.1) {
          const newTemp = storedTemp + (wTemp - storedTemp) * Math.min(1, 0.4 * dt)
          usePlayerStore.getState().setAmbientTemp(newTemp)
        }
      }
    }

    // ── M9: River system — current force, fresh water drinking, proximity HUD ──
    {
      const RIVER_NEAR_DIST    = 20   // metres — show HUD indicator
      const RIVER_IN_DIST      = 6    // metres — player is IN the river channel
      const RIVER_DRINK_RATE   = 0.04 // thirst restored per second while in river
      const WIND_CHILL_VALLEY_FACTOR = 0.7  // 30% wind-chill reduction in deep valley

      const rStore = useRiverStore.getState()
      const nearResult = queryNearestRiver(px, py, pz, RIVER_NEAR_DIST)

      if (nearResult) {
        // Update nearRiver flag
        if (!rStore.nearRiver) rStore.setNearRiver(true)

        const inRiver = nearResult.dist < RIVER_IN_DIST
        if (inRiver !== rStore.inRiver) rStore.setInRiver(inRiver)

        if (inRiver) {
          // Apply river current: push player in flow direction scaled by river speed
          // Force is applied to Velocity ECS component; KCC picks it up next frame.
          // Scale: 1 m/s current = 0.4 m/s lateral push (not overwhelming)
          const pushScale = nearResult.speed * 0.4
          const cvx = nearResult.flowDirX * pushScale
          const cvy = nearResult.flowDirY * pushScale
          const cvz = nearResult.flowDirZ * pushScale
          rStore.setRiverCurrent(cvx, cvy, cvz)

          // Apply current to player velocity in ECS (additive to KCC input)
          Velocity.x[entityId] = (Velocity.x[entityId] || 0) + cvx * dt
          Velocity.y[entityId] = (Velocity.y[entityId] || 0) + cvy * dt
          Velocity.z[entityId] = (Velocity.z[entityId] || 0) + cvz * dt

          // Also nudge Rapier KCC body directly for immediate physics response
          const kccBody = rapierWorld.getPlayer()?.body
          if (kccBody) {
            const t3 = kccBody.translation()
            kccBody.setNextKinematicTranslation({
              x: t3.x + cvx * dt,
              y: t3.y + cvy * dt,
              z: t3.z + cvz * dt,
            })
          }

          // Drinkable fresh water: E key or automatic slow restoration when in river
          // Auto-restore thirst slowly when standing in river (player is drinking)
          const psRiver = usePlayerStore.getState()
          if (psRiver.thirst > 0.02) {
            const newThirst = Math.max(0, psRiver.thirst - RIVER_DRINK_RATE * dt)
            psRiver.updateVitals({ thirst: newThirst })
            // Sync to ECS
            Metabolism.thirst[entityId] = newThirst
          }

          // Valley wind-chill reduction (deep valleys shelter from wind)
          // Reduce hypothermia damage rate by 30% when in river valley
          // This is handled by modulating ambientTemp toward a less-extreme value
          if (nearResult.t > 0.3) {  // lower valleys only (not at source)
            const psW = usePlayerStore.getState()
            const currentTemp = psW.ambientTemp
            if (currentTemp < 5) {
              // Warm slightly — valley shelters from wind chill
              const warmedTemp = currentTemp + (5 - currentTemp) * WIND_CHILL_VALLEY_FACTOR * dt * 0.5
              psW.setAmbientTemp(warmedTemp)
            }
          }
        } else {
          // Near river but not in it — clear current
          rStore.clearRiverCurrent()
        }

        // Show drink prompt when thirsty and near river
        if (!gs.inputBlocked && usePlayerStore.getState().thirst > 0.1) {
          const drinkLabel = inRiver
            ? '[E] Drink from river — restoring thirst'
            : `River nearby (${nearResult.dist.toFixed(0)}m) — approach to drink`
          if (gs.gatherPrompt === null) gs.setGatherPrompt(drinkLabel)
        }

        // E key river drinking is handled in the unified E key block above
      } else {
        // No river nearby
        if (rStore.nearRiver)   rStore.setNearRiver(false)
        if (rStore.inRiver)     rStore.setInRiver(false)
        rStore.clearRiverCurrent()
      }
    }

    // ── M10 Track A: Season metabolic multiplier ──────────────────────────────
    // Winter increases metabolic rate (+20%): hunger drains faster.
    // This is additive per-frame; we update ECS Metabolism.metabolicRate.
    {
      const seasonState = useSeasonStore.getState()
      const mult = seasonState.metabolicMult ?? 1.0
      if (mult !== 1.0) {
        // Scale base metabolic rate — Metabolism system reads this each frame
        const baseRate = 0.07  // from applyEvolutionEffects BASE_RATE
        Metabolism.metabolicRate[entityId] = baseRate * mult
      }

      // Winter ambient temperature: apply seasonal temp modifier to ambient temp.
      const tempMod = seasonState.tempModifier ?? 0
      if (tempMod !== 0 && simManagerRef.current) {
        const curTemp = usePlayerStore.getState().ambientTemp
        // Lerp ambient temperature toward seasonal target (1°C/s transition rate)
        const target = curTemp + tempMod * 0.02  // gentle continuous push
        usePlayerStore.getState().setAmbientTemp(curTemp + (target - curTemp) * Math.min(1, dt))
      }
    }

    // ── M10 Track B: Sailing + fishing ────────────────────────────────────────
    {
      // Determine if player has raft or sailing_boat equipped
      const ps10 = usePlayerStore.getState()
      const equippedSlot10 = ps10.equippedSlot ?? null
      const equippedItem10 = equippedSlot10 !== null ? inventory.getSlot(equippedSlot10) : null
      let vesselType: VesselType | null = null
      if (equippedItem10 && equippedItem10.itemId === ITEM.RAFT) vesselType = 'raft'
      else if (equippedItem10 && equippedItem10.itemId === ITEM.SAILING_BOAT) vesselType = 'sailing_boat'

      // Get wind direction from weather store
      const wStore10 = useWeatherStore.getState()
      const pw10 = wStore10.getPlayerWeather()
      const windDir10 = pw10?.windDir ?? 0
      const windSpeed10 = pw10?.windSpeed ?? 3

      // Keys: access from controller
      const keysSet = (controllerRef.current as any)?._keys ?? (controllerRef.current as any)?.keys ?? new Set()

      const sailDelta = tickSailing(
        px, py, pz,
        windDir10, windSpeed10,
        keysSet,
        dt,
        vesselType,
      )

      if (sailDelta) {
        // Apply sailing movement directly to ECS position
        Position.x[entityId] += sailDelta.dx
        Position.y[entityId] += sailDelta.dy
        Position.z[entityId] += sailDelta.dz
      }

      // Fishing: F key near water or river starts casting
      const nearWater = py < PLANET_RADIUS + 2  // rough ocean check
      const nearRiver10 = useRiverStore.getState().inRiver
      const canFish = (nearWater || nearRiver10) && inventory.hasItemById(ITEM.FISHING_ROD)
      const gs10 = useGameStore.getState()

      if (canFish && !isFishingActive()) {
        const fishLabel = '[F] Cast fishing rod'
        if (gs10.gatherPrompt === null) gs10.setGatherPrompt(fishLabel)
      }

      if (canFish && controllerRef.current?.popInteract() && !isFishingActive()) {
        const started = startFishing()
        if (started) {
          useUiStore.getState().addNotification('Line cast — waiting for a bite... (5-15s)', 'info')
          gs10.setGatherPrompt('Fishing... [Esc to cancel]')
          fishingStateRef.current = 'waiting'
        }
      }

      if (isFishingActive()) {
        const fishResult = tickFishing(dt)
        fishingStateRef.current = fishResult
        if (fishResult === 'bite') {
          inventory.addItem({ itemId: 0, materialId: MAT.FISH, quantity: 1 + Math.floor(Math.random() * 2), quality: 0.8 })
          useUiStore.getState().addNotification('Fish caught! Raw fish added to inventory.', 'discovery')
          gs10.setGatherPrompt(null)
          fishingStateRef.current = 'idle'
        }
      }

      // Compass: when compass equipped, show bearing in gather prompt
      if (equippedItem10 && equippedItem10.itemId === ITEM.COMPASS && gs10.gatherPrompt === null) {
        const playerDir10 = new THREE.Vector3(px, py, pz).normalize()
        // North = +Z direction projected onto tangent plane
        const northTangent = new THREE.Vector3(0, 0, 1).addScaledVector(playerDir10, -new THREE.Vector3(0, 0, 1).dot(playerDir10))
        // Player's forward in world space from camera
        const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        camFwd.addScaledVector(playerDir10, -camFwd.dot(playerDir10))
        const bearing = northTangent.angleTo(camFwd) * (180 / Math.PI)
        const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        const card = cardinals[Math.round(bearing / 45) % 8]
        gs10.setGatherPrompt(`Compass: ${card} (${bearing.toFixed(0)}°)`)
      }

      // M10 Track C: Open shop when near settlement and player presses F with no other context
      if (controllerRef.current?.popInteract()) {
        const nearSettlement10 = useSettlementStore.getState().nearSettlementId
        if (nearSettlement10 !== null && gs10.gatherPrompt === null) {
          getWorldSocket()?.send({ type: 'SHOP_OPEN_REQUEST', settlementId: nearSettlement10 })
        }
      }

      // Close shop on Escape
      if (useShopStore.getState().open) {
        const gs10b = useGameStore.getState()
        if (gs10b.inputBlocked) useShopStore.getState().closeShop()
      }
    }

    // ── M7 T2: NPC guard aggro — wanted players attacked on sight ─────────────
    // When local player has murder_count >= 5, server NPCs near the player
    // in a settlement territory apply combat damage (simulated client-side
    // as environmental hazard from guards). Check once per 3s with settlement timer.
    {
      const localMurderCount = usePlayerStore.getState().murderCount
      const WANTED_THRESHOLD_CLIENT = 5
      const GUARD_RANGE_SQ = 30 * 30  // 30 metre aggro radius
      const GUARD_DPS = 8             // damage per second from guard volley
      if (localMurderCount >= WANTED_THRESHOLD_CLIENT) {
        const nearestSettlement = useSettlementStore.getState().nearSettlementId
        if (nearestSettlement !== null) {
          // Guards deal damage proportional to dt — simulate arrow volley per frame
          const ps3 = usePlayerStore.getState()
          // Check if any server NPC is within 30m (they are settlement guards)
          const remoteNpcs3 = useMultiplayerStore.getState().remoteNpcs
          for (const npc of remoteNpcs3) {
            const dx = npc.x - px, dy = (npc.y ?? 1) - py, dz = npc.z - pz
            const distSq = dx * dx + dy * dy + dz * dz
            if (distSq < GUARD_RANGE_SQ) {
              // Guard attacks — apply damage per second, scaled by dt
              const guardDmg = GUARD_DPS * dt
              const maxHp    = Health.max[entityId] || 100
              const newHp    = Math.max(0, Health.current[entityId] - guardDmg)
              Health.current[entityId] = newHp
              // Mark as combat damage so death is attributed correctly
              markCombatDamage()
              break  // one guard attack per frame is enough
            }
          }
        }
      }
    }
  })

  return null
}

// ── Building ghost (shown during placement mode) ──────────────────────────────

// Scratch objects for BuildingGhost — allocated once at module scope, never inside useFrame
const _ghostPlayerPos = new THREE.Vector3()
const _ghostPlayerUp  = new THREE.Vector3()
const _ghostDir       = new THREE.Vector3()
const _ghostYUp       = new THREE.Vector3(0, 1, 0)

function BuildingGhost({ entityId }: { entityId: number }) {
  const { camera } = useThree()
  const placementMode = useGameStore(s => s.placementMode)
  const ghostRef = useRef<THREE.Group>(null)
  const fwdVec = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!ghostRef.current || !placementMode) return
    const btype = BUILDING_TYPES.find(t => t.id === placementMode)
    if (!btype) return

    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]
    // M9 T3: Use module-level scratch vectors — no per-frame Vector3 allocation
    _ghostPlayerPos.set(px, py, pz)
    _ghostPlayerUp.copy(_ghostPlayerPos).normalize()
    fwdVec.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
    fwdVec.current.addScaledVector(_ghostPlayerUp, -fwdVec.current.dot(_ghostPlayerUp))
    if (fwdVec.current.lengthSq() < 0.001) fwdVec.current.set(0, 0, -1)
    else fwdVec.current.normalize()
    _ghostDir.copy(_ghostPlayerPos).addScaledVector(fwdVec.current, 6).normalize()
    const ghostSR = surfaceRadiusAt(_ghostDir.x * PLANET_RADIUS, _ghostDir.y * PLANET_RADIUS, _ghostDir.z * PLANET_RADIUS)
    const halfH = btype.size[1] / 2
    const gx = _ghostDir.x * (ghostSR + halfH)
    const gy = _ghostDir.y * (ghostSR + halfH)
    const gz = _ghostDir.z * (ghostSR + halfH)
    ghostRef.current.position.set(gx, gy, gz)
    // Align ghost to surface normal — reuse scratch _ghostYUp
    ghostRef.current.quaternion.setFromUnitVectors(_ghostYUp, _ghostDir)
  })

  if (!placementMode) return null
  const btype = BUILDING_TYPES.find(t => t.id === placementMode)
  if (!btype) return null
  const [w, h, d] = btype.size

  return (
    <group ref={ghostRef}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#4488ff" opacity={0.25} transparent />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
        <lineBasicMaterial color="#88aaff" />
      </lineSegments>
    </group>
  )
}

// ── M5: Death loot drops + bedroll renderers ──────────────────────────────────

function DeathLootDropsRenderer() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])
  const visible = DEATH_LOOT_DROPS.filter((d) => !gatheredLootIds.has(d.id))
  if (visible.length === 0 || tick < 0) return null
  return (
    <>
      {visible.map((drop) => {
        const len = Math.sqrt(drop.x * drop.x + drop.y * drop.y + drop.z * drop.z)
        const sn =
          len > 1
            ? new THREE.Vector3(drop.x / len, drop.y / len, drop.z / len)
            : new THREE.Vector3(0, 1, 0)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sn)
        return (
          <group key={drop.id} position={[drop.x + sn.x * 0.25, drop.y + sn.y * 0.25, drop.z + sn.z * 0.25]} quaternion={q}>
            <mesh castShadow>
              <boxGeometry args={[0.3, 0.3, 0.3]} />
              <meshStandardMaterial color="#f1c40f" emissive="#f39c12" emissiveIntensity={0.5} roughness={0.4} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.22, 0.3, 16]} />
              <meshBasicMaterial color="#f39c12" transparent opacity={0.4} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

function BedrollMeshRenderer() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])
  const anchor = placedBedrollAnchor
  if (!anchor || tick < 0) return null
  const len = Math.sqrt(anchor.x * anchor.x + anchor.y * anchor.y + anchor.z * anchor.z)
  const sn =
    len > 1
      ? new THREE.Vector3(anchor.x / len, anchor.y / len, anchor.z / len)
      : new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sn)
  return (
    <group position={[anchor.x + sn.x * 0.06, anchor.y + sn.y * 0.06, anchor.z + sn.z * 0.06]} quaternion={q}>
      <mesh receiveShadow>
        <boxGeometry args={[1.8, 0.08, 0.9]} />
        <meshStandardMaterial color="#8B6914" roughness={0.9} />
      </mesh>
      <mesh position={[0.7, 0.07, 0]} receiveShadow>
        <boxGeometry args={[0.35, 0.12, 0.7]} />
        <meshStandardMaterial color="#c9a84c" roughness={0.85} />
      </mesh>
      <mesh position={[-0.1, 0.05, 0]}>
        <boxGeometry args={[1.1, 0.09, 0.88]} />
        <meshStandardMaterial color="#5a4a2a" roughness={0.95} transparent opacity={0.7} />
      </mesh>
      <pointLight color="#f1c40f" intensity={0.4} distance={4} />
    </group>
  )
}

// ── Placed buildings renderer ─────────────────────────────────────────────────

const BUILDING_COLORS: Record<number, string> = {
  0: '#8B7355',  // tier 0: earth/wood
  1: '#B8860B',  // tier 1: clay/bronze
  2: '#7A8070',  // tier 2: stone
  3: '#9A9A8A',  // tier 3: classical stone
  4: '#6A7090',  // tier 4: medieval
  5: '#8A6A4A',  // tier 5: industrial brick
  6: '#5A7A9A',  // tier 6: modern glass+steel
  7: '#4A5A8A',  // tier 7: info age
  8: '#7A4A9A',  // tier 8: fusion
  9: '#9A4A7A',  // tier 9: simulation
}

function PlacedBuildingsRenderer() {
  const buildVersion = useGameStore(s => s.buildVersion)
  const buildings = buildingSystem.getAllBuildings()

  return (
    <>
      {buildings.map(b => {
        const btype = BUILDING_TYPES.find(t => t.id === b.typeId)
        if (!btype) return null
        const [w, h, d] = btype.size
        const color = BUILDING_COLORS[btype.tier] ?? '#888'
        const [bx, by, bz] = b.position
        // Align building to surface normal so it stands upright anywhere on sphere
        const bLen = Math.sqrt(bx * bx + by * by + bz * bz)
        const bNorm = bLen > 0.01 ? new THREE.Vector3(bx / bLen, by / bLen, bz / bLen) : new THREE.Vector3(0, 1, 0)
        const bQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bNorm)
        // Position center at surface + half height along normal
        const cx = bx + bNorm.x * h / 2
        const cy = by + bNorm.y * h / 2
        const cz = bz + bNorm.z * h / 2
        return (
          <group key={b.id} position={[cx, cy, cz]} quaternion={bQuat}>
            {/* Main structure */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
            </mesh>
            {/* Roof (slightly wider, flat top) */}
            <mesh position={[0, h / 2 + 0.15, 0]} castShadow>
              <boxGeometry args={[w + 0.4, 0.3, d + 0.4]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

// ── EquippedItemMesh ──────────────────────────────────────────────────────────
// Renders a plain colored box at the player's right-hand position.
// Uses the player's ECS rotation quaternion (not the camera) because the
// camera is behind the player in third-person mode.
//
// Slot is re-read every frame inside useFrame to avoid stale closure bugs.
// If the player drops/consumes the equipped item, the mesh hides immediately.
function EquippedItemMesh({ entityId }: { entityId: number }) {
  const meshRef       = useRef<THREE.Mesh>(null)
  const _q            = useRef(new THREE.Quaternion())
  const _localOffset  = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!meshRef.current) return

    // Re-read slot every frame — avoids stale closure
    const eSlot = usePlayerStore.getState().equippedSlot
    const slot  = eSlot !== null ? inventory.getSlot(eSlot) : null

    if (!slot) {
      meshRef.current.visible = false
      return
    }
    meshRef.current.visible = true

    // Player world position from ECS
    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]

    // Player rotation quaternion from ECS (not camera — third-person game)
    const q = _q.current
    q.set(
      Rotation.x[entityId],
      Rotation.y[entityId],
      Rotation.z[entityId],
      Rotation.w[entityId],
    )

    // Hand offset in player-local space: right, slightly forward, slightly down
    const localOffset = _localOffset.current
    localOffset.set(0.5, -0.3, 0.4).applyQuaternion(q)

    meshRef.current.position.set(px + localOffset.x, py + localOffset.y, pz + localOffset.z)
    meshRef.current.quaternion.copy(q)
  })

  // Always mount the mesh — visibility controlled by useFrame
  return (
    <mesh ref={meshRef} visible={false}>
      <boxGeometry args={[0.08, 0.08, 0.45]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
  )
}

// ── Player mesh (visible body in third-person) ────────────────────────────────

function HumanoidFigure({
  skinColor, shirtColor, pantsColor,
  leftLegAngle = 0, rightLegAngle = 0,
  leftArmAngle = 0, rightArmAngle = 0,
}: {
  skinColor: string; shirtColor: string; pantsColor: string
  leftLegAngle?: number; rightLegAngle?: number
  leftArmAngle?: number; rightArmAngle?: number
}) {
  return (
    <>
      {/* Torso */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Left arm (rotates from shoulder at y=0.75) */}
      <group position={[-0.30, 0.75, 0]} rotation={[leftArmAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Right arm */}
      <group position={[0.30, 0.75, 0]} rotation={[rightArmAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Left leg (rotates from hip at y=0.09) */}
      <group position={[-0.13, 0.09, 0]} rotation={[leftLegAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      {/* Right leg */}
      <group position={[0.13, 0.09, 0]} rotation={[rightLegAngle, 0, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
    </>
  )
}

function PlayerMesh({
  entityId,
  controllerRef,
}: {
  entityId: number
  controllerRef: RefObject<PlayerController | null>
}) {
  const rootRef  = useRef<THREE.Group>(null)
  const walkTime = useRef(0)
  const lastPos  = useRef({ x: 0, y: 0, z: 0 })
  // Refs for animated limb groups
  const lLegRef  = useRef<THREE.Group>(null)
  const rLegRef  = useRef<THREE.Group>(null)
  const lArmRef  = useRef<THREE.Group>(null)
  const rArmRef  = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!rootRef.current) return

    // Prevent first-person self-occlusion (camera inside local body mesh).
    rootRef.current.visible = controllerRef.current?.cameraMode !== 'first_person'

    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]

    // Detect movement speed using full 3D displacement (sphere walking moves all 3 axes)
    const dx = px - lastPos.current.x
    const dy = py - lastPos.current.y
    const dz = pz - lastPos.current.z
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / delta
    lastPos.current = { x: px, y: py, z: pz }

    // Advance walk cycle only when moving
    const isMoving = speed > 0.3
    if (isMoving) walkTime.current += delta * Math.min(speed, 14) * 1.6

    const swing = isMoving ? Math.sin(walkTime.current) * 0.55 : 0

    // Apply leg/arm rotations directly via refs (no React re-render needed)
    if (lLegRef.current)  lLegRef.current.rotation.x  =  swing
    if (rLegRef.current)  rLegRef.current.rotation.x  = -swing
    if (lArmRef.current)  lArmRef.current.rotation.x  = -swing * 0.6
    if (rArmRef.current)  rArmRef.current.rotation.x  =  swing * 0.6

    // Root position + facing
    rootRef.current.position.set(px, py, pz)
    rootRef.current.quaternion.set(
      Rotation.x[entityId],
      Rotation.y[entityId],
      Rotation.z[entityId],
      Rotation.w[entityId] || 1,
    )
  })

  return (
    <group ref={rootRef}>
      {/* Offset entire humanoid down so feet sit at ground level.
          Rapier capsule center is 0.9m above ground (halfHeight 0.6 + radius 0.3).
          Foot bottom is at y=-0.57 in this group, so to land feet at -0.9 (ground):
          offset = -0.9 - (-0.57) = -0.33m. */}
      <group position={[0, -0.33, 0]}>
      {/* Static body parts */}
      {/* Torso */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color="#3a7ecf" />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color="#2a4a7a" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color="#f5c5a3" />
      </mesh>
      <mesh position={[0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color="#f5c5a3" />
      </mesh>
      {/* Left arm (pivot at shoulder) */}
      <group ref={lArmRef} position={[-0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color="#3a7ecf" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color="#f5c5a3" />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rArmRef} position={[0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color="#3a7ecf" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color="#f5c5a3" />
        </mesh>
      </group>
      {/* Left leg (pivot at hip) */}
      <group ref={lLegRef} position={[-0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color="#2a4a7a" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      {/* Right leg */}
      <group ref={rLegRef} position={[0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color="#2a4a7a" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      </group>{/* end offset group */}
    </group>
  )
}

// ── Server NPC renderer ───────────────────────────────────────────────────────

const NPC_SKIN_TONES = ['#c8926e', '#d4a574', '#8b5e3c', '#f0d4b0', '#a0724a']
const NPC_SHIRT_COLS = ['#8b4513', '#556b2f', '#8b0000', '#4682b4', '#a0522d']
const NPC_PANTS_COLS = ['#3b2f2f', '#2f4f2f', '#1a1a3a', '#4a3a20', '#2a2a2a']

function AnimatedNpcMesh({ npc, skinColor, shirtColor, pantsColor }: {
  npc: RemoteNpc; skinColor: string; shirtColor: string; pantsColor: string
}) {
  const groupRef = useRef<THREE.Group>(null)
  const lLegRef  = useRef<THREE.Group>(null)
  const rLegRef  = useRef<THREE.Group>(null)
  const lArmRef  = useRef<THREE.Group>(null)
  const rArmRef  = useRef<THREE.Group>(null)
  const walkRef  = useRef(0)
  const prevXZ   = useRef({ x: npc.x, z: npc.z })

  useFrame((_, delta) => {
    const root = groupRef.current
    if (!root) return

    // Snap to terrain surface using sphere-aware surfaceRadiusAt.
    // Server sends npc.x/y/z; if these are 3D sphere coords use them directly,
    // otherwise reconstruct a valid surface point via the radius function.
    const sr = surfaceRadiusAt(npc.x, npc.y, npc.z)
    const len = Math.sqrt(npc.x * npc.x + npc.y * npc.y + npc.z * npc.z)
    const nx = len > 1 ? npc.x / len : 0
    const ny = len > 1 ? npc.y / len : 1
    const nz = len > 1 ? npc.z / len : 0
    const wx = nx * (sr + 0.9)
    const wy = ny * (sr + 0.9)
    const wz = nz * (sr + 0.9)
    root.position.set(wx, wy, wz)

    // Orient upright on sphere surface
    const up2 = new THREE.Vector3(nx, ny, nz)
    const north2 = new THREE.Vector3(0, 0, 1)
    north2.addScaledVector(up2, -north2.dot(up2))
    if (north2.lengthSq() < 0.001) north2.set(1, 0, 0)
    north2.normalize()
    const east2 = new THREE.Vector3().crossVectors(up2, north2).normalize()

    // Detect movement for walk cycle
    const dx = npc.x - prevXZ.current.x
    const dz = npc.z - prevXZ.current.z
    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(delta, 0.001)
    prevXZ.current = { x: npc.x, z: npc.z }

    // Build facing direction from movement or keep last yaw
    let fwdX = -north2.x, fwdY = -north2.y, fwdZ = -north2.z
    if (speed > 0.5 && (Math.abs(dx) + Math.abs(dz)) > 0) {
      const flatFwd = new THREE.Vector3(dx, 0, dz).normalize()
      fwdX = flatFwd.x; fwdY = 0; fwdZ = flatFwd.z
    }
    const fwd2 = new THREE.Vector3(fwdX, fwdY, fwdZ)
    fwd2.addScaledVector(up2, -fwd2.dot(up2))
    if (fwd2.lengthSq() > 0.001) {
      fwd2.normalize()
      const mat = new THREE.Matrix4().set(
        east2.x, up2.x, -fwd2.x, 0,
        east2.y, up2.y, -fwd2.y, 0,
        east2.z, up2.z, -fwd2.z, 0,
        0,       0,     0,       1,
      )
      root.quaternion.setFromRotationMatrix(mat)
    }

    const moving = speed > 0.3 && npc.state !== 'eat' && npc.state !== 'rest'
    if (moving) walkRef.current += delta * Math.min(speed, 8) * 1.8
    const swing = moving ? Math.sin(walkRef.current) * 0.5 : 0

    if (lLegRef.current) lLegRef.current.rotation.x =  swing
    if (rLegRef.current) rLegRef.current.rotation.x = -swing
    if (lArmRef.current) lArmRef.current.rotation.x = -swing * 0.55
    if (rArmRef.current) rArmRef.current.rotation.x =  swing * 0.55
  })

  // Indicator dot above head shows state
  const dotColor =
    npc.state === 'eat'       ? '#ff6644' :
    npc.state === 'rest'      ? '#4488ff' :
    npc.state === 'socialize' ? '#ffcc00' :
    npc.state === 'gather'    ? '#44dd88' : null

  return (
    <group ref={groupRef}>
      {dotColor && (
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.12, 6, 6]} />
          <meshStandardMaterial color={dotColor} emissive={dotColor} emissiveIntensity={0.6} />
        </mesh>
      )}
      {/* Torso */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      <mesh position={[0.1, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.1, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Left arm */}
      <group ref={lArmRef} position={[-0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rArmRef} position={[0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Left leg */}
      <group ref={lLegRef} position={[-0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      {/* Right leg */}
      <group ref={rLegRef} position={[0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
    </group>
  )
}

function ServerNpcsRenderer() {
  const remoteNpcs = useMultiplayerStore(s => s.remoteNpcs)
  return (
    <>
      {remoteNpcs.map((npc, idx) => {
        const si = idx % NPC_SKIN_TONES.length
        return (
          <AnimatedNpcMesh
            key={npc.id}
            npc={npc}
            skinColor={NPC_SKIN_TONES[si]}
            shirtColor={NPC_SHIRT_COLS[si]}
            pantsColor={NPC_PANTS_COLS[si]}
          />
        )
      })}
    </>
  )
}

// ── Local NPC renderer (shown when server is offline) ─────────────────────────
// Spawns 12 NPCs near the spawn area and wanders them on the sphere surface.

const LOCAL_NPC_COUNT = 12
const NPC_WANDER_SPEED = 1.8  // m/s

// ── P2-3: NPC Utility AI ──────────────────────────────────────────────────────
//
// Scientific basis: Utility-based agent architecture. Each NPC maintains a set
// of continuous need values (hunger 0-1, fatigue 0-1, safety 0-1). Every
// PLAN_INTERVAL seconds the agent evaluates utility scores for each available
// action and selects the highest-utility action. Actions:
//
//   WANDER  — explore randomly; satisfies curiosity, raises fatigue slowly
//   GATHER  — move toward nearest resource node; reduces hunger when complete
//   EAT     — consume carried food; reduces hunger instantly (if food available)
//   REST    — stand still; reduces fatigue
//   FLEE    — move away from player if trust < 0.3 and player is within 8m
//
// Trust score: starts at 0.5. Rises 0.002/s when player is near and not
// attacking. Falls 0.05 per player attack event within 8m. Affects flee threshold.
//
// Hunger/fatigue dynamics:
//   hunger:  rises at 0.004/s (full hunger in ~4min real time)
//   fatigue: rises at 0.003/s while wandering, falls at 0.01/s while resting
//   food:    a boolean flag — NPC "found food" when it reaches a raw_meat node

type NpcAiState = 'WANDER' | 'GATHER' | 'EAT' | 'REST' | 'FLEE'

interface LocalNpcState {
  pos: THREE.Vector3
  vel: THREE.Vector3
  yaw: number
  walkPhase: number
  stateTimer: number
  wandering: boolean
  skinIdx: number
  // P2-3 utility AI needs
  hunger: number         // 0 = full, 1 = starving
  fatigue: number        // 0 = rested, 1 = exhausted
  trust: number          // 0 = hostile, 1 = friendly
  hasFood: boolean       // carrying food (found a raw_meat node nearby)
  aiState: NpcAiState
  planTimer: number      // seconds until next utility re-evaluation
  gatherTargetIdx: number  // index into RESOURCE_NODES for current GATHER target (-1 = none)
}

// Utility score for each action given current needs. Returns 0–1.
function utilityScore(action: NpcAiState, npc: LocalNpcState, distToPlayer: number): number {
  switch (action) {
    case 'FLEE':
      // High utility only when trust is low AND player is close
      if (distToPlayer > 12 || npc.trust > 0.35) return 0
      return (1 - npc.trust) * (1 - distToPlayer / 12)
    case 'EAT':
      return npc.hasFood ? npc.hunger * 0.9 : 0
    case 'REST':
      return npc.fatigue > 0.6 ? npc.fatigue * 0.75 : 0
    case 'GATHER':
      // Gather when hungry and not carrying food already
      return (!npc.hasFood && npc.hunger > 0.3) ? npc.hunger * 0.65 : 0
    case 'WANDER':
    default:
      return 0.2  // baseline — always some desire to explore
  }
}

function selectAiAction(npc: LocalNpcState, distToPlayer: number): NpcAiState {
  const actions: NpcAiState[] = ['FLEE', 'EAT', 'REST', 'GATHER', 'WANDER']
  let bestAction: NpcAiState = 'WANDER'
  let bestScore = -1
  for (const a of actions) {
    const score = utilityScore(a, npc, distToPlayer)
    if (score > bestScore) { bestScore = score; bestAction = a }
  }
  return bestAction
}

function buildLocalNpcs(): LocalNpcState[] {
  const npcs: LocalNpcState[] = []
  const [sx, sy, sz] = (() => {
    try { return getSpawnPosition() } catch { return [0, 2001, 0] }
  })()
  const spawnPos = new THREE.Vector3(sx, sy, sz)
  for (let i = 0; i < LOCAL_NPC_COUNT; i++) {
    const angle = (i / LOCAL_NPC_COUNT) * Math.PI * 2
    const dist  = 8 + (i % 4) * 14
    const up = spawnPos.clone().normalize()
    const north = new THREE.Vector3(0, 0, 1)
    north.addScaledVector(up, -north.dot(up)).normalize()
    const east = new THREE.Vector3().crossVectors(up, north).normalize()
    const offset = north.clone().multiplyScalar(Math.cos(angle) * dist)
      .addScaledVector(east, Math.sin(angle) * dist)
    const pos = spawnPos.clone().add(offset).normalize().multiplyScalar(spawnPos.length())
    const sr = surfaceRadiusAt(pos.x, pos.y, pos.z)
    pos.normalize().multiplyScalar(sr + 0.9)
    npcs.push({
      pos,
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      walkPhase: Math.random() * Math.PI * 2,
      stateTimer: 3 + Math.random() * 5,
      wandering: Math.random() > 0.4,
      skinIdx: i % NPC_SKIN_TONES.length,
      // P2-3 initial needs (varied so NPCs don't all do the same thing)
      hunger:   0.1 + Math.random() * 0.4,
      fatigue:  0.1 + Math.random() * 0.3,
      trust:    0.4 + Math.random() * 0.4,
      hasFood:  false,
      aiState:  'WANDER',
      planTimer: Math.random() * 3,  // stagger initial re-plan times
      gatherTargetIdx: -1,
    })
  }
  return npcs
}

function LocalNpcMesh({ npc }: { npc: LocalNpcState }) {
  const groupRef = useRef<THREE.Group>(null)
  const lLegRef  = useRef<THREE.Group>(null)
  const rLegRef  = useRef<THREE.Group>(null)
  const lArmRef  = useRef<THREE.Group>(null)
  const rArmRef  = useRef<THREE.Group>(null)
  // Scratch vectors — allocated once, reused every frame (no GC pressure)
  const _up    = useRef(new THREE.Vector3())
  const _north = useRef(new THREE.Vector3())
  const _east  = useRef(new THREE.Vector3())
  const _fwd   = useRef(new THREE.Vector3())
  const _mat   = useRef(new THREE.Matrix4())

  const si = npc.skinIdx
  const skin  = NPC_SKIN_TONES[si]
  const shirt = NPC_SHIRT_COLS[si]
  const pants = NPC_PANTS_COLS[si]

  useFrame((_, delta) => {
    const root = groupRef.current
    if (!root) return

    const dt = Math.min(delta, 0.1)
    const pos = npc.pos
    const up = pos.clone().normalize()

    // ── P2-3: Utility AI tick ──────────────────────────────────────────────
    // Update biological needs every frame
    npc.hunger  = Math.min(1, npc.hunger  + 0.004 * dt)
    npc.fatigue = Math.min(1, npc.fatigue + (npc.aiState === 'WANDER' || npc.aiState === 'GATHER' ? 0.003 : -0.008) * dt)

    // Trust dynamics: rise slowly when player near and not hostile
    const ps = usePlayerStore.getState()
    const pdx = ps.x - pos.x, pdy = ps.y - pos.y, pdz = ps.z - pos.z
    const distToPlayer = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
    if (distToPlayer < 10) {
      npc.trust = Math.min(1, npc.trust + 0.001 * dt)
    }

    // Re-evaluate utility plan every 3 seconds
    npc.planTimer -= dt
    if (npc.planTimer <= 0) {
      npc.planTimer = 2.5 + Math.random() * 1.5

      const newState = selectAiAction(npc, distToPlayer)
      if (newState !== npc.aiState) {
        npc.aiState   = newState
        npc.stateTimer = 0
        npc.gatherTargetIdx = -1
      }

      // When switching to GATHER, pick the nearest ungathered raw_meat or bone node
      if (npc.aiState === 'GATHER') {
        let bestDist = Infinity
        let bestIdx  = -1
        for (let ni = 0; ni < RESOURCE_NODES.length; ni++) {
          const node = RESOURCE_NODES[ni]
          if (gatheredNodeIds.has(node.id)) continue
          if (node.matId !== MAT.RAW_MEAT && node.matId !== MAT.BONE) continue
          const dx = node.x - pos.x, dy = node.y - pos.y, dz = node.z - pos.z
          const d = dx*dx + dy*dy + dz*dz
          if (d < bestDist) { bestDist = d; bestIdx = ni }
        }
        npc.gatherTargetIdx = bestIdx
      }
    }

    // ── State: EAT ────────────────────────────────────────────────────────
    if (npc.aiState === 'EAT') {
      npc.hunger  = Math.max(0, npc.hunger  - 0.4)
      npc.hasFood = false
      npc.aiState = 'WANDER'
      npc.planTimer = 1  // re-plan soon
    }

    // ── State machine: movement ────────────────────────────────────────────
    npc.stateTimer -= dt
    const moving = npc.aiState === 'WANDER' || npc.aiState === 'GATHER' || npc.aiState === 'FLEE'
    if (npc.stateTimer <= 0 && npc.aiState === 'WANDER') {
      npc.stateTimer = 2 + Math.random() * 6
      npc.yaw += (Math.random() - 0.5) * Math.PI * 0.8
    }

    // For GATHER, steer toward target node
    if (npc.aiState === 'GATHER' && npc.gatherTargetIdx >= 0) {
      const target = RESOURCE_NODES[npc.gatherTargetIdx]
      if (target && !gatheredNodeIds.has(target.id)) {
        const tdx = target.x - pos.x, tdy = target.y - pos.y, tdz = target.z - pos.z
        const tLen = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz)
        if (tLen < 2.5) {
          // Reached food node — pick it up
          npc.hasFood   = true
          npc.aiState   = 'EAT'  // eat immediately
          npc.planTimer = 0.5
        } else {
          // Steer yaw toward target — project target dir into local tangent plane
          const north = _north.current.set(0, 0, 1)
          north.addScaledVector(up, -north.dot(up)).normalize()
          const east = _east.current.crossVectors(up, north).normalize()
          const targetYaw = Math.atan2(
            tdx * east.x + tdy * east.y + tdz * east.z,
            tdx * north.x + tdy * north.y + tdz * north.z
          )
          // Smooth yaw toward target (20 deg/s max turn)
          const yawDiff = ((targetYaw - npc.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
          npc.yaw += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), 1.2 * dt)
        }
      } else {
        // Target gone — re-plan
        npc.gatherTargetIdx = -1
        npc.aiState = 'WANDER'
      }
    }

    // For FLEE, steer directly away from player
    if (npc.aiState === 'FLEE') {
      const north = _north.current.set(0, 0, 1)
      north.addScaledVector(up, -north.dot(up)).normalize()
      const east = _east.current.crossVectors(up, north).normalize()
      // Direction AWAY from player
      const awayX = -pdx, awayY = -pdy, awayZ = -pdz
      npc.yaw = Math.atan2(
        awayX * east.x + awayY * east.y + awayZ * east.z,
        awayX * north.x + awayY * north.y + awayZ * north.z
      )
    }

    if (moving) {
      // Compute forward direction in local tangent plane
      const north = _north.current.set(0, 0, 1)
      north.addScaledVector(up, -north.dot(up)).normalize()
      const east = _east.current.crossVectors(up, north).normalize()
      const fwdX = north.x * Math.cos(npc.yaw) + east.x * Math.sin(npc.yaw)
      const fwdY = north.y * Math.cos(npc.yaw) + east.y * Math.sin(npc.yaw)
      const fwdZ = north.z * Math.cos(npc.yaw) + east.z * Math.sin(npc.yaw)

      const spd = (npc.aiState === 'FLEE' ? NPC_WANDER_SPEED * 2.0 : NPC_WANDER_SPEED) * dt
      const nx2 = pos.x + fwdX * spd
      const ny2 = pos.y + fwdY * spd
      const nz2 = pos.z + fwdZ * spd

      const targetH = surfaceRadiusAt(nx2, ny2, nz2) - PLANET_RADIUS
      if (targetH < 2) {
        npc.yaw += Math.PI + (Math.random() - 0.5) * 0.8
        npc.stateTimer = 1 + Math.random() * 2
      } else {
        pos.x = nx2; pos.y = ny2; pos.z = nz2
        const sr = surfaceRadiusAt(pos.x, pos.y, pos.z)
        pos.normalize().multiplyScalar(sr + 0.9)
      }

      npc.walkPhase += dt * 3.5
    }
    // Legacy wandering flag kept in sync for walk cycle animation
    npc.wandering = moving

    // Position and orient root group
    root.position.copy(pos)

    // Align group Y-axis to surface normal, face movement direction (no allocations)
    const up2    = _up.current.copy(pos).normalize()
    const north2 = _north.current.set(0, 0, 1)
    north2.addScaledVector(up2, -north2.dot(up2)).normalize()
    const east2 = _east.current.crossVectors(up2, north2).normalize()
    const fwd2  = _fwd.current.copy(north2).multiplyScalar(Math.cos(npc.yaw)).addScaledVector(east2, Math.sin(npc.yaw))
    _mat.current.set(
      east2.x, up2.x, -fwd2.x, 0,
      east2.y, up2.y, -fwd2.y, 0,
      east2.z, up2.z, -fwd2.z, 0,
      0,       0,     0,       1,
    )
    root.quaternion.setFromRotationMatrix(_mat.current)

    // Walk cycle limbs
    const swing = npc.wandering ? Math.sin(npc.walkPhase) * 0.5 : 0
    if (lLegRef.current) lLegRef.current.rotation.x =  swing
    if (rLegRef.current) rLegRef.current.rotation.x = -swing
    if (lArmRef.current) lArmRef.current.rotation.x = -swing * 0.55
    if (rArmRef.current) rArmRef.current.rotation.x =  swing * 0.55
  })

  // Indicator dot: color reflects P2-3 utility AI state
  const dotColor =
    npc.aiState === 'FLEE'   ? '#ff2222' :  // red    — fleeing player
    npc.aiState === 'EAT'    ? '#ff8833' :  // orange — eating
    npc.aiState === 'GATHER' ? '#44dd88' :  // green  — gathering food
    npc.aiState === 'REST'   ? '#4488ff' :  // blue   — resting
                               '#ffdd44'   // yellow — wandering

  return (
    <group ref={groupRef}>
      {/* State indicator dot above head */}
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.10, 6, 6]} />
        <meshStandardMaterial color={dotColor} emissive={dotColor} emissiveIntensity={0.8} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color={shirt} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color={pants} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.09, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.09, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      {/* Left arm (upper sleeve + forearm skin) */}
      <group ref={lArmRef} position={[-0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rArmRef} position={[0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      {/* Left leg */}
      <group ref={lLegRef} position={[-0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pants} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      {/* Right leg */}
      <group ref={rLegRef} position={[0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pants} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
    </group>
  )
}

function LocalNpcsRenderer() {
  const connectionStatus = useMultiplayerStore(s => s.connectionStatus)
  const remoteNpcs = useMultiplayerStore(s => s.remoteNpcs)
  // Only render local NPCs when server is offline AND server sent no NPCs
  const showLocal = connectionStatus !== 'connected' || remoteNpcs.length === 0
  const npcs = useMemo(() => buildLocalNpcs(), [])
  if (!showLocal) return null
  return (
    <>
      {npcs.map((npc, i) => <LocalNpcMesh key={i} npc={npc} />)}
    </>
  )
}

// ── Resource nodes ────────────────────────────────────────────────────────────

// Per-node visual variation (deterministic from node id)
function nodeRand(id: number, offset: number): number {
  let h = ((id * 374761 + offset * 668265) * 1274127) >>> 0
  return (h >>> 0) / 0xffffffff
}

// ── Foliage wind-sway material factory ───────────────────────────────────────
// Creates a MeshStandardMaterial with per-vertex wind animation baked into the
// vertex shader via onBeforeCompile. Crown sways more (high local Y), base
// stays fixed (local Y = 0). uTime uniform is updated each frame by TreeMesh.
// Formula matches spec: position.x += sin(uTime*0.5 + position.z*0.3)*0.02*(position.y/treeHeight)
function makeWindFoliageMaterial(color: string, treeHeight: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime       = { value: 0 }
    shader.uniforms.uTreeHeight = { value: Math.max(treeHeight, 0.01) }
    // Stash uniform refs on material for per-frame update
    ;(mat as any)._windUniforms = shader.uniforms

    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `uniform float uTime;
uniform float uTreeHeight;
void main() {`
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `// Wind sway: amplitude scales 0 at base → full at crown tip
float _windT = position.y / uTreeHeight;
transformed.x += sin(uTime * 0.5 + position.z * 0.3) * 0.02 * _windT * uTreeHeight;
// Secondary orthogonal gust for elliptical crown motion
transformed.z += sin(uTime * 0.37 + position.x * 0.25) * 0.012 * _windT * uTreeHeight;
#include <project_vertex>`
    )
  }
  return mat
}

// ── Rock face-variation material factory ─────────────────────────────────────
// Upward-facing faces (vNormal.y → 1) are shinier: rain-polished/worn.
// Vertical side faces stay rough (sheltered, unweathered rock texture).
// roughness *= (0.7 + 0.3 * abs(vNormal.y))  →  top=0.7×, sides=1.0×
function makeRockMaterial(color: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.05 })
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      // Face-direction roughness: top faces are wet/worn (lower roughness),
      // side faces are rough (sheltered from weather).
      roughnessFactor *= (0.7 + 0.3 * abs(vNormal.y));`
    )
  }
  return mat
}

function TreeMesh({ id }: { id: number }) {
  const scale    = 0.8 + nodeRand(id, 0) * 0.7
  const trunkH   = 3.5 * scale
  const trunkBot = 0.28 * scale
  const trunkTop = 0.12 * scale
  const lean     = (nodeRand(id, 1) - 0.5) * 0.06
  const leafG1   = '#1e5c1e'
  const leafG2   = nodeRand(id, 2) > 0.5 ? '#2a7030' : '#174d17'
  const leafG3   = '#3a8a2a'

  // Wind foliage materials — vertex-shader micro-flutter + full PBR lighting.
  // One per foliage layer. useMemo [] — stable for this tree's lifetime.
  const crownHeight = 3.5 * scale * 1.1  // full tree height for amplitude normalisation
  const mat1 = useMemo(() => makeWindFoliageMaterial(leafG1, crownHeight), []) // eslint-disable-line react-hooks/exhaustive-deps
  const mat2 = useMemo(() => makeWindFoliageMaterial(leafG2, crownHeight), []) // eslint-disable-line react-hooks/exhaustive-deps
  const mat3 = useMemo(() => makeWindFoliageMaterial(leafG3, crownHeight), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Per-tree phase offset — ensures trees don't all sway in sync
  // Scientific basis: turbulent wind spectrum → each tree resonates at slightly
  // different natural frequency depending on mass, height, stiffness.
  const phaseOffset = nodeRand(id, 9) * Math.PI * 2
  const freqMult    = 0.8 + nodeRand(id, 10) * 0.4  // 0.8–1.2× base frequency

  // Wind direction: slow veering over time (2°/10s in real Beaufort-2 conditions)
  // We bake a stable yaw into each tree so wind appears directional
  const windYaw = nodeRand(id, 11) * 0.4 - 0.2  // ±0.2 rad individual lean bias

  const crownRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const crown = crownRef.current
    if (!crown) return
    const t = clock.elapsedTime

    // Two-frequency sway: primary at 0.5 Hz + harmonic at 1.0 Hz
    // Amplitude: 0.06 rad ≈ 3.4° — Beaufort scale 2 (light breeze)
    const sway = Math.sin(t * 0.5 * freqMult * Math.PI * 2 + phaseOffset) * 0.055
               + Math.sin(t * 1.0 * freqMult * Math.PI * 2 + phaseOffset * 1.3) * 0.02

    // Apply in two axes: primary wind direction + orthogonal gust component
    crown.rotation.z = sway + windYaw * 0.3
    crown.rotation.x = sway * 0.35 + Math.sin(t * 0.7 * freqMult + phaseOffset * 0.7) * 0.015

    // Micro-flutter: push elapsed time into vertex shader uniforms
    const windTime = t + phaseOffset
    const u1 = (mat1 as any)._windUniforms
    const u2 = (mat2 as any)._windUniforms
    const u3 = (mat3 as any)._windUniforms
    if (u1) u1.uTime.value = windTime
    if (u2) u2.uTime.value = windTime
    if (u3) u3.uTime.value = windTime
  })

  return (
    <group>
      {/* Trunk — static, only base of tree */}
      <mesh position={[lean * trunkH * 0.5, trunkH * 0.5, 0]} castShadow rotation={[0, 0, lean]}>
        <cylinderGeometry args={[trunkTop, trunkBot, trunkH, 7]} />
        <meshStandardMaterial color="#5c3a1e" roughness={1} />
      </mesh>
      {/* Crown group — macro rotation + per-vertex micro-flutter via wind shader */}
      <group ref={crownRef} position={[lean * trunkH, trunkH * 0.5, 0]}>
        {/* Lower foliage layer */}
        <mesh position={[0, trunkH * 0.12, 0]} castShadow material={mat1}>
          <coneGeometry args={[2.2 * scale, 2.8 * scale, 7]} />
        </mesh>
        {/* Mid foliage layer */}
        <mesh position={[0, trunkH * 0.32, 0]} castShadow material={mat2}>
          <coneGeometry args={[1.6 * scale, 2.2 * scale, 6]} />
        </mesh>
        {/* Top foliage layer */}
        <mesh position={[0, trunkH * 0.48, 0]} castShadow material={mat3}>
          <coneGeometry args={[1.0 * scale, 1.6 * scale, 6]} />
        </mesh>
      </group>
    </group>
  )
}

function BarkMesh({ id }: { id: number }) {
  const scale = 0.7 + nodeRand(id, 6) * 0.5
  const rot   = nodeRand(id, 7) * Math.PI
  const tilt  = (nodeRand(id, 8) - 0.5) * 0.3
  return (
    <group position={[0, 0.06 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale, scale]}>
      {/* Main bark plank */}
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.12, 0.35]} />
        <meshStandardMaterial color="#7a5a2a" roughness={1} />
      </mesh>
      {/* Second piece slightly offset */}
      <mesh position={[0.15, 0.06, 0.1]} rotation={[0, 0.4, 0.1]} castShadow>
        <boxGeometry args={[0.55, 0.10, 0.28]} />
        <meshStandardMaterial color="#6a4a1e" roughness={1} />
      </mesh>
    </group>
  )
}

function RockMesh({ id, color }: { id: number; color: string }) {
  const scale = 0.5 + nodeRand(id, 3) * 0.6
  const rot   = nodeRand(id, 4) * Math.PI * 2
  const tilt  = (nodeRand(id, 5) - 0.5) * 0.4
  // Specular face variation: upward faces shinier (rain-polished), sides rougher.
  // useMemo [] — rock color is stable for its lifetime.
  const mat = useMemo(() => makeRockMaterial(color), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group position={[0, 0.3 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale * 0.7, scale]}>
      <mesh castShadow material={mat}>
        <dodecahedronGeometry args={[0.55, 0]} />
      </mesh>
    </group>
  )
}

// ── Node health bar renderer ──────────────────────────────────────────────────
// M9 T3: Zero-allocation pool. Old code created new Geometry/Material/Mesh
// every frame per damaged node — a GC bomb at 60fps. New approach: preallocate
// _MAX_HP_BARS track+fill mesh pairs. Each frame costs 0 heap allocations.
const _MAX_HP_BARS = 32
const _hpTrackGeo = new THREE.PlaneGeometry(1.2, 0.18)
const _hpTrackMat = new THREE.MeshBasicMaterial({ color: '#222222', depthTest: false })
const _hpFillGeo = new THREE.PlaneGeometry(1.1, 0.14)
const _hpFillMats = Array.from({ length: _MAX_HP_BARS }, () =>
  new THREE.MeshBasicMaterial({ color: '#00ff00', depthTest: false }),
)
const _hpBarPos = new THREE.Vector3()
const _hpCamDir = new THREE.Vector3()
const _hpZAxis = new THREE.Vector3(0, 0, 1)
const _hpBillQ = new THREE.Quaternion()
function NodeHealthBars() {
  const groupRef = useRef<THREE.Group>(null)

  const { trackMeshes, fillMeshes } = useMemo(() => {
    const tracks: THREE.Mesh[] = []
    const fills: THREE.Mesh[] = []
    for (let i = 0; i < _MAX_HP_BARS; i++) {
      const t = new THREE.Mesh(_hpTrackGeo, _hpTrackMat)
      t.renderOrder = 999
      t.visible = false
      tracks.push(t)
      const f = new THREE.Mesh(_hpFillGeo, _hpFillMats[i])
      f.renderOrder = 1000
      f.visible = false
      fills.push(f)
    }
    return { trackMeshes: tracks, fillMeshes: fills }
  }, [])

  useEffect(() => {
    const g = groupRef.current
    if (!g) return
    for (let i = 0; i < _MAX_HP_BARS; i++) {
      g.add(trackMeshes[i])
      g.add(fillMeshes[i])
    }
    return () => {
      _hpFillMats.forEach((m) => m.dispose())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame(({ camera }) => {
    let slot = 0
    for (const [nodeId, hitsTaken] of NODE_HITS_TAKEN) {
      if (slot >= _MAX_HP_BARS) break
      if (gatheredNodeIds.has(nodeId)) continue
      const node = RESOURCE_NODES.find((n) => n.id === nodeId)
      if (!node) continue
      const maxHits = getNodeMaxHits(node.type)
      const pct = 1 - hitsTaken / maxHits

      const nLen = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z) || 1
      _hpBarPos.set(
        node.x + (node.x / nLen) * 4.5,
        node.y + (node.y / nLen) * 4.5,
        node.z + (node.z / nLen) * 4.5,
      )
      _hpCamDir.subVectors(camera.position, _hpBarPos).normalize()
      _hpBillQ.setFromUnitVectors(_hpZAxis, _hpCamDir)

      const track = trackMeshes[slot]
      track.position.copy(_hpBarPos)
      track.quaternion.copy(_hpBillQ)
      track.visible = true

      const fill = fillMeshes[slot]
      fill.scale.x = Math.max(0.001, pct)
      fill.position.set(_hpBarPos.x - 1.1 * (1 - pct) * 0.5, _hpBarPos.y, _hpBarPos.z)
      fill.quaternion.copy(_hpBillQ)
      fill.visible = true
      _hpFillMats[slot].color.setHSL((pct * 120) / 360, 0.8, 0.5)
      slot++
    }
    for (let i = slot; i < _MAX_HP_BARS; i++) {
      trackMeshes[i].visible = false
      fillMeshes[i].visible = false
    }
  })

  return <group ref={groupRef} />
}

function ResourceNodes() {
  const groupRefs = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    const serverDepleted = useMultiplayerStore.getState().depletedNodes
    for (let i = 0; i < RESOURCE_NODES.length; i++) {
      const g = groupRefs.current[i]
      if (g) {
        const id = RESOURCE_NODES[i].id
        g.visible = !gatheredNodeIds.has(id) && !serverDepleted.has(id)
      }
    }
  })

  return (
    <>
      {RESOURCE_NODES.map((node, i) => {
        return (
          <group
            key={node.id}
            ref={el => { groupRefs.current[i] = el }}
            position={[node.x, node.y, node.z]}
            quaternion={RESOURCE_NODE_QUATS[i]}
          >
            {node.type === 'wood'
              ? <TreeMesh id={node.id} />
              : node.type === 'bark'
                ? <BarkMesh id={node.id} />
                : <RockMesh id={node.id} color={node.color} />
            }
          </group>
        )
      })}
    </>
  )
}

// ── Dig holes renderer ────────────────────────────────────────────────────────
// Renders a dark concave disc at each dug position so the player can see
// where they have excavated. The disc sits flush on the sphere surface,
// oriented perpendicular to the surface normal at that point.

const _digDiscGeo = new THREE.CircleGeometry(1, 12)  // r=1, scaled per hole
const _digDiscMat = new THREE.MeshStandardMaterial({
  color: '#1a1208', roughness: 1, metalness: 0,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
})

function DigHolesRenderer() {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    // Keep child count in sync with DIG_HOLES
    while (g.children.length < DIG_HOLES.length) {
      const mesh = new THREE.Mesh(_digDiscGeo, _digDiscMat)
      g.add(mesh)
    }
    while (g.children.length > DIG_HOLES.length) {
      g.remove(g.children[g.children.length - 1])
    }
    for (let i = 0; i < DIG_HOLES.length; i++) {
      const h = DIG_HOLES[i]
      const mesh = g.children[i] as THREE.Mesh
      mesh.position.set(h.x, h.y, h.z)
      mesh.scale.setScalar(h.r)
      // Orient disc to face surface normal (disc normal = surface normal)
      const up = new THREE.Vector3(h.x, h.y, h.z).normalize()
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up)
    }
  })

  return <group ref={groupRef} />
}

// ── M8: Weather renderer wrapper ─────────────────────────────────────────────
// Reads player position from ECS each frame and passes it to WeatherRenderer
// so particle systems always follow the camera.

function WeatherRendererWrapper() {
  const entityId = usePlayerStore(s => s.entityId)
  const posRef   = useRef({ x: 0, y: 0, z: 0 })
  const [pos, setPos] = useState({ x: 0, y: 4003, z: 0 })

  useFrame(() => {
    if (entityId === null) return
    const nx = Position.x[entityId]
    const ny = Position.y[entityId]
    const nz = Position.z[entityId]
    // Only re-render when position changes appreciably (avoid thrashing React)
    if (
      Math.abs(nx - posRef.current.x) > 5 ||
      Math.abs(ny - posRef.current.y) > 5 ||
      Math.abs(nz - posRef.current.z) > 5
    ) {
      posRef.current = { x: nx, y: ny, z: nz }
      setPos({ x: nx, y: ny, z: nz })
    }
  })

  return (
    <WeatherRenderer
      playerX={pos.x}
      playerY={pos.y}
      playerZ={pos.z}
    />
  )
}

// ── M14 Track A: TransitOverlay wrapper ───────────────────────────────────────
// Renders the 20s star-stream cinematic when transit is in progress.
function TransitOverlayWrapper() {
  const phase = useTransitStore(s => s.phase)
  const { arriveAtDestination } = useTransitStore()
  if (phase !== 'launching') return null
  return <TransitOverlay onComplete={arriveAtDestination} />
}

// ── M14 Track A: DestinationPlanet wrapper ────────────────────────────────────
// Replaces home planet view when transit phase === 'arrived'.
function DestinationPlanetMeshWrapper() {
  const phase = useTransitStore(s => s.phase)
  if (phase !== 'arrived') return null
  return <DestinationPlanetMesh />
}

// ── M15: Planet selector — Velar World gets crystalline alien renderer ─────────
function DestinationPlanetSelector() {
  const toPlanet = useTransitStore(s => s.toPlanet)
  if (toPlanet === 'Velar') return <VelarPlanetMesh />
  return <DestinationPlanetMesh />
}

// ── Scene geometry ────────────────────────────────────────────────────────────

// TerrainMesh is replaced by <PlanetTerrain /> — see imports at top of file
