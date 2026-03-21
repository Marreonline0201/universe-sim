// ── SeasonalTerrainPass.tsx ─────────────────────────────────────────────────────
// M10 Track A: Seasonal visual changes.
//
// Autumn: terrain vertex-color lerps toward orange/amber (factor = season progress 0→1)
// Winter: terrain lerps toward white/grey (snow), trees lose crown opacity (bare branches)
// Spring: terrain returns to green, blossoms particles (white sprites near tree positions)
//
// Implementation approach:
// - We cannot directly mutate the PlanetTerrain geometry every frame (expensive).
// - Instead we render an additive overlay using a fullscreen quad with a custom
//   seasonal tint material, modulated by season progress.
// - Blossom particles are instanced Points, only visible in Spring.
// - Snow overlay is a flat white transparent sphere slightly larger than the planet
//   that fades in during Winter (opacity = progress * 0.18).
//
// The PlanetTerrain vertex colors are left unchanged. This pass sits on top.

import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useSeasonStore } from '../store/seasonStore'
import { PLANET_RADIUS } from '../world/SpherePlanet'

// ── Blossom particle positions (spring) ───────────────────────────────────────
// Derived from a fixed-seed scatter — consistent positions every session.
function genBlossomPositions(count: number): Float32Array {
  const pos = new Float32Array(count * 3)
  let s = 12345
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
  for (let i = 0; i < count; i++) {
    // Scatter on sphere surface at land radius
    const theta = rand() * Math.PI * 2
    const phi   = Math.acos(2 * rand() - 1)
    const r     = PLANET_RADIUS + 2 + rand() * 8  // 2-10m above surface
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    pos[i * 3 + 1] = r * Math.cos(phi)
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  return pos
}

const BLOSSOM_COUNT = 2000
const blossomPositions = genBlossomPositions(BLOSSOM_COUNT)

// ── Autumn tint overlay (transparent additive sphere) ─────────────────────────
// Additive amber overlay: color #d4822a at low opacity = warm tint over terrain.
// Depth test disabled so it covers all land.

function AutumnOverlay({ progress }: { progress: number }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    if (!matRef.current) return
    // Opacity ramps 0→0.12 as season progresses 0→1
    matRef.current.opacity = progress * 0.12
  })
  if (progress < 0.01) return null
  return (
    <mesh renderOrder={10}>
      <sphereGeometry args={[PLANET_RADIUS + 0.5, 32, 16]} />
      <meshBasicMaterial
        ref={matRef}
        color="#d4822a"
        transparent
        opacity={progress * 0.12}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  )
}

// ── Winter snow overlay ────────────────────────────────────────────────────────
// White sphere (BackSide) covers terrain as snow.  Opacity = progress * 0.18.
// Also renders snow particles from WeatherRenderer — this is just the ground cover.

function WinterOverlay({ progress }: { progress: number }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    if (!matRef.current) return
    matRef.current.opacity = progress * 0.18
  })
  if (progress < 0.01) return null
  return (
    <mesh renderOrder={10}>
      <sphereGeometry args={[PLANET_RADIUS + 0.4, 32, 16]} />
      <meshBasicMaterial
        ref={matRef}
        color="#dfe8f0"
        transparent
        opacity={progress * 0.18}
        depthWrite={false}
        side={THREE.BackSide}
      />
    </mesh>
  )
}

// ── Spring blossom particles ───────────────────────────────────────────────────

function SpringBlossoms({ progress }: { progress: number }) {
  const pointsRef = useRef<THREE.Points>(null)

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(blossomPositions, 3))
    return geo
  }, [])

  useFrame((state) => {
    if (!pointsRef.current) return
    const mat = pointsRef.current.material as THREE.PointsMaterial
    // Blossoms fade in 0→1 over spring, drift slightly upward with sine
    mat.opacity = Math.min(progress * 2, 1) * 0.7
    // Gentle rotation to simulate drift
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.003
  })

  if (progress < 0.01) return null

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#f8f4ff"
        size={0.8}
        transparent
        opacity={0.7}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

// ── Main SeasonalTerrainPass component ────────────────────────────────────────

export function SeasonalTerrainPass() {
  const { season, progress } = useSeasonStore()

  return (
    <>
      {season === 'AUTUMN' && <AutumnOverlay progress={progress} />}
      {season === 'WINTER' && <WinterOverlay progress={progress} />}
      {season === 'SPRING' && <SpringBlossoms progress={progress} />}
    </>
  )
}
