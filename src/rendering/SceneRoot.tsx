import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Sky, Stars } from '@react-three/drei'
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
import { world, createPlayerEntity, Metabolism, Health, Position, Rotation } from '../ecs/world'
import { PlayerController } from '../player/PlayerController'
import { MetabolismSystem, setMetabolismDt } from '../ecs/systems/MetabolismSystem'
import { inventory, buildingSystem } from '../game/GameSingletons'
import { MAT, ITEM } from '../player/Inventory'
import { BUILDING_TYPES } from '../civilization/BuildingSystem'
import { PlanetTerrain } from './PlanetTerrain'
import { surfaceRadiusAt, terrainHeightAt, getSpawnPosition, PLANET_RADIUS } from '../world/SpherePlanet'

// ── Resource node definitions ─────────────────────────────────────────────────

interface ResourceNode {
  id: number
  type: string
  label: string
  matId: number
  color: string
  x: number
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
]

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// Resource nodes placed on the sphere surface near the spawn point (north pole)
function generateResourceNodes(): ResourceNode[] {
  const rand = seededRand(99991)
  const nodes: ResourceNode[] = []
  let id = 0
  const spawnDir = new THREE.Vector3(0, 1, 0)  // north pole spawn
  for (const nt of NODE_TYPES) {
    for (let i = 0; i < nt.count; i++) {
      // Random angle and arc distance from spawn point on sphere surface
      const angle   = rand() * Math.PI * 2
      const arcDist = (12 + rand() * 200) / PLANET_RADIUS  // radians offset from spawn
      // Rotate spawn direction by arcDist around a random horizontal axis
      const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize()
      const dir  = spawnDir.clone().applyAxisAngle(axis, arcDist)
      // Place on sphere surface
      const h = terrainHeightAt(dir)
      const r = PLANET_RADIUS + Math.max(h, 0)
      nodes.push({
        id: id++, type: nt.type, label: nt.label, matId: nt.matId, color: nt.color,
        x: dir.x * r, z: dir.z * r,
      })
    }
  }
  return nodes
}

// Module-level constants so they survive across renders
const RESOURCE_NODES: ResourceNode[] = generateResourceNodes()
const gatheredNodeIds = new Set<number>()
const NODE_RESPAWN_AT = new Map<number, number>()
const NODE_RESPAWN_DELAY = 60_000

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

export function SceneRoot() {
  const engineRef = useRef<SimulationEngine | null>(null)
  const controllerRef = useRef<PlayerController | null>(null)
  const [pointerLocked, setPointerLocked] = useState(false)

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

      // Spawn player at a land position on the sphere surface
      const [spawnX, spawnY, spawnZ] = getSpawnPosition()

      // Init Rapier physics BEFORE creating the player entity.
      // Builds planet trimesh collider + player capsule KCC.
      await rapierWorld.init(spawnX, spawnY, spawnZ)

      const eid = createPlayerEntity(world, spawnX, spawnY, spawnZ)
      setEntityId(eid)

      // Create keyboard/mouse controller for the player
      controllerRef.current = new PlayerController(eid)

      setEngineReady(true)
    })

    return () => {
      engine.dispose()
      controllerRef.current?.dispose()
      controllerRef.current = null
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
          <div style={{ fontSize: 11, color: '#aaa' }}>WASD — Move &nbsp;·&nbsp; Mouse — Look &nbsp;·&nbsp; Space — Jump &nbsp;·&nbsp; F — Interact</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>ESC — Settings &nbsp;·&nbsp; I — Inventory &nbsp;·&nbsp; C — Craft &nbsp;·&nbsp; B — Build &nbsp;·&nbsp; T/E/J/Tab/M — More</div>
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
      <PerspectiveCamera makeDefault fov={70} near={0.5} far={8000} position={[0, PLANET_RADIUS + 200, 0]} />
      <fog attach="fog" args={['#a8c8e8', 200, 3000]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#87ceeb', '#3a4a1a', 0.7]} />
      <directionalLight
        position={[2000, 3000, 1500]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={5000}
        shadow-camera-left={-500}
        shadow-camera-right={500}
        shadow-camera-top={500}
        shadow-camera-bottom={-500}
      />
      {/* Sun — a simple point in the sky far from the planet */}
      <Sky sunPosition={[2000, 3000, 1500]} turbidity={4} rayleigh={0.4} />
      <Stars radius={4000} depth={100} count={5000} factor={4} />
      <Suspense fallback={null}>
        <PlanetTerrain />
        <ResourceNodes />
        <PlacedBuildingsRenderer />
        <CreatureRenderer />
        <RemotePlayersRenderer />
        <ServerNpcsRenderer />
        <LocalNpcsRenderer />
      </Suspense>
      {entityId !== null && (
        <>
          <GameLoop controllerRef={controllerRef} entityId={entityId} />
          <PlayerMesh entityId={entityId} />
          <BuildingGhost entityId={entityId} />
        </>
      )}
    </Canvas>
    </>
  )
}

// ── Per-frame game loop (runs inside Canvas so useFrame works) ────────────────

interface GameLoopProps {
  controllerRef: RefObject<PlayerController | null>
  entityId: number
}

function GameLoop({ controllerRef, entityId }: GameLoopProps) {
  const { camera } = useThree()
  const updateVitals        = usePlayerStore(s => s.updateVitals)
  const setPosition         = usePlayerStore(s => s.setPosition)
  const addEvolutionPoints  = usePlayerStore(s => s.addEvolutionPoints)
  const spectateTarget      = useGameStore(s => s.spectateTarget)
  const placementMode       = useGameStore(s => s.placementMode)
  const setPlacementMode    = useGameStore(s => s.setPlacementMode)
  const bumpBuildVersion    = useGameStore(s => s.bumpBuildVersion)
  const epAccumRef          = useRef(0)
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

    // 4a. EP trickle — 1 EP per 30 real seconds of survival
    epAccumRef.current += dt
    if (epAccumRef.current >= 30) {
      epAccumRef.current -= 30
      addEvolutionPoints(1)
    }

    // 4b. Node respawn — check if any gathered nodes are ready to come back
    if (gatheredNodeIds.size > 0) {
      const now = Date.now()
      for (const id of gatheredNodeIds) {
        const at = NODE_RESPAWN_AT.get(id)
        if (at !== undefined && now >= at) {
          gatheredNodeIds.delete(id)
          NODE_RESPAWN_AT.delete(id)
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
      const nodeY = terrainYAt(node.x, node.z)
      const dx = px - node.x
      const dy = py - nodeY
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
          const canBuild = btype.materialsRequired.every(req => {
            const idx = inventory.findItem(req.materialId)
            if (idx === -1) return false
            const slot = inventory.getSlot(idx)
            return slot !== null && slot.quantity >= req.quantity
          })
          const addNotification = useUiStore.getState().addNotification
          if (canBuild) {
            // Consume materials
            for (const req of btype.materialsRequired) {
              let remaining = req.quantity
              for (let i = 0; i < 40 && remaining > 0; i++) {
                const slot = inventory.getSlot(i)
                if (slot && slot.materialId === req.materialId) {
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
      const oreMatIds: number[] = [MAT.COPPER_ORE, MAT.IRON_ORE, MAT.COAL, MAT.TIN_ORE, MAT.SULFUR]
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
        addNotification(`Gathered ${qty > 1 ? qty + '× ' : ''}${nearNode.label}`, 'info')
        // Award EP for discovery gathers (ores)
        if (isOre) {
          addEvolutionPoints(2)
        }
      }
    } else {
      if (gs.gatherPrompt !== null) gs.setGatherPrompt(null)
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
    const gx = ghostDir.x * ghostSR, gy = ghostDir.y * ghostSR, gz = ghostDir.z * ghostSR
    ghostRef.current.position.set(gx, gy + btype.size[1] / 2, gz)
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
        return (
          <group key={b.id} position={[bx, by + h / 2, bz]}>
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
  const lastPos  = useRef({ x: 0, z: 0 })
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

    // Detect movement speed
    const dx = px - lastPos.current.x
    const dz = pz - lastPos.current.z
    const speed = Math.sqrt(dx * dx + dz * dz) / delta
    lastPos.current = { x: px, z: pz }

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

    // Snap Y to terrain (server sends y=0.9 flat; client knows terrain)
    root.position.set(npc.x, terrainYAt(npc.x, npc.z) + 0.9, npc.z)

    // Detect lateral speed for walk cycle
    const dx = npc.x - prevXZ.current.x
    const dz = npc.z - prevXZ.current.z
    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(delta, 0.001)
    prevXZ.current = { x: npc.x, z: npc.z }

    const moving = speed > 0.3 && npc.state !== 'eat' && npc.state !== 'rest'
    if (moving) walkRef.current += delta * Math.min(speed, 8) * 1.8
    const swing = moving ? Math.sin(walkRef.current) * 0.5 : 0

    if (lLegRef.current) lLegRef.current.rotation.x =  swing
    if (rLegRef.current) rLegRef.current.rotation.x = -swing
    if (lArmRef.current) lArmRef.current.rotation.x = -swing * 0.55
    if (rArmRef.current) rArmRef.current.rotation.x =  swing * 0.55

    // Face direction of travel
    if (speed > 0.5 && (Math.abs(dx) + Math.abs(dz)) > 0) {
      root.rotation.y = Math.atan2(dx, dz)
    }
  })

  // Indicator dot above head shows state
  const dotColor =
    npc.state === 'eat'       ? '#ff6644' :
    npc.state === 'rest'      ? '#4488ff' :
    npc.state === 'socialize' ? '#ffcc00' :
    npc.state === 'gather'    ? '#44dd88' : null

  return (
    <group ref={groupRef} position={[npc.x, terrainYAt(npc.x, npc.z) + 0.9, npc.z]}>
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
    // Scatter NPCs within ~30m tangent-plane offset of spawn
    const angle = (i / LOCAL_NPC_COUNT) * Math.PI * 2
    const dist  = 5 + (i % 4) * 8
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
      // Compute forward direction in local tangent plane
      const north = new THREE.Vector3(0, 0, 1)
      north.addScaledVector(up, -north.dot(up)).normalize()
      const east = new THREE.Vector3().crossVectors(up, north).normalize()
      const fwdX = north.x * Math.cos(npc.yaw) + east.x * Math.sin(npc.yaw)
      const fwdY = north.y * Math.cos(npc.yaw) + east.y * Math.sin(npc.yaw)
      const fwdZ = north.z * Math.cos(npc.yaw) + east.z * Math.sin(npc.yaw)

      const spd = NPC_WANDER_SPEED * delta
      pos.x += fwdX * spd
      pos.y += fwdY * spd
      pos.z += fwdZ * spd

      // Clamp back to terrain surface
      const sr = surfaceRadiusAt(pos.x, pos.y, pos.z)
      pos.normalize().multiplyScalar(sr + 0.9)

      npc.walkPhase += delta * 3.5
    }

    // Position and orient root group
    root.position.copy(pos)

    // Align group Y-axis to surface normal, face movement direction
    const up2 = pos.clone().normalize()
    const north2 = new THREE.Vector3(0, 0, 1)
    north2.addScaledVector(up2, -north2.dot(up2)).normalize()
    const east2 = new THREE.Vector3().crossVectors(up2, north2).normalize()
    const fwd2 = north2.clone().multiplyScalar(Math.cos(npc.yaw)).addScaledVector(east2, Math.sin(npc.yaw))
    const mat = new THREE.Matrix4().set(
      east2.x, up2.x, -fwd2.x, 0,
      east2.y, up2.y, -fwd2.y, 0,
      east2.z, up2.z, -fwd2.z, 0,
      0,       0,     0,       1,
    )
    root.quaternion.setFromRotationMatrix(mat)

    // Walk cycle limbs
    const swing = npc.wandering ? Math.sin(npc.walkPhase) * 0.5 : 0
    if (lLegRef.current) lLegRef.current.rotation.x =  swing
    if (rLegRef.current) rLegRef.current.rotation.x = -swing
    if (lArmRef.current) lArmRef.current.rotation.x = -swing * 0.55
    if (rArmRef.current) rArmRef.current.rotation.x =  swing * 0.55
  })

  return (
    <group ref={groupRef}>
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
      {/* Left arm */}
      <group ref={lArmRef} position={[-0.31, 0.55, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.15, 0.36, 0.15]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rArmRef} position={[0.31, 0.55, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.15, 0.36, 0.15]} />
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
          <meshStandardMaterial color={skin} />
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
          <meshStandardMaterial color={skin} />
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

function TreeMesh({ id, groundY }: { id: number; groundY: number }) {
  const scale    = 0.8 + nodeRand(id, 0) * 0.7
  const trunkH   = 3.5 * scale
  const trunkBot = 0.28 * scale
  const trunkTop = 0.12 * scale
  const lean     = (nodeRand(id, 1) - 0.5) * 0.06
  const leafG1   = '#1e5c1e'
  const leafG2   = nodeRand(id, 2) > 0.5 ? '#2a7030' : '#174d17'
  const leafG3   = '#3a8a2a'

  return (
    <group position={[0, groundY, 0]}>
      {/* Trunk */}
      <mesh position={[lean * trunkH * 0.5, trunkH * 0.5, 0]} castShadow rotation={[0, 0, lean]}>
        <cylinderGeometry args={[trunkTop, trunkBot, trunkH, 7]} />
        <meshStandardMaterial color="#5c3a1e" roughness={1} />
      </mesh>
      {/* Lower foliage layer */}
      <mesh position={[lean * trunkH, trunkH * 0.62, 0]} castShadow>
        <coneGeometry args={[2.2 * scale, 2.8 * scale, 7]} />
        <meshStandardMaterial color={leafG1} roughness={0.9} />
      </mesh>
      {/* Mid foliage layer */}
      <mesh position={[lean * trunkH * 0.9, trunkH * 0.82, 0]} castShadow>
        <coneGeometry args={[1.6 * scale, 2.2 * scale, 6]} />
        <meshStandardMaterial color={leafG2} roughness={0.9} />
      </mesh>
      {/* Top foliage layer */}
      <mesh position={[lean * trunkH * 0.8, trunkH * 0.98, 0]} castShadow>
        <coneGeometry args={[1.0 * scale, 1.6 * scale, 6]} />
        <meshStandardMaterial color={leafG3} roughness={0.9} />
      </mesh>
    </group>
  )
}

function BarkMesh({ id, groundY }: { id: number; groundY: number }) {
  const scale = 0.7 + nodeRand(id, 6) * 0.5
  const rot   = nodeRand(id, 7) * Math.PI
  const tilt  = (nodeRand(id, 8) - 0.5) * 0.3
  return (
    <group position={[0, groundY + 0.06 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale, scale]}>
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

function RockMesh({ id, color, groundY }: { id: number; color: string; groundY: number }) {
  const scale = 0.5 + nodeRand(id, 3) * 0.6
  const rot   = nodeRand(id, 4) * Math.PI * 2
  const tilt  = (nodeRand(id, 5) - 0.5) * 0.4
  return (
    <group position={[0, groundY + 0.3 * scale, 0]} rotation={[tilt, rot, 0]} scale={[scale, scale * 0.7, scale]}>
      <mesh castShadow>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color={color} roughness={0.95} metalness={0.05} />
      </mesh>
    </group>
  )
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
        // Nodes are stored with full (x, y, z) sphere coordinates (x = node.x, z = node.z stored for compat)
        // For sphere placement, reconstruct y from sphere surface
        const nodeY = terrainYAt(node.x, node.z)
        return (
          <group
            key={node.id}
            ref={el => { groupRefs.current[i] = el }}
            position={[node.x, nodeY, node.z]}
          >
            {node.type === 'wood'
              ? <TreeMesh id={node.id} groundY={nodeY} />
              : node.type === 'bark'
                ? <BarkMesh id={node.id} groundY={nodeY} />
                : <RockMesh id={node.id} color={node.color} groundY={nodeY} />
            }
          </group>
        )
      })}
    </>
  )
}

// ── Scene geometry ────────────────────────────────────────────────────────────

// TerrainMesh is replaced by <PlanetTerrain /> — see imports at top of file
