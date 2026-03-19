import { Vector3, Euler, type Camera } from 'three'
import { world, Position, Velocity, Rotation } from '../ecs/world'

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

const WALK_SPEED   = 5.0   // m/s
const SPRINT_MULT  = 2.5
const CROUCH_MULT  = 0.4
const JUMP_IMPULSE = 6.0   // m/s upward
const MOUSE_SENS   = 0.002 // radians per pixel

const THIRD_PERSON_DIST_DEFAULT = 6   // meters behind player
const THIRD_PERSON_DIST_MIN     = 2
const THIRD_PERSON_DIST_MAX     = 20

/**
 * PlayerController
 *
 * Handles keyboard + mouse input, translates into entity velocity (ECS).
 * Camera follows entity in first/third-person mode, or orbits freely.
 *
 * Pointer Lock API is used for mouse look — must be requested after a user gesture.
 */
export class PlayerController {
  private input: InputState = this.emptyInput()
  cameraMode: CameraMode = 'third_person'

  private keys = new Set<string>()
  private yaw   = 0   // radians — horizontal look
  private pitch = 0   // radians — vertical look

  private thirdPersonDist = THIRD_PERSON_DIST_DEFAULT
  private onGround = false

  // Cached vectors to avoid GC pressure
  private readonly _move  = new Vector3()
  private readonly _camPos = new Vector3()
  private readonly _euler = new Euler(0, 0, 0, 'YXZ')

  private boundKeyDown: (e: KeyboardEvent) => void
  private boundKeyUp:   (e: KeyboardEvent) => void
  private boundMouseMove: (e: MouseEvent) => void
  private boundWheel: (e: WheelEvent) => void

  constructor(private entityId: number) {
    this.boundKeyDown  = (e) => this.onKeyDown(e)
    this.boundKeyUp    = (e) => this.onKeyUp(e)
    this.boundMouseMove = (e) => this.onMouseMove(e)
    this.boundWheel    = (e) => this.onWheel(e)

    this.bindKeyboard()
    this.bindMouse()
  }

  /**
   * Call once per frame with the simulation delta-time and the Three.js camera.
   * Updates entity velocity via ECS and repositions the camera.
   */
  update(dt: number, camera: Camera): void {
    this.pollInput()
    this.applyMovement(dt)
    this.updateCamera(camera)
    // Reset per-frame mouse delta
    this.input.mouseX = 0
    this.input.mouseY = 0
    this.input.scrollDelta = 0
  }

  /** Request pointer lock (call from a click handler) */
  requestPointerLock(): void {
    document.body.requestPointerLock()
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundKeyDown)
    document.removeEventListener('keyup',   this.boundKeyUp)
    document.removeEventListener('mousemove', this.boundMouseMove)
    document.removeEventListener('wheel', this.boundWheel)
    document.exitPointerLock?.()
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private bindKeyboard(): void {
    document.addEventListener('keydown', this.boundKeyDown)
    document.addEventListener('keyup',   this.boundKeyUp)
  }

  private bindMouse(): void {
    document.addEventListener('mousemove', this.boundMouseMove)
    document.addEventListener('wheel', this.boundWheel, { passive: true })
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.code)
    // Toggle camera mode
    if (e.code === 'KeyV') this.cycleCameraMode()
    // Prevent browser shortcuts from interfering
    if (['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
      e.preventDefault()
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code)
  }

  private onMouseMove(e: MouseEvent): void {
    if (document.pointerLockElement) {
      this.input.mouseX += e.movementX
      this.input.mouseY += e.movementY
    }
  }

  private onWheel(e: WheelEvent): void {
    this.input.scrollDelta += e.deltaY
  }

  private pollInput(): void {
    const k = this.keys
    this.input.forward   = k.has('KeyW') || k.has('ArrowUp')
    this.input.backward  = k.has('KeyS') || k.has('ArrowDown')
    this.input.left      = k.has('KeyA') || k.has('ArrowLeft')
    this.input.right     = k.has('KeyD') || k.has('ArrowRight')
    this.input.jump      = k.has('Space')
    this.input.sprint    = k.has('ShiftLeft') || k.has('ShiftRight')
    this.input.crouch    = k.has('ControlLeft') || k.has('KeyC')
    this.input.interact  = k.has('KeyE') || k.has('KeyF')
    this.input.attack    = k.has('MouseLeft') || k.has('KeyQ')
  }

  // ── Movement ───────────────────────────────────────────────────────────────

  private applyMovement(dt: number): void {
    const inp = this.input

    let speed = WALK_SPEED
    if (inp.sprint)  speed *= SPRINT_MULT
    if (inp.crouch)  speed *= CROUCH_MULT

    // Movement relative to yaw (camera heading)
    const sinYaw = Math.sin(this.yaw)
    const cosYaw = Math.cos(this.yaw)

    let mx = 0, mz = 0
    if (inp.forward)  { mx -= sinYaw; mz -= cosYaw }
    if (inp.backward) { mx += sinYaw; mz += cosYaw }
    if (inp.left)     { mx -= cosYaw; mz += sinYaw }
    if (inp.right)    { mx += cosYaw; mz -= sinYaw }

    // Normalise diagonal movement
    const len = Math.sqrt(mx * mx + mz * mz)
    if (len > 0) { mx = (mx / len) * speed; mz = (mz / len) * speed }

    Velocity.x[this.entityId] = mx
    Velocity.z[this.entityId] = mz

    // Jump
    if (inp.jump && this.onGround) {
      Velocity.y[this.entityId] = JUMP_IMPULSE
      this.onGround = false
    }

    // Gravity integration — floor at y=0.9 (capsule half-height so bottom touches ground)
    Velocity.y[this.entityId] -= 9.81 * dt
    if (Position.y[this.entityId] <= 0.9) {
      Position.y[this.entityId] = 0.9
      Velocity.y[this.entityId] = 0
      this.onGround = true
    }

    // Update rotation quaternion to face movement direction
    if (len > 0) {
      Rotation.x[this.entityId] = 0
      Rotation.y[this.entityId] = Math.sin(this.yaw / 2)
      Rotation.z[this.entityId] = 0
      Rotation.w[this.entityId] = Math.cos(this.yaw / 2)
    }

    // Mouse look
    this.yaw   -= inp.mouseX * MOUSE_SENS
    this.pitch -= inp.mouseY * MOUSE_SENS
    this.pitch  = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch))

    // Scroll to change third-person distance
    if (this.cameraMode === 'third_person') {
      this.thirdPersonDist += inp.scrollDelta * 0.01
      this.thirdPersonDist  = Math.max(THIRD_PERSON_DIST_MIN, Math.min(THIRD_PERSON_DIST_MAX, this.thirdPersonDist))
    }
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private updateCamera(camera: Camera): void {
    const ex = Position.x[this.entityId]
    const ey = Position.y[this.entityId]
    const ez = Position.z[this.entityId]

    switch (this.cameraMode) {
      case 'first_person': {
        // Eyes at creature head height
        camera.position.set(ex, ey + 1.6, ez)
        this._euler.set(this.pitch, this.yaw, 0, 'YXZ')
        camera.rotation.copy(this._euler)
        break
      }
      case 'third_person': {
        // Camera orbits behind and above the player
        const d = this.thirdPersonDist
        const camX = ex + Math.sin(this.yaw) * d
        const camY = ey + d * 0.5 + Math.sin(this.pitch) * d
        const camZ = ez + Math.cos(this.yaw) * d
        camera.position.set(camX, camY, camZ)
        camera.lookAt(ex, ey + 1.0, ez)
        break
      }
      case 'orbit': {
        // Free orbit (no entity lock — only yaw/pitch/scroll)
        const orbitD = this.thirdPersonDist * 2
        camera.position.set(
          ex + Math.sin(this.yaw) * Math.cos(this.pitch) * orbitD,
          ey + Math.sin(this.pitch) * orbitD,
          ez + Math.cos(this.yaw) * Math.cos(this.pitch) * orbitD
        )
        camera.lookAt(ex, ey, ez)
        break
      }
    }
  }

  private cycleCameraMode(): void {
    const modes: CameraMode[] = ['third_person', 'first_person', 'orbit']
    const idx = modes.indexOf(this.cameraMode)
    this.cameraMode = modes[(idx + 1) % modes.length]
  }

  private emptyInput(): InputState {
    return {
      forward: false, backward: false,
      left: false, right: false,
      jump: false, sprint: false, crouch: false,
      interact: false, attack: false,
      mouseX: 0, mouseY: 0, scrollDelta: 0,
    }
  }
}
