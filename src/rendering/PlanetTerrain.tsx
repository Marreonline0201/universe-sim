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

// GLSL injected into MeshStandardMaterial to add sub-polygon procedural surface detail.
// Uses smooth value noise at multiple frequencies (2m → 0.1m scale) to break up the
// flat interpolated-vertex-color look without needing any texture asset files.
const DETAIL_NOISE_GLSL = /* glsl */`
float _hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 19.19);
  return fract((p.x + p.y) * p.z);
}
float _sn(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(_hash(i), _hash(i+vec3(1,0,0)), f.x), mix(_hash(i+vec3(0,1,0)), _hash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(_hash(i+vec3(0,0,1)), _hash(i+vec3(1,0,1)), f.x), mix(_hash(i+vec3(0,1,1)), _hash(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}
float _detail(vec3 p) {
  return _sn(p * 0.40) * 0.48
       + _sn(p * 1.20) * 0.28
       + _sn(p * 3.60) * 0.14
       + _sn(p * 9.00) * 0.10;
}
`

function makeTerrainMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.FrontSide,
    roughness: 0.88,
    metalness: 0.0,
  })

  mat.onBeforeCompile = (shader) => {
    // Inject world-position varying into vertex shader.
    // Use #include <project_vertex> as the injection point — always present in
    // MeshStandardMaterial regardless of env/transmission feature flags.
    shader.vertexShader = 'varying vec3 vTerrainWorldPos;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    )

    // Inject detail noise into fragment shader color step
    shader.fragmentShader = 'varying vec3 vTerrainWorldPos;\n' + DETAIL_NOISE_GLSL + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Sub-polygon detail: multi-frequency noise in world space (units = meters)
      float _d = _detail(vTerrainWorldPos);
      // Map [0,1] → [-0.22, +0.22] variation, preserves base biome color
      diffuseColor.rgb *= 0.78 + _d * 0.44;`
    )
  }

  return mat
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
    color: new THREE.Color(0.50, 0.72, 1.00),
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide,   // render inside — creates glow halo
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

function makeHazeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.65, 0.82, 1.00),
    transparent: true,
    opacity: 0.06,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanetTerrain() {
  // Generate geometry once — no reactive dependencies
  const terrainGeo = useMemo(() => generatePlanetGeometry(160), [])
  const oceanGeo   = useMemo(() => generateOceanGeometry(48), [])
  // Outer atmosphere glow halo (large, thin ring seen from space)
  const atmosphereGeo = useMemo(() => new THREE.SphereGeometry(PLANET_RADIUS * 1.05, 32, 32), [])
  // Inner surface haze layer (close to ground, thickens at limb)
  const hazeGeo       = useMemo(() => new THREE.SphereGeometry(PLANET_RADIUS * 1.012, 32, 32), [])

  const terrainMat    = useMemo(makeTerrainMaterial, [])
  const oceanMat      = useMemo(makeOceanMaterial, [])
  const atmosphereMat = useMemo(makeAtmosphereMaterial, [])
  const hazeMat       = useMemo(makeHazeMaterial, [])

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

      {/* Inner haze layer — softens the surface-to-sky transition */}
      <mesh geometry={hazeGeo} material={hazeMat} />

      {/* Outer atmosphere glow — visible as blue limb from ground */}
      <mesh geometry={atmosphereGeo} material={atmosphereMat} />
    </group>
  )
}
