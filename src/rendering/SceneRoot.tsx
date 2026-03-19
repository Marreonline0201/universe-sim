import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Sky, Stars } from '@react-three/drei'
import { Suspense, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { SimulationEngine } from '../engine/SimulationEngine'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { CreatureRenderer } from './entities/CreatureRenderer'
import { world, createPlayerEntity, Metabolism, Health, Position, Rotation } from '../ecs/world'
import { PlayerController } from '../player/PlayerController'
import { MetabolismSystem, setMetabolismDt } from '../ecs/systems/MetabolismSystem'

export function SceneRoot() {
  const engineRef = useRef<SimulationEngine | null>(null)
  const controllerRef = useRef<PlayerController | null>(null)

  const setEngineReady = useGameStore(s => s.setEngineReady)
  const timeScale = useGameStore(s => s.timeScale)
  const paused = useGameStore(s => s.paused)

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
    <Canvas
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
      shadows
      onClick={() => controllerRef.current?.requestPointerLock()}
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
        <CreatureRenderer />
      </Suspense>
      {entityId !== null && (
        <>
          <GameLoop controllerRef={controllerRef} entityId={entityId} />
          <PlayerMesh entityId={entityId} />
        </>
      )}
    </Canvas>
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

  useFrame((_, delta) => {
    // Cap dt to avoid spiral-of-death on slow frames
    const dt = Math.min(delta, 0.1)

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
    setPosition(
      Position.x[entityId],
      Position.y[entityId],
      Position.z[entityId],
    )
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

// ── Scene geometry ────────────────────────────────────────────────────────────

function TerrainMesh() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[512, 512, 63, 63]} />
      <meshStandardMaterial color="#3a5c2a" wireframe={false} />
    </mesh>
  )
}
