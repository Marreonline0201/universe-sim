// ── RemotePlayersRenderer ──────────────────────────────────────────────────────
// Renders other connected players as coloured capsules with username labels.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useAuth } from '@clerk/react'

// Stable capsule geometry shared across all player meshes
const CAPSULE_GEO = new THREE.CapsuleGeometry(0.35, 1.2, 4, 8)
const CAPSULE_MAT = new THREE.MeshStandardMaterial({ color: '#3498db', roughness: 0.7 })

function RemotePlayer({ userId, username, x, y, z, health, murderCount = 0 }: {
  userId: string
  username: string
  x: number
  y: number
  z: number
  health: number
  murderCount?: number
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const groupRef = useRef<THREE.Group>(null!)

  // Smoothly interpolate to server position
  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    g.position.lerp(new THREE.Vector3(x, y + 0.6, z), Math.min(1, dt * 12))
  })

  return (
    <group ref={groupRef} position={[x, y + 0.6, z]}>
      <mesh ref={meshRef} geometry={CAPSULE_GEO} material={CAPSULE_MAT} />
      {/* Health indicator ring */}
      <mesh rotation={[0, 0, 0]} position={[0, 1.2, 0]}>
        <torusGeometry args={[0.4, 0.04, 8, 24, health * Math.PI * 2]} />
        <meshBasicMaterial color={health > 0.5 ? '#2ecc71' : health > 0.25 ? '#f39c12' : '#e74c3c'} />
      </mesh>
      {/* Username label — skull prefix for outlaws (murderCount > 0) */}
      <Text
        position={[0, 1.8, 0]}
        fontSize={0.25}
        color={murderCount > 0 ? '#e74c3c' : '#ffffff'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#000000"
      >
        {murderCount > 0 ? `[${murderCount}] ${username}` : username}
      </Text>
      {/* Skull indicator sphere — red orb above name for killers */}
      {murderCount > 0 && (
        <mesh position={[0, 2.15, 0]}>
          <sphereGeometry args={[0.1, 6, 6]} />
          <meshStandardMaterial color="#e74c3c" emissive="#c0392b" emissiveIntensity={0.8} />
        </mesh>
      )}
    </group>
  )
}

export function RemotePlayersRenderer() {
  const { userId: myUserId } = useAuth()
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)

  return (
    <>
      {Array.from(remotePlayers.values())
        .filter(p => p.userId !== myUserId)
        .map(p => (
          <RemotePlayer key={p.userId} {...p} />
        ))}
    </>
  )
}
