/**
 * SceneRoot — Three.js canvas and simulation setup.
 * RPG systems removed. Core: terrain, organisms, animals, weather, spectator camera.
 */
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { SimulationEngine } from '../engine/SimulationEngine'
import { rapierWorld } from '../physics/RapierWorld'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { CreatureRenderer } from './entities/CreatureRenderer'
import { OrganismLabels } from './entities/OrganismLabels'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { world, createPlayerEntity, Metabolism, Health, Position } from '../ecs/world'
import { PlayerController } from '../player/PlayerController'
import { inventory } from '../game/GameSingletons'
import { MAT } from '../player/Inventory'
import { resetColdDamageFlag } from '../game/SurvivalSystems'
import { executeRespawn } from '../game/DeathSystem'
import { DeathScreen as DeathScreenImport } from '../ui/DeathScreen'
import { PlanetTerrain } from './PlanetTerrain'
import { getSpawnPosition, PLANET_RADIUS, setTerrainSeed } from '../world/SpherePlanet'
import { LocalSimManager } from '../engine/LocalSimManager'
import { FireRenderer } from './FireRenderer'
import { DayNightCycle } from './DayNightCycle'
import { SimGridVisualizer } from './SimGridVisualizer'
import { setSimManagerForSocket } from '../net/WorldSocket'
import { RiverRenderer } from './RiverRenderer'
import { rebuildRivers } from '../world/RiverSystem'
import { registerRiverCarveDepth } from '../world/SpherePlanet'
import { getRiverCarveDepth } from '../world/RiverSystem'
import { RESOURCE_NODES, rebuildResourceNodes } from '../world/ResourceNodeManager'
import { AnimalRenderer } from './AnimalRenderer'
import { PlayerMesh } from './entities/PlayerRenderer'
import { spawnInitialAnimals } from '../ecs/systems/AnimalAISystem'
import { spawnInitialCreatures } from '../ecs/systems/CreatureSpawner'
import { initializeSimulation } from '../biology/SimulationIntegration'
import { SpectatorCamera } from './SpectatorCamera'
import { GameLoop } from '../game/GameLoop'
import { CloudSystem } from './CloudSystem'
import { PostProcessing } from './PostProcessing'
import { AudioHook } from '../audio/AudioHook'
import { WeatherRenderer } from './WeatherRenderer'
import { usePlayerStore as _usePlayerStore } from '../store/playerStore'

function WeatherRendererWrapper() {
  const { x, y, z } = _usePlayerStore(s => ({ x: s.x, y: s.y, z: s.z }))
  return <WeatherRenderer playerX={x} playerY={y} playerZ={z} />
}

// M9: Register river valley carving with terrain height function.
registerRiverCarveDepth(getRiverCarveDepth)

// ── M69 Track B: FPS Counter ──────────────────────────────────────────────────
function FpsCounter() {
  const ref = useRef<HTMLDivElement>(null)
  const frames = useRef(0)
  const last = useRef(performance.now())
  useEffect(() => {
    let raf: number
    const tick = () => {
      frames.current++
      const now = performance.now()
      if (now - last.current >= 1000) {
        if (ref.current) ref.current.textContent = `${frames.current} FPS`
        frames.current = 0
        last.current = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div ref={ref} style={{
      position: 'fixed', top: 6, left: '50%', transform: 'translateX(-50%)',
      color: '#0f0', fontSize: 11, fontFamily: 'monospace', zIndex: 9999,
      background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 3,
      pointerEvents: 'none',
    }}>
      -- FPS
    </div>
  )
}

// ── DeathScreen wrapper (reads isDead from store) ─────────────────────────────
function DeathScreenWrapper({ onRespawn }: { onRespawn: () => void }) {
  const isDead = usePlayerStore(s => s.isDead)
  if (!isDead) return null
  return <DeathScreenImport onRespawn={onRespawn} />
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
  const [dayAngle, setDayAngle] = useState(Math.PI * 0.6)

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
  const shadowsEnabled = useGameStore(s => s.shadowsEnabled)
  const renderScale = useGameStore(s => s.renderScale)
  const showFps = useGameStore(s => s.showFps)

  const setEntityId = usePlayerStore(s => s.setEntityId)
  const entityId = usePlayerStore(s => s.entityId)
  const activePanel = useUiStore(s => s.activePanel)

  useEffect(() => {
    const check = () => setPointerLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', check)
    return () => document.removeEventListener('pointerlockchange', check)
  }, [])

  useEffect(() => {
    const onPointerLockError = () => {
      console.warn('[SceneRoot] pointerlockerror fired, bypassing')
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

  // Respawn handler
  const handleRespawn = useCallback(() => {
    if (entityId === null) return
    resetColdDamageFlag()
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
  }, [entityId])

  // Sync time scale
  useEffect(() => {
    engineRef.current?.clock.setTimeScale(timeScale)
  }, [timeScale])

  // Sync pause/resume
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (paused) engine.stop()
    else if (engine.clock.running === false) engine.clock.start()
  }, [paused])

  // Engine lifecycle
  useEffect(() => {
    if (!worldInitialized) return
    const engine = new SimulationEngine({ gridX: 64, gridY: 32, gridZ: 64, seed: serverWorldSeed })
    engineRef.current = engine

    engine.init().then(async () => {
      engine.start()
      engine.clock.setTimeScale(useGameStore.getState().timeScale)

      const [spawnX, spawnY, spawnZ] = getSpawnPosition()

      await rapierWorld.init(spawnX, spawnY, spawnZ)
      rapierWorld.addNodeColliders(RESOURCE_NODES)

      const eid = createPlayerEntity(world, spawnX, spawnY, spawnZ)

      const savedPs = usePlayerStore.getState()
      if (savedPs.health > 0 && savedPs.health < 1) Health.current[eid] = savedPs.health * Health.max[eid]
      if (savedPs.hunger > 0) Metabolism.hunger[eid] = savedPs.hunger
      if (savedPs.thirst > 0) Metabolism.thirst[eid] = savedPs.thirst
      if (savedPs.energy < 1) Metabolism.energy[eid] = savedPs.energy
      if (savedPs.fatigue > 0) Metabolism.fatigue[eid] = savedPs.fatigue

      const savedR = Math.sqrt(savedPs.x ** 2 + savedPs.y ** 2 + savedPs.z ** 2)
      const hasSavedPos = savedR > PLANET_RADIUS / 2
      if (hasSavedPos) {
        Position.x[eid] = savedPs.x
        Position.y[eid] = savedPs.y
        Position.z[eid] = savedPs.z
        rapierWorld.getPlayer()?.body.setNextKinematicTranslation({ x: savedPs.x, y: savedPs.y, z: savedPs.z })
      }

      setEntityId(eid)

      spawnInitialCreatures(spawnX, spawnY, spawnZ)
      spawnInitialAnimals(spawnX, spawnY, spawnZ)
      initializeSimulation(serverWorldSeed ?? 42)

      // Spawn offline NPCs for local testing
      {
        const up = new THREE.Vector3(spawnX, spawnY, spawnZ).normalize()
        const north = new THREE.Vector3(0, 0, 1)
        north.addScaledVector(up, -north.dot(up)).normalize()
        const east = new THREE.Vector3().crossVectors(up, north).normalize()
        const offlineNpcs = Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6) * Math.PI * 2
          const dist = 8 + (i % 3) * 4
          const ox = (north.x * Math.cos(angle) + east.x * Math.sin(angle)) * dist
          const oy = (north.y * Math.cos(angle) + east.y * Math.sin(angle)) * dist
          const oz = (north.z * Math.cos(angle) + east.z * Math.sin(angle)) * dist
          return { id: i, x: spawnX + ox, y: spawnY + oy, z: spawnZ + oz }
        })
        const { connectionStatus } = useMultiplayerStore.getState()
        if (connectionStatus !== 'connected') {
          useMultiplayerStore.getState().setRemoteNpcs(offlineNpcs)
        }
      }

      controllerRef.current = new PlayerController(eid)
      setEngineReady(true)

      const simMgr = new LocalSimManager(engine)
      simMgr.initFromSpawn(spawnX, spawnY, spawnZ)
      simMgr.placeAmbientFires(spawnX, spawnY, spawnZ)

      simManagerRef.current = simMgr
      setSimManager(simMgr)
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
            setTimeout(() => {
              if (!document.pointerLockElement) {
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
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>CLICK TO ENTER</div>
            <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.7 }}>
              <div><span style={{ color: '#fff', fontWeight: 600 }}>WASD</span> &nbsp;— Move</div>
              <div><span style={{ color: '#fff', fontWeight: 600 }}>Mouse</span> &nbsp;— Look around</div>
              <div style={{ marginTop: 6, color: '#aaa', fontStyle: 'italic' }}>Explore. Survive. Discover.</div>
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

      <Canvas
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ position: 'fixed', inset: 0, pointerEvents: activePanel ? 'none' : 'auto' }}
        shadows={shadowsEnabled}
        dpr={Math.max(0.25, Math.min(2.0, renderScale * window.devicePixelRatio))}
      >
        <PerspectiveCamera makeDefault fov={70} near={0.5} far={20000} position={[0, PLANET_RADIUS + 200, 0]} />
        <fogExp2 attach="fog" args={['#c0d8f4', 0.010]} />
        <DayNightCycle onDayAngleChange={setDayAngle} />
        <CloudSystem />
        <Suspense fallback={null}>
          {worldInitialized && (
            <>
              <PlanetTerrain key={"planet-" + serverWorldSeed} seed={serverWorldSeed} dayAngle={dayAngle} />
              <CreatureRenderer />
              <OrganismLabels />
              <FireRenderer simManager={simManager} />
              <SimGridVisualizer simManager={simManager} />
              <RiverRenderer key={"river-" + serverWorldSeed} seed={serverWorldSeed} />
              <AnimalRenderer />
              <WeatherRendererWrapper />
            </>
          )}
        </Suspense>
        {worldInitialized && entityId !== null && (
          <>
            <GameLoop
              controllerRef={controllerRef}
              simManagerRef={simManagerRef}
              entityId={entityId}
              gameActive={pointerLocked || bypassPointerLock || activePanel !== null}
            />
            <AudioHook />
            <PlayerMesh entityId={entityId} controllerRef={controllerRef} />
          </>
        )}
        <PostProcessing />
        <SpectatorCamera />
      </Canvas>

      {showFps && <FpsCounter />}
      <DeathScreenWrapper onRespawn={handleRespawn} />
    </>
  )
}
