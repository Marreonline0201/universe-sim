import { Canvas } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { SimulationEngine } from '../engine/SimulationEngine'
import { rapierWorld } from '../physics/RapierWorld'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { CreatureRenderer } from './entities/CreatureRenderer'
import { RemotePlayersRenderer } from './RemotePlayersRenderer'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { world, createPlayerEntity, Metabolism, Health, Position } from '../ecs/world'
import { PlayerController } from '../player/PlayerController'
import { inventory } from '../game/GameSingletons'
import { MAT } from '../player/Inventory'
import { BUILDING_TYPES, setReactorCallbacks } from '../civilization/BuildingSystem'
import {
  resetColdDamageFlag,
} from '../game/SurvivalSystems'
import {
  executeRespawn,
} from '../game/DeathSystem'
import { DeathScreen as DeathScreenImport } from '../ui/DeathScreen'
import { SettlementRenderer } from './SettlementRenderer'
import { SettlementHUD } from '../ui/SettlementHUD'
import { RiverHUD } from '../ui/RiverHUD'
import { useSettlementStore } from '../store/settlementStore'
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
import {
  RESOURCE_NODES,
  rebuildResourceNodes,
} from '../world/ResourceNodeManager'

import { AnimalRenderer } from './AnimalRenderer'
import { ServerNpcsRenderer } from './entities/ServerNpcsRenderer'
import { LocalNpcsRenderer } from './entities/LocalNpcsRenderer'
import { PlayerMesh, EquippedItemMesh } from './entities/PlayerRenderer'
import { ResourceNodes, NodeHealthBars, DigHolesRenderer } from './entities/ResourceNodesRenderer'
import { BuildingGhost, PlacedBuildingsRenderer } from './entities/BuildingsRenderer'
import { DeathLootDropsRenderer, BedrollMeshRenderer, WeatherRendererWrapper, TransitOverlayWrapper, DestinationPlanetMeshWrapper, DestinationPlanetSelector } from './entities/MiscRenderers'
import {
  spawnInitialAnimals,
} from '../ecs/systems/AnimalAISystem'
import { spawnInitialCreatures } from '../ecs/systems/CreatureSpawner'
import { GameLoop } from '../game/GameLoop'

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
// DestinationPlanetMesh, VelarPlanetMesh, TransitOverlay moved to entities/MiscRenderers.tsx (M18 A7)
import { useTransitStore } from '../store/transitStore'
import { VelarDiplomacyPanel } from '../ui/VelarDiplomacyPanel'
import { ChemistryHUD } from '../ui/ChemistryHUD'

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

// spawnInitialCreatures extracted to ../ecs/systems/CreatureSpawner.ts (M18 A8)

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
    {/* M18 Track C: Chemistry event notifications (bottom-left) */}
    <ChemistryHUD />
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

// M18 Track A extractions: see src/rendering/entities/ for all extracted renderers.
