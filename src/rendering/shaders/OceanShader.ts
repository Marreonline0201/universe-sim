/**
 * OceanShader.ts
 * PBR ocean ShaderMaterial for Universe Sim.
 *
 * Features:
 *   - Gerstner wave vertex displacement (2-octave: 8m + 20m wavelengths)
 *   - Fresnel reflections (Schlick approximation) blending sky colour vs refraction
 *   - Shoreline foam via depth-based edge detection + 2-frequency scrolling noise
 *   - Underwater caustics projected onto terrain via onBeforeCompile (see applyOceanCaustics)
 *
 * Usage:
 *   const { material, update } = createOceanMaterial(renderer)
 *   // in useFrame: update(clock.getElapsedTime())
 */

import * as THREE from 'three'
import { PLANET_RADIUS, SEA_LEVEL } from '../../world/SpherePlanet'

// ── Constants ──────────────────────────────────────────────────────────────────
export const OCEAN_COLOR = new THREE.Color(0x0a2e3d)  // deep blue-green per spec
const SEA_RADIUS = PLANET_RADIUS + (SEA_LEVEL ?? 0) + 1 // ocean mesh sits 1m above terrain sea level

// ── Vertex Shader ─────────────────────────────────────────────────────────────
// Gerstner wave displacement:
//   Two octaves (A=0.3m, λ=8m) + (A=0.15m, λ=20m), steepness Q=0.4
//   The displacement is applied in world-tangent space on a sphere by projecting
//   the wave direction onto the local tangential plane, then offsetting along
//   the sphere normal (for the vertical component) and tangent (for horizontal).
const oceanVertexShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uSeaRadius;

varying vec3  vWorldPos;
varying vec3  vWorldNormal;
varying float vWaterDepth;   // >0 = above sea floor, used for foam
varying vec2  vUv;

// ── Gerstner wave ──────────────────────────────────────────────────────────────
// p  : world-space position on the undisplaced sphere
// dir: wave direction (2D, on the xz plane for simplicity)
// A  : amplitude (metres)
// L  : wavelength (metres)
// Q  : steepness [0–1]
// t  : time
vec3 gerstnerWave(vec3 p, vec2 dir, float A, float L, float Q, float t) {
  float k   = 2.0 * 3.14159265 / L;      // wave number
  float c   = sqrt(9.81 / k);             // phase speed (deep water dispersion)
  float phi = k * (dot(dir, p.xz) - c * t);

  // Gerstner horizontal displacement (in xz)
  float qAk = Q * A * k;
  vec3 disp;
  disp.x = qAk * dir.x * cos(phi);
  disp.z = qAk * dir.y * cos(phi);
  disp.y = A * sin(phi);                  // vertical displacement
  return disp;
}

void main() {
  // Start from the base sphere position (model space = world space for this mesh)
  vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
  vec3 wpos = worldPos4.xyz;

  // ── Sphere-relative Gerstner ───────────────────────────────────────────────
  // We treat xz as the "horizontal" plane.
  // Two wave trains at different scales / directions.
  vec3 d1 = gerstnerWave(wpos, normalize(vec2(1.0, 0.6)),  0.30,  8.0, 0.4, uTime);
  vec3 d2 = gerstnerWave(wpos, normalize(vec2(-0.5, 1.0)), 0.15, 20.0, 0.4, uTime * 0.7);
  vec3 disp = d1 + d2;

  // Apply displacement in world space (tangent: xz, normal: y)
  wpos += disp;

  // Recompute a perturbed normal from the Gerstner formula for lighting.
  // N = normalize(original_normal - tangent_components_of_disp)
  vec3 origNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

  // Approximate displaced normal: tilt by horizontal displacement / amplitude
  vec3 tangentX = normalize(cross(origNorm, vec3(0.0, 0.0, 1.0)));
  vec3 tangentZ = normalize(cross(origNorm, tangentX));
  vec3 pertNorm = normalize(origNorm
    - tangentX * disp.x * 0.8
    - tangentZ * disp.z * 0.8);

  vWorldPos    = wpos;
  vWorldNormal = pertNorm;
  vUv          = uv;

  // Depth above sea floor (used for foam): positive when above floor, 0 at surface
  vWaterDepth  = length(wpos) - uSeaRadius + 2.0; // +2 keeps foam band 2m wide

  gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);
}
`

// ── Fragment Shader ────────────────────────────────────────────────────────────
// PBR-like output:
//   - Base colour: deep blue-green
//   - Fresnel (Schlick): reflection vs refraction blend
//   - Shoreline foam: 2-freq scrolling noise where water is shallow
//   - Directional light approximation (sun)
const oceanFragmentShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec3  uSkyColor;      // sky colour for Fresnel reflection
uniform vec3  uSunDirection;  // world-space sun direction (normalised)
uniform vec3  uSunColor;      // sun light colour

varying vec3  vWorldPos;
varying vec3  vWorldNormal;
varying float vWaterDepth;
varying vec2  vUv;

// ── Hash / noise ───────────────────────────────────────────────────────────────
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y);
}

// 2-octave scrolling foam noise
float foamNoise(vec2 uv, float t) {
  vec2 scroll1 = uv * 4.0  + vec2(t * 0.08, t * 0.05);
  vec2 scroll2 = uv * 10.0 + vec2(-t * 0.12, t * 0.09);
  return noise2(scroll1) * 0.6 + noise2(scroll2) * 0.4;
}

// ── Schlick Fresnel ────────────────────────────────────────────────────────────
float fresnel(vec3 viewDir, vec3 normal, float f0) {
  float cosTheta = clamp(1.0 - dot(viewDir, normal), 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(cosTheta, 5.0);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);  // view direction

  // ── Base ocean colour ──────────────────────────────────────────────────────
  vec3 baseColor = vec3(0.04, 0.18, 0.24);  // #0a2e3d in linear

  // ── Diffuse (Lambert) ──────────────────────────────────────────────────────
  float NdotL   = max(dot(N, uSunDirection), 0.0);
  vec3  diffuse = baseColor * uSunColor * NdotL * 0.6;

  // ── Specular (Blinn-Phong for water surface micro-glints) ─────────────────
  vec3  H       = normalize(uSunDirection + V);
  float NdotH   = max(dot(N, H), 0.0);
  float spec    = pow(NdotH, 256.0) * 1.4;  // very tight highlight, near-mirror
  vec3  specular = uSunColor * spec;

  // ── Fresnel reflection ─────────────────────────────────────────────────────
  // f0 for water ≈ 0.02 (refractive index ~1.33)
  float fresnelFactor = fresnel(V, N, 0.02);
  // Sky reflection blended by Fresnel
  vec3 reflected = uSkyColor * fresnelFactor;

  // ── Ambient (underwater scattering simulation) ─────────────────────────────
  vec3 ambient = baseColor * 0.18 + vec3(0.0, 0.02, 0.04);

  // ── Combine lighting ───────────────────────────────────────────────────────
  vec3 color = ambient + diffuse + specular + reflected;

  // ── Shoreline foam ─────────────────────────────────────────────────────────
  // vWaterDepth < 0 → at shore; > 2 → deep water
  // foam zone: vWaterDepth in [-2, 1.5]
  float foamZone  = clamp(1.0 - vWaterDepth / 1.5, 0.0, 1.0);
  if (foamZone > 0.001) {
    // Use world xz as UV for noise (world-space, metres)
    float fn    = foamNoise(vWorldPos.xz * 0.02, uTime);
    // Threshold noise for foam patches
    float foam  = smoothstep(0.45, 0.75, fn) * foamZone;
    // Foam is white, alpha fades from 0.8 at shore to 0 at edge
    color = mix(color, vec3(1.0, 1.0, 1.0), foam * 0.8 * foamZone);
  }

  // ── Opacity: more transparent in deep water, opaque at shore ──────────────
  float alpha = mix(0.72, 0.88, clamp(1.0 - vWaterDepth / 4.0, 0.0, 1.0));

  gl_FragColor = vec4(color, alpha);
}
`

// ── createOceanMaterial ────────────────────────────────────────────────────────
export interface OceanMaterialHandle {
  material: THREE.ShaderMaterial
  /** Call every frame with elapsed time in seconds */
  update: (time: number, sunDirection?: THREE.Vector3, sunColor?: THREE.Color, skyColor?: THREE.Color) => void
}

export function createOceanMaterial(): OceanMaterialHandle {
  const uniforms = {
    uTime:         { value: 0 },
    uSeaRadius:    { value: SEA_RADIUS },
    uSkyColor:     { value: new THREE.Color(0.53, 0.80, 1.00) },
    uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    uSunColor:     { value: new THREE.Color(1.0, 0.95, 0.85) },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    transparent:    true,
    side:           THREE.FrontSide,
    depthWrite:     false,  // standard for transparent water surface
  })

  const update = (
    time: number,
    sunDirection?: THREE.Vector3,
    sunColor?: THREE.Color,
    skyColor?: THREE.Color,
  ) => {
    uniforms.uTime.value = time
    if (sunDirection) uniforms.uSunDirection.value.copy(sunDirection)
    if (sunColor)     uniforms.uSunColor.value.copy(sunColor)
    if (skyColor)     uniforms.uSkyColor.value.copy(skyColor)
  }

  return { material, update }
}

// ── applyOceanCaustics ─────────────────────────────────────────────────────────
/**
 * Patches a MeshStandardMaterial (the terrain) via onBeforeCompile to project
 * animated caustic patterns onto fragments that lie below sea level + 2m.
 *
 * The caustic pattern is a 2D animated noise evaluated at worldPos.xz.
 * Intensity is attenuated by depth so surface-adjacent terrain is brightest.
 *
 * Call this on the terrain material BEFORE it is first rendered.
 */
const CAUSTIC_GLSL = /* glsl */`
// ── Caustic helpers ────────────────────────────────────────────────────────────
float _cHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
float _cNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(_cHash(i), _cHash(i+vec2(1,0)), f.x),
    mix(_cHash(i+vec2(0,1)), _cHash(i+vec2(1,1)), f.x), f.y);
}
float causticPattern(vec2 uv, float t) {
  // Two animated noise layers in opposite directions
  float a = _cNoise(uv + vec2( t * 0.10,  t * 0.07));
  float b = _cNoise(uv + vec2(-t * 0.08,  t * 0.11) + 3.7);
  // Interference produces bright caustic rings
  return pow(abs(a - b), 0.5) * 1.2;
}
`

export function applyOceanCaustics(
  terrainMat: THREE.MeshStandardMaterial,
  getTime: () => number,
  seaRadiusOverride?: number,
): void {
  const seaR = seaRadiusOverride ?? SEA_RADIUS

  // We store a caustic time ref that gets updated via a uniform on the material
  const causticUniforms = {
    uCausticTime:   { value: 0 },
    uCausticSeaR:   { value: seaR },
  }

  // Attach update callback reference to material user data for the frame loop
  ;(terrainMat as unknown as Record<string, unknown>)._causticUpdate = (t: number) => {
    causticUniforms.uCausticTime.value = t
  }

  const existingOBC = terrainMat.onBeforeCompile.bind(terrainMat)

  terrainMat.onBeforeCompile = (shader, renderer) => {
    // Run any previously set onBeforeCompile first (terrain detail noise etc.)
    existingOBC(shader, renderer)

    // Merge our caustic uniforms
    Object.assign(shader.uniforms, causticUniforms)

    // Inject varying if not already present (terrain already declares vTerrainWorldPos)
    if (!shader.vertexShader.includes('vTerrainWorldPos')) {
      shader.vertexShader = 'varying vec3 vTerrainWorldPos;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      )
    }
    if (!shader.fragmentShader.includes('vTerrainWorldPos')) {
      shader.fragmentShader = 'varying vec3 vTerrainWorldPos;\n' + shader.fragmentShader
    }

    // Inject caustic uniforms + GLSL into fragment shader
    shader.fragmentShader =
      'uniform float uCausticTime;\nuniform float uCausticSeaR;\n' +
      CAUSTIC_GLSL +
      shader.fragmentShader

    // Apply caustic colour after base colour is resolved
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        // Only apply caustics to fragments below sea level + 2m
        float _elevC = length(vTerrainWorldPos) - uCausticSeaR;
        if (_elevC < 2.0) {
          // Depth attenuation: 1 at surface, 0 at 12m below
          float _depthAtten = clamp(1.0 - (-_elevC) / 12.0, 0.0, 1.0);
          // Caustic UV: world xz scaled for ~3m pattern size
          float _c = causticPattern(vTerrainWorldPos.xz * 0.3, uCausticTime * 0.1);
          // Add warm caustic light (sun-coloured)
          diffuseColor.rgb += vec3(0.18, 0.14, 0.08) * _c * _depthAtten;
        }
      }`
    )
  }
}
