// ── PlanetTerrain ────────────────────────────────────────────────────────────
// React Three Fiber component for the spherical planet mesh.
//
// Renders:
//   1. The terrain sphere (cube-sphere, vertex colors, lit by directional light)
//   2. Ocean sphere (slightly larger, transparent blue)
//   3. Thin atmosphere glow shell (very large sphere, additive blend)
//
// The geometry is generated once on mount (~50ms) and never rebuilt.
// For LOD, a future implementation would split into 6 face-quads and rebuild
// only the faces near the player at high resolution, using CDLOD.

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  generatePlanetGeometry,
  generateOceanGeometry,
  PLANET_RADIUS,
} from '../world/SpherePlanet'

// ── Materials ─────────────────────────────────────────────────────────────────

function makeTerrainMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.FrontSide,
  })
}

function makeOceanMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: new THREE.Color(0.04, 0.18, 0.52),
    transparent: true,
    opacity: 0.78,
    shininess: 80,
    specular: new THREE.Color(0.4, 0.6, 1.0),
    side: THREE.FrontSide,
  })
}

function makeAtmosphereMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.45, 0.70, 1.00),
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,   // render inside — creates glow halo
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanetTerrain() {
  // Generate geometry once — no reactive dependencies
  const terrainGeo = useMemo(() => generatePlanetGeometry(80), [])
  const oceanGeo   = useMemo(() => generateOceanGeometry(48), [])
  const atmosphereGeo = useMemo(() => new THREE.SphereGeometry(PLANET_RADIUS * 1.035, 32, 32), [])

  const terrainMat   = useMemo(makeTerrainMaterial, [])
  const oceanMat     = useMemo(makeOceanMaterial, [])
  const atmosphereMat = useMemo(makeAtmosphereMaterial, [])

  // Gentle ocean shimmer — oscillate ocean opacity slightly
  const oceanRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (oceanRef.current) {
      const mat = oceanRef.current.material as THREE.MeshPhongMaterial
      mat.opacity = 0.75 + Math.sin(clock.getElapsedTime() * 0.4) * 0.03
    }
  })

  return (
    <group>
      {/* Terrain */}
      <mesh geometry={terrainGeo} material={terrainMat} receiveShadow castShadow />

      {/* Ocean surface */}
      <mesh ref={oceanRef} geometry={oceanGeo} material={oceanMat} />

      {/* Atmosphere glow */}
      <mesh geometry={atmosphereGeo} material={atmosphereMat} />
    </group>
  )
}
