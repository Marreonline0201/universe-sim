/**
 * RaftRenderer.tsx — M28 Track B
 *
 * Renders all placed rafts as flat wooden platforms (3×3m, plank-shaped boxes).
 * When a raft is mounted the renderer tracks the raft's buoyancy state from RaftSystem.
 *
 * Also renders a ghost for the "raft" placementMode (water-surface aligned).
 */

import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { buildingSystem } from '../game/GameSingletons'
import { getRaftState } from '../game/RaftSystem'
import { useGameStore } from '../store/gameStore'
import { PLANET_RADIUS, SEA_LEVEL } from '../world/SpherePlanet'

// Scratch quaternion helpers
const _yUp    = new THREE.Vector3(0, 1, 0)
const _qSurf  = new THREE.Quaternion()
const _qPitch = new THREE.Quaternion()
const _qRoll  = new THREE.Quaternion()
const _qFinal = new THREE.Quaternion()
const _up     = new THREE.Vector3()
const _north  = new THREE.Vector3()
const _east   = new THREE.Vector3()
const _axPitch = new THREE.Vector3()
const _axRoll  = new THREE.Vector3()

/**
 * Single raft mesh: flat wooden platform, 3×3m, made of planks.
 * Uses instanced box geometries.
 */
function RaftPlatform() {
  // 5 planks along X axis, each 3m long × 0.35m wide × 0.2m tall
  const planks: [number, number, number][] = [
    [-1.0, 0, 0],
    [-0.5, 0, 0],
    [ 0.0, 0, 0],
    [ 0.5, 0, 0],
    [ 1.0, 0, 0],
  ]
  // Cross-lash ropes at front and back
  const lashZ: number[] = [-1.1, -0.3, 0.3, 1.1]

  return (
    <group>
      {/* Planks — laid along Z (length of raft) */}
      {planks.map(([ox], i) => (
        <mesh key={`plank-${i}`} position={[ox, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.32, 0.18, 3.0]} />
          <meshStandardMaterial color="#7a5c2e" roughness={0.95} metalness={0} />
        </mesh>
      ))}
      {/* Lashing ropes */}
      {lashZ.map((oz, i) => (
        <mesh key={`lash-${i}`} position={[0, 0.1, oz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 2.2, 6]} />
          <meshStandardMaterial color="#a07040" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Renders all placed raft buildings, tracking buoyancy for the mounted one.
 */
export function PlacedRaftsRenderer() {
  const buildVersion = useGameStore(s => s.buildVersion)
  const rafts = buildingSystem.getAllBuildings().filter(b => b.typeId === 'raft')
  return (
    <>
      {rafts.map(b => (
        <MountedRaftMesh key={b.id} buildingId={b.id} initialPos={b.position} />
      ))}
    </>
  )
}

function MountedRaftMesh({ buildingId, initialPos }: { buildingId: number; initialPos: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!groupRef.current) return
    const raft = getRaftState()

    // Use live raft position if mounted, otherwise use stored building position
    let pos: [number, number, number]
    let pitch = 0
    let roll  = 0
    let heading = 0

    if (raft.mounted && raft.raftBuildingId === buildingId) {
      pos     = raft.raftPos
      pitch   = raft.pitch
      roll    = raft.roll
      heading = raft.heading
    } else {
      // Unmounted: float gently at sea level based on building position direction
      const b = buildingSystem.getBuilding(buildingId)
      if (!b) { groupRef.current.visible = false; return }
      const norm = new THREE.Vector3(...b.position).normalize()
      const r = PLANET_RADIUS + SEA_LEVEL + 0.5
      pos = [norm.x * r, norm.y * r, norm.z * r]
    }

    // Build orientation: surface normal + heading + buoyancy pitch/roll
    _up.set(...pos).normalize()
    _north.set(0, 0, 1).addScaledVector(_up, -_up.z).normalize()
    if (_north.lengthSq() < 0.001) _north.set(1, 0, 0)
    _east.crossVectors(_north, _up).normalize()

    // Surface alignment quaternion
    _qSurf.setFromUnitVectors(_yUp, _up)

    // Heading rotation around surface normal
    const _qHeading = new THREE.Quaternion().setFromAxisAngle(_up, heading)

    // Pitch around east axis (after heading)
    _axPitch.copy(_east).applyQuaternion(_qHeading)
    _qPitch.setFromAxisAngle(_axPitch, pitch)

    // Roll around forward (fwd = north rotated by heading)
    const sinH = Math.sin(heading), cosH = Math.cos(heading)
    _axRoll.set(
      _north.x * cosH + _east.x * sinH,
      _north.y * cosH + _east.y * sinH,
      _north.z * cosH + _east.z * sinH,
    )
    _qRoll.setFromAxisAngle(_axRoll, roll)

    _qFinal.copy(_qRoll).multiply(_qPitch).multiply(_qHeading).multiply(_qSurf)

    groupRef.current.position.set(...pos)
    groupRef.current.quaternion.copy(_qFinal)
    groupRef.current.visible = true
  })

  return (
    <group ref={groupRef} visible={false}>
      <RaftPlatform />
    </group>
  )
}
