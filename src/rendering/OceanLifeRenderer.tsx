// ── OceanLifeRenderer.tsx ─────────────────────────────────────────────────────
// M34 Track C: Visible fish schools, dolphin arcs, and fishing spot ripples
// near ocean surface when player is close to the water.
//
// Uses InstancedMesh for fish (one draw call), individual meshes for dolphins,
// and animated Torus rings for ripple spot indicators.
//
// Fish swim in loose schools via sine-wave paths, rotate to face movement direction.
// Dolphins arc over the water surface every 30-60 seconds.
// Ripple spots expand and fade, indicating +20% catch rate locations.

import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { PLANET_RADIUS } from '../world/SpherePlanet'
import { Position } from '../ecs/world'
import { fishingSystem } from '../game/FishingSystem'

// ── Constants ─────────────────────────────────────────────────────────────────

const FISH_COUNT    = 20
const SCHOOL_SIZE   = 4      // fish per school
const OCEAN_Y_DELTA = 150    // show within 150 vertical units of surface

// ── Utility ───────────────────────────────────────────────────────────────────

// Small wrapper to avoid repeated ECS access overhead
function getPlayerPos(entityId: number): [number, number, number] {
  return [Position.x[entityId], Position.y[entityId], Position.z[entityId]]
}

// ── Fish schools (instanced) ──────────────────────────────────────────────────

interface SchoolDesc {
  offsetX: number
  offsetZ: number
  speed: number
  radius: number
  phaseOffset: number
}

function FishSchools({ entityId }: { entityId: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { schools, fishPhases, geo, mat } = useMemo(() => {
    const numSchools = Math.ceil(FISH_COUNT / SCHOOL_SIZE)
    const schools: SchoolDesc[] = []
    const fishPhases: Array<{ schoolIdx: number; phaseOffset: number; yOff: number }> = []

    for (let s = 0; s < numSchools; s++) {
      const angle = (s / numSchools) * Math.PI * 2
      schools.push({
        offsetX:     Math.cos(angle) * 35,
        offsetZ:     Math.sin(angle) * 35,
        speed:       0.5 + Math.random() * 0.7,
        radius:      8 + Math.random() * 14,
        phaseOffset: Math.random() * Math.PI * 2,
      })
      for (let f = 0; f < SCHOOL_SIZE; f++) {
        fishPhases.push({
          schoolIdx:   s,
          phaseOffset: (f / SCHOOL_SIZE) * Math.PI * 2,
          yOff:        (Math.random() - 0.5) * 0.9,
        })
      }
    }

    const geo = new THREE.BoxGeometry(0.3, 0.08, 0.1)
    const mat = new THREE.MeshStandardMaterial({
      color:       new THREE.Color(0.4, 0.65, 0.95),
      metalness:   0.25,
      roughness:   0.5,
      transparent: true,
      opacity:     0.82,
    })

    return { schools, fishPhases, geo, mat }
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime()
    const [px, py, pz] = getPlayerPos(entityId)

    // Only animate when near ocean surface
    if (py > PLANET_RADIUS + OCEAN_Y_DELTA) return

    for (let i = 0; i < fishPhases.length; i++) {
      const fp = fishPhases[i]
      const sc = schools[fp.schoolIdx]
      const phase = t * sc.speed + sc.phaseOffset + fp.phaseOffset

      const wx = px + sc.offsetX + Math.sin(phase) * sc.radius
      const wz = pz + sc.offsetZ + Math.cos(phase * 0.7) * sc.radius * 0.6
      const wy = PLANET_RADIUS + 0.35 + fp.yOff + Math.sin(phase * 1.4) * 0.25

      dummy.position.set(wx, wy, wz)

      // Rotate fish to face swim direction
      const dxdt = Math.cos(phase) * sc.speed * sc.radius
      const dzdt = -Math.sin(phase * 0.7) * sc.speed * sc.radius * 0.6 * 0.7
      dummy.rotation.y = -Math.atan2(dzdt, dxdt)

      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, fishPhases.length]}>
    </instancedMesh>
  )
}

// ── Shadow fish (deep silhouettes) ────────────────────────────────────────────

function ShadowFish({ entityId }: { entityId: number }) {
  const ref0 = useRef<THREE.Mesh>(null)
  const ref1 = useRef<THREE.Mesh>(null)
  const refs = [ref0, ref1]

  const geo = useMemo(() => new THREE.BoxGeometry(1.2, 0.25, 0.35), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color:       new THREE.Color(0.04, 0.09, 0.18),
    transparent: true,
    opacity:     0.3,
  }), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const [px, , pz] = getPlayerPos(entityId)
    refs.forEach((ref, i) => {
      const mesh = ref.current
      if (!mesh) return
      const phase = t * 0.12 + i * Math.PI
      mesh.position.set(
        px + Math.sin(phase) * 45,
        PLANET_RADIUS - 2.5,
        pz + Math.cos(phase * 0.55) * 45,
      )
      mesh.rotation.y = -Math.atan2(Math.cos(phase * 0.55) * 0.55, Math.cos(phase))
    })
  })

  return (
    <>
      <mesh ref={ref0} geometry={geo} material={mat} />
      <mesh ref={ref1} geometry={geo} material={mat} />
    </>
  )
}

// ── Dolphins ──────────────────────────────────────────────────────────────────

interface DolphinState {
  nextArc: number
  arcDuration: number
  active: boolean
  offsetX: number
  offsetZ: number
}

function Dolphins({ entityId }: { entityId: number }) {
  const stateRef = useRef<DolphinState[]>([
    { nextArc: 12 + Math.random() * 20, arcDuration: 2.2, active: false, offsetX:  25, offsetZ:  18 },
    { nextArc: 35 + Math.random() * 25, arcDuration: 2.0, active: false, offsetX: -28, offsetZ: -20 },
  ])

  const ref0 = useRef<THREE.Mesh>(null)
  const ref1 = useRef<THREE.Mesh>(null)
  const meshRefs = [ref0, ref1]

  const geo = useMemo(() => new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color:    new THREE.Color(0.32, 0.42, 0.58),
    roughness: 0.4,
    metalness: 0.1,
  }), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const [px, , pz] = getPlayerPos(entityId)

    stateRef.current.forEach((d, i) => {
      const mesh = meshRefs[i].current
      if (!mesh) return

      if (!d.active) {
        mesh.visible = false
        if (t >= d.nextArc) {
          d.active = true
        }
        return
      }

      const elapsed = t - d.nextArc
      const progress = elapsed / d.arcDuration

      if (progress >= 1) {
        d.active = false
        d.nextArc = t + 30 + Math.random() * 30
        mesh.visible = false
        return
      }

      mesh.visible = true
      const arcY = Math.sin(progress * Math.PI) * 4.5
      const sweepX = px + d.offsetX + Math.cos(progress * Math.PI * 2) * 5

      mesh.position.set(sweepX, PLANET_RADIUS + arcY, pz + d.offsetZ)
      mesh.rotation.z = Math.cos(progress * Math.PI) * 0.8
      mesh.rotation.y = 0.3
    })
  })

  return (
    <>
      <mesh ref={ref0} geometry={geo} material={mat} />
      <mesh ref={ref1} geometry={geo} material={mat} />
    </>
  )
}

// ── Fishing spot ripples ──────────────────────────────────────────────────────

interface RippleSpot {
  offsetX: number
  offsetZ: number
  phaseOffset: number
}

function FishingSpotRipples({ entityId }: { entityId: number }) {
  const spots = useMemo<RippleSpot[]>(() => [
    { offsetX:  25, offsetZ:  18, phaseOffset: 0 },
    { offsetX: -30, offsetZ:  10, phaseOffset: 0.5 },
    { offsetX:  10, offsetZ: -35, phaseOffset: 1.1 },
    { offsetX: -15, offsetZ: -22, phaseOffset: 1.7 },
  ], [])

  const ref0 = useRef<THREE.Mesh>(null)
  const ref1 = useRef<THREE.Mesh>(null)
  const ref2 = useRef<THREE.Mesh>(null)
  const ref3 = useRef<THREE.Mesh>(null)
  const ringRefs = [ref0, ref1, ref2, ref3]

  const geo = useMemo(() => new THREE.TorusGeometry(1, 0.045, 4, 24), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       new THREE.Color(0.3, 0.72, 1.0),
    transparent: true,
    opacity:     0.55,
    side:        THREE.DoubleSide,
  }), [])

  const nearRef = useRef(false)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const [px, , pz] = getPlayerPos(entityId)

    let anyNear = false

    spots.forEach((spot, i) => {
      const mesh = ringRefs[i].current
      if (!mesh) return

      const wx = px + spot.offsetX
      const wz = pz + spot.offsetZ

      const localPhase = ((t * 0.45 + spot.phaseOffset) % 1)
      const scale   = 1 + localPhase * 3.8
      const opacity = (1 - localPhase) * 0.55

      mesh.position.set(wx, PLANET_RADIUS + 0.06, wz)
      mesh.scale.setScalar(scale)
      ;(mat as THREE.MeshBasicMaterial).opacity = opacity

      const dx = px - wx
      const dz = pz - wz
      if (dx * dx + dz * dz < 25) anyNear = true   // within 5m
    })

    if (anyNear !== nearRef.current) {
      nearRef.current = anyNear
      fishingSystem.setContext(anyNear, fishingSystem.state.isUnderground)
    }
  })

  return (
    <>
      {ringRefs.map((ref, i) => (
        <mesh
          key={i}
          ref={ref as React.RefObject<THREE.Mesh>}
          geometry={geo}
          material={mat}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface OceanLifeRendererProps {
  entityId: number
}

export function OceanLifeRenderer({ entityId }: OceanLifeRendererProps) {
  return (
    <group>
      <FishSchools entityId={entityId} />
      <ShadowFish entityId={entityId} />
      <Dolphins entityId={entityId} />
      <FishingSpotRipples entityId={entityId} />
    </group>
  )
}
