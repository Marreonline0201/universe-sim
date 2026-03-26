/**
 * RaftSystem.ts — M28 Track B
 *
 * Manages the player mounting/dismounting a placed raft building, raft movement on water,
 * buoyancy bob simulation, and shore collision detection.
 *
 * State is a singleton module-level object updated each frame from GameLoop.
 */

import * as THREE from 'three'
import { Position } from '../ecs/world'
import { buildingSystem } from './GameSingletons'
import { SEA_LEVEL, PLANET_RADIUS, terrainHeightAt } from '../world/SpherePlanet'

// ── Constants ──────────────────────────────────────────────────────────────────
const MOUNT_RADIUS   = 2.0    // metres — E key mounts if closer than this
const RAFT_FWD_SPEED = 4.0    // m/s forward/back
const RAFT_STR_SPEED = 2.0    // m/s strafe
const RAFT_TURN_RATE = 1.2    // radians/s (Q/E rotate)
const BUOY_Y         = SEA_LEVEL + 0.5  // base raft Y height above sea level
const BOB_AMP_Y      = 0.15   // metres vertical bob amplitude
const BOB_FREQ_Y     = 0.8    // rad/s vertical bob frequency
const BOB_PITCH_AMP  = 0.03   // radians pitch amplitude
const BOB_PITCH_FREQ = 0.5    // rad/s pitch frequency
const BOB_ROLL_AMP   = 0.025  // radians roll amplitude
const BOB_ROLL_FREQ  = 0.7    // rad/s roll frequency

export interface RaftState {
  /** Whether player is currently riding a raft. */
  mounted: boolean
  /** The buildingSystem ID of the mounted raft, or -1. */
  raftBuildingId: number
  /** World position of the raft center. */
  raftPos: [number, number, number]
  /** Heading in radians (around surface normal). */
  heading: number
  /** Current speed in m/s (magnitude). */
  speed: number
  /** Buoyancy Y offset (world). Computed each frame. */
  buoyY: number
  /** Pitch angle (radians) — used by renderer. */
  pitch: number
  /** Roll angle (radians) — used by renderer. */
  roll: number
  /** Whether shore was hit this frame. */
  shoreHit: boolean
}

// Singleton state
const _state: RaftState = {
  mounted: false,
  raftBuildingId: -1,
  raftPos: [0, 0, 0],
  heading: 0,
  speed: 0,
  buoyY: 0,
  pitch: 0,
  roll: 0,
  shoreHit: false,
}

export function getRaftState(): Readonly<RaftState> {
  return _state
}

// Shore notification timer — counts down, > 0 means show "Too shallow" text
let _shoreNotifyTimer = 0
export function getShoreNotifyTimer(): number { return _shoreNotifyTimer }

// ── Scratch objects ────────────────────────────────────────────────────────────
const _up    = new THREE.Vector3()
const _north = new THREE.Vector3()
const _east  = new THREE.Vector3()
const _fwd   = new THREE.Vector3()
const _right = new THREE.Vector3()

/**
 * Attempt to mount the nearest raft building within MOUNT_RADIUS.
 * Returns true if mounted successfully.
 */
export function tryMountRaft(entityId: number): boolean {
  const px = Position.x[entityId]
  const py = Position.y[entityId]
  const pz = Position.z[entityId]

  const allBuildings = buildingSystem.getAllBuildings()
  for (const b of allBuildings) {
    if (b.typeId !== 'raft') continue
    const dx = b.position[0] - px
    const dy = b.position[1] - py
    const dz = b.position[2] - pz
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist <= MOUNT_RADIUS) {
      _state.mounted = true
      _state.raftBuildingId = b.id
      _state.raftPos = [...b.position] as [number, number, number]
      _state.heading = 0
      _state.speed   = 0
      _state.shoreHit = false
      return true
    }
  }
  return false
}

/**
 * Dismount — drop player at raft edge.
 */
export function dismountRaft(entityId: number): void {
  if (!_state.mounted) return

  // Place player 2m to the side of the raft
  const [rx, ry, rz] = _state.raftPos
  const up = new THREE.Vector3(rx, ry, rz).normalize()
  // right = cross(up, world-Z)
  const sideDir = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize()
  if (sideDir.lengthSq() < 0.01) sideDir.set(1, 0, 0)
  const r = PLANET_RADIUS + SEA_LEVEL + 2
  Position.x[entityId] = rx + sideDir.x * 2.5 + up.x * 1
  Position.y[entityId] = ry + sideDir.y * 2.5 + up.y * 1
  Position.z[entityId] = rz + sideDir.z * 2.5 + up.z * 1

  _state.mounted = false
  _state.raftBuildingId = -1
  _state.speed = 0
}

/**
 * Compute surface-aligned local basis at position (px, py, pz).
 */
function computeBasis(px: number, py: number, pz: number): void {
  _up.set(px, py, pz).normalize()
  // north = tangent toward world +Z projected on surface plane
  _north.set(0, 0, 1).addScaledVector(_up, -_up.z).normalize()
  if (_north.lengthSq() < 0.001) _north.set(1, 0, 0)
  _east.crossVectors(_north, _up).normalize()
}

/**
 * Tick the raft system.
 * @param entityId - player ECS entity
 * @param keys     - Set<string> of currently held key codes
 * @param dt       - frame delta in seconds
 * @param time     - cumulative game time in seconds (for buoyancy sin)
 */
export function tickRaft(
  entityId: number,
  keys: Set<string>,
  dt: number,
  time: number,
): void {
  _shoreNotifyTimer = Math.max(0, _shoreNotifyTimer - dt)

  if (!_state.mounted) return

  // ── Buoyancy bob ────────────────────────────────────────────────────────────
  const [rx, ry, rz] = _state.raftPos
  const raftNorm = new THREE.Vector3(rx, ry, rz).normalize()
  const raftDist = PLANET_RADIUS + BUOY_Y + Math.sin(time * BOB_FREQ_Y) * BOB_AMP_Y
  _state.raftPos = [raftNorm.x * raftDist, raftNorm.y * raftDist, raftNorm.z * raftDist]
  _state.buoyY   = Math.sin(time * BOB_FREQ_Y) * BOB_AMP_Y
  _state.pitch   = Math.sin(time * BOB_PITCH_FREQ) * BOB_PITCH_AMP
  _state.roll    = Math.cos(time * BOB_ROLL_FREQ)  * BOB_ROLL_AMP

  // ── Heading rotation (Q/E keys) ─────────────────────────────────────────────
  if (keys.has('KeyQ')) _state.heading += RAFT_TURN_RATE * dt
  if (keys.has('KeyE')) _state.heading -= RAFT_TURN_RATE * dt

  // ── Build movement vector in surface tangent plane ──────────────────────────
  const [rpx, rpy, rpz] = _state.raftPos
  computeBasis(rpx, rpy, rpz)

  // Forward direction = north rotated by heading around surface normal
  const sinH = Math.sin(_state.heading)
  const cosH = Math.cos(_state.heading)
  _fwd.set(
    _north.x * cosH + _east.x * sinH,
    _north.y * cosH + _east.y * sinH,
    _north.z * cosH + _east.z * sinH,
  )
  _right.crossVectors(_up, _fwd).normalize()

  let mvx = 0, mvy = 0, mvz = 0
  if (keys.has('KeyW') || keys.has('ArrowUp'))   { mvx += _fwd.x * RAFT_FWD_SPEED; mvy += _fwd.y * RAFT_FWD_SPEED; mvz += _fwd.z * RAFT_FWD_SPEED }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { mvx -= _fwd.x * RAFT_FWD_SPEED; mvy -= _fwd.y * RAFT_FWD_SPEED; mvz -= _fwd.z * RAFT_FWD_SPEED }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { mvx -= _right.x * RAFT_STR_SPEED; mvy -= _right.y * RAFT_STR_SPEED; mvz -= _right.z * RAFT_STR_SPEED }
  if (keys.has('KeyD') || keys.has('ArrowRight')){ mvx += _right.x * RAFT_STR_SPEED; mvy += _right.y * RAFT_STR_SPEED; mvz += _right.z * RAFT_STR_SPEED }

  const moveSpeed = Math.sqrt(mvx * mvx + mvy * mvy + mvz * mvz)
  _state.speed = moveSpeed

  // ── Shore collision — block movement if terrain height > SEA_LEVEL - 0.5 ───
  _state.shoreHit = false
  if (moveSpeed > 0.01) {
    // Test proposed new position
    const nx = _state.raftPos[0] + mvx * dt
    const ny = _state.raftPos[1] + mvy * dt
    const nz = _state.raftPos[2] + mvz * dt
    const testDir = new THREE.Vector3(nx, ny, nz).normalize()
    const terrH = terrainHeightAt(testDir)
    if (terrH >= SEA_LEVEL - 0.5) {
      // Blocked — zero velocity, trigger HUD notification
      mvx = mvy = mvz = 0
      _state.speed = 0
      _state.shoreHit = true
      _shoreNotifyTimer = 1.0  // show "Too shallow" for 1 second
    }
  }

  // ── Apply movement to raft position ─────────────────────────────────────────
  const newPosRaw = new THREE.Vector3(
    _state.raftPos[0] + mvx * dt,
    _state.raftPos[1] + mvy * dt,
    _state.raftPos[2] + mvz * dt,
  )
  // Re-normalize to ocean surface radius (buoyancy maintains raftDist)
  const newNorm = newPosRaw.normalize()
  _state.raftPos = [newNorm.x * raftDist, newNorm.y * raftDist, newNorm.z * raftDist]

  // ── Lock player to raft (offset slightly above) ─────────────────────────────
  const playerR = raftDist + 1.0
  Position.x[entityId] = newNorm.x * playerR
  Position.y[entityId] = newNorm.y * playerR
  Position.z[entityId] = newNorm.z * playerR
}
