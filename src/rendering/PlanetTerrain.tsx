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
import { createOceanMaterial, applyOceanCaustics, type OceanMaterialHandle } from './shaders/OceanShader'
import { makeAtmosphereShader, updateAtmosphereUniforms } from './shaders/AtmosphereShader'
import { useWeatherStore } from '../store/weatherStore'

// Sun orbit radius — must match DayNightCycle.tsx constant
const SUN_ORBIT_R_PT = 8000

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

// ── Tri-planar procedural normal mapping ─────────────────────────────────────
// Computes surface normal perturbation from analytical noise gradient using
// tri-planar projection to avoid seams on spherical geometry.
// Returns a perturbed normal in world space given a base normal and world pos.
vec3 _noiseGrad(vec3 p) {
  // Finite-difference gradient of _sn at two frequencies for bumpiness
  float eps = 0.15;
  float nx = _sn(p + vec3(eps, 0.0, 0.0)) - _sn(p - vec3(eps, 0.0, 0.0));
  float ny = _sn(p + vec3(0.0, eps, 0.0)) - _sn(p - vec3(0.0, eps, 0.0));
  float nz = _sn(p + vec3(0.0, 0.0, eps)) - _sn(p - vec3(0.0, 0.0, eps));
  return vec3(nx, ny, nz) / (2.0 * eps);
}

vec3 _triplanarNormal(vec3 worldPos, vec3 worldNormal, float intensity) {
  // Blending weights from absolute normal components, sharpened with pow4
  vec3 blend = abs(worldNormal);
  blend = pow(blend, vec3(4.0));
  blend /= (blend.x + blend.y + blend.z + 0.0001);

  // Sample noise gradient on each axis plane at two frequencies
  vec3 gXY = _noiseGrad(worldPos.xyz * 1.8) * 0.6
           + _noiseGrad(worldPos.xyz * 5.5) * 0.4;
  vec3 gXZ = _noiseGrad(worldPos.xzy * 1.8) * 0.6
           + _noiseGrad(worldPos.xzy * 5.5) * 0.4;
  vec3 gYZ = _noiseGrad(worldPos.yzx * 1.8) * 0.6
           + _noiseGrad(worldPos.yzx * 5.5) * 0.4;

  // Tangent-space perturbation per face, then blend
  vec3 perturbXY = vec3(gXY.x, gXY.y, 0.0);
  vec3 perturbXZ = vec3(gXZ.x, 0.0, gXZ.y);
  vec3 perturbYZ = vec3(0.0, gYZ.x, gYZ.y);
  vec3 perturb = perturbXY * blend.z + perturbXZ * blend.y + perturbYZ * blend.x;

  // Add perturbation to world normal scaled by intensity, then renormalize
  return normalize(worldNormal + perturb * intensity);
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
    // M23: Wetness factor from weather system (0-1)
    shader.uniforms.uWetness = { value: 0.0 }

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
    shader.fragmentShader = 'varying vec3 vTerrainWorldPos;\nuniform float uSeaRadius;\nuniform float uWetness;\n' + DETAIL_NOISE_GLSL + shader.fragmentShader
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
      diffuseColor.rgb *= 1.0 - _wetFactor * 0.15;

      // M23: Rain wetness — darken terrain albedo by up to 30% when wet
      diffuseColor.rgb *= 1.0 - uWetness * 0.30;`
    )

    // ── Biome-dependent roughness + wet edge roughness (C2) ───────────────────
    // Biome detection uses elevation and slope (face normal vs sphere normal).
    // grass=0.85, rock=0.65, sand (coastal)=0.92, snow (high alt)=0.3
    // Inject after <roughnessmap_fragment> which sets roughnessFactor.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      {
        float _elev2   = length(vTerrainWorldPos) - uSeaRadius;
        // Slope: dot of surface normal with outward sphere normal (0=cliff, 1=flat)
        vec3  _sphereN = normalize(vTerrainWorldPos);
        float _slope   = clamp(dot(normalize(vNormal), _sphereN), 0.0, 1.0);

        // ── Biome weights (sum to 1) ─────────────────────────────────────────
        // Sand: coastal band 0–8m elevation
        float _sandW  = clamp(1.0 - abs(_elev2 - 4.0) / 4.0, 0.0, 1.0);
        _sandW = clamp(_sandW, 0.0, 1.0);
        // Snow: high altitude > 60m
        float _snowW  = clamp((_elev2 - 60.0) / 20.0, 0.0, 1.0);
        // Rock: steep slopes (slope < 0.55) above sea, excluding snow
        float _rockW  = clamp((0.55 - _slope) / 0.35, 0.0, 1.0) * clamp(1.0 - _snowW, 0.0, 1.0);
        // Grass: everything else above sea
        float _aboveSea = clamp(_elev2 / 5.0, 0.0, 1.0);
        float _grassW = _aboveSea * clamp(1.0 - _sandW - _snowW - _rockW, 0.0, 1.0);

        // Normalise weights
        float _wSum = _grassW + _rockW + _sandW + _snowW + 0.0001;
        _grassW /= _wSum; _rockW /= _wSum; _sandW /= _wSum; _snowW /= _wSum;

        // Blend biome roughness values
        float _biomeRoughness = _grassW * 0.85 + _rockW * 0.65 + _sandW * 0.92 + _snowW * 0.3;
        roughnessFactor = mix(roughnessFactor, _biomeRoughness, 0.75);

        // Wet edge: increase roughness near sea level
        float _wetR = clamp(1.0 - _elev2 / 20.0, 0.0, 1.0);
        roughnessFactor = clamp(roughnessFactor + _wetR * 0.20, 0.0, 1.0);

        // M23: Rain wetness — reduce roughness by up to 0.3 when wet (shinier surfaces)
        roughnessFactor = clamp(roughnessFactor - uWetness * 0.30, 0.0, 1.0);
      }`
    )

    // M23: Store shader reference for per-frame wetness uniform updates
    ;(mat as any)._terrainShader = shader

    // ── Tri-planar procedural normal mapping (C1) ─────────────────────────────
    // Perturb the shading normal after <normal_fragment_maps> to add surface bumps.
    // Normal intensity: 0.15 for grass/flat, 0.3 for rock/steep.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // Recompute biome weights for normal intensity (mirrors roughness block)
        float _nElev  = length(vTerrainWorldPos) - uSeaRadius;
        vec3  _nSphN  = normalize(vTerrainWorldPos);
        float _nSlope = clamp(dot(normalize(vNormal), _nSphN), 0.0, 1.0);
        float _nRockW = clamp((0.55 - _nSlope) / 0.35, 0.0, 1.0);
        // Intensity: lerp between 0.15 (flat/grass) and 0.3 (steep/rock)
        float _normIntensity = mix(0.15, 0.30, _nRockW);
        // Apply tri-planar normal perturbation in world space
        normal = _triplanarNormal(vTerrainWorldPos, normal, _normIntensity);
      }`
    )
  }

  return mat
}

// makeOceanMaterial replaced by PBR OceanShader (M19 Track A).
// createOceanMaterial() is called inside the component so the handle
// (material + update fn) can be stored in a ref for per-frame updates.

// makeAtmosphereMaterial + makeHazeMaterial replaced by Rayleigh+Mie AtmosphereShader (M19 Track B).
// makeAtmosphereShader() is called inside useMemo so the ShaderMaterial is
// created once and updated each frame via updateAtmosphereUniforms().

// ── Component ─────────────────────────────────────────────────────────────────

interface PlanetTerrainProps {
  seed: number
  /** Current sun angle in radians forwarded from DayNightCycle — drives atmosphere color */
  dayAngle?: number
}

export function PlanetTerrain({ seed, dayAngle = Math.PI * 0.6 }: PlanetTerrainProps) {
  // Generate geometry once — no reactive dependencies
  const terrainGeo = useMemo(() => generatePlanetGeometry(160), [seed])
  const oceanGeo   = useMemo(() => generateOceanGeometry(48), [])
  // Single atmosphere shell — Rayleigh+Mie scattering (M19 Track B)
  // Replaces old flat atmosphere + haze spheres.
  const atmosphereGeo = useMemo(
    () => new THREE.SphereGeometry(PLANET_RADIUS * 1.05, 32, 32),
    [],
  )

  const terrainMat  = useMemo(makeTerrainMaterial, [])
  // M19 Track A: PBR OceanShader — createOceanMaterial returns { material, update }
  const oceanHandle = useMemo(() => createOceanMaterial(), [])
  const oceanMat    = oceanHandle.material
  // M19 Track B: Rayleigh+Mie atmosphere shader (replaces makeAtmosphereMaterial + makeHazeMaterial)
  const atmosphereMat = useMemo(
    () => makeAtmosphereShader(PLANET_RADIUS, PLANET_RADIUS * 1.05),
    [],
  )

  // Store dayAngle in a ref so useFrame closure always reads the latest value
  // without needing to re-register the callback on every render.
  const dayAngleRef = useRef(dayAngle)
  useEffect(() => { dayAngleRef.current = dayAngle }, [dayAngle])

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

  // Apply underwater caustics patch to terrain material once on first mount.
  // applyOceanCaustics extends terrainMat.onBeforeCompile and stores a
  // _causticUpdate(t) callback that is called each frame below.
  useEffect(() => {
    const seaRadius = PLANET_RADIUS + (SEA_LEVEL ?? 0) + 1
    applyOceanCaustics(terrainMat, () => 0, seaRadius)
    terrainMat.needsUpdate = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Per-frame updates for ocean + atmosphere
  const oceanRef = useRef<THREE.Mesh>(null)
  const atmoRef  = useRef<THREE.Mesh>(null)

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime()

    // Ocean: propagate sun direction from scene directional light → Fresnel uniforms + caustics
    let sunDir: THREE.Vector3 | undefined
    let sunCol: THREE.Color   | undefined
    scene.traverse((obj) => {
      if ((obj as THREE.DirectionalLight).isDirectionalLight && !sunDir) {
        const light = obj as THREE.DirectionalLight
        sunDir = new THREE.Vector3()
        light.getWorldDirection(sunDir).negate()
        sunCol = light.color
      }
    })
    oceanHandle.update(t, sunDir, sunCol)

    // Drive caustic time on terrain (patched by applyOceanCaustics)
    const causticUpdate = (terrainMat as unknown as Record<string, unknown>)._causticUpdate
    if (typeof causticUpdate === 'function') {
      (causticUpdate as (elapsed: number) => void)(t)
    }

    // M23: Update wetness uniform from weather store
    const terrainShader = (terrainMat as any)._terrainShader
    if (terrainShader?.uniforms?.uWetness) {
      terrainShader.uniforms.uWetness.value = useWeatherStore.getState().wetness
    }

    // Atmosphere: update sun direction uniform + smooth twilight opacity
    if (atmoRef.current) {
      updateAtmosphereUniforms(
        atmoRef.current.material as THREE.ShaderMaterial,
        dayAngleRef.current,
        SUN_ORBIT_R_PT,
        delta,
      )
    }
  })

  return (
    <group>
      {/* Terrain */}
      <mesh geometry={terrainGeo} material={terrainMat} receiveShadow castShadow />

      {/* Ocean surface — PBR Gerstner waves (M19 Track A) */}
      <mesh ref={oceanRef} geometry={oceanGeo} material={oceanMat} />

      {/* Atmosphere shell — Rayleigh+Mie scattering sky (M19 Track B)
          BackSide render so the shader sees rays cast from inside the shell.
          depthWrite=false avoids z-fighting with terrain at the horizon.
          Opacity fades to zero at night, revealing NightSkyRenderer stars. */}
      <mesh ref={atmoRef} geometry={atmosphereGeo} material={atmosphereMat} />
    </group>
  )
}
