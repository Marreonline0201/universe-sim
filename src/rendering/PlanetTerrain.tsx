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

// ── Biome uniforms interface ──────────────────────────────────────────────────
// uBiomeFlags: vec3(volcanoWeight, tundraWeight, desertWeight) in [0,1]
// uBiomeTemperature: current world temperature in °C
// uBiomeMoisture: current world humidity in [0,1]
// uWindDir: wind direction in degrees (for desert dune alignment)

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

// ── Biome shader snippets ─────────────────────────────────────────────────────

// Volcano: lava crack pattern — high-frequency noise threshold → emissive orange
const BIOME_VOLCANO_GLSL = /* glsl */`
vec3 _volcanoBiome(vec3 worldPos, vec3 baseAlbedo) {
  // Dark charcoal base
  vec3 charcoal = vec3(0.102, 0.039, 0.0); // #1a0a00
  // Lava crack: high-freq noise threshold
  float _lava = _sn(worldPos * 8.0);
  vec3 lavaColor = vec3(1.0, 0.2, 0.0); // #ff3300
  float _crackMask = step(0.85, _lava);
  vec3 volcanicAlbedo = mix(charcoal, lavaColor, _crackMask);
  return volcanicAlbedo;
}
`

// Tundra: icy blue-grey with frozen ground cracks
const BIOME_TUNDRA_GLSL = /* glsl */`
vec3 _tundraBiome(vec3 worldPos, vec3 baseAlbedo) {
  vec3 iceColor = vec3(0.784, 0.831, 0.847); // #c8d4d8
  // Procedural frozen ground cracks: grid pattern
  float _cx = sin(worldPos.x * 20.0);
  float _cz = sin(worldPos.z * 20.0);
  float _crackT = step(0.7, _cx * _cz);
  vec3 crackColor = vec3(0.15, 0.22, 0.28); // dark frost crack
  return mix(iceColor, crackColor, _crackT * 0.6);
}
`

// Desert: sandy yellow-orange with dune ripples (handled via color here; vertex displacement separate)
const BIOME_DESERT_GLSL = /* glsl */`
vec3 _desertBiome(vec3 worldPos, vec3 baseAlbedo) {
  vec3 sandColor = vec3(0.784, 0.643, 0.345); // #c8a458
  // Subtle dune ripple shading: gentle sine modulation along xz
  float _ripple = sin(worldPos.x * 2.0 + worldPos.z * 1.5) * 0.5 + 0.5;
  // Slight color variation between crest and trough
  vec3 troughColor = vec3(0.706, 0.549, 0.251); // slightly darker #b48c40
  return mix(sandColor, troughColor, _ripple * 0.3);
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
    // M27 Track C3: Sunrise/sunset terrain tinting
    shader.uniforms.uSunTint = { value: new THREE.Color(0xff8040) }
    shader.uniforms.uSunTintStrength = { value: 0.0 }
    // M31 Track A: Biome flags — vec3(volcano, tundra, desert) weights in [0,1]
    shader.uniforms.uBiomeFlags = { value: new THREE.Vector3(0, 0, 0) }
    // M31 Track A: Wind direction in degrees (0=north, CW) for desert dune orientation
    shader.uniforms.uWindDir = { value: 0.0 }

    // Inject world-position varying into vertex shader.
    // Use #include <project_vertex> as the injection point — always present in
    // MeshStandardMaterial regardless of env/transmission feature flags.
    shader.vertexShader = 'varying vec3 vTerrainWorldPos;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    )

    // Inject detail noise + biome functions + wet-edge darkening into fragment shader color step
    shader.fragmentShader =
      'varying vec3 vTerrainWorldPos;\n' +
      'uniform float uSeaRadius;\n' +
      'uniform float uWetness;\n' +
      'uniform vec3 uSunTint;\n' +
      'uniform float uSunTintStrength;\n' +
      'uniform vec3 uBiomeFlags;\n' +
      'uniform float uWindDir;\n' +
      DETAIL_NOISE_GLSL +
      BIOME_VOLCANO_GLSL +
      BIOME_TUNDRA_GLSL +
      BIOME_DESERT_GLSL +
      shader.fragmentShader

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
      diffuseColor.rgb *= 1.0 - uWetness * 0.30;
      // M27 Track C3: Sunrise/sunset warm tint — blend albedo toward #ff8040
      diffuseColor.rgb = mix(diffuseColor.rgb, uSunTint, uSunTintStrength * 0.15);

      // ── M31 Track A: Biome color blending ──────────────────────────────────
      // Smooth transition noise to soften biome boundaries
      float _biomeNoise = _sn(vTerrainWorldPos * 0.05) * 0.5 + 0.5;

      // Volcano biome (uBiomeFlags.x)
      if (uBiomeFlags.x > 0.0) {
        vec3 _volcanoAlbedo = _volcanoBiome(vTerrainWorldPos, diffuseColor.rgb);
        float _volcW = uBiomeFlags.x * clamp(_biomeNoise * 0.4 + 0.6, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, _volcanoAlbedo, _volcW);
        // Lava crack emissive glow — blended via brightening
        float _lavaCrack = step(0.85, _sn(vTerrainWorldPos * 8.0));
        diffuseColor.rgb += vec3(1.0, 0.2, 0.0) * _lavaCrack * uBiomeFlags.x * 2.0;
      }

      // Tundra biome (uBiomeFlags.y)
      if (uBiomeFlags.y > 0.0) {
        vec3 _tundraAlbedo = _tundraBiome(vTerrainWorldPos, diffuseColor.rgb);
        float _tundW = uBiomeFlags.y * clamp(_biomeNoise * 0.4 + 0.6, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, _tundraAlbedo, _tundW);
      }

      // Desert biome (uBiomeFlags.z)
      if (uBiomeFlags.z > 0.0) {
        vec3 _desertAlbedo = _desertBiome(vTerrainWorldPos, diffuseColor.rgb);
        float _desW = uBiomeFlags.z * clamp(_biomeNoise * 0.4 + 0.6, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, _desertAlbedo, _desW);
      }`
    )

    // ── Biome-dependent roughness + wet edge roughness (C2) ───────────────────
    // Biome detection uses elevation and slope (face normal vs sphere normal).
    // grass=0.85, rock=0.65, sand (coastal)=0.92, snow (high alt)=0.3
    // Volcano=0.75, Tundra=0.15 (icy sheen), Desert=0.88
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

        // M31 Track A: Override roughness for new biomes
        // Volcano: rough dark rock (0.75)
        roughnessFactor = mix(roughnessFactor, 0.75, uBiomeFlags.x * 0.8);
        // Tundra: icy sheen (0.15 = very smooth/reflective)
        roughnessFactor = mix(roughnessFactor, 0.15, uBiomeFlags.y * 0.8);
        // Desert: coarse sand (0.88)
        roughnessFactor = mix(roughnessFactor, 0.88, uBiomeFlags.z * 0.8);

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
        // Increase bump intensity for volcano (more rugged), reduce for tundra (flat ice)
        float _normIntensity = mix(0.15, 0.30, _nRockW);
        _normIntensity = mix(_normIntensity, 0.45, uBiomeFlags.x * 0.6); // volcano: more rugged
        _normIntensity = mix(_normIntensity, 0.05, uBiomeFlags.y * 0.7); // tundra: flat ice
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

// ── Volcano summit detection ──────────────────────────────────────────────────
// Finds up to 3 approximate volcano summit world positions from the terrain geometry.
// Summits = vertices with the highest elevation in high-elevation bands.
function findVolcanoSummits(geo: THREE.BufferGeometry, seaRadius: number, maxCount = 3): THREE.Vector3[] {
  const pos = geo.attributes.position
  if (!pos) return []
  const summits: { elev: number; vec: THREE.Vector3 }[] = []
  const tmp = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i)
    const elev = tmp.length() - seaRadius
    // Only consider vertices above 80m as potential volcano summits
    if (elev > 80) {
      summits.push({ elev, vec: tmp.clone() })
    }
  }
  // Sort descending by elevation, pick top `maxCount` that are well-separated
  summits.sort((a, b) => b.elev - a.elev)
  const chosen: THREE.Vector3[] = []
  for (const { vec } of summits) {
    // Require at least 400m separation from already-chosen summits
    if (chosen.every(c => c.distanceTo(vec) > 400)) {
      chosen.push(vec)
      if (chosen.length >= maxCount) break
    }
  }
  return chosen
}

// ── Particle geometry helpers ─────────────────────────────────────────────────

// Volcanic ash: slow-falling dark grey particles within 50m of a summit
function makeAshParticles(summit: THREE.Vector3, count = 300): THREE.Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r   = Math.random() * 50
    const ang = Math.random() * Math.PI * 2
    const h   = Math.random() * 60 // spread vertically 0–60m above summit
    // In local space — particles distributed around summit in world coords
    const up = summit.clone().normalize()
    // Tangent basis from up vector
    const tangent = new THREE.Vector3(1, 0, 0)
    if (Math.abs(up.dot(tangent)) > 0.9) tangent.set(0, 1, 0)
    const t1 = tangent.clone().cross(up).normalize()
    const t2 = up.clone().cross(t1).normalize()
    const offset = t1.clone().multiplyScalar(Math.cos(ang) * r)
      .addScaledVector(t2, Math.sin(ang) * r)
      .addScaledVector(up, h)
    const wp = summit.clone().add(offset)
    positions[i * 3]     = wp.x
    positions[i * 3 + 1] = wp.y
    positions[i * 3 + 2] = wp.z
  }
  const ashGeo = new THREE.BufferGeometry()
  ashGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const ashMat = new THREE.PointsMaterial({
    color: 0x333333,
    size: 1.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  return new THREE.Points(ashGeo, ashMat)
}

// Sand particles: tiny sand-colored sprites blown horizontally near ground
function makeSandParticles(count = 500): THREE.Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Spread within ±80m flat disc near sea level (0–3m height)
    const r   = Math.random() * 80
    const ang = Math.random() * Math.PI * 2
    positions[i * 3]     = Math.cos(ang) * r
    positions[i * 3 + 1] = Math.random() * 3
    positions[i * 3 + 2] = Math.sin(ang) * r
  }
  const sandGeo = new THREE.BufferGeometry()
  sandGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const sandMat = new THREE.PointsMaterial({
    color: 0xd4a85c,
    size: 0.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  })
  return new THREE.Points(sandGeo, sandMat)
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

  const seaRadius = PLANET_RADIUS + (SEA_LEVEL ?? 0)

  // M31 Track A: Detect volcano summits once from terrain geometry
  const volcanoSummits = useMemo(
    () => findVolcanoSummits(terrainGeo, seaRadius, 3),
    [terrainGeo, seaRadius],
  )

  // M31 Track A: Volcano point lights (up to 3) — lava glow at each summit
  const volcanoLights = useMemo(
    () => volcanoSummits.map((pos) => {
      const light = new THREE.PointLight(0xff4400, 1.5, 30)
      light.position.copy(pos)
      return light
    }),
    [volcanoSummits],
  )

  // M31 Track A: Ash particle systems — one per volcano summit
  const ashParticleSystems = useMemo(
    () => volcanoSummits.map((pos) => makeAshParticles(pos, 300)),
    [volcanoSummits],
  )

  // M31 Track A: Sand particle system — single Points placed at origin, moved with player
  const sandParticles = useMemo(() => makeSandParticles(500), [])

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
    applyOceanCaustics(terrainMat, () => 0, seaRadius + 1)
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

    // M31 Track A: Update biome flags from weather store
    if (terrainShader?.uniforms?.uBiomeFlags) {
      const weather = useWeatherStore.getState().getPlayerWeather()
      const temp     = weather?.temperature ?? 15
      const humidity = weather?.humidity    ?? 0.5
      const windDir  = weather?.windDir     ?? 0

      // Volcano: high temperature (>55°C) — extreme heat zones
      const volcanoW = Math.max(0, Math.min(1, (temp - 55) / 20))
      // Tundra: very low temperature (<-10°C)
      const tundraW  = Math.max(0, Math.min(1, (-10 - temp) / 15))
      // Desert: moderate temperature (15–40°C) + low humidity (<0.25)
      const desertW  = Math.max(0, Math.min(1, (0.25 - humidity) / 0.2)) *
                       Math.max(0, Math.min(1, (temp - 15) / 15))

      terrainShader.uniforms.uBiomeFlags.value.set(volcanoW, tundraW, desertW)
      if (terrainShader.uniforms.uWindDir) {
        terrainShader.uniforms.uWindDir.value = windDir
      }
    }

    // M31 Track A: Animate volcano lava light flicker + ash drift
    const volcanoWeight = (terrainShader?.uniforms?.uBiomeFlags?.value as THREE.Vector3 | undefined)?.x ?? 0
    for (const light of volcanoLights) {
      // Flicker: randomize intensity each frame around 1.5 base
      light.intensity = volcanoWeight > 0
        ? 1.5 + Math.sin(t * 7.3 + light.position.x) * 0.6
        : 0
    }

    // M31 Track A: Animate ash particles — slow downward drift + lateral swirl
    for (const ashPts of ashParticleSystems) {
      const pPos = ashPts.geometry.attributes.position as THREE.BufferAttribute
      const arr  = pPos.array as Float32Array
      for (let i = 0; i < arr.length; i += 3) {
        // Drift: slowly move in the -up direction (approximate as -Y for now)
        arr[i + 1] -= delta * (0.8 + Math.sin(t + i) * 0.3)
        // Reset when too low (below summit minus 20m)
        const wp = new THREE.Vector3(arr[i], arr[i + 1], arr[i + 2])
        if (wp.length() < seaRadius + 5) {
          // Re-seed near summit
          const summit = ashParticleSystems.indexOf(ashPts)
          if (summit >= 0 && volcanoSummits[summit]) {
            const s   = volcanoSummits[summit]
            const r   = Math.random() * 50
            const ang = Math.random() * Math.PI * 2
            const up  = s.clone().normalize()
            const tan = new THREE.Vector3(1, 0, 0)
            if (Math.abs(up.dot(tan)) > 0.9) tan.set(0, 1, 0)
            const t1  = tan.clone().cross(up).normalize()
            const t2  = up.clone().cross(t1).normalize()
            const off = t1.clone().multiplyScalar(Math.cos(ang) * r)
              .addScaledVector(t2, Math.sin(ang) * r)
              .addScaledVector(up, Math.random() * 40)
            const nw  = s.clone().add(off)
            arr[i]     = nw.x
            arr[i + 1] = nw.y
            arr[i + 2] = nw.z
          }
        }
      }
      pPos.needsUpdate = true
      // Show ash only when volcano is active
      ashPts.visible = volcanoWeight > 0.1
    }

    // M31 Track A: Animate sand particles — blown horizontally in wind direction
    const desertWeight = (terrainShader?.uniforms?.uBiomeFlags?.value as THREE.Vector3 | undefined)?.z ?? 0
    sandParticles.visible = desertWeight > 0.1
    if (desertWeight > 0) {
      const sandPos = sandParticles.geometry.attributes.position as THREE.BufferAttribute
      const sArr    = sandPos.array as Float32Array
      const weatherNow = useWeatherStore.getState().getPlayerWeather()
      const windRad    = ((weatherNow?.windDir ?? 0) * Math.PI) / 180
      const windSpd    = (weatherNow?.windSpeed ?? 3) * 0.5
      for (let i = 0; i < sArr.length; i += 3) {
        sArr[i]     += Math.cos(windRad) * windSpd * delta
        sArr[i + 2] += Math.sin(windRad) * windSpd * delta
        // Wrap within ±80m radius
        if (Math.abs(sArr[i]) > 80 || Math.abs(sArr[i + 2]) > 80) {
          sArr[i]     = (Math.random() - 0.5) * 160
          sArr[i + 2] = (Math.random() - 0.5) * 160
        }
      }
      sandPos.needsUpdate = true
    }

    // M27 Track C3: Sunrise/sunset terrain tinting
    // Sun elevation proxy: sinA = sin(dayAngle). Golden hour = sinA in [-0.09, +0.26].
    // warmth factor 0→1 within that band, 0 outside.
    if (terrainShader?.uniforms?.uSunTintStrength) {
      const sinA = Math.sin(dayAngleRef.current)
      const inGoldenHour = sinA >= -0.09 && sinA <= 0.26
      if (inGoldenHour) {
        // Map sinA from [-0.09, 0.26] → warmth peak at sinA ≈ 0.085 (mid golden hour)
        const mid = (-0.09 + 0.26) / 2
        const half = (0.26 - (-0.09)) / 2
        const warmth = 1.0 - Math.abs(sinA - mid) / half
        terrainShader.uniforms.uSunTintStrength.value = Math.max(0, warmth)
      } else {
        terrainShader.uniforms.uSunTintStrength.value = 0.0
      }
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

      {/* M31 Track A: Volcano point lights — lava glow at summit positions */}
      {volcanoLights.map((light, i) => (
        <primitive key={`volcano-light-${i}`} object={light} />
      ))}

      {/* M31 Track A: Volcanic ash particle effects */}
      {ashParticleSystems.map((pts, i) => (
        <primitive key={`ash-particles-${i}`} object={pts} />
      ))}

      {/* M31 Track A: Desert sand particle effect — offset to player position by parent */}
      <primitive object={sandParticles} />
    </group>
  )
}
