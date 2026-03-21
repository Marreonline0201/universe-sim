// ── SailingRenderer.tsx ─────────────────────────────────────────────────────────
// M10 Track B: 3D vessel mesh — renders raft or sailing boat under the player
// when sailing mode is active.
//
// Raft: flat log platform (5 planks side by side), tied with rope.
// Sailing boat: sleek hull with a mast and sail.
//
// The mesh tracks ECS player position every frame (useFrame).

import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Position } from '../ecs/world'
import { getSailingState } from '../world/SailingSystem'
import { PLANET_RADIUS } from '../world/SpherePlanet'

// ── Scratch objects ────────────────────────────────────────────────────────────
const _up = new THREE.Vector3()
const _north = new THREE.Vector3(0, 1, 0)
const _east = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _yUp = new THREE.Vector3(0, 1, 0)
const _q = new THREE.Quaternion()
const _qHeading = new THREE.Quaternion()
const _qSurface = new THREE.Quaternion()

function RaftMesh() {
  return (
    <group>
      {/* 5 logs */}
      {[-1.0, -0.5, 0, 0.5, 1.0].map((ox, i) => (
        <mesh key={i} position={[ox, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.18, 0.18, 3.2, 8]} />
          <meshStandardMaterial color="#7a5c2e" roughness={0.95} metalness={0} />
        </mesh>
      ))}
      {/* Cross-lashing ropes */}
      {[-0.9, 0.9].map((oz, i) => (
        <mesh key={i} position={[0, 0.05, oz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
          <meshStandardMaterial color="#a07840" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function SailingBoatMesh() {
  return (
    <group>
      {/* Hull */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.6, 4.5]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Bow taper */}
      <mesh position={[0, 0, 2.1]} castShadow>
        <coneGeometry args={[0.8, 1.0, 4]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.8} />
      </mesh>
      {/* Mast */}
      <mesh position={[0, 2.0, -0.3]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 4.2, 8]} />
        <meshStandardMaterial color="#8B6914" roughness={0.85} />
      </mesh>
      {/* Sail (white canvas) */}
      <mesh position={[0, 1.8, -0.3]}>
        <planeGeometry args={[2.2, 3.2]} />
        <meshStandardMaterial
          color="#f5f0e8"
          roughness={0.9}
          metalness={0}
          side={THREE.DoubleSide}
          transparent
          opacity={0.92}
        />
      </mesh>
      {/* Boom */}
      <mesh position={[0, 0.2, -0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
        <meshStandardMaterial color="#8B6914" roughness={0.85} />
      </mesh>
      {/* Deck boards */}
      {[-0.5, 0, 0.5].map((oz, i) => (
        <mesh key={i} position={[0, 0.31, oz]} receiveShadow>
          <boxGeometry args={[1.4, 0.04, 1.3]} />
          <meshStandardMaterial color="#9a7040" roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

export function SailingRenderer({ entityId }: { entityId: number }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!groupRef.current) return
    const sail = getSailingState()

    if (!sail.active || !sail.vesselType) {
      groupRef.current.visible = false
      return
    }

    groupRef.current.visible = true

    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]

    // Surface normal (up direction on sphere)
    _up.set(px, py, pz).normalize()

    // Align vessel to surface
    _qSurface.setFromUnitVectors(_yUp, _up)

    // Apply heading rotation around surface normal
    _qHeading.setFromAxisAngle(_up, -(sail.heading * Math.PI) / 180)

    _q.copy(_qHeading).multiply(_qSurface)

    // Position vessel slightly below player (0.3m below player feet)
    const r = PLANET_RADIUS + Math.max(0, 0) + 0.3
    groupRef.current.position.set(
      _up.x * r,
      _up.y * r,
      _up.z * r,
    )
    groupRef.current.quaternion.copy(_q)
  })

  // Inner refs for per-vessel groups — toggled in useFrame to avoid React re-renders
  const raftRef  = useRef<THREE.Group>(null)
  const boatRef  = useRef<THREE.Group>(null)

  // Extend the outer useFrame to also toggle vessel sub-groups
  useFrame(() => {
    if (!raftRef.current || !boatRef.current) return
    const s = getSailingState()
    raftRef.current.visible  = s.active && s.vesselType === 'raft'
    boatRef.current.visible  = s.active && s.vesselType === 'sailing_boat'
  })

  return (
    <group ref={groupRef} visible={false}>
      <group ref={raftRef} visible={false}><RaftMesh /></group>
      <group ref={boatRef} visible={false}><SailingBoatMesh /></group>
    </group>
  )
}
