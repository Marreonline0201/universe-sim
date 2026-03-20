// ── PlayerController ──────────────────────────────────────────────────────────
// Handles keyboard + mouse input for a player character standing on a sphere.
//
// Key changes from flat-world version:
//   • "Up" direction = normalize(playerPos) — points away from planet center
//   • Gravity acts along -up (toward center), not world -Y
//   • WASD movement is in the local tangent plane at the player's surface position
//   • Camera aligns camera.up to the surface normal so the horizon stays level
//   • Jump impulse is along the local up axis

import * as THREE from 'three'
import { world, Position, Velocity, Rotation } from '../ecs/world'
import { useGameStore } from '../store/gameStore'

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
const JUMP_IMPULSE = 7.0   // m/s radially outward
const MOUSE_SENS   = 0.002
const GRAVITY      = 9.81  // m/s² toward center

const THIRD_PERSON_DIST_DEFAULT = 8
const THIRD_PERSON_DIST_MIN     = 2
const THIRD_PERSON_DIST_MAX     = 25

export class PlayerController {
  private input: InputState = this.emptyInput()
  cameraMode: CameraMode = 'third_person'

  private keys = new Set<string>()
  private _interactConsumed = false

  // Yaw and pitch in local surface frame
  private yaw   = 0
  private pitch = 0

  private thirdPersonDist = THIRD_PERSON_DIST_DEFAULT
  private onGround = false

  // Reusable vectors to avoid per-frame allocations
  private readonly _up      = new THREE.Vector3()
  private readonly _north   = new THREE.Vector3()
  private readonly _east    = new THREE.Vector3()
  private readonly _fwd     = new THREE.Vector3()
  private readonly _right   = new THREE.Vector3()
  private readonly _lookDir = new THREE.Vector3()
  private readonly _camPos  = new THREE.Vector3()

  private boundKeyDown: (e: KeyboardEvent) => void
  private boundKeyUp:   (e: KeyboardEvent) => void
  private boundMouseMove: (e: MouseEvent) => void
  private boundWheel: (e: WheelEvent) => void

  constructor(private entityId: number) {
    this.boundKeyDown   = (e) => this.onKeyDown(e)
    this.boundKeyUp     = (e) => this.onKeyUp(e)
    this.boundMouseMove = (e) => this.onMouseMove(e)
    this.boundWheel     = (e) => this.onWheel(e)
    document.addEventListener('keydown',   this.boundKeyDown)
    document.addEventListener('keyup',     this.boundKeyUp)
    document.addEventListener('mousemove', this.boundMouseMove)
    document.addEventListener('wheel',     this.boundWheel, { passive: true })
  }

  /** Call once per frame. Updates ECS velocity and repositions camera. */
  update(dt: number, camera: THREE.Camera): void {
    this.pollInput()
    this.applyMovement(dt)
    this.updateCamera(camera)
    this.input.mouseX      = 0
    this.input.mouseY      = 0
    this.input.scrollDelta = 0
  }

  setOnGround(v: boolean): void { this.onGround = v }

  /** Returns true on the frame the player presses F (consumed once). */
  popInteract(): boolean {
    if (this.keys.has('KeyF') && !this._interactConsumed) {
      this._interactConsumed = true
      return true
    }
    if (!this.keys.has('KeyF')) this._interactConsumed = false
    return false
  }

  requestPointerLock(): void { document.body.requestPointerLock() }

  dispose(): void {
    document.removeEventListener('keydown',   this.boundKeyDown)
    document.removeEventListener('keyup',     this.boundKeyUp)
    document.removeEventListener('mousemove', this.boundMouseMove)
    document.removeEventListener('wheel',     this.boundWheel)
    document.exitPointerLock?.()
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.code)
    if (e.code === 'KeyV') this.cycleCameraMode()
    if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault()
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
  }

  // ── Movement (sphere-aware) ───────────────────────────────────────────────

  private applyMovement(dt: number): void {
    const id  = this.entityId
    const inp = this.input

    // Build local surface basis at player's current position
    const up    = this._up
    const north = this._north
    const east  = this._east
    this.computeLocalBasis(up, north, east)

    if (useGameStore.getState().inputBlocked) {
      // Keep only radial velocity (gravity), kill tangential
      const vr = Velocity.x[id] * up.x + Velocity.y[id] * up.y + Velocity.z[id] * up.z
      const newR = vr - GRAVITY * dt
      Velocity.x[id] = up.x * newR
      Velocity.y[id] = up.y * newR
      Velocity.z[id] = up.z * newR
      Position.x[id] += Velocity.x[id] * dt
      Position.y[id] += Velocity.y[id] * dt
      Position.z[id] += Velocity.z[id] * dt
      return
    }

    // Compute forward/right in the tangent plane, rotated by yaw
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw)
    const fwd   = this._fwd
    const right = this._right
    fwd.set(
      north.x * cosY + east.x * sinY,
      north.y * cosY + east.y * sinY,
      north.z * cosY + east.z * sinY,
    )
    right.set(
      east.x * cosY - north.x * sinY,
      east.y * cosY - north.y * sinY,
      east.z * cosY - north.z * sinY,
    )

    let speed = WALK_SPEED
    if (inp.sprint) speed *= SPRINT_MULT
    if (inp.crouch) speed *= CROUCH_MULT

    // Desired lateral move in world space (tangent plane only)
    let mx = 0, my = 0, mz = 0
    if (inp.forward)  { mx -= fwd.x;   my -= fwd.y;   mz -= fwd.z   }
    if (inp.backward) { mx += fwd.x;   my += fwd.y;   mz += fwd.z   }
    if (inp.left)     { mx -= right.x; my -= right.y; mz -= right.z  }
    if (inp.right)    { mx += right.x; my += right.y; mz += right.z  }

    const moveLen = Math.sqrt(mx * mx + my * my + mz * mz)
    if (moveLen > 1) { mx /= moveLen; my /= moveLen; mz /= moveLen }
    mx *= speed; my *= speed; mz *= speed

    // Decompose current velocity into radial + tangential
    const vx = Velocity.x[id], vy = Velocity.y[id], vz = Velocity.z[id]
    const vRadial = vx * up.x + vy * up.y + vz * up.z

    // Apply gravity to radial component
    let newRadial = vRadial - GRAVITY * dt

    // Jump: impulse radially outward
    if (inp.jump && this.onGround) {
      newRadial = JUMP_IMPULSE
      this.onGround = false
    }

    // New velocity = tangential (WASD) + radial (gravity/jump)
    Velocity.x[id] = mx + up.x * newRadial
    Velocity.y[id] = my + up.y * newRadial
    Velocity.z[id] = mz + up.z * newRadial

    // Integrate position
    Position.x[id] += Velocity.x[id] * dt
    Position.y[id] += Velocity.y[id] * dt
    Position.z[id] += Velocity.z[id] * dt

    // Safety: if player falls below planet core, teleport to north pole surface
    const dist = Math.sqrt(Position.x[id] ** 2 + Position.y[id] ** 2 + Position.z[id] ** 2)
    if (dist < 800) {
      Position.x[id] = 0; Position.y[id] = 2002; Position.z[id] = 0
      Velocity.x[id] = 0; Velocity.y[id] = 0;    Velocity.z[id] = 0
    }

    // Mouse look
    this.yaw   -= inp.mouseX * MOUSE_SENS
    this.pitch -= inp.mouseY * MOUSE_SENS
    this.pitch  = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.pitch))

    if (this.cameraMode === 'third_person') {
      this.thirdPersonDist += inp.scrollDelta * 0.01
      this.thirdPersonDist  = Math.max(THIRD_PERSON_DIST_MIN, Math.min(THIRD_PERSON_DIST_MAX, this.thirdPersonDist))
    }

    // Entity rotation quaternion to face movement direction
    if (moveLen > 0) {
      Rotation.x[id] = 0
      Rotation.y[id] = Math.sin(this.yaw / 2)
      Rotation.z[id] = 0
      Rotation.w[id] = Math.cos(this.yaw / 2)
    }
  }

  // ── Camera (sphere-aware) ─────────────────────────────────────────────────

  private updateCamera(camera: THREE.Camera): void {
    const id = this.entityId
    const ex = Position.x[id], ey = Position.y[id], ez = Position.z[id]

    const up    = this._up
    const north = this._north
    const east  = this._east
    this.computeLocalBasisAt(ex, ey, ez, up, north, east)

    // Build look direction: yaw in tangent plane, then pitched up/down
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw)
    const hx = north.x * cosY + east.x * sinY
    const hy = north.y * cosY + east.y * sinY
    const hz = north.z * cosY + east.z * sinY
    const cosPitch = Math.cos(this.pitch), sinPitch = Math.sin(this.pitch)
    const lookDir = this._lookDir
    lookDir.set(
      hx * cosPitch + up.x * sinPitch,
      hy * cosPitch + up.y * sinPitch,
      hz * cosPitch + up.z * sinPitch,
    )

    // CRITICAL: camera.up = surface normal so horizon stays level as you walk around
    camera.up.copy(up)

    switch (this.cameraMode) {
      case 'first_person': {
        const dist = Math.sqrt(ex * ex + ey * ey + ez * ez)
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
        camera.position.copy(this._camPos)
        camera.lookAt(ex + up.x * 0.9, ey + up.y * 0.9, ez + up.z * 0.9)
        break
      }
      case 'orbit': {
        const orbitD = this.thirdPersonDist * 3
        camera.position.set(
          ex + lookDir.x * orbitD,
          ey + lookDir.y * orbitD,
          ez + lookDir.z * orbitD,
        )
        camera.lookAt(ex, ey, ez)
        break
      }
    }
  }

  // ── Local surface basis ───────────────────────────────────────────────────

  private computeLocalBasis(
    out_up: THREE.Vector3, out_north: THREE.Vector3, out_east: THREE.Vector3,
  ): void {
    const id = this.entityId
    this.computeLocalBasisAt(
      Position.x[id], Position.y[id], Position.z[id],
      out_up, out_north, out_east,
    )
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

    // North = world Z projected onto tangent plane
    // At Z-poles, degenerate — use world Y instead
    let nx = 0, ny = 0, nz = 1
    if (Math.abs(out_up.z) > 0.99) { nx = 0; ny = 1; nz = 0 }
    const dot = nx * out_up.x + ny * out_up.y + nz * out_up.z
    nx -= dot * out_up.x; ny -= dot * out_up.y; nz -= dot * out_up.z
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (nLen < 0.001) { out_north.set(1, 0, 0) }
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
