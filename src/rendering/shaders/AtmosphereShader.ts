// ── AtmosphereShader.ts ────────────────────────────────────────────────────
// M19 Track B: Physically-motivated Rayleigh + Mie single-scattering sky shader.
//
// Physics basis:
//   Rayleigh scattering — short wavelengths (blue) scatter more than long ones.
//   The scattering coefficient scales as 1/λ⁴, so blue light (~450nm) scatters
//   ~5.5x more than red (~700nm). This makes the daytime sky blue and sunsets
//   orange/red (long path through atmosphere = blue scattered away, leaving red).
//
//   Mie scattering — wavelength-independent forward scattering from aerosols.
//   Creates the bright haze halo around the sun (sun disc glow).
//
// Implementation:
//   Single-pass fragment shader on the atmosphere shell mesh.
//   Integrates scattering along view ray from surface through thin atmosphere
//   using 8 in-scatter samples (sufficient for game-quality results).
//   No LUT precomputation needed — evaluated in real time per fragment.
//
// Coefficients (from Nishita 1993 / Preetham 1999):
//   Rayleigh: βR = (5.5e-6, 13.0e-6, 22.4e-6) m⁻¹   [R, G, B]
//   Mie:      βM = 2.0e-5 m⁻¹  (uniform across λ for aerosols)
//   Mie anisotropy g = 0.76 (strong forward peak)
//
// Sun direction is passed as a uniform linked to DayNightCycle.
// Night fade: when sun.y < 0 atmosphere becomes transparent to show NightSkyRenderer.

import * as THREE from 'three'

// ── Shader source ─────────────────────────────────────────────────────────────

const vertexShader = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vWorldDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    // View direction from camera to this vertex (unnormalized — normalized in fragment)
    vWorldDir = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */`
  // ── Uniforms ──────────────────────────────────────────────────────────────
  uniform vec3  uSunDirection;   // normalized sun direction in world space
  uniform float uPlanetRadius;   // metres — sphere radius of solid planet
  uniform float uAtmoRadius;     // metres — outer edge of atmosphere shell
  uniform float uAtmoOpacity;    // overall opacity scale (1 = full, 0 = night fade)
  uniform float uTime;           // not used for scattering, but available for future fx

  // ── Varyings ──────────────────────────────────────────────────────────────
  varying vec3 vWorldPos;
  varying vec3 vWorldDir;

  // ── Scattering constants ────────────────────────────────────────────────
  // Rayleigh coefficients (wavelength-dependent, m⁻¹)
  const vec3  BETA_R   = vec3(5.5e-6, 13.0e-6, 22.4e-6);
  // Mie coefficient (wavelength-independent for aerosols, m⁻¹)
  const float BETA_M   = 2.0e-5;
  // Mie anisotropy (Henyey-Greenstein g factor; 0.76 = strong forward peak)
  const float G_MIE    = 0.76;
  // Scale heights — altitude at which density falls to 1/e of sea-level value
  const float H_R      = 800.0;    // Rayleigh scale height (m)
  const float H_M      = 120.0;    // Mie scale height (m)   (aerosols hug the ground)
  // Number of in-scatter samples along view ray
  const int   N_SAMPLES = 8;

  // ── Phase functions ──────────────────────────────────────────────────────

  // Rayleigh phase — symmetric, depends on angle between view and sun
  float phaseRayleigh(float cosTheta) {
    return (3.0 / (16.0 * 3.14159265)) * (1.0 + cosTheta * cosTheta);
  }

  // Henyey-Greenstein phase — strongly forward-peaked for Mie scattering
  float phaseMie(float cosTheta) {
    float g2 = G_MIE * G_MIE;
    float denom = 1.0 + g2 - 2.0 * G_MIE * cosTheta;
    return (1.0 / (4.0 * 3.14159265)) * ((1.0 - g2) / (denom * sqrt(denom)));
  }

  // ── Ray-sphere intersection ───────────────────────────────────────────────
  // Returns the two intersection distances (tMin, tMax).
  // If no intersection, tMin > tMax.
  vec2 raySphere(vec3 ro, vec3 rd, float radius) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - radius * radius;
    float disc = b * b - c;
    if (disc < 0.0) return vec2(1e9, -1e9);
    float sqrtDisc = sqrt(disc);
    return vec2(-b - sqrtDisc, -b + sqrtDisc);
  }

  // ── Density at altitude h above planet surface ────────────────────────────
  vec2 densityAt(float h) {
    // x = Rayleigh density, y = Mie density
    h = max(0.0, h);
    return vec2(exp(-h / H_R), exp(-h / H_M));
  }

  // ── Optical depth along a ray from point p in direction rd ───────────────
  // Integrates density * ds from p to atmosphere exit.
  vec2 opticalDepth(vec3 p, vec3 rd, float planetR, float atmoR) {
    vec2 atmoHit = raySphere(p, rd, atmoR);
    float tMax = max(0.0, atmoHit.y);
    float stepSize = tMax / float(N_SAMPLES);
    vec2 depth = vec2(0.0);
    for (int i = 0; i < N_SAMPLES; i++) {
      vec3 sampleP = p + rd * (float(i) + 0.5) * stepSize;
      float alt = length(sampleP) - planetR;
      depth += densityAt(alt) * stepSize;
    }
    return depth;
  }

  // ── Main scattering integral ─────────────────────────────────────────────
  vec3 scatter(
    vec3 rayOrigin,    // camera position (may be on surface or above)
    vec3 rayDir,       // normalized view direction
    vec3 sunDir,       // normalized sun direction
    float planetR,
    float atmoR
  ) {
    // Find view ray atmosphere entry/exit
    vec2 atmoHit = raySphere(rayOrigin, rayDir, atmoR);
    if (atmoHit.x > atmoHit.y) return vec3(0.0);

    // Clamp entry to be behind camera (tMin ≥ 0)
    float tMin = max(0.0, atmoHit.x);
    float tMax = atmoHit.y;

    // If ray hits planet, clamp to planet surface entry
    vec2 planetHit = raySphere(rayOrigin, rayDir, planetR);
    if (planetHit.x > 0.0) tMax = min(tMax, planetHit.x);

    float stepSize = (tMax - tMin) / float(N_SAMPLES);

    // Accumulated in-scatter color
    vec3  rayleighSum = vec3(0.0);
    float mieSum      = 0.0;

    // Accumulated optical depth along view ray (for transmittance)
    vec2 viewOptDepth = vec2(0.0);

    for (int i = 0; i < N_SAMPLES; i++) {
      // Sample point along view ray
      vec3 sp = rayOrigin + rayDir * (tMin + (float(i) + 0.5) * stepSize);
      float alt = length(sp) - planetR;
      vec2 density = densityAt(alt) * stepSize;

      // Accumulated density for transmittance
      viewOptDepth += density;

      // Optical depth toward sun (transmittance along sun ray)
      vec2 sunDepth = opticalDepth(sp, sunDir, planetR, atmoR);

      // Total optical depth = view optical depth + sun optical depth
      vec2 totalDepth = viewOptDepth + sunDepth;

      // Transmittance (Beer-Lambert law)
      vec3 transmittance = exp(-(BETA_R * totalDepth.x + BETA_M * totalDepth.y));

      // Accumulate in-scatter weighted by density and transmittance
      rayleighSum += density.x * transmittance;
      mieSum      += density.y * transmittance.r; // mie is scalar
    }

    // Phase functions
    float cosTheta = dot(rayDir, sunDir);
    float phR = phaseRayleigh(cosTheta);
    float phM = phaseMie(cosTheta);

    // Final sky color: Rayleigh (blue sky) + Mie (sun haze)
    vec3 color = rayleighSum * BETA_R * phR
               + mieSum      * BETA_M * phM;

    // Scale to perceptually pleasing range (physical units are very small numbers)
    return color * 20.0;
  }

  void main() {
    vec3 rayDir  = normalize(vWorldDir);
    vec3 sunDir  = normalize(uSunDirection);

    // For fragment rays from inside the atmosphere shell we use the camera as origin
    vec3 skyColor = scatter(cameraPosition, rayDir, sunDir, uPlanetRadius, uAtmoRadius);

    // ── Night / twilight fade ────────────────────────────────────────────────
    // When sun is below horizon, fade out so stars show through.
    // Smooth blend: full at sun.y = 0.05 (5% above horizon), zero at sun.y = -0.05.
    float sunElevation = sunDir.y;  // world-up is +Y
    // uAtmoOpacity is pre-computed on CPU and passed in (smooth 10-minute twilight)
    float fade = uAtmoOpacity;

    // Limb brightening: atmosphere is thicker at the horizon (grazing angle).
    // The view-ray near the limb (perpendicular to view-up) picks up more path length.
    // We approximate this by boosting colors near the equator of the sky sphere.
    // Abs(rayDir.y) near zero = horizon; abs 1 = zenith/nadir.
    float limbFactor = 1.0 + (1.0 - abs(rayDir.y)) * 0.4;
    skyColor *= limbFactor;

    // Horizon glow enhancement — warm orange tint in the direction of the sun
    // near sunset/sunrise when sun is near the horizon.
    float sunHorizonProx = max(0.0, 1.0 - abs(sunElevation) * 10.0);
    float sunAlignment   = max(0.0, dot(rayDir, vec3(sunDir.x, 0.0, sunDir.z)));  // horizontal alignment
    float sunGlow        = sunHorizonProx * sunAlignment * sunAlignment; // squared for tighter halo
    skyColor += vec3(0.9, 0.4, 0.05) * sunGlow * 0.8;

    // Clamp to avoid over-saturation (HDR-like tonemapping for the sky)
    // Simple Reinhard tonemap on the sky color
    skyColor = skyColor / (skyColor + vec3(1.0));
    // Gamma correction (linear → sRGB)
    skyColor = pow(max(skyColor, vec3(0.0)), vec3(1.0 / 2.2));

    // Opacity: zero at nadir (below horizon don't draw), fade out at night
    // The atmosphere shell is rendered BackSide so nadir fragments face down —
    // we let alpha do the work rather than discarding to keep smooth edges.
    float alpha = fade * clamp(skyColor.r + skyColor.g + skyColor.b, 0.0, 1.0);

    gl_FragColor = vec4(skyColor, alpha * fade);
  }
`

// ── AtmosphereShader class ────────────────────────────────────────────────────

export interface AtmosphereUniforms {
  [key: string]: THREE.IUniform<any>
  uSunDirection: THREE.IUniform<THREE.Vector3>
  uPlanetRadius: THREE.IUniform<number>
  uAtmoRadius:   THREE.IUniform<number>
  uAtmoOpacity:  THREE.IUniform<number>
  uTime:         THREE.IUniform<number>
}

/**
 * Creates a ShaderMaterial implementing Rayleigh + Mie single-scattering.
 *
 * @param planetRadius  Solid planet radius in metres (e.g. PLANET_RADIUS)
 * @param atmoRadius    Outer atmosphere shell radius in metres (e.g. PLANET_RADIUS * 1.05)
 */
export function makeAtmosphereShader(
  planetRadius: number,
  atmoRadius: number,
): THREE.ShaderMaterial {
  const uniforms: AtmosphereUniforms = {
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uPlanetRadius: { value: planetRadius },
    uAtmoRadius:   { value: atmoRadius },
    uAtmoOpacity:  { value: 1.0 },
    uTime:         { value: 0.0 },
  }

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite:  false,
    side:        THREE.BackSide,   // render inside shell — faces camera from outside
    blending:    THREE.NormalBlending,
  })
}

/**
 * Updates atmosphere shader uniforms each frame.
 *
 * @param mat        The ShaderMaterial returned by makeAtmosphereShader
 * @param dayAngle   Current sun angle in radians (from DayNightCycle)
 * @param sunOrbitR  Sun orbit radius used to compute sun position
 * @param delta      Frame delta time in seconds
 */
export function updateAtmosphereUniforms(
  mat: THREE.ShaderMaterial,
  dayAngle: number,
  sunOrbitR: number,
  delta: number,
): void {
  const u = mat.uniforms as AtmosphereUniforms

  // Sun direction: normalized vector toward sun
  const sx = Math.cos(dayAngle)
  const sy = Math.sin(dayAngle)
  u.uSunDirection.value.set(sx, sy, 3000 / sunOrbitR).normalize()

  // Twilight fade: smooth 10-minute (600s real-time) transition.
  // sinA = 1 at noon, -1 at midnight, 0 at horizon.
  const sinA = Math.sin(dayAngle)

  // Target opacity: full day above horizon, twilight zone [-0.05..+0.05], night below.
  // We use a smooth sigmoid-like transition over a ±5% band around the horizon.
  const targetOpacity = THREE.MathUtils.smoothstep(sinA, -0.08, 0.04)

  // Lerp toward target at a rate that gives ~10 real-time minutes for full transition
  // 600s * 0.001667 ≈ 1.0 total lerp, but we cap delta to avoid large jumps
  const lerpSpeed = 0.5  // per second — fast enough to be responsive
  const current   = u.uAtmoOpacity.value
  u.uAtmoOpacity.value = current + (targetOpacity - current) * Math.min(1, delta * lerpSpeed)

  u.uTime.value += delta
}
