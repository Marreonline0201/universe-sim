/**
 * SpectatorCamera.tsx — M72-1
 *
 * God-mode / spectator free-fly camera. Activated by pressing [G].
 * When active:
 *   - Takes over the Three.js camera
 *   - WASD + QE = move (forward/back/strafe/up/down)
 *   - Mouse = look (yaw + pitch)
 *   - Shift = speed boost (10x)
 *   - Scroll = adjust base speed
 *   - Player controls are suppressed (camera detached from player entity)
 *   - Shows a small "SPECTATOR" badge in top-center
 *
 * When deactivated (press G again):
 *   - Camera control returns to PlayerController
 *   - Player controls re-enabled
 *
 * Runs inside the R3F <Canvas> so it has access to useThree/useFrame.
 * The DOM overlay badge is rendered via a portal-free fixed div approach
 * (createPortal to document.body would be cleaner but adds complexity).
 *
 * Zero dependency on player systems beyond reading the initial camera position.
 */

import { useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'
import { spawnOrganismAt } from '../biology/SimulationIntegration'
import { PLANET_RADIUS } from '../world/SpherePlanet'

// ── Module-level state (shared with SpectatorBadge DOM component) ───────────

/** Whether spectator mode is currently active */
let _spectatorActive = false
/** Subscribers notified when spectator state changes */
const _listeners = new Set<(active: boolean) => void>()

export function isSpectatorActive(): boolean { return _spectatorActive }

export function subscribeSpectator(fn: (active: boolean) => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

/** Programmatically activate spectator mode (used by renderer bypass). */
export function requestSpectatorActivation() {
  // Dispatch a synthetic G keydown — picked up by SpectatorCamera's own listener
  // after isAdmin is set to true in the store.
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true }))
}

function setSpectatorActive(v: boolean) {
  _spectatorActive = v
  for (const fn of _listeners) fn(v)
}

// ── Speed settings ──────────────────────────────────────────────────────────

const BASE_SPEED = 50          // m/s at default scroll
const BOOST_MULT = 10          // shift multiplier
const MOUSE_SENS = 0.002
const MIN_SPEED  = 5
const MAX_SPEED  = 5000

// ── SpectatorCamera (runs inside Canvas) ────────────────────────────────────

export function SpectatorCamera() {
  const { camera } = useThree()

  const activeRef   = useRef(false)
  const keysRef     = useRef(new Set<string>())
  const yawRef      = useRef(0)
  const pitchRef    = useRef(0)
  const speedRef    = useRef(BASE_SPEED)

  // Scratch vectors — allocated once, reused every frame
  const _forward = useRef(new THREE.Vector3())
  const _right   = useRef(new THREE.Vector3())
  const _up      = useRef(new THREE.Vector3(0, 1, 0))
  const _move    = useRef(new THREE.Vector3())
  const _euler   = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  // M80: Scratch objects for organism seeding raycast
  const _rayDir = useRef(new THREE.Vector3())

  // Toggle on [G] key press — admin only
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Gate all spectator/seed keys behind admin flag
      if (!useGameStore.getState().isAdmin) return

      if (e.code === 'KeyG' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

        const next = !activeRef.current
        activeRef.current = next
        setSpectatorActive(next)

        if (next) {
          // Entering spectator: capture current camera orientation
          _euler.current.setFromQuaternion(camera.quaternion, 'YXZ')
          yawRef.current   = _euler.current.y
          pitchRef.current = _euler.current.x

          // Block player input
          useGameStore.getState().setInputBlocked(true)
        } else {
          // Leaving spectator: unblock player input
          useGameStore.getState().setInputBlocked(false)
        }
      }

      // M80: Press [O] to seed a new organism at camera look-at point on planet surface
      if (e.code === 'KeyO' && activeRef.current && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

        // Raycast from camera position along look direction to find planet surface
        const camPos = camera.position
        camera.getWorldDirection(_rayDir.current)
        const dir = _rayDir.current

        // Analytical ray-sphere intersection with planet (sphere at origin, radius PLANET_RADIUS)
        // Ray: P = camPos + t * dir
        // Sphere: |P|^2 = R^2
        // Solving: t^2(dir.dir) + 2t(camPos.dir) + (camPos.camPos - R^2) = 0
        const R = PLANET_RADIUS + 2  // spawn slightly above surface
        const a = dir.dot(dir)
        const b = 2 * camPos.dot(dir)
        const c = camPos.dot(camPos) - R * R
        const discriminant = b * b - 4 * a * c

        if (discriminant >= 0) {
          const sqrtD = Math.sqrt(discriminant)
          const t1 = (-b - sqrtD) / (2 * a)
          const t2 = (-b + sqrtD) / (2 * a)
          // Use nearest positive intersection
          const t = t1 > 0.1 ? t1 : t2 > 0.1 ? t2 : -1
          if (t > 0) {
            const spawnX = camPos.x + dir.x * t
            const spawnY = camPos.y + dir.y * t
            const spawnZ = camPos.z + dir.z * t
            spawnOrganismAt(spawnX, spawnY, spawnZ)
          }
        }
      }

      keysRef.current.add(e.code)
    }

    function onKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.code)
    }

    function onMouseMove(e: MouseEvent) {
      if (!activeRef.current) return
      // Only process mouse if pointer is locked (game is focused)
      if (!document.pointerLockElement) return
      yawRef.current   -= e.movementX * MOUSE_SENS
      pitchRef.current -= e.movementY * MOUSE_SENS
      pitchRef.current  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitchRef.current))
    }

    function onWheel(e: WheelEvent) {
      if (!activeRef.current) return
      const factor = e.deltaY > 0 ? 0.85 : 1.18
      speedRef.current = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speedRef.current * factor))
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('wheel', onWheel)
    }
  }, [camera])

  useFrame((_, delta) => {
    if (!activeRef.current) return

    // Clamp delta to prevent huge jumps on tab-back
    const dt = Math.min(delta, 0.1)

    const keys  = keysRef.current
    const speed = speedRef.current * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? BOOST_MULT : 1)

    // Build movement vector in camera-local space
    const move = _move.current.set(0, 0, 0)

    // Forward/Back (along camera look direction)
    camera.getWorldDirection(_forward.current)
    if (keys.has('KeyW')) move.add(_forward.current)
    if (keys.has('KeyS')) move.sub(_forward.current)

    // Strafe (right vector = cross(forward, worldUp))
    _right.current.crossVectors(_forward.current, _up.current).normalize()
    if (keys.has('KeyD')) move.add(_right.current)
    if (keys.has('KeyA')) move.sub(_right.current)

    // Vertical (world up/down)
    if (keys.has('KeyE') || keys.has('Space')) move.y += 1
    if (keys.has('KeyQ')) move.y -= 1

    // Apply movement
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt)
      camera.position.add(move)
    }

    // Apply rotation
    _euler.current.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    camera.quaternion.setFromEuler(_euler.current)
  })

  return null
}
