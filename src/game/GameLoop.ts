/**
 * GameLoop — per-frame simulation update.
 *
 * RPG systems removed. Keeps:
 *   - Simulation time advance
 *   - Player movement
 *   - Rapier physics
 *   - Creature AI / wander
 *   - Animal AI
 *   - Metabolism tick
 *   - Emergent organism simulation tick
 *   - Offline auto-save
 */
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { RefObject } from 'react'

import { rapierWorld } from '../physics/RapierWorld'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useWeatherStore } from '../store/weatherStore'
import { inventory } from './GameSingletons'

import {
  world,
  Metabolism, Health, Position, Velocity, IsDead,
} from '../ecs/world'
import { MetabolismSystem, setMetabolismDt } from '../ecs/systems/MetabolismSystem'
import { creatureWander, tickCreatureWander } from '../ecs/systems/CreatureWanderSystem'
import {
  tickAnimalAI,
  pendingLoot,
  tickEcosystemBalance,
  tickRespawnQueue,
} from '../ecs/systems/AnimalAISystem'

import {
  resetColdDamageFlag,
  tickWoundSystem,
  tickSleepSystem,
} from './SurvivalSystems'
// checkAndTriggerDeath — inline in loop instead
import { surfaceRadiusAt, PLANET_RADIUS } from '../world/SpherePlanet'
import { getWorldSocket } from '../net/useWorldSocket'
// tickSimulation / isSimulationActive removed — server-authoritative (M_bio)
import { getSectorIdForPosition } from '../world/WeatherSectors'
import { saveOffline } from './OfflineSaveManager'
import { gameLoopScheduler } from './GameLoopScheduler'
import { registerPeriodicTasks } from './GameLoopPeriodicTasks'
import type { PlayerController } from '../player/PlayerController'
import type { LocalSimManager } from '../engine/LocalSimManager'

// Register periodic tasks once at module load
registerPeriodicTasks()

// ── Dig holes ─────────────────────────────────────────────────────────────────
export interface DigHole { x: number; y: number; z: number; r: number }
export const DIG_HOLES: DigHole[] = []
export const MAX_DIG_HOLES = 64
export const DIG_RADIUS = 1.4

// ── Storm movement multiplier ─────────────────────────────────────────────────
export let weatherSpeedMult = 1.0
export function setWeatherSpeedMult(v: number) { weatherSpeedMult = v }

export interface GameLoopProps {
  controllerRef: RefObject<PlayerController | null>
  simManagerRef: RefObject<LocalSimManager | null>
  entityId: number
  gameActive: boolean
}

export function GameLoop({ controllerRef, simManagerRef, entityId, gameActive }: GameLoopProps) {
  const { camera } = useThree()
  const updateVitals = usePlayerStore(s => s.updateVitals)
  const setPosition  = usePlayerStore(s => s.setPosition)
  const spectateTarget = useGameStore(s => s.spectateTarget)

  const offlineSaveTimerRef = useRef(0)
  const simTickAccRef = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)

    // If not game active (click-to-play), skip game logic
    if (!gameActive) return

    // Advance simulation time (gated behind gameActive so Sim Time
    // doesn't count before the player has entered the world)
    const { timeScale, addSimSeconds, paused } = useGameStore.getState()
    if (!paused) {
      addSimSeconds(dt * timeScale)
    }

    // Admin spectate overrides player camera
    if (spectateTarget) {
      camera.position.set(spectateTarget.x, spectateTarget.y + 20, spectateTarget.z + 15)
      camera.lookAt(spectateTarget.x, spectateTarget.y, spectateTarget.z)
      return
    }

    // Player movement
    controllerRef.current?.update(dt, camera)

    // Step Rapier physics
    rapierWorld.step(dt)

    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]

    // Creature wander AI
    tickCreatureWander(dt, entityId, px, py, pz)

    // Animal AI
    {
      tickAnimalAI({
        dt,
        playerX: px, playerY: py, playerZ: pz,
        playerMurderCount: 0,
        playerCrouching: false,
        onPlayerDamaged: (dmg) => {
          Health.current[entityId] = Math.max(0, Health.current[entityId] - dmg)
        },
        onAnimalKilled: () => {},
        onTamedProductDrop: (_animal, materialId, _label) => {
          inventory.addItem({ itemId: 0, materialId, quantity: 1, quality: 0.8 })
        },
      })
      while (pendingLoot.length > 0) {
        const drop = pendingLoot.shift()!
        inventory.addItem({ itemId: 0, materialId: drop.materialId, quantity: drop.quantity, quality: 0.8 })
      }
    }

    // Ecosystem balance + respawn
    tickEcosystemBalance(px, py, pz)
    tickRespawnQueue(dt)

    // Metabolism tick
    setMetabolismDt(dt)
    MetabolismSystem(world)

    // Wound + sleep system
    tickWoundSystem(dt, entityId)
    tickSleepSystem(dt, entityId)

    // Death check (minimal inline version)
    {
      const ps = usePlayerStore.getState()
      const currentHp = Health.current[entityId]
      if (!ps.isDead && currentHp <= 0) {
        usePlayerStore.getState().triggerDeath('combat', { x: px, y: py, z: pz })
      }
    }

    // Sync player position to store (throttled — only when moved)
    setPosition(px, py, pz)

    // Sync player vitals to store
    updateVitals({
      health:  Health.current[entityId] / Health.max[entityId],
      hunger:  Metabolism.hunger[entityId],
      thirst:  Metabolism.thirst[entityId],
      energy:  Metabolism.energy[entityId],
      fatigue: Metabolism.fatigue[entityId],
    })

    // Emergent organism simulation tick — REMOVED: server-authoritative (M_bio).
    // The server runs NaturalSelectionSystem at 6 Hz and broadcasts ORGANISM_UPDATE.
    // Clients sync via syncOrganismsFromServer() in WorldSocket.ts.
    // Keep simTickAccRef so the ref doesn't cause lint errors; tick is a no-op.
    const scaledDt = paused ? 0 : dt * timeScale
    simTickAccRef.current += scaledDt
    if (simTickAccRef.current >= 0.16) {
      simTickAccRef.current = 0
      // tickSimulation(useGameStore.getState().simSeconds)  // REMOVED: server-authoritative
    }

    // Scheduler-based periodic tasks
    const simSeconds = useGameStore.getState().simSeconds
    gameLoopScheduler.update(dt, simSeconds)

    // Auto-save every 60s
    offlineSaveTimerRef.current += dt
    if (offlineSaveTimerRef.current >= 60) {
      offlineSaveTimerRef.current = 0
      saveOffline()
    }

    // Send position update to server
    const socket = getWorldSocket()
    if (socket) {
      // Throttled by useWorldSocket's rAF loop
    }
  })

  return null
}
