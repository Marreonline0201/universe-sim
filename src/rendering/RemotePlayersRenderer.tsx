// ── RemotePlayersRenderer ──────────────────────────────────────────────────────
// Renders other connected players as coloured capsules with username labels.
// M7 T2: Wanted players (murderCount >= 5) show skull icon + bounty amount.
// M26 Track B: Emote chat bubbles float above players when they emote.

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useOutlawStore } from '../store/outlawStore'
import { useAuth } from '@clerk/react'
import { getRemoteEmote } from '../game/EmoteSystem'

const WANTED_THRESHOLD = 5

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
  const meshRef  = useRef<THREE.Mesh>(null!)
  const groupRef = useRef<THREE.Group>(null!)

  // Look up bounty reward from outlaw store (populated by BOUNTY_POSTED)
  const bountyEntry = useOutlawStore(s => s.getWantedEntry(userId))
  const isWanted    = murderCount >= WANTED_THRESHOLD

  // M26 Track B: poll emote state — throttled to ~4 Hz to avoid excess re-renders
  const [currentEmote, setCurrentEmote] = useState<string | null>(null)
  const emoteCheckRef = useRef(0)

  // Smoothly interpolate to server position
  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return
    g.position.lerp(new THREE.Vector3(x, y + 0.6, z), Math.min(1, dt * 12))

    emoteCheckRef.current += dt
    if (emoteCheckRef.current >= 0.25) {
      emoteCheckRef.current = 0
      const emoji = getRemoteEmote(userId)
      setCurrentEmote(prev => prev !== emoji ? emoji : prev)
    }
  })

  // Capsule colour: wanted players glow red, ordinary outlaws are orange-tinted
  const capsuleMat = isWanted
    ? new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.6, emissive: '#5a1010', emissiveIntensity: 0.3 })
    : murderCount > 0
      ? new THREE.MeshStandardMaterial({ color: '#e67e22', roughness: 0.7 })
      : CAPSULE_MAT

  return (
    <group ref={groupRef} position={[x, y + 0.6, z]}>
      <mesh ref={meshRef} geometry={CAPSULE_GEO} material={capsuleMat} />

      {/* Health indicator ring */}
      <mesh rotation={[0, 0, 0]} position={[0, 1.2, 0]}>
        <torusGeometry args={[0.4, 0.04, 8, 24, health * Math.PI * 2]} />
        <meshBasicMaterial color={health > 0.5 ? '#2ecc71' : health > 0.25 ? '#f39c12' : '#e74c3c'} />
      </mesh>

      {/* Username label — kill count prefix for outlaws */}
      <Text
        position={[0, 1.85, 0]}
        fontSize={0.22}
        color={isWanted ? '#ff4444' : murderCount > 0 ? '#e67e22' : '#ffffff'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#000000"
      >
        {murderCount > 0 ? `[${murderCount}] ${username}` : username}
      </Text>

      {/* WANTED bounty label — shown above name for murderCount >= 5 */}
      {isWanted && (
        <Text
          position={[0, 2.25, 0]}
          fontSize={0.18}
          color="#ffd700"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#000000"
        >
          {`WANTED: ${bountyEntry?.reward ?? '?'} copper`}
        </Text>
      )}

      {/* Skull indicator — pulsing red orb above name */}
      {murderCount > 0 && (
        <mesh position={[0, isWanted ? 2.6 : 2.15, 0]}>
          <sphereGeometry args={[isWanted ? 0.14 : 0.1, 6, 6]} />
          <meshStandardMaterial
            color={isWanted ? '#ff0000' : '#e74c3c'}
            emissive={isWanted ? '#ff0000' : '#c0392b'}
            emissiveIntensity={isWanted ? 1.4 : 0.8}
          />
        </mesh>
      )}

      {/* M26 Track B: Emote chat bubble — floats above head for 3s */}
      {currentEmote && (
        <Text
          position={[0, isWanted ? 3.1 : 2.65, 0]}
          fontSize={0.52}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.06}
          outlineColor="#ffffff"
        >
          {currentEmote}
        </Text>
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
