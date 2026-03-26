// ── WorldEventRenderer.tsx ────────────────────────────────────────────────────
// M37 Track A: Renders 3-D visuals for active world events inside the R3F Canvas.
//
// • treasure_hunt  — golden beacon pillar of light + pulsing PointLight
// • meteor_impact  — expanding shockwave ring + crater disc + debris particles
// • migration      — dust cloud particle field moving in a direction
// • ancient_ruins  — stone columns emerging from the ground, vine sparkles
// • faction_war    — crossed-swords marker + red/blue flame columns

import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  currentWorldEvent,
  subscribeWorldEvent,
  type WorldEvent,
  type WorldEventType,
} from '../game/WorldEventSystem'

// ── Helpers ──────────────────────────────────────────────────────────────────

function useActiveEvent() {
  const [event, setEvent] = useState<WorldEvent | null>(currentWorldEvent)
  useEffect(() => subscribeWorldEvent(setEvent), [])
  return event
}

// ── Treasure Hunt: tall golden beacon pillar ──────────────────────────────────

function TreasureBeacon({ pos }: { pos: [number, number, number] }) {
  const lightRef = useRef<THREE.PointLight>(null)
  const meshRef  = useRef<THREE.Mesh>(null)
  const t = useRef(0)

  useFrame((_, dt) => {
    t.current += dt
    if (lightRef.current) {
      lightRef.current.intensity = 4 + Math.sin(t.current * 3) * 2
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += dt * 0.5
      const s = 1 + Math.sin(t.current * 2) * 0.08
      meshRef.current.scale.set(s, 1, s)
    }
  })

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffdd00',
    emissive: '#ffaa00',
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.7,
  }), [])

  const [px, py, pz] = pos
  return (
    <group position={[px, py, pz]}>
      {/* Tall pillar */}
      <mesh ref={meshRef} material={mat} castShadow={false}>
        <cylinderGeometry args={[0.3, 0.3, 50, 8]} />
      </mesh>
      {/* Base glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={useMemo(() => new THREE.MeshStandardMaterial({
        color: '#ffee44',
        emissive: '#ffee44',
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }), [])}>
        <ringGeometry args={[2, 5, 32]} />
      </mesh>
      {/* Pulsing point light */}
      <pointLight ref={lightRef} color="#ffdd00" intensity={5} distance={80} decay={2} />
    </group>
  )
}

// ── Meteor Impact: shockwave ring + crater disc + debris ─────────────────────

function MeteorImpact({ pos }: { pos: [number, number, number] }) {
  const ringRef  = useRef<THREE.Mesh>(null)
  const debrisRef = useRef<THREE.InstancedMesh>(null)
  const t = useRef(0)
  const MAX_RING = 20

  const debrisPositions = useMemo(() => {
    const positions: THREE.Matrix4[] = []
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2
      const r = 2 + Math.random() * 12
      dummy.position.set(
        Math.cos(angle) * r,
        Math.abs(Math.sin(i * 0.4)) * 3 + 0.1,
        Math.sin(angle) * r,
      )
      dummy.scale.setScalar(0.1 + Math.random() * 0.3)
      dummy.updateMatrix()
      positions.push(dummy.matrix.clone())
    }
    return positions
  }, [])

  useFrame((_, dt) => {
    t.current += dt
    // Expand shockwave ring outward over 3 seconds then reset slowly
    if (ringRef.current) {
      const progress = (t.current % 3) / 3
      const radius = 0.5 + progress * MAX_RING
      ringRef.current.scale.set(radius, radius, radius)
      const mat = ringRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = Math.max(0, 0.8 - progress)
    }
  })

  const [px, py, pz] = pos

  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff6600',
    emissive: '#ff3300',
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  }), [])

  const craterMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#332211',
    roughness: 1,
    side: THREE.DoubleSide,
  }), [])

  const debrisMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#886644',
    emissive: '#441100',
    emissiveIntensity: 0.5,
  }), [])

  return (
    <group position={[px, py, pz]}>
      {/* Crater disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={craterMat}>
        <circleGeometry args={[8, 32]} />
      </mesh>
      {/* Expanding shockwave ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[0.9, 1, 32]} />
      </mesh>
      {/* Debris particles (50 small sphere instances) */}
      <instancedMesh ref={debrisRef} args={[undefined, debrisMat, 50]}
        onUpdate={(im) => {
          debrisPositions.forEach((m, i) => im.setMatrixAt(i, m))
          im.instanceMatrix.needsUpdate = true
        }}
      >
        <sphereGeometry args={[0.2, 4, 4]} />
      </instancedMesh>
      {/* Orange point light */}
      <pointLight color="#ff6600" intensity={3} distance={40} decay={2} />
    </group>
  )
}

// ── Migration: dust cloud moving in a direction ───────────────────────────────

function MigrationDust({ pos }: { pos: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null)
  const t = useRef(0)
  const SPEED = 2 // m/s drift

  const dustMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c8a870',
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  }), [])

  useFrame((_, dt) => {
    t.current += dt
    if (groupRef.current) {
      // Drift in +X direction
      groupRef.current.position.x = pos[0] + (t.current * SPEED) % 60
      groupRef.current.position.y = pos[1]
      groupRef.current.position.z = pos[2]
    }
  })

  const particles = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      ox: (Math.random() - 0.5) * 30,
      oy: Math.random() * 4,
      oz: (Math.random() - 0.5) * 30,
      s: 0.5 + Math.random() * 1.5,
    }))
  }, [])

  return (
    <group ref={groupRef} position={pos}>
      {particles.map(p => (
        <mesh key={p.id} position={[p.ox, p.oy, p.oz]} material={dustMat}>
          <sphereGeometry args={[p.s, 4, 4]} />
        </mesh>
      ))}
    </group>
  )
}

// ── Ancient Ruins: stone columns emerging + sparkles ─────────────────────────

function AncientRuins({ pos }: { pos: [number, number, number] }) {
  const columnRefs = useRef<(THREE.Mesh | null)[]>([])
  const t = useRef(0)
  const EMERGE_DURATION = 5  // seconds to rise

  const columns = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2
      const r = 4 + (i % 2) * 2
      return {
        id: i,
        x: Math.cos(angle) * r,
        z: Math.sin(angle) * r,
        h: 3 + Math.random() * 4,
        delay: i * 0.5,
      }
    })
  }, [])

  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8a8070',
    roughness: 0.9,
    emissive: '#332200',
    emissiveIntensity: 0.2,
  }), [])

  const sparkleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cc88ff',
    emissive: '#cc88ff',
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.8,
  }), [])

  useFrame((_, dt) => {
    t.current += dt
    columns.forEach((col, i) => {
      const mesh = columnRefs.current[i]
      if (!mesh) return
      const elapsed = Math.max(0, t.current - col.delay)
      const progress = Math.min(1, elapsed / EMERGE_DURATION)
      // Interpolate Y from -col.h (buried) to 0 (fully emerged)
      const targetY = -col.h * (1 - progress) + col.h * 0.5
      mesh.position.y = targetY
    })
  })

  const [px, py, pz] = pos

  return (
    <group position={[px, py, pz]}>
      {columns.map((col, i) => (
        <group key={col.id} position={[col.x, 0, col.z]}>
          <mesh
            ref={el => { columnRefs.current[i] = el }}
            material={stoneMat}
          >
            <cylinderGeometry args={[0.4, 0.5, col.h, 6]} />
          </mesh>
          {/* Vine sparkle at column base */}
          <mesh position={[0, 0.2, 0]} material={sparkleMat}>
            <sphereGeometry args={[0.15, 4, 4]} />
          </mesh>
        </group>
      ))}
      {/* Purple ambient glow */}
      <pointLight color="#9933ff" intensity={2} distance={30} decay={2} />
    </group>
  )
}

// ── Faction War: red/blue flame columns ───────────────────────────────────────

function FactionWar({ pos }: { pos: [number, number, number] }) {
  const redRef  = useRef<THREE.PointLight>(null)
  const blueRef = useRef<THREE.PointLight>(null)
  const t = useRef(0)

  const redMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff2200',
    emissive: '#ff2200',
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.8,
  }), [])
  const blueMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2244ff',
    emissive: '#2244ff',
    emissiveIntensity: 3,
    transparent: true,
    opacity: 0.8,
  }), [])

  useFrame((_, dt) => {
    t.current += dt
    if (redRef.current)  redRef.current.intensity  = 3 + Math.sin(t.current * 4) * 1.5
    if (blueRef.current) blueRef.current.intensity = 3 + Math.cos(t.current * 4) * 1.5
  })

  const [px, py, pz] = pos
  return (
    <group position={[px, py, pz]}>
      {/* Red faction flame */}
      <group position={[-5, 0, 0]}>
        <mesh material={redMat}>
          <cylinderGeometry args={[0.3, 0.6, 8, 6]} />
        </mesh>
        <pointLight ref={redRef} color="#ff2200" intensity={4} distance={30} decay={2} />
      </group>
      {/* Blue faction flame */}
      <group position={[5, 0, 0]}>
        <mesh material={blueMat}>
          <cylinderGeometry args={[0.3, 0.6, 8, 6]} />
        </mesh>
        <pointLight ref={blueRef} color="#2244ff" intensity={4} distance={30} decay={2} />
      </group>
    </group>
  )
}

// ── Main renderer ─────────────────────────────────────────────────────────────

const EVENT_RENDERERS: Record<WorldEventType, React.FC<{ pos: [number, number, number] }>> = {
  treasure_hunt:  TreasureBeacon,
  meteor_impact:  MeteorImpact,
  migration:      MigrationDust,
  ancient_ruins:  AncientRuins,
  faction_war:    FactionWar,
}

export function WorldEventRenderer() {
  const event = useActiveEvent()
  if (!event) return null
  const Renderer = EVENT_RENDERERS[event.type]
  if (!Renderer) return null
  return <Renderer pos={event.position} />
}
