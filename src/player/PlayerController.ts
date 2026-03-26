// ── PlayerController ──────────────────────────────────────────────────────────
// Keyboard + mouse input for a player character standing on a sphere planet.
//
// Physics model:
//   • Gravity = -9.81 m/s² toward the planet center (Newton's law: F toward CoM)
//   • "Up" at any surface point = normalize(playerPosition)
//   • WASD moves in the local tangent plane; jump impulse is radially outward
//   • Collision resolution delegated to Rapier KinematicCharacterController
//   • Character orientation: rotation matrix columns = (right, up, -fwd) where
//     up = normalize(position) — this is the exact gravitational reference frame,
//     ensuring the character stands perpendicular to the surface everywhere

import * as THREE from 'three'
import { world, Position, Velocity, Rotation } from '../ecs/world'
import { useGameStore } from '../store/gameStore'
import { PLANET_RADIUS, SEA_LEVEL, surfaceRadiusAt } from '../world/SpherePlanet'
import { rapierWorld } from '../physics/RapierWorld'
import { useJoystickStore } from '../ui/MobileControls'
// M29 Track B: storm movement penalty (set by GameLoop each frame)
import { weatherSpeedMult } from '../game/GameLoop'
// M33 Track B: food buff speed multiplier
import { getFoodSpeedMult } from '../game/FoodBuffSystem'

export type CameraMode = 'first_person' | 'third_person' | 'orbit'

export interface InputState {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  sprint: boolean
  crouch: boolean
  interact: boolean
  attack: boolean
  mouseX: number
  mouseY: number
  scrollDelta: number
}

const WALK_SPEED   = 6.0
const SPRINT_MULT  = 2.4
const CROUCH_MULT  = 0.4
const JUMP_IMPULSE = 7.0    // m/s radially outward
const MOUSE_SENS   = 0.002
const GRAVITY      = 9.81   // m/s² toward center (Newton)
const SWIM_SPEED   = 3.5    // m/s horizontal in water
const BUOYANCY     = 14.0   // net upward accel in water = BUOYANCY - GRAVITY (must be > 9.81 to float)
const WATER_DRAG   = 6.0    // velocity damping in water (per second)
const OCEAN_RADIUS = PLANET_RADIUS + SEA_LEVEL

const THIRD_PERSON_DIST_DEFAULT = 8
const THIRD_PERSON_DIST_MIN     = 2
const THIRD_PERSON_DIST_MAX     = 25

export class PlayerController {
  private input: InputState = this.emptyInput()
  cameraMode: CameraMode = 'third_person'

  private keys = new Set<string>()
  private _interactConsumed = false
  private _attackConsumed = false

  private yaw   = 0
  private pitch = 0

  private thirdPersonDist = THIRD_PERSON_DIST_DEFAULT

  // Radial velocity (m/s) — positive = away from planet center.
  // Carried between frames for gravity/jump arcs.
  // Using a dedicated scalar avoids the "extract radial from world-space velocity"
  // problem when up-vector changes between frames.
  private _radialVel = 0
  private _onGround  = false

  // Reusable vectors — no per-frame allocations
  private readonly _up      = new THREE.Vector3()
  private readonly _north   = new THREE.Vector3()
  private readonly _east    = new THREE.Vector3()
  private readonly _fwd     = new THREE.Vector3()
  private readonly _right   = new THREE.Vector3()
  private readonly _lookDir = new THREE.Vector3()
  private readonly _camPos  = new THREE.Vector3()
  private readonly _rotMat  = new THREE.Matrix4()
  private readonly _rotQuat = new THREE.Quaternion()

  private boundKeyDown:   (e: KeyboardEvent) => void
  private boundKeyUp:     (e: KeyboardEvent) => void
  private boundMouseMove: (e: MouseEvent)    => void
  private boundWheel:     (e: WheelEvent)    => void
  private boundMouseDown: (e: MouseEvent) => void = () => {}
  private boundMouseUp:   (e: MouseEvent) => void = () => {}

  constructor(private entityId: number) {
    this.boundKeyDown   = (e) => this.onKeyDown(e)
    this.boundKeyUp     = (e) => this.onKeyUp(e)
    this.boundMouseMove = (e) => this.onMouseMove(e)
    this.boundWheel     = (e) => this.onWheel(e)
    this.boundMouseDown = (e: MouseEvent) => { if (e.button === 0) this.keys.add('MouseLeft') }
    this.boundMouseUp   = (e: MouseEvent) => { if (e.button === 0) this.keys.delete('MouseLeft') }
    document.addEventListener('keydown',   this.boundKeyDown)
    document.addEventListener('keyup',     this.boundKeyUp)
    document.addEventListener('mousemove', this.boundMouseMove)
    document.addEventListener('wheel',     this.boundWheel, { passive: true })
    window.addEventListener('mousedown', this.boundMouseDown)
    window.addEventListener('mouseup',   this.boundMouseUp)
  }

  /** Call once per frame — updates physics, ECS position, and camera. */
  update(dt: number, camera: THREE.Camera): void {
    this.pollInput()
    this.applyMovement(dt)
    this.updateCamera(camera)
    this.input.mouseX      = 0
    this.input.mouseY      = 0
    this.input.scrollDelta = 0
  }

  /** Returns true on the frame the player presses F (consumed once). */
  popInteract(): boolean {
    const held = this.keys.has('KeyF')
    if (held && !this._interactConsumed) {
      this._interactConsumed = true
      return true
    }
    if (!held) this._interactConsumed = false
    return false
  }

  /** Consume the pending attack input. Returns true once per left-click. */
  popAttack(): boolean {
    const held = this.keys.has('MouseLeft') || this.keys.has('KeyQ')
    if (held && !this._attackConsumed) {
      this._attackConsumed = true
      return true
    }
    if (!held) this._attackConsumed = false
    return false
  }

  private _digConsumed = false
  /** Consume the dig key (G). Returns true once per press. */
  popDig(): boolean {
    if (this.keys.has('KeyG') && !this._digConsumed) {
      this._digConsumed = true
      return true
    }
    if (!this.keys.has('KeyG')) this._digConsumed = false
    return false
  }

  // ── Slice 4: Eat (E key) ─────────────────────────────────────────────────
  private _eatConsumed = false
  /** Consume the eat key (E). Returns true once per press. */
  popEat(): boolean {
    if (this.keys.has('KeyE') && !this._eatConsumed) {
      this._eatConsumed = true
      return true
    }
    if (!this.keys.has('KeyE')) this._eatConsumed = false
    return false
  }

  // ── Slice 5: Herb (H key) ────────────────────────────────────────────────
  private _herbConsumed = false
  /** Consume the herb application key (H). Returns true once per press. */
  popHerb(): boolean {
    if (this.keys.has('KeyH') && !this._herbConsumed) {
      this._herbConsumed = true
      return true
    }
    if (!this.keys.has('KeyH')) this._herbConsumed = false
    return false
  }

  // ── Slice 6: Sleep (Z key) ───────────────────────────────────────────────
  private _sleepConsumed = false
  /** Consume the sleep key (Z). Returns true once per press. */
  popSleep(): boolean {
    if (this.keys.has('KeyZ') && !this._sleepConsumed) {
      this._sleepConsumed = true
      return true
    }
    if (!this.keys.has('KeyZ')) this._sleepConsumed = false
    return false
  }

  // ── M34 Track A: Home placement (B key) ──────────────────────────────────
  private _homePlaceConsumed = false
  /** Consume the home placement key (B). Returns true once per press. */
  popHomePlacement(): boolean {
    if (this.keys.has('KeyB') && !this._homePlaceConsumed) {
      this._homePlaceConsumed = true
      return true
    }
    if (!this.keys.has('KeyB')) this._homePlaceConsumed = false
    return false
  }

  // ── M38 Track B: Faction ability key (X) ─────────────────────────────────
  private _factionAbilityConsumed = false
  /** Consume the faction ability key (X). Returns true once per press. */
  popFactionAbility(): boolean {
    if (this.keys.has('KeyX') && !this._factionAbilityConsumed) {
      this._factionAbilityConsumed = true
      return true
    }
    if (!this.keys.has('KeyX')) this._factionAbilityConsumed = false
    return false
  }

  // ── M38 Track B: Dodge roll detection ────────────────────────────────────
  // Double-tap WASD or Shift+Space triggers a dodge roll.
  // Tracks last key tap times for double-tap detection (< 0.3s).
  private _lastKeyTapTimes: Partial<Record<string, number>> = {}
  private _dodgePending = false

  private _checkDoubleTap(code: string): boolean {
    const now = Date.now()
    const last = this._lastKeyTapTimes[code] ?? 0
    this._lastKeyTapTimes[code] = now
    return (now - last) < 300  // 300ms double-tap window
  }

  /** Returns true (once) if player should dodge this frame. Direction set by move input. */
  popDodgeRequest(): boolean {
    if (this._dodgePending) {
      this._dodgePending = false
      return true
    }
    return false
  }

  /** Internal: set by onKeyDown for double-tap. */
  private _pendingDodgeCode: string | null = null

  getPendingDodgeDirection(): { dx: number; dz: number } | null {
    return this._pendingDodgeDir
  }
  private _pendingDodgeDir: { dx: number; dz: number } | null = null

  requestPointerLock(): void {
    try {
      // Try canvas first (most reliable), fallback to body
      const canvas = document.querySelector('canvas')
      if (canvas) {
        canvas.requestPointerLock()
      } else {
        document.body.requestPointerLock()
      }
    } catch (err) {
      console.warn('[PlayerController] Failed to request pointer lock:', err)
    }
  }

  dispose(): void {
    document.removeEventListener('keydown',   this.boundKeyDown)
    document.removeEventListener('keyup',     this.boundKeyUp)
    document.removeEventListener('mousemove', this.boundMouseMove)
    document.removeEventListener('wheel',     this.boundWheel)
    window.removeEventListener('mousedown', this.boundMouseDown)
    window.removeEventListener('mouseup',   this.boundMouseUp)
    document.exitPointerLock?.()
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.code)
    if (e.code === 'KeyV') this.cycleCameraMode()
    if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault()

    // M38 Track B: Dodge roll — double-tap WASD or Shift+Space
    const moveCodes = ['KeyW', 'KeyS', 'KeyA', 'KeyD']
    if (moveCodes.includes(e.code) && this._checkDoubleTap(e.code)) {
      this._dodgePending = true
      // Map key to direction
      const dirMap: Record<string, { dx: number; dz: number }> = {
        KeyW: { dx: 0, dz: -1 },
        KeyS: { dx: 0, dz: 1 },
        KeyA: { dx: -1, dz: 0 },
        KeyD: { dx: 1, dz: 0 },
      }
      this._pendingDodgeDir = dirMap[e.code] ?? null
    }
    if (e.code === 'Space' && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'))) {
      this._dodgePending = true
      this._pendingDodgeDir = null  // backward direction will be computed from movement state
    }
  }

  private onKeyUp(e: KeyboardEvent): void { this.keys.delete(e.code) }

  private onMouseMove(e: MouseEvent): void {
    if (document.pointerLockElement) {
      this.input.mouseX += e.movementX
      this.input.mouseY += e.movementY
    }
  }

  private onWheel(e: WheelEvent): void { this.input.scrollDelta += e.deltaY }

  private pollInput(): void {
    const k = this.keys
    this.input.forward  = k.has('KeyW') || k.has('ArrowUp')
    this.input.backward = k.has('KeyS') || k.has('ArrowDown')
    this.input.left     = k.has('KeyA') || k.has('ArrowLeft')
    this.input.right    = k.has('KeyD') || k.has('ArrowRight')
    this.input.jump     = k.has('Space')
    this.input.sprint   = k.has('ShiftLeft') || k.has('ShiftRight')
    this.input.crouch   = k.has('ControlLeft')
    this.input.interact = k.has('KeyE') || k.has('KeyF')
    this.input.attack   = k.has('MouseLeft') || k.has('KeyQ')

    // ── Virtual joystick (mobile touch) ──────────────────────────────────────
    // Blend joystick direction into movement flags so the rest of the pipeline
    // needs no changes. dy < 0 = up on screen = forward.
    const joy = useJoystickStore.getState()
    if (joy.active) {
      const DEAD = 0.15
      if (joy.dy < -DEAD) this.input.forward  = true
      if (joy.dy >  DEAD) this.input.backward = true
      if (joy.dx < -DEAD) this.input.left     = true
      if (joy.dx >  DEAD) this.input.right    = true
    }
  }

  // ── Movement ───────────────────────────────────────────────────────────────

  private applyMovement(dt: number): void {
    const id  = this.entityId
    const inp = this.input
    const gs  = useGameStore.getState()

    const physics = rapierWorld.getPlayer()

    if (!physics) {
      // Rapier not yet initialised — hold still (first frame only)
      return
    }

    const { body, collider, controller } = physics

    // ── Read authoritative position from Rapier ──────────────────────────────
    const t = body.translation()
    const px = t.x, py = t.y, pz = t.z

    // ── Build local gravitational reference frame ────────────────────────────
    // up = normalize(pos) = direction gravity acts away from (Newton: F toward CoM)
    const up    = this._up
    const north = this._north
    const east  = this._east
    this.computeLocalBasisAt(px, py, pz, up, north, east)

    // ── Mouse look ───────────────────────────────────────────────────────────
    if (!gs.inputBlocked) {
      this.yaw   -= inp.mouseX * MOUSE_SENS
      this.pitch -= inp.mouseY * MOUSE_SENS
      this.pitch  = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch))
      if (this.cameraMode === 'third_person') {
        this.thirdPersonDist += inp.scrollDelta * 0.01
        this.thirdPersonDist  = Math.max(THIRD_PERSON_DIST_MIN, Math.min(THIRD_PERSON_DIST_MAX, this.thirdPersonDist))
      }
    }

    // ── Facing direction from yaw ────────────────────────────────────────────
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw)
    const fwd   = this._fwd
    const right = this._right
    fwd.set(
      north.x * cosY + east.x * sinY,
      north.y * cosY + east.y * sinY,
      north.z * cosY + east.z * sinY,
    )
    // right = fwd × up (right-handed, matches camera screen-right direction)
    // camera screen-right = -(up × fwd) = fwd × up = north*sinY - east*cosY
    right.set(
      north.x * sinY - east.x * cosY,
      north.y * sinY - east.y * cosY,
      north.z * sinY - east.z * cosY,
    )

    const distFromCenter = Math.sqrt(px * px + py * py + pz * pz)
    const inWater  = distFromCenter < OCEAN_RADIUS + 0.5
    const speedMult = gs.adminSpeedMult ?? 1

    // ── Input blocked (panel open) ───────────────────────────────────────────
    // Keep radial velocity (gravity), kill tangential.
    if (gs.inputBlocked) {
      this._radialVel -= GRAVITY * dt
      const dx = up.x * this._radialVel * dt
      const dy = up.y * this._radialVel * dt
      const dz = up.z * this._radialVel * dt
      controller.computeColliderMovement(collider, { x: dx, y: dy, z: dz })
      const actual = controller.computedMovement()
      const actualR = actual.x * up.x + actual.y * up.y + actual.z * up.z
      if (this._radialVel < 0 && actualR > this._radialVel * dt * 0.1) {
        this._radialVel = 0  // ground blocked the fall
      }
      const nx = px + actual.x, ny = py + actual.y, nz = pz + actual.z
      body.setNextKinematicTranslation({ x: nx, y: ny, z: nz })
      Position.x[id] = nx; Position.y[id] = ny; Position.z[id] = nz
      this.writeRotation(id, right, up, fwd)
      return
    }

    // ── Fly mode (admin) ─────────────────────────────────────────────────────
    if (gs.flyMode) {
      const FLY_SPEED = WALK_SPEED * 4 * speedMult
      let fx = 0, fy = 0, fz = 0
      if (inp.forward)  { fx += fwd.x;   fy += fwd.y;   fz += fwd.z   }
      if (inp.backward) { fx -= fwd.x;   fy -= fwd.y;   fz -= fwd.z   }
      if (inp.left)     { fx -= right.x; fy -= right.y; fz -= right.z  }
      if (inp.right)    { fx += right.x; fy += right.y; fz += right.z  }
      if (inp.jump)     { fx += up.x;    fy += up.y;    fz += up.z     }
      if (inp.crouch)   { fx -= up.x;    fy -= up.y;    fz -= up.z     }
      const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz)
      if (fLen > 1) { fx /= fLen; fy /= fLen; fz /= fLen }
      // Fly bypasses collision (intentional: fly through terrain for admin use)
      const nx = px + fx * FLY_SPEED * dt
      const ny = py + fy * FLY_SPEED * dt
      const nz = pz + fz * FLY_SPEED * dt
      body.setNextKinematicTranslation({ x: nx, y: ny, z: nz })
      Position.x[id] = nx; Position.y[id] = ny; Position.z[id] = nz
      Velocity.x[id] = fx * FLY_SPEED
      Velocity.y[id] = fy * FLY_SPEED
      Velocity.z[id] = fz * FLY_SPEED
      this._radialVel = 0
      if (fLen > 0) this.writeRotation(id, right, up, fwd)
      return
    }

    // ── Normal movement (land + water) ───────────────────────────────────────
    let speed = inWater ? SWIM_SPEED : WALK_SPEED * speedMult * weatherSpeedMult * getFoodSpeedMult()
    if (!inWater && inp.sprint) speed *= SPRINT_MULT
    if (!inWater && inp.crouch) speed *= CROUCH_MULT

    // WASD: desired tangential velocity in the surface plane
    let mx = 0, my = 0, mz = 0
    if (inp.forward)  { mx += fwd.x;   my += fwd.y;   mz += fwd.z   }
    if (inp.backward) { mx -= fwd.x;   my -= fwd.y;   mz -= fwd.z   }
    if (inp.left)     { mx -= right.x; my -= right.y; mz -= right.z  }
    if (inp.right)    { mx += right.x; my += right.y; mz += right.z  }

    const moveLen = Math.sqrt(mx * mx + my * my + mz * mz)
    if (moveLen > 1) { mx /= moveLen; my /= moveLen; mz /= moveLen }
    mx *= speed; my *= speed; mz *= speed

    // Radial velocity: gravity acts toward center (Newton) at -9.81 m/s²
    let rv = this._radialVel
    if (inWater) {
      rv += (BUOYANCY - GRAVITY) * dt
      if (inp.jump)   rv += BUOYANCY * dt
      if (inp.crouch) rv -= BUOYANCY * dt
      const drag = Math.max(0, 1 - WATER_DRAG * dt)
      rv *= drag
      mx *= drag; my *= drag; mz *= drag
    } else {
      rv -= GRAVITY * dt
      if (inp.jump && this._onGround) {
        rv = JUMP_IMPULSE
        this._onGround = false
      }
    }

    // Compose desired movement: tangential (WASD) + radial (gravity/jump)
    const dx = (mx + up.x * rv) * dt
    const dy = (my + up.y * rv) * dt
    const dz = (mz + up.z * rv) * dt

    // ── Rapier KCC collision resolution ─────────────────────────────────────
    // Sweeps the capsule along (dx, dy, dz) and resolves slope/wall/step collisions.
    // The planet trimesh collider stops the character at the terrain surface.
    controller.computeColliderMovement(collider, { x: dx, y: dy, z: dz })
    const actual = controller.computedMovement()

    // Ground detection: was the radially-downward component blocked?
    // If desired radial is negative (falling) and actual radial is near zero → grounded.
    const desiredR = dx * up.x + dy * up.y + dz * up.z
    const actualR  = actual.x * up.x + actual.y * up.y + actual.z * up.z
    const groundBlocked = desiredR < -0.001 && actualR > desiredR * 0.1
    this._onGround = groundBlocked

    if (groundBlocked) {
      rv = 0  // kill radial velocity on landing (prevents tunneling re-attempt)
    }

    this._radialVel = rv

    // Move kinematic body to resolved position
    const nx = px + actual.x
    const ny = py + actual.y
    const nz = pz + actual.z
    body.setNextKinematicTranslation({ x: nx, y: ny, z: nz })

    // Write back to ECS (other systems read from here)
    Position.x[id] = nx; Position.y[id] = ny; Position.z[id] = nz
    Velocity.x[id] = mx + up.x * rv
    Velocity.y[id] = my + up.y * rv
    Velocity.z[id] = mz + up.z * rv

    // Safety: if player somehow falls below planet core, teleport to spawn surface
    const dist2 = nx * nx + ny * ny + nz * nz
    if (dist2 < 800 * 800) {
      const safeR = PLANET_RADIUS + 5
      const mag   = Math.sqrt(dist2)
      if (mag > 0.1) {
        const sx = (nx / mag) * safeR
        const sy = (ny / mag) * safeR
        const sz = (nz / mag) * safeR
        body.setNextKinematicTranslation({ x: sx, y: sy, z: sz })
        Position.x[id] = sx; Position.y[id] = sy; Position.z[id] = sz
      } else {
        body.setNextKinematicTranslation({ x: 0, y: safeR, z: 0 })
        Position.x[id] = 0; Position.y[id] = safeR; Position.z[id] = 0
      }
      this._radialVel = 0
    }

    // Character rotation: surface-normal aligned, facing direction of travel.
    // Applied every frame (not just when moving) — ensures no tilt anywhere.
    this.writeRotation(id, right, up, fwd)
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private updateCamera(camera: THREE.Camera): void {
    const id = this.entityId
    const ex = Position.x[id], ey = Position.y[id], ez = Position.z[id]

    const up    = this._up
    const north = this._north
    const east  = this._east
    this.computeLocalBasisAt(ex, ey, ez, up, north, east)

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw)
    const hx = north.x * cosY + east.x * sinY
    const hy = north.y * cosY + east.y * sinY
    const hz = north.z * cosY + east.z * sinY
    const cosPitch = Math.cos(this.pitch), sinPitch = Math.sin(this.pitch)
    const lookDir  = this._lookDir
    lookDir.set(
      hx * cosPitch + up.x * sinPitch,
      hy * cosPitch + up.y * sinPitch,
      hz * cosPitch + up.z * sinPitch,
    )

    // CRITICAL: camera.up = surface normal → horizon stays level everywhere
    camera.up.copy(up)

    switch (this.cameraMode) {
      case 'first_person': {
        const dist  = Math.sqrt(ex * ex + ey * ey + ez * ez)
        const headR = dist + 0.8
        camera.position.set(ex / dist * headR, ey / dist * headR, ez / dist * headR)
        camera.lookAt(
          camera.position.x + lookDir.x,
          camera.position.y + lookDir.y,
          camera.position.z + lookDir.z,
        )
        break
      }
      case 'third_person': {
        const d = this.thirdPersonDist
        this._camPos.set(
          ex - lookDir.x * d + up.x * d * 0.35,
          ey - lookDir.y * d + up.y * d * 0.35,
          ez - lookDir.z * d + up.z * d * 0.35,
        )
        // Prevent camera from going underground — clamp to actual terrain surface + 1.5m
        const cx = this._camPos.x, cy = this._camPos.y, cz = this._camPos.z
        const terrainR = surfaceRadiusAt(cx, cy, cz)
        const camLen = this._camPos.length()
        if (camLen < terrainR + 1.5) {
          this._camPos.normalize().multiplyScalar(terrainR + 1.5)
        }
        camera.position.copy(this._camPos)
        camera.lookAt(ex + up.x * 0.9, ey + up.y * 0.9, ez + up.z * 0.9)
        break
      }
      case 'orbit': {
        const orbitD = this.thirdPersonDist * 3
        // Negate lookDir so camera sits BEHIND the player (lookDir points forward)
        camera.position.set(
          ex - lookDir.x * orbitD,
          ey - lookDir.y * orbitD,
          ez - lookDir.z * orbitD,
        )
        camera.lookAt(ex, ey, ez)
        break
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Write character rotation quaternion to ECS.
   * Columns of the rotation matrix: right, up (surface normal), -forward.
   * This is the physically correct orientation: up = normalize(position) is
   * exactly the gravitational reference frame on a sphere.
   */
  private writeRotation(
    id: number,
    right: THREE.Vector3,
    up:    THREE.Vector3,
    fwd:   THREE.Vector3,
  ): void {
    this._rotMat.set(
      right.x, up.x, -fwd.x, 0,
      right.y, up.y, -fwd.y, 0,
      right.z, up.z, -fwd.z, 0,
      0,       0,    0,      1,
    )
    this._rotQuat.setFromRotationMatrix(this._rotMat)
    Rotation.x[id] = this._rotQuat.x
    Rotation.y[id] = this._rotQuat.y
    Rotation.z[id] = this._rotQuat.z
    Rotation.w[id] = this._rotQuat.w
  }

  private computeLocalBasisAt(
    px: number, py: number, pz: number,
    out_up: THREE.Vector3, out_north: THREE.Vector3, out_east: THREE.Vector3,
  ): void {
    const len = Math.sqrt(px * px + py * py + pz * pz)
    if (len < 1) {
      out_up.set(0, 1, 0); out_north.set(0, 0, 1); out_east.set(1, 0, 0)
      return
    }
    out_up.set(px / len, py / len, pz / len)

    let nx = 0, ny = 0, nz = 1
    if (Math.abs(out_up.z) > 0.99) { nx = 0; ny = 1; nz = 0 }
    const dot = nx * out_up.x + ny * out_up.y + nz * out_up.z
    nx -= dot * out_up.x; ny -= dot * out_up.y; nz -= dot * out_up.z
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (nLen < 0.001) out_north.set(1, 0, 0)
    else out_north.set(nx / nLen, ny / nLen, nz / nLen)

    out_east.crossVectors(out_up, out_north).normalize()
  }

  private cycleCameraMode(): void {
    const modes: CameraMode[] = ['third_person', 'first_person', 'orbit']
    const idx = modes.indexOf(this.cameraMode)
    this.cameraMode = modes[(idx + 1) % modes.length]
  }

  private emptyInput(): InputState {
    return {
      forward: false, backward: false, left: false, right: false,
      jump: false, sprint: false, crouch: false,
      interact: false, attack: false,
      mouseX: 0, mouseY: 0, scrollDelta: 0,
    }
  }
}
