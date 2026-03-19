import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Sky, Stars } from '@react-three/drei'
import { Suspense, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { SimulationEngine } from '../engine/SimulationEngine'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { CreatureRenderer } from './entities/CreatureRenderer'
import { RemotePlayersRenderer } from './RemotePlayersRenderer'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { world, createPlayerEntity, Metabolism, Health, Position, Rotation } from '../ecs/world'
import { PlayerController } from '../player/PlayerController'
import { MetabolismSystem, setMetabolismDt } from '../ecs/systems/MetabolismSystem'
import { inventory } from '../game/GameSingletons'
import { MAT } from '../player/Inventory'

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
  { type: 'stone', label: 'Stone',  matId: MAT.STONE, color: '#888888', count: 15 },
  { type: 'flint', label: 'Flint',  matId: MAT.FLINT, color: '#556677', count: 8  },
  { type: 'wood',  label: 'Wood',   matId: MAT.WOOD,  color: '#8B5E3C', count: 15 },
  { type: 'clay',  label: 'Clay',   matId: MAT.CLAY,  color: '#CC7744', count: 8  },
  { type: 'fiber', label: 'Fiber',  matId: MAT.FIBER, color: '#66BB44', count: 12 },
]

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function generateResourceNodes(): ResourceNode[] {
  const rand = seededRand(99991)
  const nodes: ResourceNode[] = []
  let id = 0
  for (const nt of NODE_TYPES) {
    for (let i = 0; i < nt.count; i++) {
      const angle = rand() * Math.PI * 2
      const dist  = 12 + rand() * 160
      nodes.push({ id: id++, type: nt.type, label: nt.label, matId: nt.matId, color: nt.color,
        x: Math.cos(angle) * dist, z: Math.sin(angle) * dist })
    }
  }
  return nodes
}

// Module-level constants so they survive across renders
const RESOURCE_NODES: ResourceNode[] = generateResourceNodes()
// Mutable set — mutated by game loop when player gathers a node
const gatheredNodeIds = new Set<number>()

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

    engine.init().then(() => {
      engine.start()

      // Spawn player at world centre — Y=0.9 so capsule bottom rests on ground
      const eid = createPlayerEntity(world, 0, 0.9, 0)
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
          <div style={{ fontSize: 11, color: '#aaa' }}>WASD — Move &nbsp;·&nbsp; Mouse — Look &nbsp;·&nbsp; Space — Jump</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>ESC — Settings &nbsp;·&nbsp; I/C/T/E/J/Tab/M — Panels</div>
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
      <PerspectiveCamera makeDefault fov={75} near={0.1} far={10000} position={[0, 10, 20]} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[100, 200, 100]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={1000}
        shadow-camera-left={-256}
        shadow-camera-right={256}
        shadow-camera-top={256}
        shadow-camera-bottom={-256}
      />
      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={500} depth={50} count={5000} factor={4} />
      <Suspense fallback={null}>
        <TerrainMesh />
        <ResourceNodes />
        <CreatureRenderer />
        <RemotePlayersRenderer />
        <ServerNpcsRenderer />
      </Suspense>
      {entityId !== null && (
        <>
          <GameLoop controllerRef={controllerRef} entityId={entityId} />
          <PlayerMesh entityId={entityId} />
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
  const updateVitals = usePlayerStore(s => s.updateVitals)
  const setPosition  = usePlayerStore(s => s.setPosition)
  const spectateTarget = useGameStore(s => s.spectateTarget)

  useFrame((_, delta) => {
    // Cap dt to avoid spiral-of-death on slow frames
    const dt = Math.min(delta, 0.1)

    // Admin spectate overrides player camera
    if (spectateTarget) {
      camera.position.set(spectateTarget.x, spectateTarget.y + 20, spectateTarget.z + 15)
      camera.lookAt(spectateTarget.x, spectateTarget.y, spectateTarget.z)
      return
    }

    // 1. Player movement + camera
    controllerRef.current?.update(dt, camera)

    // 2. Metabolism (hunger, thirst, fatigue, health regen)
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

    // 4. Sync player world position
    const px = Position.x[entityId]
    const pz = Position.z[entityId]
    setPosition(px, Position.y[entityId], pz)

    // 5. Resource proximity + gather
    const gs = useGameStore.getState()
    let nearNode: ResourceNode | null = null
    let nearDist = Infinity
    for (const node of RESOURCE_NODES) {
      if (gatheredNodeIds.has(node.id)) continue
      const dx = px - node.x
      const dz = pz - node.z
      const d2 = dx * dx + dz * dz
      if (d2 < nearDist) { nearDist = d2; nearNode = node }
    }

    if (nearNode && nearDist < 9) { // within 3m
      const label = `[F] Gather ${nearNode.label}`
      if (gs.gatherPrompt !== label) gs.setGatherPrompt(label)

      if (controllerRef.current?.popInteract()) {
        gatheredNodeIds.add(nearNode.id)
        gs.setGatherPrompt(null)
        inventory.addItem({ itemId: nearNode.matId, materialId: nearNode.matId, quantity: 1, quality: 0.8 })
        // Unlock stone tool recipe on first stone or flint gather
        if (nearNode.matId === MAT.STONE || nearNode.matId === MAT.FLINT) {
          inventory.discoverRecipe(1)
        }
        const addNotification = useUiStore.getState().addNotification
        addNotification(`Gathered ${nearNode.label}`, 'info')
      }
    } else {
      if (gs.gatherPrompt !== null) gs.setGatherPrompt(null)
    }
  })

  return null
}

// ── Player mesh (visible body in third-person) ────────────────────────────────

function PlayerMesh({ entityId }: { entityId: number }) {
  const meshRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!meshRef.current) return
    meshRef.current.position.set(
      Position.x[entityId],
      Position.y[entityId],
      Position.z[entityId],
    )
    // Face the direction the player is moving (from rotation quaternion)
    meshRef.current.quaternion.set(
      Rotation.x[entityId],
      Rotation.y[entityId],
      Rotation.z[entityId],
      Rotation.w[entityId] || 1,
    )
  })

  return (
    <group ref={meshRef}>
      {/* Body */}
      <mesh position={[0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.35, 1.1, 8, 16]} />
        <meshStandardMaterial color="#4a9eff" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color="#f5c5a3" />
      </mesh>
      {/* Eyes (direction indicator) */}
      <mesh position={[0.12, 1.05, -0.22]} castShadow>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[-0.12, 1.05, -0.22]} castShadow>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  )
}

// ── Server NPC renderer ───────────────────────────────────────────────────────

function ServerNpcsRenderer() {
  const remoteNpcs = useMultiplayerStore(s => s.remoteNpcs)
  return (
    <>
      {remoteNpcs.map(npc => (
        <mesh key={npc.id} position={[npc.x, npc.y + 0.5, npc.z]} castShadow>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshStandardMaterial color="#e67e22" />
        </mesh>
      ))}
    </>
  )
}

// ── Resource nodes ────────────────────────────────────────────────────────────

function ResourceNodes() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])

  useFrame(() => {
    for (let i = 0; i < RESOURCE_NODES.length; i++) {
      const m = meshRefs.current[i]
      if (m) m.visible = !gatheredNodeIds.has(RESOURCE_NODES[i].id)
    }
  })

  return (
    <>
      {RESOURCE_NODES.map((node, i) => {
        const isTree = node.type === 'wood'
        return (
          <group key={node.id} position={[node.x, 0, node.z]}>
            <mesh
              ref={el => { meshRefs.current[i] = el }}
              position={[0, isTree ? 1.5 : 0.4, 0]}
              castShadow
            >
              {isTree
                ? <cylinderGeometry args={[0.2, 0.3, 3, 8]} />
                : <boxGeometry args={[0.6, 0.5, 0.6]} />}
              <meshStandardMaterial color={isTree ? '#6B4226' : node.color} />
            </mesh>
            {isTree && (
              <mesh position={[0, 3.5, 0]} castShadow>
                <sphereGeometry args={[1.2, 8, 8]} />
                <meshStandardMaterial color="#2D6A2D" />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

// ── Scene geometry ────────────────────────────────────────────────────────────

function TerrainMesh() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[512, 512, 63, 63]} />
      <meshStandardMaterial color="#3a5c2a" wireframe={false} />
    </mesh>
  )
}
