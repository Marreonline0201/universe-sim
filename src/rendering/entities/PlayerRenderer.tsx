/**
 * PlayerRenderer.tsx
 * Player mesh (third-person body) + equipped item mesh in hand.
 * Extracted from SceneRoot.tsx during M18 Track A (step A4).
 */

import * as THREE from 'three'
import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { usePlayerStore } from '../../store/playerStore'
import { Position, Rotation } from '../../ecs/world'
import { inventory } from '../../game/GameSingletons'
import type { PlayerController } from '../../player/PlayerController'

// ── EquippedItemMesh ──────────────────────────────────────────────────────────
// Renders a plain colored box at the player's right-hand position.
export function EquippedItemMesh({ entityId }: { entityId: number }) {
  const meshRef       = useRef<THREE.Mesh>(null)
  const _q            = useRef(new THREE.Quaternion())
  const _localOffset  = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!meshRef.current) return

    const eSlot = usePlayerStore.getState().equippedSlot
    const slot  = eSlot !== null ? inventory.getSlot(eSlot) : null

    if (!slot) {
      meshRef.current.visible = false
      return
    }
    meshRef.current.visible = true

    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]

    const q = _q.current
    q.set(
      Rotation.x[entityId],
      Rotation.y[entityId],
      Rotation.z[entityId],
      Rotation.w[entityId],
    )

    const localOffset = _localOffset.current
    localOffset.set(0.5, -0.3, 0.4).applyQuaternion(q)

    meshRef.current.position.set(px + localOffset.x, py + localOffset.y, pz + localOffset.z)
    meshRef.current.quaternion.copy(q)
  })

  return (
    <mesh ref={meshRef} visible={false}>
      <boxGeometry args={[0.08, 0.08, 0.45]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
  )
}

// ── PlayerMesh ──────────────────────────────────────────────────────────────
// Visible body in third-person mode with walk-cycle animation.
export function PlayerMesh({
  entityId,
  controllerRef,
}: {
  entityId: number
  controllerRef: RefObject<PlayerController | null>
}) {
  const rootRef  = useRef<THREE.Group>(null)
  const walkTime = useRef(0)
  const lastPos  = useRef({ x: 0, y: 0, z: 0 })
  const lLegRef  = useRef<THREE.Group>(null)
  const rLegRef  = useRef<THREE.Group>(null)
  const lArmRef  = useRef<THREE.Group>(null)
  const rArmRef  = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!rootRef.current) return

    rootRef.current.visible = controllerRef.current?.cameraMode !== 'first_person'

    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]

    const dx = px - lastPos.current.x
    const dy = py - lastPos.current.y
    const dz = pz - lastPos.current.z
    const speed = Math.sqrt(dx * dx + dy * dy + dz * dz) / delta
    lastPos.current = { x: px, y: py, z: pz }

    const isMoving = speed > 0.3
    if (isMoving) walkTime.current += delta * Math.min(speed, 14) * 1.6

    const swing = isMoving ? Math.sin(walkTime.current) * 0.55 : 0

    if (lLegRef.current)  lLegRef.current.rotation.x  =  swing
    if (rLegRef.current)  rLegRef.current.rotation.x  = -swing
    if (lArmRef.current)  lArmRef.current.rotation.x  = -swing * 0.6
    if (rArmRef.current)  rArmRef.current.rotation.x  =  swing * 0.6

    rootRef.current.position.set(px, py, pz)
    rootRef.current.quaternion.set(
      Rotation.x[entityId],
      Rotation.y[entityId],
      Rotation.z[entityId],
      Rotation.w[entityId] || 1,
    )
  })

  return (
    <group ref={rootRef}>
      <group position={[0, -0.33, 0]}>
      {/* Torso */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color="#3a7ecf" />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color="#2a4a7a" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color="#f5c5a3" />
      </mesh>
      <mesh position={[0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.1, 1.03, -0.17]} castShadow>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color="#f5c5a3" />
      </mesh>
      {/* Left arm */}
      <group ref={lArmRef} position={[-0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color="#3a7ecf" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color="#f5c5a3" />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rArmRef} position={[0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color="#3a7ecf" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color="#f5c5a3" />
        </mesh>
      </group>
      {/* Left leg */}
      <group ref={lLegRef} position={[-0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color="#2a4a7a" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      {/* Right leg */}
      <group ref={rLegRef} position={[0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color="#2a4a7a" />
        </mesh>
        <mesh position={[0, -0.44, 0]} castShadow>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      </group>{/* end offset group */}
    </group>
  )
}
