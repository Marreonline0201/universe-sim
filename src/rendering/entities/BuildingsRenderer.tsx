/**
 * BuildingsRenderer.tsx
 * Building ghost (placement preview) + placed buildings renderer.
 * Extracted from SceneRoot.tsx during M18 Track A (step A6).
 */

import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '../../store/gameStore'
import { Position } from '../../ecs/world'
import { BUILDING_TYPES } from '../../civilization/BuildingSystem'
import { buildingSystem } from '../../game/GameSingletons'
import { surfaceRadiusAt, PLANET_RADIUS } from '../../world/SpherePlanet'

// Scratch objects for BuildingGhost
const _ghostPlayerPos = new THREE.Vector3()
const _ghostPlayerUp  = new THREE.Vector3()
const _ghostDir       = new THREE.Vector3()
const _ghostYUp       = new THREE.Vector3(0, 1, 0)

export function BuildingGhost({ entityId }: { entityId: number }) {
  const { camera } = useThree()
  const placementMode = useGameStore(s => s.placementMode)
  const ghostRef = useRef<THREE.Group>(null)
  const fwdVec = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!ghostRef.current || !placementMode) return
    const btype = BUILDING_TYPES.find(t => t.id === placementMode)
    if (!btype) return
    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]
    _ghostPlayerPos.set(px, py, pz)
    _ghostPlayerUp.copy(_ghostPlayerPos).normalize()
    fwdVec.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
    fwdVec.current.addScaledVector(_ghostPlayerUp, -fwdVec.current.dot(_ghostPlayerUp))
    if (fwdVec.current.lengthSq() < 0.001) fwdVec.current.set(0, 0, -1)
    else fwdVec.current.normalize()
    _ghostDir.copy(_ghostPlayerPos).addScaledVector(fwdVec.current, 6).normalize()
    const ghostSR = surfaceRadiusAt(_ghostDir.x * PLANET_RADIUS, _ghostDir.y * PLANET_RADIUS, _ghostDir.z * PLANET_RADIUS)
    const halfH = btype.size[1] / 2
    ghostRef.current.position.set(_ghostDir.x * (ghostSR + halfH), _ghostDir.y * (ghostSR + halfH), _ghostDir.z * (ghostSR + halfH))
    ghostRef.current.quaternion.setFromUnitVectors(_ghostYUp, _ghostDir)
  })

  if (!placementMode) return null
  const btype = BUILDING_TYPES.find(t => t.id === placementMode)
  if (!btype) return null
  const [w, h, d] = btype.size

  return (
    <group ref={ghostRef}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#4488ff" opacity={0.25} transparent />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
        <lineBasicMaterial color="#88aaff" />
      </lineSegments>
    </group>
  )
}

const BUILDING_COLORS: Record<number, string> = {
  0: '#8B7355', 1: '#B8860B', 2: '#7A8070', 3: '#9A9A8A', 4: '#6A7090',
  5: '#8A6A4A', 6: '#5A7A9A', 7: '#4A5A8A', 8: '#7A4A9A', 9: '#9A4A7A',
}

export function PlacedBuildingsRenderer() {
  const buildVersion = useGameStore(s => s.buildVersion)
  const buildings = buildingSystem.getAllBuildings()
  return (
    <>
      {buildings.map(b => {
        const btype = BUILDING_TYPES.find(t => t.id === b.typeId)
        if (!btype) return null
        const [w, h, d] = btype.size
        const color = BUILDING_COLORS[btype.tier] ?? '#888'
        const [bx, by, bz] = b.position
        const bLen = Math.sqrt(bx * bx + by * by + bz * bz)
        const bNorm = bLen > 0.01 ? new THREE.Vector3(bx / bLen, by / bLen, bz / bLen) : new THREE.Vector3(0, 1, 0)
        const bQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bNorm)
        const cx = bx + bNorm.x * h / 2
        const cy = by + bNorm.y * h / 2
        const cz = bz + bNorm.z * h / 2
        return (
          <group key={b.id} position={[cx, cy, cz]} quaternion={bQuat}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
            </mesh>
            <mesh position={[0, h / 2 + 0.15, 0]} castShadow>
              <boxGeometry args={[w + 0.4, 0.3, d + 0.4]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}
