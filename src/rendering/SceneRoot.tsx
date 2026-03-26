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
import { inventory, buildingSystem, journal } from '../game/GameSingletons'
import { MAT } from '../player/Inventory'
import { BUILDING_TYPES, setReactorCallbacks } from '../civilization/BuildingSystem'
import {
  resetColdDamageFlag,
} from '../game/SurvivalSystems'
import {
  executeRespawn,
  DEATH_LOOT_DROPS,
  gatheredLootIds,
  placedBedrollAnchor,
} from '../game/DeathSystem'
import { DeathScreen as DeathScreenImport } from '../ui/DeathScreen'
import { SettlementRenderer } from './SettlementRenderer'
import { SettlementHUD } from '../ui/SettlementHUD'
import { RiverHUD } from '../ui/RiverHUD'
import { useSettlementStore } from '../store/settlementStore'
import { PlanetTerrain } from './PlanetTerrain'
import { surfaceRadiusAt, terrainHeightAt, getSpawnPosition, PLANET_RADIUS, SEA_LEVEL, setTerrainSeed, getSurfaceDigMaterials } from '../world/SpherePlanet'
import { LocalSimManager } from '../engine/LocalSimManager'
import { FireRenderer } from './FireRenderer'
import { DayNightCycle } from './DayNightCycle'
import { SimGridVisualizer } from './SimGridVisualizer'
import { getWorldSocket } from '../net/useWorldSocket'
import { setSimManagerForSocket } from '../net/WorldSocket'
import { WeatherRenderer } from './WeatherRenderer'
import { RiverRenderer } from './RiverRenderer'
import { rebuildRivers } from '../world/RiverSystem'
import { registerRiverCarveDepth } from '../world/SpherePlanet'
import { getRiverCarveDepth } from '../world/RiverSystem'
import {
  type ResourceNode,
  RESOURCE_NODES,
  RESOURCE_NODE_QUATS,
  gatheredNodeIds,
  NODE_RESPAWN_AT,
  NODE_RESPAWN_DELAY,
  NODE_HITS_TAKEN,
  getNodeMaxHits,
  rebuildResourceNodes,
  seededRand,
} from '../world/ResourceNodeManager'

import { AnimalRenderer } from './AnimalRenderer'
import {
  spawnInitialAnimals,
} from '../ecs/systems/AnimalAISystem'
import { creatureWander } from '../ecs/systems/CreatureWanderSystem'
import { GameLoop, type GameLoopProps, DIG_HOLES, type DigHole, MAX_DIG_HOLES, DIG_RADIUS } from '../game/GameLoop'

// M10 Track A: Seasonal terrain pass
import { SeasonalTerrainPass } from './SeasonalTerrainPass'
// Post-processing: raw Three.js composer (bloom + vignette)
import { PostProcessing } from './PostProcessing'

// M10 Track B: Sailing + fishing
import { SailingRenderer } from './SailingRenderer'

// M10 Track C: Shop UI
import { ShopHUD } from '../ui/ShopHUD'

// M11 Track A: Gunpowder + Musket
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
import { VelarDiplomacyPanel } from '../ui/VelarDiplomacyPanel'

// M12 Track A: Rocketry
import { RocketVFXRenderer } from './RocketVFXRenderer'

// M12 Track B: Radio + Electric lights
import { RadioTowerVFXRenderer } from './RadioTowerVFXRenderer'
import { ElectricLightPass, registerElectricSettlements } from './ElectricLightPass'

// M12 Track C: civLevel 6 gate handled in SettlementManager (server) + WorldSocket

// M13 Track C: Nuclear reactor callbacks
import { activateReactor, deactivateReactor } from '../game/NuclearReactorSystem'
// Wire reactor callbacks into BuildingSystem to break the circular dep:
// BuildingSystem ← NuclearReactorSystem ← GameSingletons ← BuildingSystem
// Wrapper converts object pos to tuple for activateReactor signature
setReactorCallbacks(
  (pos: { x: number; y: number; z: number }) => activateReactor([pos.x, pos.y, pos.z]),
  deactivateReactor
)

// M14: Interplanetary travel + Velar gateway + Multiverse
import { VelarGatewayRenderer } from './VelarGatewayRenderer'
import { VelarResponsePanel } from '../ui/VelarResponsePanel'
import { useVelarStore } from '../store/velarStore'
import { useUniverseSync } from '../store/universeStore'
import { ContextualHints } from '../ui/ContextualHints'

// M9: Register river valley carving with the terrain height function.
// Must happen before any geometry is generated (before generatePlanetGeometry is called).
// registerRiverCarveDepth wires getRiverCarveDepth into terrainHeightAt so the
// terrain mesh has carved valleys wherever rivers flow.
registerRiverCarveDepth(getRiverCarveDepth)

// creatureWander imported from ../ecs/systems/CreatureWanderSystem

// DIG_HOLES, DigHole, MAX_DIG_HOLES, DIG_RADIUS imported from ../game/GameLoop

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
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>CLICK TO PLAY</div>
          <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.7 }}>
            <div><span style={{ color: '#fff', fontWeight: 600 }}>WASD</span> &nbsp;— Move</div>
            <div><span style={{ color: '#fff', fontWeight: 600 }}>Mouse</span> &nbsp;— Look</div>
            <div><span style={{ color: '#fff', fontWeight: 600 }}>Space</span> &nbsp;— Jump</div>
            <div><span style={{ color: '#fff', fontWeight: 600 }}>F</span> &nbsp;— Gather</div>
            <div><span style={{ color: '#fff', fontWeight: 600 }}>E</span> &nbsp;— Open Inventory</div>
          </div>
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
      {/* Post-processing — bloom on bright emitters + vignette framing */}
      <PostProcessing />
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
    {/* Interaction: contextual keybind hints — bottom-center, above hotbar */}
    {(pointerLocked || bypassPointerLock) && <ContextualHints />}
    </>
  )
}

// ── DeathScreenWrapper ────────────────────────────────────────────────────────
// Conditionally renders DeathScreen. Imported statically; hidden until isDead.
function DeathScreenWrapper({ onRespawn }: { onRespawn: () => void }) {
  return <DeathScreenImport onRespawn={onRespawn} />
}

// ── Per-frame game loop — imported from ../game/GameLoop ─────────────────────
// GameLoop, GameLoopProps, DIG_HOLES, DigHole, MAX_DIG_HOLES, DIG_RADIUS are
// imported at the top of this file.




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
  const scale = 0.8 + nodeRand(id, 3) * 1.0
  const rot   = nodeRand(id, 4) * Math.PI * 2
  const tilt  = (nodeRand(id, 5) - 0.5) * 0.4
  // Specular face variation: upward faces shinier (rain-polished), sides rougher.
  // useMemo [] — rock color is stable for its lifetime.
  const mat = useMemo(() => makeRockMaterial(color), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group position={[0, 0.4 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale * 0.7, scale]}>
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
