import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Stars } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
import { removeComponent } from 'bitecs'
import { PlayerController } from '../player/PlayerController'
import { MetabolismSystem, setMetabolismDt } from '../ecs/systems/MetabolismSystem'
import { inventory, buildingSystem, techTree, evolutionTree, journal } from '../game/GameSingletons'
import { TECH_NODES } from '../civilization/TechTree'
import { DISCOVERIES } from '../player/DiscoveryJournal'
import { TECH_TO_DISCOVERY } from '../civilization/TechDiscoveries'
import { MAT, ITEM } from '../player/Inventory'
import { BUILDING_TYPES } from '../civilization/BuildingSystem'
import { getItemStats, canHarvest } from '../player/EquipSystem'
import {
  tickFoodCooking,
  tickWoundSystem,
  tickSleepSystem,
  tickFurnaceSmelting,
  tryEatFood,
  tryApplyHerb,
  tryStartSleep,
  inflictWound,
  cookingProgress,
} from '../game/SurvivalSystems'
import { PlanetTerrain } from './PlanetTerrain'
import { surfaceRadiusAt, terrainHeightAt, getSpawnPosition, PLANET_RADIUS, SEA_LEVEL } from '../world/SpherePlanet'
import { LocalSimManager } from '../engine/LocalSimManager'
import { FireRenderer } from './FireRenderer'
import { DayNightCycle } from './DayNightCycle'
import { SimGridVisualizer } from './SimGridVisualizer'

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

// Resource nodes placed on the sphere surface near the actual land spawn point.
// getSpawnPosition() scans the sphere to find solid land (h >= 10m) rather than
// using the hard-coded north pole, which may be ocean on some planet seeds.
function generateResourceNodes(): ResourceNode[] {
  const rand = seededRand(99991)
  const nodes: ResourceNode[] = []
  let id = 0

  // Use the real land spawn direction instead of the north pole
  const [sx, sy, sz] = getSpawnPosition()
  const spawnDir = new THREE.Vector3(sx, sy, sz).normalize()

  // Build a stable perpendicular basis around spawnDir for arc rotation
  const perpBase = Math.abs(spawnDir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()

  for (const nt of NODE_TYPES) {
    for (let i = 0; i < nt.count; i++) {
      // Try up to 40 random positions until we find one above sea level
      let placed = false
      for (let attempt = 0; attempt < 40; attempt++) {
        const angle   = rand() * Math.PI * 2
        const arcDist = (15 + rand() * 500) / PLANET_RADIUS  // 15–515 m from spawn
        // Rotate tangent around spawnDir by angle → random great-circle axis
        const axis = tangent.clone().applyAxisAngle(spawnDir, angle)
        const dir  = spawnDir.clone().applyAxisAngle(axis, arcDist)
        const h    = terrainHeightAt(dir)
        if (h < 0) continue  // underwater — try again
        // Sink 2m below the exact terrain height so the base is embedded in
        // the rendered mesh (which underestimates convex peaks by 1–3m due to
        // vertex interpolation at segs=160 ~35m grid spacing).
        const r = PLANET_RADIUS + h - 0.8
        nodes.push({
          id: id++, type: nt.type, label: nt.label, matId: nt.matId, color: nt.color,
          x: dir.x * r, y: dir.y * r, z: dir.z * r,
        })
        placed = true
        break
      }
      if (!placed) {
        // Fallback: place exactly at spawn (guaranteed land)
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

// Module-level constants so they survive across renders
const RESOURCE_NODES: ResourceNode[] = generateResourceNodes()

// Pre-compute surface-normal quaternions for each node once.
// Rotates local Y (tree up) → outward surface normal at that point on the sphere.
const _worldUp = new THREE.Vector3(0, 1, 0)
const RESOURCE_NODE_QUATS: THREE.Quaternion[] = RESOURCE_NODES.map(n =>
  new THREE.Quaternion().setFromUnitVectors(
    _worldUp,
    new THREE.Vector3(n.x, n.y, n.z).normalize(),
  )
)

const gatheredNodeIds = new Set<number>()
const NODE_RESPAWN_AT = new Map<number, number>()
const NODE_RESPAWN_DELAY = 60_000

// Auto-open inventory on the player's first-ever gather so the playtester can
// immediately inspect the item without knowing to press I.
let _firstGatherDone = false

// ── Node health system ────────────────────────────────────────────────────────
// Tracks hits-taken per node. When hits reach the node's max, it is gathered.
// Trees require 3 hits, rocks require 2 hits, other nodes require 1 hit.
// Resets when the node respawns.
const NODE_HITS_TAKEN = new Map<number, number>()

function getNodeMaxHits(nodeType: string): number {
  if (nodeType === 'wood') return 3
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
  const [pointerLocked, setPointerLocked] = useState(false)
  const [simManager, setSimManager] = useState<LocalSimManager | null>(null)

  useEffect(() => {
    const check = () => setPointerLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', check)
    return () => document.removeEventListener('pointerlockchange', check)
  }, [])

  const setEngineReady = useGameStore(s => s.setEngineReady)
  const timeScale = useGameStore(s => s.timeScale)
  const paused = useGameStore(s => s.paused)
  const gatherPrompt = useGameStore(s => s.gatherPrompt)
  const placementMode = useGameStore(s => s.placementMode)
  const setPlacementMode = useGameStore(s => s.setPlacementMode)

  const setEntityId = usePlayerStore(s => s.setEntityId)
  const entityId = usePlayerStore(s => s.entityId)

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
    const engine = new SimulationEngine({ gridX: 64, gridY: 32, gridZ: 64, seed: 42 })
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
      if (savedPs.health < 1)    Health.current[eid]          = savedPs.health * Health.max[eid]
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
    })

    return () => {
      engine.dispose()
      controllerRef.current?.dispose()
      controllerRef.current = null
      simManagerRef.current = null
      setSimManager(null)
    }
  }, [setEngineReady, setEntityId])

  return (
    <>
    {/* Click-to-play overlay */}
    {!pointerLocked && (
      <div
        onClick={() => controllerRef.current?.requestPointerLock()}
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
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>E — Eat food &nbsp;·&nbsp; H — Herb / treat wound &nbsp;·&nbsp; Z — Sleep &nbsp;·&nbsp; Q — Attack</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>ESC — Settings &nbsp;·&nbsp; I — Inventory &nbsp;·&nbsp; C — Craft &nbsp;·&nbsp; B — Build &nbsp;·&nbsp; T/J/Tab/M — More</div>
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
    {/* Crosshair */}
    {pointerLocked && (
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 16, height: 16, zIndex: 50,
        pointerEvents: 'none',
      }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1.5, background: 'rgba(255,255,255,0.8)', transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1.5, background: 'rgba(255,255,255,0.8)', transform: 'translateX(-50%)' }} />
      </div>
    )}
    <Canvas
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
      shadows
    >
      <PerspectiveCamera makeDefault fov={70} near={0.5} far={20000} position={[0, PLANET_RADIUS + 200, 0]} />
      <fogExp2 attach="fog" args={['#c0d8f4', 0.010]} />
      {/* DayNightCycle owns all sky/sun/ambient/hemisphere lighting — replaces static lights */}
      <DayNightCycle />
      <Stars radius={10000} depth={200} count={6000} factor={5} />
      <Suspense fallback={null}>
        <PlanetTerrain />
        <DigHolesRenderer />
        <ResourceNodes />
        <NodeHealthBars />
        <PlacedBuildingsRenderer />
        <CreatureRenderer />
        <RemotePlayersRenderer />
        <ServerNpcsRenderer />
        <LocalNpcsRenderer />
        <FireRenderer simManager={simManager} />
        <SimGridVisualizer simManager={simManager} />
      </Suspense>
      {entityId !== null && (
        <>
          <GameLoop controllerRef={controllerRef} simManagerRef={simManagerRef} entityId={entityId} />
          <PlayerMesh entityId={entityId} />
          <EquippedItemMesh entityId={entityId} />
          <BuildingGhost entityId={entityId} />
        </>
      )}
    </Canvas>
    </>
  )
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
}

function GameLoop({ controllerRef, simManagerRef, entityId }: GameLoopProps) {
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
  const _sleepKeyRef        = useRef(false)
  const epAccumRef          = useRef(0)
  const tierRef             = useRef(0)
  const evoUnlockedRef      = useRef(-1)  // -1 forces apply on first frame
  const fwdVec              = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    // Cap dt to avoid spiral-of-death on slow frames
    const dt = Math.min(delta, 0.1)

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
        const dir3 = new THREE.Vector3(ndx, ndy, ndz)
        const h = terrainHeightAt(dir3)
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
          }
        }
      }
    }

    // 3. Metabolism (hunger, thirst, fatigue, health regen)
    setMetabolismDt(dt)
    MetabolismSystem(world)

    // 3. Push ECS vitals → playerStore so HUD bars update
    const maxHp = Health.max[entityId] || 100
    updateVitals({
      health:  Health.current[entityId] / maxHp,
      hunger:  Metabolism.hunger[entityId],
      thirst:  Metabolism.thirst[entityId],
      energy:  Metabolism.energy[entityId],
      fatigue: Metabolism.fatigue[entityId],
    })

    // 3b. Death / respawn — if player is dead, teleport back to spawn and reset vitals
    if (Health.current[entityId] <= 0) {
      const [sx, sy, sz] = getSpawnPosition()
      const physics = rapierWorld.getPlayer()
      if (physics) {
        physics.body.setNextKinematicTranslation({ x: sx, y: sy, z: sz })
      }
      Position.x[entityId] = sx; Position.y[entityId] = sy; Position.z[entityId] = sz
      Health.current[entityId] = Health.max[entityId] || 100
      Metabolism.hunger[entityId] = 0.5   // respawn hungry (not full, not dying)
      Metabolism.thirst[entityId] = 0.5
      Metabolism.energy[entityId] = 0.7
      removeComponent(world, IsDead, entityId)
      useUiStore.getState().addNotification('You died and respawned at spawn.', 'warning')
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
    let nearNode: ResourceNode | null = null
    let nearDist = Infinity
    for (const node of RESOURCE_NODES) {
      if (gatheredNodeIds.has(node.id)) continue
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

    if (nearNode && nearDist < 9) { // within 3m
      // Ores require at minimum a stone tool to mine
      const oreMatIds: number[] = [MAT.COPPER_ORE, MAT.IRON_ORE, MAT.COAL, MAT.TIN_ORE, MAT.SULFUR, MAT.GOLD, MAT.SILVER, MAT.URANIUM]
      const isOre = oreMatIds.includes(nearNode.matId)
      const hasPickaxe = inventory.hasItemById(ITEM.STONE_TOOL)
        || inventory.hasItemById(ITEM.AXE)
      const canGather = !isOre || hasPickaxe

      const label = canGather
        ? `[F] Gather ${nearNode.label}`
        : `[Need Stone Tool] ${nearNode.label}`
      if (gs.gatherPrompt !== label) gs.setGatherPrompt(label)

      if (canGather && !gs.inputBlocked && controllerRef.current?.popInteract()) {
        gatheredNodeIds.add(nearNode.id)
        NODE_RESPAWN_AT.set(nearNode.id, Date.now() + NODE_RESPAWN_DELAY)
        gs.setGatherPrompt(null)
        const qty = isOre ? 3 : 1
        inventory.addItem({ itemId: 0, materialId: nearNode.matId, quantity: qty, quality: 0.8 })
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
      }
    } else {
      if (gs.gatherPrompt !== null) gs.setGatherPrompt(null)
    }

    // ── Ambient temperature update ────────────────────────────────────────────
    if (simManagerRef.current) {
      const ps = usePlayerStore.getState()
      const tempC = simManagerRef.current.getTemperatureAt(ps.x, ps.y, ps.z)
      usePlayerStore.getState().setAmbientTemp(tempC)
    }

    // ── Slice 4: Food cooking thermodynamics ──────────────────────────────────
    tickFoodCooking(dt, inventory, simManagerRef.current, px, py, pz)

    // ── Slice 5: Wound + infection system ─────────────────────────────────────
    tickWoundSystem(dt)

    // ── Slice 6: Sleep / stamina restoration ──────────────────────────────────
    tickSleepSystem(dt)

    // ── Slice 7: Furnace smelting ─────────────────────────────────────────────
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

    // ── Tool use: left click harvests with equipped item ─────────────────
    const ps2 = usePlayerStore.getState()
    const equippedSlot2 = ps2.equippedSlot ?? null
    const equippedItem2 = equippedSlot2 !== null ? inventory.getSlot(equippedSlot2) : null
    const hasFlint = equippedItem2?.materialId === MAT.FLINT

    // ── Fire prompt: show when flint equipped + can start fire ───────────
    if (hasFlint && !gs.inputBlocked) {
      let nearestBurnable: ResourceNode | null = null
      let nearestBurnDist = 3.0
      for (const node of RESOURCE_NODES) {
        if (gatheredNodeIds.has(node.id)) continue
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
        if (gatheredNodeIds.has(node.id)) continue
        if (node.matId !== MAT.WOOD && node.matId !== MAT.BARK && node.matId !== MAT.FIBER) continue
        const dx = px - node.x, dy = py - node.y, dz = pz - node.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < nearestFireDist) { nearestFireDist = dist; nearestFireNode = node }
      }
      if (nearestFireNode) {
        // Path A: Strike flint near an in-world wood/bark/fiber node
        simManagerRef.current.placeWood(nearestFireNode.x, nearestFireNode.y, nearestFireNode.z, nearestFireNode.matId)
        simManagerRef.current.ignite(nearestFireNode.x, nearestFireNode.y, nearestFireNode.z)
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

      let nearest: (typeof RESOURCE_NODES)[0] | null = null
      let nearestDist = Infinity

      for (const node of RESOURCE_NODES) {
        if (gatheredNodeIds.has(node.id)) continue
        const dx = node.x - px
        const dy = node.y - py
        const dz = node.z - pz
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < stats.range && dist < nearestDist && canHarvest(itemId, node.type)) {
          nearest = node
          nearestDist = dist
        }
      }

      if (nearest) {
        // Hit-based health system: deplete hits, only gather when max hits reached
        const maxHits   = getNodeMaxHits(nearest.type)
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

    // ── E key: eat cooked food ────────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popEat?.()) {
      if (!tryEatFood(inventory)) {
        // If no food, try herb treatment instead
        tryApplyHerb(inventory)
      }
    }

    // ── H key: apply herb to wound ────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popHerb?.()) {
      tryApplyHerb(inventory)
    }

    // ── Z key: sleep / wake ───────────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popSleep?.()) {
      tryStartSleep(
        inventory,
        buildingSystem.getAllBuildings().map(b => ({ position: b.position, typeId: b.typeId })),
        px, py, pz
      )
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
  })

  return null
}

// ── Building ghost (shown during placement mode) ──────────────────────────────

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
    const playerPos = new THREE.Vector3(px, py, pz)
    const playerUp  = playerPos.clone().normalize()
    fwdVec.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
    fwdVec.current.addScaledVector(playerUp, -fwdVec.current.dot(playerUp))
    if (fwdVec.current.lengthSq() < 0.001) fwdVec.current.set(0, 0, -1)
    else fwdVec.current.normalize()
    const ghostDir = playerPos.clone().addScaledVector(fwdVec.current, 6).normalize()
    const ghostSR  = surfaceRadiusAt(ghostDir.x * PLANET_RADIUS, ghostDir.y * PLANET_RADIUS, ghostDir.z * PLANET_RADIUS)
    // Offset along surface normal (outward) by half building height — correct on any part of sphere
    const halfH = btype.size[1] / 2
    const gx = ghostDir.x * (ghostSR + halfH)
    const gy = ghostDir.y * (ghostSR + halfH)
    const gz = ghostDir.z * (ghostSR + halfH)
    ghostRef.current.position.set(gx, gy, gz)
    // Align ghost to surface normal (Y-up → outward normal)
    ghostRef.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      ghostDir,
    )
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

function PlayerMesh({ entityId }: { entityId: number }) {
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

interface LocalNpcState {
  pos: THREE.Vector3
  vel: THREE.Vector3  // tangential velocity in world space
  yaw: number
  walkPhase: number
  stateTimer: number
  wandering: boolean
  skinIdx: number
}

function buildLocalNpcs(): LocalNpcState[] {
  const npcs: LocalNpcState[] = []
  const [sx, sy, sz] = (() => {
    try { return getSpawnPosition() } catch { return [0, 2001, 0] }
  })()
  const spawnPos = new THREE.Vector3(sx, sy, sz)
  for (let i = 0; i < LOCAL_NPC_COUNT; i++) {
    // Scatter NPCs within ~60m tangent-plane offset of spawn (spread out enough to see)
    const angle = (i / LOCAL_NPC_COUNT) * Math.PI * 2
    const dist  = 8 + (i % 4) * 14
    const up = spawnPos.clone().normalize()
    const north = new THREE.Vector3(0, 0, 1)
    north.addScaledVector(up, -north.dot(up)).normalize()
    const east = new THREE.Vector3().crossVectors(up, north).normalize()
    const offset = north.clone().multiplyScalar(Math.cos(angle) * dist)
      .addScaledVector(east, Math.sin(angle) * dist)
    const pos = spawnPos.clone().add(offset).normalize().multiplyScalar(spawnPos.length())
    // Clamp to actual terrain surface
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

    // Update state timer
    npc.stateTimer -= delta
    if (npc.stateTimer <= 0) {
      npc.wandering = Math.random() > 0.35
      npc.stateTimer = 2 + Math.random() * 6
      if (npc.wandering) npc.yaw += (Math.random() - 0.5) * Math.PI * 0.8
    }

    const pos = npc.pos
    const up = pos.clone().normalize()

    if (npc.wandering) {
      // Compute forward direction in local tangent plane (reuse scratch refs — no alloc)
      const north = _north.current.set(0, 0, 1)
      north.addScaledVector(up, -north.dot(up)).normalize()
      const east = _east.current.crossVectors(up, north).normalize()
      const fwdX = north.x * Math.cos(npc.yaw) + east.x * Math.sin(npc.yaw)
      const fwdY = north.y * Math.cos(npc.yaw) + east.y * Math.sin(npc.yaw)
      const fwdZ = north.z * Math.cos(npc.yaw) + east.z * Math.sin(npc.yaw)

      const spd = NPC_WANDER_SPEED * delta
      const nx2 = pos.x + fwdX * spd
      const ny2 = pos.y + fwdY * spd
      const nz2 = pos.z + fwdZ * spd

      // Check the target height — refuse to step into ocean, turn around instead
      const targetH = surfaceRadiusAt(nx2, ny2, nz2) - PLANET_RADIUS
      if (targetH < 2) {
        // About to walk into water — reverse direction
        npc.yaw += Math.PI + (Math.random() - 0.5) * 0.8
        npc.stateTimer = 1 + Math.random() * 2
      } else {
        pos.x = nx2; pos.y = ny2; pos.z = nz2
        // Clamp back to terrain surface
        const sr = surfaceRadiusAt(pos.x, pos.y, pos.z)
        pos.normalize().multiplyScalar(sr + 0.9)
      }

      npc.walkPhase += delta * 3.5
    }

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

  // Indicator dot: yellow = wandering, blue = resting
  const dotColor = npc.wandering ? '#ffdd44' : '#4488ff'

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

function TreeMesh({ id }: { id: number }) {
  const scale    = 0.8 + nodeRand(id, 0) * 0.7
  const trunkH   = 3.5 * scale
  const trunkBot = 0.28 * scale
  const trunkTop = 0.12 * scale
  const lean     = (nodeRand(id, 1) - 0.5) * 0.06
  const leafG1   = '#1e5c1e'
  const leafG2   = nodeRand(id, 2) > 0.5 ? '#2a7030' : '#174d17'
  const leafG3   = '#3a8a2a'

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
  })

  return (
    <group>
      {/* Trunk — static, only base of tree */}
      <mesh position={[lean * trunkH * 0.5, trunkH * 0.5, 0]} castShadow rotation={[0, 0, lean]}>
        <cylinderGeometry args={[trunkTop, trunkBot, trunkH, 7]} />
        <meshStandardMaterial color="#5c3a1e" roughness={1} />
      </mesh>
      {/* Crown group — all foliage layers sway together as a unit */}
      <group ref={crownRef} position={[lean * trunkH, trunkH * 0.5, 0]}>
        {/* Lower foliage layer */}
        <mesh position={[0, trunkH * 0.12, 0]} castShadow>
          <coneGeometry args={[2.2 * scale, 2.8 * scale, 7]} />
          <meshStandardMaterial color={leafG1} roughness={0.9} />
        </mesh>
        {/* Mid foliage layer */}
        <mesh position={[0, trunkH * 0.32, 0]} castShadow>
          <coneGeometry args={[1.6 * scale, 2.2 * scale, 6]} />
          <meshStandardMaterial color={leafG2} roughness={0.9} />
        </mesh>
        {/* Top foliage layer */}
        <mesh position={[0, trunkH * 0.48, 0]} castShadow>
          <coneGeometry args={[1.0 * scale, 1.6 * scale, 6]} />
          <meshStandardMaterial color={leafG3} roughness={0.9} />
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
  return (
    <group position={[0, 0.3 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale * 0.7, scale]}>
      <mesh castShadow>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} />
      </mesh>
    </group>
  )
}

// ── Node health bar renderer ──────────────────────────────────────────────────
// Renders a 3D health bar above each node that has taken damage but not been
// gathered yet. Bar width scales from full (0 hits) to zero (maxHits).
// Uses instanced meshes — no per-node React re-renders.
function NodeHealthBars() {
  const trackRef = useRef<THREE.Group>(null)

  useFrame(({ camera }) => {
    const g = trackRef.current
    if (!g) return

    // Remove existing children and re-add only for damaged nodes
    while (g.children.length) g.remove(g.children[0])

    for (const [nodeId, hitsTaken] of NODE_HITS_TAKEN) {
      if (gatheredNodeIds.has(nodeId)) continue
      const node = RESOURCE_NODES.find(n => n.id === nodeId)
      if (!node) continue
      const maxHits = getNodeMaxHits(node.type)
      const pct = 1 - hitsTaken / maxHits  // 1 = full, 0 = gone

      // Position bar 3m above the node's surface position along the surface normal
      const surfNorm = new THREE.Vector3(node.x, node.y, node.z).normalize()
      const barPos = new THREE.Vector3(
        node.x + surfNorm.x * 4.5,
        node.y + surfNorm.y * 4.5,
        node.z + surfNorm.z * 4.5,
      )

      // Background track (dark)
      const trackGeo = new THREE.PlaneGeometry(1.2, 0.18)
      const trackMat = new THREE.MeshBasicMaterial({ color: '#222222', depthTest: false })
      const trackMesh = new THREE.Mesh(trackGeo, trackMat)
      trackMesh.position.copy(barPos)
      trackMesh.renderOrder = 999

      // Fill bar (green→red)
      const fillW  = 1.1 * pct
      const fillGeo = new THREE.PlaneGeometry(fillW, 0.14)
      const hue     = Math.round(pct * 120)  // 120=green, 60=yellow, 0=red
      const fillMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(`hsl(${hue}, 80%, 50%)`),
        depthTest: false,
      })
      const fillMesh = new THREE.Mesh(fillGeo, fillMat)
      // Offset fill to left-align: start at left edge of track
      fillMesh.position.set(
        barPos.x - (1.1 - fillW) * 0.5,
        barPos.y,
        barPos.z,
      )
      fillMesh.renderOrder = 1000

      // Billboard both to face camera
      const camDir = camera.position.clone().sub(barPos).normalize()
      const billQ  = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), camDir)
      trackMesh.quaternion.copy(billQ)
      fillMesh.quaternion.copy(billQ)

      g.add(trackMesh)
      g.add(fillMesh)
    }
  })

  return <group ref={trackRef} />
}

function ResourceNodes() {
  const groupRefs = useRef<(THREE.Group | null)[]>([])

  useFrame(() => {
    for (let i = 0; i < RESOURCE_NODES.length; i++) {
      const g = groupRefs.current[i]
      if (g) g.visible = !gatheredNodeIds.has(RESOURCE_NODES[i].id)
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

// ── Scene geometry ────────────────────────────────────────────────────────────

// TerrainMesh is replaced by <PlanetTerrain /> — see imports at top of file
