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

import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import {
  generatePlanetGeometry,
  generateOceanGeometry,
  PLANET_RADIUS,
  SEA_LEVEL,
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

  // SEA_LEVEL is the terrain height (metres above planet centre) at which water sits.
  // The sphere surface radius at sea level = PLANET_RADIUS + SEA_LEVEL.
  // We compute vertex elevation as: length(vTerrainWorldPos) - (PLANET_RADIUS + SEA_LEVEL).
  // Negative = underwater, 0–20 = coastal wet zone, >20 = dry land.
  const seaRadius = PLANET_RADIUS + (SEA_LEVEL ?? 0)

  mat.onBeforeCompile = (shader) => {
    // Pass sea-level radius as a uniform so the GLSL can compute elevation
    shader.uniforms.uSeaRadius = { value: seaRadius }

    // Inject world-position varying into vertex shader.
    // Use #include <project_vertex> as the injection point — always present in
    // MeshStandardMaterial regardless of env/transmission feature flags.
    shader.vertexShader = 'varying vec3 vTerrainWorldPos;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    )

    // Inject detail noise + wet-edge darkening into fragment shader color step
    shader.fragmentShader = 'varying vec3 vTerrainWorldPos;\nuniform float uSeaRadius;\n' + DETAIL_NOISE_GLSL + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Sub-polygon detail: multi-frequency noise in world space (units = meters)
      float _d = _detail(vTerrainWorldPos);
      // Map [0,1] → [-0.22, +0.22] variation, preserves base biome color
      diffuseColor.rgb *= 0.78 + _d * 0.44;

      // ── Wet edge darkening ──────────────────────────────────────────────────
      // Elevation above sea level in metres. Negative = submerged, 0–20 = coastal.
      float _elev = length(vTerrainWorldPos) - uSeaRadius;
      // Smooth ramp: 1.0 at sea level, 0.0 at 20m above
      float _wetFactor = clamp(1.0 - _elev / 20.0, 0.0, 1.0);
      // Darken albedo by up to 0.15 (wet sand/rock absorbs more light)
      diffuseColor.rgb *= 1.0 - _wetFactor * 0.15;`
    )

    // ── Wet edge roughness ────────────────────────────────────────────────────
    // Increase roughness near water (wet surfaces scatter light more diffusely).
    // Inject after <roughnessmap_fragment> which sets roughnessFactor.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      {
        float _elev2 = length(vTerrainWorldPos) - uSeaRadius;
        float _wetR  = clamp(1.0 - _elev2 / 20.0, 0.0, 1.0);
        roughnessFactor = clamp(roughnessFactor + _wetR * 0.20, 0.0, 1.0);
      }`
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

  // ── M9 T3: Shader warmup — compile terrain material before first visible frame ──
  // onBeforeCompile shaders compile on first use, causing a frame hitch of 50-200ms.
  // Fix: call renderer.compile() on a tiny off-screen scene containing the terrain
  // material during the mount effect. This happens before the player releases the
  // pointer lock, so the hitch is invisible.
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    // Build a minimal warmup scene with one mesh using the terrain material
    const warmupScene = new THREE.Scene()
    const warmupGeo   = new THREE.SphereGeometry(1, 4, 4)
    const warmupMesh  = new THREE.Mesh(warmupGeo, terrainMat)
    warmupScene.add(warmupMesh)
    // Compile shaders off-screen — no visible render, just GPU program compilation
    gl.compile(warmupScene, camera)
    // Dispose the warmup geometry immediately — material is kept (reused by terrain)
    warmupGeo.dispose()
    warmupScene.remove(warmupMesh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
