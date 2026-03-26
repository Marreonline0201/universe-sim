/**
 * ServerNpcsRenderer.tsx
 * Renders NPCs received from the multiplayer server with animated walk cycles.
 * Extracted from SceneRoot.tsx during M18 Track A (step A2).
 */

import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useMultiplayerStore } from '../../store/multiplayerStore'
import type { RemoteNpc } from '../../store/multiplayerStore'
import { surfaceRadiusAt } from '../../world/SpherePlanet'
import { NPC_SKIN_TONES, NPC_SHIRT_COLS, NPC_PANTS_COLS } from './HumanoidFigure'

function AnimatedNpcMesh({ npc, skinColor, shirtColor, pantsColor }: {
  npc: RemoteNpc; skinColor: string; shirtColor: string; pantsColor: string
}) {
  const groupRef = useRef<THREE.Group>(null)
  const lLegRef  = useRef<THREE.Group>(null)
  const rLegRef  = useRef<THREE.Group>(null)
  const lArmRef  = useRef<THREE.Group>(null)
  const rArmRef  = useRef<THREE.Group>(null)
  const walkRef  = useRef(0)
  const prevXZ   = useRef({ x: npc.x, z: npc.z })

  useFrame((_, delta) => {
    const root = groupRef.current
    if (!root) return

    // Snap to terrain surface using sphere-aware surfaceRadiusAt.
    const sr = surfaceRadiusAt(npc.x, npc.y, npc.z)
    const len = Math.sqrt(npc.x * npc.x + npc.y * npc.y + npc.z * npc.z)
    const nx = len > 1 ? npc.x / len : 0
    const ny = len > 1 ? npc.y / len : 1
    const nz = len > 1 ? npc.z / len : 0
    const wx = nx * (sr + 0.9)
    const wy = ny * (sr + 0.9)
    const wz = nz * (sr + 0.9)
    root.position.set(wx, wy, wz)

    // Orient upright on sphere surface
    const up2 = new THREE.Vector3(nx, ny, nz)
    const north2 = new THREE.Vector3(0, 0, 1)
    north2.addScaledVector(up2, -north2.dot(up2))
    if (north2.lengthSq() < 0.001) north2.set(1, 0, 0)
    north2.normalize()
    const east2 = new THREE.Vector3().crossVectors(up2, north2).normalize()

    // Detect movement for walk cycle
    const dx = npc.x - prevXZ.current.x
    const dz = npc.z - prevXZ.current.z
    const speed = Math.sqrt(dx * dx + dz * dz) / Math.max(delta, 0.001)
    prevXZ.current = { x: npc.x, z: npc.z }

    // Build facing direction from movement or keep last yaw
    let fwdX = -north2.x, fwdY = -north2.y, fwdZ = -north2.z
    if (speed > 0.5 && (Math.abs(dx) + Math.abs(dz)) > 0) {
      const flatFwd = new THREE.Vector3(dx, 0, dz).normalize()
      fwdX = flatFwd.x; fwdY = 0; fwdZ = flatFwd.z
    }
    const fwd2 = new THREE.Vector3(fwdX, fwdY, fwdZ)
    fwd2.addScaledVector(up2, -fwd2.dot(up2))
    if (fwd2.lengthSq() > 0.001) {
      fwd2.normalize()
      const mat = new THREE.Matrix4().set(
        east2.x, up2.x, -fwd2.x, 0,
        east2.y, up2.y, -fwd2.y, 0,
        east2.z, up2.z, -fwd2.z, 0,
        0,       0,     0,       1,
      )
      root.quaternion.setFromRotationMatrix(mat)
    }

    const moving = speed > 0.3 && npc.state !== 'eat' && npc.state !== 'rest'
    if (moving) walkRef.current += delta * Math.min(speed, 8) * 1.8
    const swing = moving ? Math.sin(walkRef.current) * 0.5 : 0

    if (lLegRef.current) lLegRef.current.rotation.x =  swing
    if (rLegRef.current) rLegRef.current.rotation.x = -swing
    if (lArmRef.current) lArmRef.current.rotation.x = -swing * 0.55
    if (rArmRef.current) rArmRef.current.rotation.x =  swing * 0.55
  })

  // Indicator dot above head shows state
  const dotColor =
    npc.state === 'eat'       ? '#ff6644' :
    npc.state === 'rest'      ? '#4488ff' :
    npc.state === 'socialize' ? '#ffcc00' :
    npc.state === 'gather'    ? '#44dd88' : null

  return (
    <group ref={groupRef}>
      {dotColor && (
        <mesh position={[0, 1.55, 0]}>
          <sphereGeometry args={[0.12, 6, 6]} />
          <meshStandardMaterial color={dotColor} emissive={dotColor} emissiveIntensity={0.6} />
        </mesh>
      )}
      {/* Torso */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.22]} />
        <meshStandardMaterial color={shirtColor} />
      </mesh>
      {/* Hips */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.22]} />
        <meshStandardMaterial color={pantsColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.34, 0.32]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      <mesh position={[0.1, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[-0.1, 1.03, -0.17]}>
        <boxGeometry args={[0.07, 0.05, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Left arm */}
      <group ref={lArmRef} position={[-0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Right arm */}
      <group ref={rArmRef} position={[0.30, 0.75, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.14]} />
          <meshStandardMaterial color={shirtColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.12, 0.30, 0.12]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
      {/* Left leg */}
      <group ref={lLegRef} position={[-0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
      {/* Right leg */}
      <group ref={rLegRef} position={[0.13, 0.09, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.16]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0, -0.44, 0]}>
          <boxGeometry args={[0.14, 0.32, 0.14]} />
          <meshStandardMaterial color="#4a3a2a" />
        </mesh>
        <mesh position={[0, -0.62, -0.04]}>
          <boxGeometry args={[0.14, 0.08, 0.22]} />
          <meshStandardMaterial color="#2a2010" />
        </mesh>
      </group>
    </group>
  )
}

export function ServerNpcsRenderer() {
  const remoteNpcs = useMultiplayerStore(s => s.remoteNpcs)
  return (
    <>
      {remoteNpcs.map((npc, idx) => {
        const si = idx % NPC_SKIN_TONES.length
        return (
          <AnimatedNpcMesh
            key={npc.id}
            npc={npc}
            skinColor={NPC_SKIN_TONES[si]}
            shirtColor={NPC_SHIRT_COLS[si]}
            pantsColor={NPC_PANTS_COLS[si]}
          />
        )
      })}
    </>
  )
}
