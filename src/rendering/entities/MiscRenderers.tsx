/**
 * MiscRenderers.tsx
 * Death loot drops, bedroll, weather wrapper, transit wrappers, planet selector.
 * Extracted from SceneRoot.tsx during M18 Track A (step A7).
 */

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { usePlayerStore } from '../../store/playerStore'
import { useTransitStore } from '../../store/transitStore'
import { Position } from '../../ecs/world'
import {
  DEATH_LOOT_DROPS,
  gatheredLootIds,
  placedBedrollAnchor,
} from '../../game/DeathSystem'
import { WeatherRenderer } from '../WeatherRenderer'
import { TransitOverlay } from '../../ui/TransitOverlay'
import { DestinationPlanetMesh } from '../DestinationPlanet'
import { VelarPlanetMesh } from '../VelarPlanetTerrain'

export function DeathLootDropsRenderer() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])
  const visible = DEATH_LOOT_DROPS.filter((d) => !gatheredLootIds.has(d.id))
  if (visible.length === 0 || tick < 0) return null
  return (
    <>
      {visible.map((drop) => {
        const len = Math.sqrt(drop.x * drop.x + drop.y * drop.y + drop.z * drop.z)
        const sn = len > 1
          ? new THREE.Vector3(drop.x / len, drop.y / len, drop.z / len)
          : new THREE.Vector3(0, 1, 0)
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sn)
        return (
          <group key={drop.id} position={[drop.x + sn.x * 0.25, drop.y + sn.y * 0.25, drop.z + sn.z * 0.25]} quaternion={q}>
            <mesh castShadow>
              <boxGeometry args={[0.3, 0.3, 0.3]} />
              <meshStandardMaterial color="#f1c40f" emissive="#f39c12" emissiveIntensity={0.5} roughness={0.4} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.22, 0.3, 16]} />
              <meshBasicMaterial color="#f39c12" transparent opacity={0.4} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

export function BedrollMeshRenderer() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000)
    return () => clearInterval(id)
  }, [])
  const anchor = placedBedrollAnchor
  if (!anchor || tick < 0) return null
  const len = Math.sqrt(anchor.x * anchor.x + anchor.y * anchor.y + anchor.z * anchor.z)
  const sn = len > 1
    ? new THREE.Vector3(anchor.x / len, anchor.y / len, anchor.z / len)
    : new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sn)
  return (
    <group position={[anchor.x + sn.x * 0.06, anchor.y + sn.y * 0.06, anchor.z + sn.z * 0.06]} quaternion={q}>
      <mesh receiveShadow>
        <boxGeometry args={[1.8, 0.08, 0.9]} />
        <meshStandardMaterial color="#8B6914" roughness={0.9} />
      </mesh>
      <mesh position={[0.7, 0.07, 0]} receiveShadow>
        <boxGeometry args={[0.35, 0.12, 0.7]} />
        <meshStandardMaterial color="#c9a84c" roughness={0.85} />
      </mesh>
      <mesh position={[-0.1, 0.05, 0]}>
        <boxGeometry args={[1.1, 0.09, 0.88]} />
        <meshStandardMaterial color="#5a4a2a" roughness={0.95} transparent opacity={0.7} />
      </mesh>
      <pointLight color="#f1c40f" intensity={0.4} distance={4} />
    </group>
  )
}

export function WeatherRendererWrapper() {
  const entityId = usePlayerStore(s => s.entityId)
  const posRef   = useRef({ x: 0, y: 0, z: 0 })
  const [pos, setPos] = useState({ x: 0, y: 4003, z: 0 })

  useFrame(() => {
    if (entityId === null) return
    const nx = Position.x[entityId]
    const ny = Position.y[entityId]
    const nz = Position.z[entityId]
    if (
      Math.abs(nx - posRef.current.x) > 5 ||
      Math.abs(ny - posRef.current.y) > 5 ||
      Math.abs(nz - posRef.current.z) > 5
    ) {
      posRef.current = { x: nx, y: ny, z: nz }
      setPos({ x: nx, y: ny, z: nz })
    }
  })

  return <WeatherRenderer playerX={pos.x} playerY={pos.y} playerZ={pos.z} />
}

export function TransitOverlayWrapper() {
  const phase = useTransitStore(s => s.phase)
  const { arriveAtDestination } = useTransitStore()
  if (phase !== 'launching') return null
  return <TransitOverlay onComplete={arriveAtDestination} />
}

export function DestinationPlanetMeshWrapper() {
  const phase = useTransitStore(s => s.phase)
  if (phase !== 'arrived') return null
  return <DestinationPlanetMesh />
}

export function DestinationPlanetSelector() {
  const toPlanet = useTransitStore(s => s.toPlanet)
  if (toPlanet === 'Velar') return <VelarPlanetMesh />
  return <DestinationPlanetMesh />
}
