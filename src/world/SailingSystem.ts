// ── SailingSystem.ts ────────────────────────────────────────────────────────────
// M10 Track B: Ocean sailing and navigation.
//
// When the player equips a raft or sailing_boat and steps into water (terrain height < 0),
// sailing mode activates. WASD steers the vessel on the water surface.
//
// Physics model:
//   Raft:  moves only with wind direction. Paddling (W key) adds small forward force.
//   Boat:  can sail up to 45° from wind. Full WASD steering.
//   Buoyancy: upward force = water_density * volume * g - vessel_mass * g (net)
//             Simplified to: vessel stays on ocean surface (SEA_LEVEL), Y-velocity zeroed.
//
// The system is purely client-side — no server authority needed for vessel physics.
// Other players see the sailing player via regular PLAYER_UPDATE position messages.

import { SEA_LEVEL, PLANET_RADIUS, terrainHeightAt, surfaceRadiusAt } from './SpherePlanet'
import * as THREE from 'three'

export type VesselType = 'raft' | 'sailing_boat'

// Vessel parameters
const VESSEL_PARAMS: Record<VesselType, {
  maxSpeed: number       // m/s forward
  turnRate: number       // radians/s
  paddleForce: number    // extra m/s from W key
  windInfluence: number  // 0-1, how much wind pushes the vessel
  canTackUpwind: boolean
}> = {
  raft: {
    maxSpeed: 3.0,
    turnRate: 0.5,
    paddleForce: 1.5,
    windInfluence: 0.8,
    canTackUpwind: false,
  },
  sailing_boat: {
    maxSpeed: 7.0,
    turnRate: 1.2,
    paddleForce: 0.0,
    windInfluence: 0.5,
    canTackUpwind: true,
  },
}

// Wind direction 0 = north (+Z), clockwise
function windDirToVec(deg: number): THREE.Vector3 {
  const rad = (deg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad))
}

export interface SailingState {
  active: boolean
  vesselType: VesselType | null
  heading: number       // degrees, 0 = north
  speed: number         // m/s
  onWater: boolean
}

// ── Module state — singleton, mutated each frame ───────────────────────────────

let _state: SailingState = {
  active: false,
  vesselType: null,
  heading: 0,
  speed: 0,
  onWater: false,
}

// Scratch vectors — allocated once
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _windVec = new THREE.Vector3()

export function getSailingState(): Readonly<SailingState> {
  return _state
}

/**
 * Call every frame from GameLoop.
 *
 * @param px/py/pz  Player world position
 * @param windDir   Wind direction in degrees (from WeatherSystem)
 * @param windSpeed Wind speed m/s
 * @param keys      Set of currently pressed keys
 * @param dt        Frame delta time in seconds
 * @param vesselType  'raft' | 'sailing_boat' | null (null = no vessel equipped)
 * @returns  { dx, dy, dz } position delta to apply to player this frame, or null if not sailing
 */
export function tickSailing(
  px: number, py: number, pz: number,
  windDir: number, windSpeed: number,
  keys: Set<string>,
  dt: number,
  vesselType: VesselType | null,
): { dx: number; dy: number; dz: number } | null {

  // Check if player is at/near ocean surface
  const playerDir = new THREE.Vector3(px, py, pz).normalize()
  const surfaceH = terrainHeightAt(playerDir)
  const onWater = surfaceH < 0.5  // terrain below sea level = ocean

  _state.onWater = onWater

  if (!vesselType || !onWater) {
    if (_state.active) {
      _state.active = false
      _state.speed = 0
    }
    return null
  }

  _state.active = true
  _state.vesselType = vesselType
  const params = VESSEL_PARAMS[vesselType]

  // Turn left/right
  if (keys.has('KeyA') || keys.has('ArrowLeft'))  _state.heading -= params.turnRate * dt * (180 / Math.PI)
  if (keys.has('KeyD') || keys.has('ArrowRight')) _state.heading += params.turnRate * dt * (180 / Math.PI)
  _state.heading = ((_state.heading % 360) + 360) % 360

  // Forward direction in tangent plane (sphere surface)
  _up.copy(playerDir)
  const headRad = (_state.heading * Math.PI) / 180
  // North tangent on sphere
  const north = new THREE.Vector3(0, 1, 0)
  north.addScaledVector(_up, -north.dot(_up)).normalize()
  const east = new THREE.Vector3().crossVectors(_up, north).normalize()
  _fwd.copy(north).multiplyScalar(Math.cos(headRad)).addScaledVector(east, Math.sin(headRad))

  // Wind contribution
  _windVec.copy(windDirToVec(windDir))
  // Project wind to tangent plane
  _windVec.addScaledVector(_up, -_windVec.dot(_up))
  if (_windVec.lengthSq() > 0.001) _windVec.normalize()

  const windDot = _fwd.dot(_windVec) // 1 = downwind, -1 = upwind

  let targetSpeed = 0

  if (vesselType === 'raft') {
    // Raft moves only downwind. W key = paddle for small boost.
    if (windDot > 0) {
      targetSpeed = windSpeed * params.windInfluence * windDot
    }
    if (keys.has('KeyW') || keys.has('ArrowUp')) {
      targetSpeed += params.paddleForce
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      targetSpeed = Math.max(0, targetSpeed - 1.0)
    }
  } else {
    // Sailing boat: efficient 45°+ off wind, can tack upwind
    const angleOffWind = Math.acos(Math.max(-1, Math.min(1, windDot))) * (180 / Math.PI)

    let windEff: number
    if (angleOffWind <= 45) {
      // No-go zone: sailing too close into wind (tacking required)
      windEff = 0.15
    } else if (angleOffWind <= 90) {
      // Close-hauled: moderate efficiency
      windEff = 0.6 + (angleOffWind - 45) / 45 * 0.4
    } else if (angleOffWind <= 135) {
      // Beam/broad reach: best efficiency
      windEff = 1.0
    } else {
      // Downwind run: slightly less efficient than reach
      windEff = 0.75
    }

    targetSpeed = windSpeed * windEff * params.windInfluence
    if (keys.has('KeyW') || keys.has('ArrowUp'))  targetSpeed = Math.min(params.maxSpeed, targetSpeed * 1.2)
    if (keys.has('KeyS') || keys.has('ArrowDown')) targetSpeed *= 0.3
  }

  targetSpeed = Math.min(targetSpeed, params.maxSpeed)
  // Smooth speed changes
  _state.speed += (targetSpeed - _state.speed) * Math.min(1, dt * 2)

  // Move along forward direction, staying on water surface
  const moveAmt = _state.speed * dt
  const newPosVec = new THREE.Vector3(px, py, pz)
    .addScaledVector(_fwd, moveAmt)

  // Snap to ocean surface (SEA_LEVEL)
  const newDir = newPosVec.clone().normalize()
  const targetR = PLANET_RADIUS + Math.max(SEA_LEVEL, 0) + 0.5  // 0.5m above water
  newPosVec.copy(newDir).multiplyScalar(targetR)

  return {
    dx: newPosVec.x - px,
    dy: newPosVec.y - py,
    dz: newPosVec.z - pz,
  }
}

// ── Fishing ───────────────────────────────────────────────────────────────────
// Returns true when a fish bite occurs (call once on F-key press near water)

let _fishingActive = false
let _fishingTimer = 0
let _fishingBiteAt = 0

export function startFishing(): boolean {
  if (_fishingActive) return false
  _fishingActive = true
  _fishingTimer = 0
  _fishingBiteAt = 5 + Math.random() * 10  // 5-15 seconds
  return true
}

/** Call every frame when fishing is active. Returns true if fish bites this frame. */
export function tickFishing(dt: number): 'bite' | 'waiting' | 'idle' {
  if (!_fishingActive) return 'idle'
  _fishingTimer += dt
  if (_fishingTimer >= _fishingBiteAt) {
    _fishingActive = false
    return 'bite'
  }
  return 'waiting'
}

export function cancelFishing(): void {
  _fishingActive = false
  _fishingTimer = 0
}

export function isFishingActive(): boolean {
  return _fishingActive
}
