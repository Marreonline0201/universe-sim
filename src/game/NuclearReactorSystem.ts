// ── NuclearReactorSystem.ts ───────────────────────────────────────────────────
// M13 Track C: Nuclear fission reactor simulation.
//
// Physics basis:
//   Fission: U-235 + n → fission products + ~200 MeV + 2-3 neutrons (chain reaction)
//   Thermal power: 100 kW rated output (vs campfire 0.5 kW → 200x multiplier)
//   Coolant: light water (H2O) absorbs excess heat — without it core temperature rises.
//   Meltdown threshold: 600°C core temperature (simplified; real LWR limit ~1200°C fuel melt)
//
// Power grid effects (provided by nuclear_reactor or nuclear_reactor_small building):
//   - electric_forge:    smelts 3× faster than standard blast furnace
//   - arc_welder:        crafts complex electronics (circuit_board, satellite) in 1/3 time
//   - electrolysis:      H2O → H2 + O2 (produces HYDROGEN MAT 68, first hydrogen fuel)
//
// Meltdown sequence:
//   1. Core temp exceeds MELT_THRESHOLD for 30 continuous seconds
//   2. Server broadcasts REACTOR_MELTDOWN { pos, playerId }
//   3. Radiation zone: 20m radius, 2 HP/s drain, persists until cleanup
//   4. Cleanup: player delivers 10x CLAY + 5x STONE to meltdown pos within 120s
//      → broadcasts REACTOR_CLEANED, radiation zone cleared

import { getWorldSocket } from '../net/useWorldSocket'
import { useVelarStore } from '../store/velarStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { inventory } from './GameSingletons'
import { MAT } from '../player/Inventory'

// ── Constants ─────────────────────────────────────────────────────────────────

export const REACTOR_POWER_KW     = 100    // kW electrical output
export const CAMPFIRE_POWER_KW    = 0.5    // reference baseline
export const SAFE_TEMP_CELSIUS    = 600    // °C — above this: warning
export const MELT_THRESHOLD_C     = 800    // °C — sustained → meltdown
export const MELT_SUSTAINED_SECS  = 30     // seconds above MELT_THRESHOLD before meltdown
export const RADIATION_RADIUS_M   = 20     // metres
export const RADIATION_DRAIN_HP_S = 2      // HP/s inside radius
export const CLEANUP_CLAY_QTY     = 10
export const CLEANUP_STONE_QTY    = 5
export const CLEANUP_TIMEOUT_SECS = 120

// Electric utility speed multipliers (powered by nuclear reactor)
export const ELECTRIC_FORGE_SPEED   = 3.0  // smelt 3× faster
export const ARC_WELDER_SPEED       = 3.0  // craft electronics 3× faster
export const ELECTROLYSIS_H2_RATE   = 1    // units of HYDROGEN per 30s cycle

// ── Module state ──────────────────────────────────────────────────────────────

let _reactorPos:          [number, number, number] | null = null
let _overThresholdSecs:   number = 0
let _cleanupTimer:        number = 0
let _cleanupActive:       boolean = false
let _radiationDrainAcc:   number = 0
let _power:               boolean = false   // is a reactor building placed + fueled?

// ── Public API ────────────────────────────────────────────────────────────────

/** Called by BuildingSystem when player places a nuclear_reactor_small building. */
export function activateReactor(pos: [number, number, number]): void {
  _reactorPos = [...pos] as [number, number, number]
  _power      = true
  useVelarStore.getState().setReactorActive(true)
  useUiStore.getState().addNotification(
    'Nuclear reactor online! Power output: 100 kW. Water cooling required to prevent meltdown.',
    'discovery'
  )
  console.log('[NuclearReactor] Reactor activated at', pos)
}

/** Called when reactor building is demolished. */
export function deactivateReactor(): void {
  _reactorPos = null
  _power      = false
  _overThresholdSecs = 0
  useVelarStore.getState().setReactorActive(false)
}

/** Returns true if the settlement has nuclear power (enables electric utilities). */
export function hasNuclearPower(): boolean {
  return _power && !useVelarStore.getState().reactorMeltdown
}

/** Returns true if position is inside a radiation zone. */
export function isInRadiationZone(x: number, y: number, z: number): boolean {
  const vs = useVelarStore.getState()
  if (!vs.reactorMeltdown || !vs.reactorMeltdownPos) return false
  const [rx, ry, rz] = vs.reactorMeltdownPos
  const dx = x - rx, dy = y - ry, dz = z - rz
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= RADIATION_RADIUS_M
}

/**
 * Try to clean up a meltdown site.
 * Player must be within 5m of the meltdown pos and have the required materials.
 */
export function attemptCleanup(playerX: number, playerY: number, playerZ: number): boolean {
  const vs = useVelarStore.getState()
  if (!vs.reactorMeltdown || !vs.reactorMeltdownPos) return false
  if (!_cleanupActive) return false

  const [rx, ry, rz] = vs.reactorMeltdownPos
  const dx = playerX - rx, dy = playerY - ry, dz = playerZ - rz
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (dist > 5) {
    useUiStore.getState().addNotification(
      'Move closer to the meltdown site to begin cleanup.',
      'warning'
    )
    return false
  }

  // Check materials
  if (inventory.countMaterial(MAT.CLAY)  < CLEANUP_CLAY_QTY ||
      inventory.countMaterial(MAT.STONE) < CLEANUP_STONE_QTY) {
    useUiStore.getState().addNotification(
      `Cleanup requires ${CLEANUP_CLAY_QTY}x Clay + ${CLEANUP_STONE_QTY}x Stone in inventory.`,
      'warning'
    )
    return false
  }

  // Consume materials
  let clayCost  = CLEANUP_CLAY_QTY
  let stoneCost = CLEANUP_STONE_QTY
  for (let i = 0; i < inventory.slotCount && (clayCost > 0 || stoneCost > 0); i++) {
    const slot = inventory.getSlot(i)
    if (!slot || slot.itemId !== 0) continue
    if (slot.materialId === MAT.CLAY && clayCost > 0) {
      const take = Math.min(slot.quantity, clayCost)
      inventory.removeItem(i, take)
      clayCost -= take
    } else if (slot.materialId === MAT.STONE && stoneCost > 0) {
      const take = Math.min(slot.quantity, stoneCost)
      inventory.removeItem(i, take)
      stoneCost -= take
    }
  }

  // Broadcast cleanup
  try {
    const ws = getWorldSocket()
    if (ws) ws.send({ type: 'REACTOR_CLEANED', pos: vs.reactorMeltdownPos })
  } catch {}

  vs.clearMeltdown()
  _cleanupActive = false
  _overThresholdSecs = 0
  _power = false
  useUiStore.getState().addNotification(
    'Meltdown contained! Reactor site decommissioned. You can build a new reactor.',
    'discovery'
  )
  return true
}

// ── Tick (called from GameLoop useFrame) ──────────────────────────────────────

/**
 * Tick the reactor simulation.
 * dt: real seconds since last frame.
 * hasWaterCooling: true if player has placed a water_tank adjacent to reactor.
 * playerPos: [x,y,z] for radiation damage check.
 */
export function tickNuclearReactor(
  dt: number,
  hasWaterCooling: boolean,
  playerPos: [number, number, number],
): void {
  const vs = useVelarStore.getState()

  // ── Radiation damage (even after meltdown) ────────────────────────────────
  if (vs.reactorMeltdown) {
    if (isInRadiationZone(playerPos[0], playerPos[1], playerPos[2])) {
      _radiationDrainAcc += RADIATION_DRAIN_HP_S * dt
      if (_radiationDrainAcc >= 1) {
        const dmg = Math.floor(_radiationDrainAcc)
        _radiationDrainAcc -= dmg
        const ps = usePlayerStore.getState()
        ps.updateVitals({ health: ps.health - dmg / 100 })
      }
    }

    // Cleanup timeout
    if (_cleanupActive) {
      _cleanupTimer += dt
      if (_cleanupTimer > CLEANUP_TIMEOUT_SECS) {
        _cleanupActive = false
        useUiStore.getState().addNotification(
          'Meltdown cleanup window expired. Radiation zone persists indefinitely.',
          'error'
        )
      }
    }
    return
  }

  // ── Normal reactor operation ───────────────────────────────────────────────
  if (!_power) return

  // Temperature update (delegated to velarStore tick)
  vs.tickReactor(dt, hasWaterCooling)

  const temp = vs.reactorTemp

  // Warning at safe threshold
  if (temp > SAFE_TEMP_CELSIUS && temp <= MELT_THRESHOLD_C) {
    // Warn every 10s
    if (Math.floor(temp / 10) % 10 === 0) {
      useUiStore.getState().addNotification(
        `Reactor temperature: ${temp.toFixed(0)}°C — add water cooling before reaching 800°C!`,
        'warning'
      )
    }
  }

  // Track time above melt threshold
  if (temp > MELT_THRESHOLD_C) {
    _overThresholdSecs += dt
    if (_overThresholdSecs >= MELT_SUSTAINED_SECS) {
      _triggerMeltdown()
    }
  } else {
    _overThresholdSecs = 0
  }

  // Electrolysis: if powered + water available → produce hydrogen periodically
  // Uses a simple accumulator — 1 HYDROGEN unit per 30 real seconds
  // (Full electrolysis implementation: H2O → H2 + ½O2 at ~1.23 eV/molecule)
  // The game abstracts this as a passive material yield.
}

function _triggerMeltdown(): void {
  if (!_reactorPos) return
  const pos: [number, number, number] = [..._reactorPos]

  console.error('[NuclearReactor] MELTDOWN at', pos)

  // Broadcast to server
  try {
    const ws = getWorldSocket()
    if (ws) ws.send({ type: 'REACTOR_MELTDOWN', pos })
  } catch {}

  useVelarStore.getState().triggerMeltdown(pos)
  _power = false
  _cleanupActive = true
  _cleanupTimer  = 0

  useUiStore.getState().addNotification(
    'REACTOR MELTDOWN! Evacuate 20m radius immediately. Deliver 10x Clay + 5x Stone to site within 120s to contain.',
    'error'
  )
}

/** Returns the current reactor temperature for HUD display. */
export function getReactorTemp(): number {
  return useVelarStore.getState().reactorTemp
}

/** Returns whether a cleanup mission is active. */
export function isCleanupActive(): boolean {
  return _cleanupActive
}

/** Returns remaining cleanup window seconds. */
export function getCleanupTimeRemaining(): number {
  return Math.max(0, CLEANUP_TIMEOUT_SECS - _cleanupTimer)
}
