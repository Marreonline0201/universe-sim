import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Sky, Stars } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { SimulationEngine } from '../engine/SimulationEngine'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { CreatureRenderer } from './entities/CreatureRenderer'
import { RemotePlayersRenderer } from './RemotePlayersRenderer'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { world, createPlayerEntity, Metabolism, Health, Position, Rotation, Velocity } from '../ecs/world'
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

// ── Terrain noise ─────────────────────────────────────────────────────────────

function _hash(ix: number, iz: number): number {
  let h = ((ix * 374761393) ^ (iz * 668265263)) >>> 0
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff
}

function _smoothNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return (
    _hash(ix,   iz)   * (1-ux) * (1-uz) +
    _hash(ix+1, iz)   *   ux   * (1-uz) +
    _hash(ix,   iz+1) * (1-ux) *   uz   +
    _hash(ix+1, iz+1) *   ux   *   uz
  ) * 2 - 1
}

export function terrainHeight(x: number, z: number): number {
  let h = 0
  h += _smoothNoise(x * 0.012, z * 0.012) * 12  // large hills
  h += _smoothNoise(x * 0.035, z * 0.035) * 5   // mid bumps
  h += _smoothNoise(x * 0.09,  z * 0.09)  * 1.5 // small detail
  // Fade to flat within 30 units of spawn
  const d = Math.sqrt(x * x + z * z)
  const fade = Math.min(1, Math.max(0, (d - 20) / 30))
  return h * fade
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
      <PerspectiveCamera makeDefault fov={70} near={0.1} far={2000} position={[0, 10, 20]} />
      <fog attach="fog" args={['#b0c8e8', 80, 600]} />
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#87ceeb', '#3a6b2a', 0.6]} />
      <directionalLight
        position={[150, 250, 100]}
        intensity={2.0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={800}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />
      <Sky sunPosition={[150, 40, 100]} turbidity={6} rayleigh={0.5} />
      <Stars radius={400} depth={50} count={3000} factor={3} />
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

    // 4. Sync player world position + clamp to terrain
    const px = Position.x[entityId]
    const pz = Position.z[entityId]
    const floorY = terrainHeight(px, pz) + 0.9
    if (Position.y[entityId] < floorY) {
      Position.y[entityId] = floorY
      if (Velocity.y[entityId] < 0) Velocity.y[entityId] = 0
    }
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

      if (!gs.inputBlocked && controllerRef.current?.popInteract()) {
        gatheredNodeIds.add(nearNode.id)
        gs.setGatherPrompt(null)
        inventory.addItem({ itemId: 0, materialId: nearNode.matId, quantity: 1, quality: 0.8 })
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

function HumanoidFigure({ skinColor, shirtColor, pantsColor }: { skinColor: string; shirtColor: string; pantsColor: string }) {
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
      {/* Left upper arm */}
      <mesh position={[-0.30, 0.60, 0]} castShadow>
        <boxGeometry args={[0.14, 0.36, 0.14]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>
      {/* Left forearm */}
      <mesh position={[-0.30, 0.26, 0]} castShadow>
        <boxGeometry args={[0.12, 0.30, 0.12]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Right upper arm */}
      <mesh position={[0.30, 0.60, 0]} castShadow>
        <boxGeometry args={[0.14, 0.36, 0.14]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>
      {/* Right forearm */}
      <mesh position={[0.30, 0.26, 0]} castShadow>
        <boxGeometry args={[0.12, 0.30, 0.12]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Left thigh */}
      <mesh position={[-0.13, -0.10, 0]} castShadow>
        <boxGeometry args={[0.16, 0.36, 0.16]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>
      {/* Right thigh */}
      <mesh position={[0.13, -0.10, 0]} castShadow>
        <boxGeometry args={[0.16, 0.36, 0.16]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>
      {/* Left shin */}
      <mesh position={[-0.13, -0.44, 0]} castShadow>
        <boxGeometry args={[0.14, 0.32, 0.14]} />
        <meshStandardMaterial color="#4a3a2a" />
      </mesh>
      {/* Right shin */}
      <mesh position={[0.13, -0.44, 0]} castShadow>
        <boxGeometry args={[0.14, 0.32, 0.14]} />
        <meshStandardMaterial color="#4a3a2a" />
      </mesh>
      {/* Left foot */}
      <mesh position={[-0.13, -0.63, -0.04]} castShadow>
        <boxGeometry args={[0.14, 0.08, 0.22]} />
        <meshStandardMaterial color="#2a2010" />
      </mesh>
      {/* Right foot */}
      <mesh position={[0.13, -0.63, -0.04]} castShadow>
        <boxGeometry args={[0.14, 0.08, 0.22]} />
        <meshStandardMaterial color="#2a2010" />
      </mesh>
    </>
  )
}

function PlayerMesh({ entityId }: { entityId: number }) {
  const meshRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!meshRef.current) return
    meshRef.current.position.set(
      Position.x[entityId],
      Position.y[entityId],
      Position.z[entityId],
    )
    meshRef.current.quaternion.set(
      Rotation.x[entityId],
      Rotation.y[entityId],
      Rotation.z[entityId],
      Rotation.w[entityId] || 1,
    )
  })

  return (
    <group ref={meshRef}>
      <HumanoidFigure skinColor="#f5c5a3" shirtColor="#3a7ecf" pantsColor="#2a4a7a" />
    </group>
  )
}

// ── Server NPC renderer ───────────────────────────────────────────────────────

const NPC_SKIN_TONES = ['#c8926e', '#d4a574', '#8b5e3c', '#f0d4b0', '#a0724a']
const NPC_SHIRT_COLS = ['#8b4513', '#556b2f', '#8b0000', '#4682b4', '#a0522d']
const NPC_PANTS_COLS = ['#3b2f2f', '#2f4f2f', '#1a1a3a', '#4a3a20', '#2a2a2a']

function ServerNpcsRenderer() {
  const remoteNpcs = useMultiplayerStore(s => s.remoteNpcs)
  return (
    <>
      {remoteNpcs.map((npc, idx) => {
        const si = idx % NPC_SKIN_TONES.length
        return (
          <group key={npc.id} position={[npc.x, npc.y, npc.z]}>
            <HumanoidFigure
              skinColor={NPC_SKIN_TONES[si]}
              shirtColor={NPC_SHIRT_COLS[si]}
              pantsColor={NPC_PANTS_COLS[si]}
            />
          </group>
        )
      })}
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

  const nodeGroundY = useMemo(
    () => RESOURCE_NODES.map(n => terrainHeight(n.x, n.z)),
    []
  )

  useFrame(() => {
    for (let i = 0; i < RESOURCE_NODES.length; i++) {
      const g = groupRefs.current[i]
      if (g) g.visible = !gatheredNodeIds.has(RESOURCE_NODES[i].id)
    }
  })

  return (
    <>
      {RESOURCE_NODES.map((node, i) => {
        const groundY = nodeGroundY[i]
        return (
          <group
            key={node.id}
            ref={el => { groupRefs.current[i] = el }}
            position={[node.x, 0, node.z]}
          >
            {node.type === 'wood'
              ? <TreeMesh id={node.id} groundY={groundY} />
              : <RockMesh id={node.id} color={node.color} groundY={groundY} />
            }
          </group>
        )
      })}
    </>
  )
}

// ── Scene geometry ────────────────────────────────────────────────────────────

function TerrainMesh() {
  const geometry = useMemo(() => {
    const SEG = 127
    const SIZE = 512
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const count = pos.count
    const colors = new Float32Array(count * 3)
    const col = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const wx = pos.getX(i)
      const wz = pos.getZ(i)
      const h = terrainHeight(wx, wz)
      pos.setY(i, h)

      // Vertex color by height
      if (h < 0.3)       col.setStyle('#4a7a35')  // low grass
      else if (h < 2.0)  col.setStyle('#5a8a3a')  // mid grass
      else if (h < 5.0)  col.setStyle('#7a9a50')  // upper grass
      else if (h < 8.0)  col.setStyle('#9a8060')  // rocky dirt
      else               col.setStyle('#b8a090')  // high rock
      colors[i * 3]     = col.r
      colors[i * 3 + 1] = col.g
      colors[i * 3 + 2] = col.b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  )
}
