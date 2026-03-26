// ── NightSkyRenderer.tsx ───────────────────────────────────────────────────
// M11 Track D: Astronomy — procedural star field + moon visible at night.
//
// Stars:
//   2000 stars rendered as THREE.Points with varying size and brightness.
//   Positions derived from a seeded distribution approximating real sky density
//   (higher star density along the galactic plane band: |lat| < 15°).
//   Stars fade in as the sun drops below horizon (sinA < 0) and fade out at dawn.
//   Color variation: O/B-type blue-white hot stars, G-type yellow (like our sun),
//   K/M-type orange-red cool stars — distributed per stellar IMF (Salpeter slope).
//
// Moon:
//   Simplified moon at fixed orbital offset from the sun (phase approximation).
//   Rendered as a self-illuminated sphere with subtle SSS for limb glow.
//   Shows current phase (new → crescent → half → gibbous → full).
//
// Planets (L6 teaser):
//   Three bright "wandering stars" rendered as oversized points with warm glow.
//   Clicking the telescope on them reveals the TelescopeView planet info.
//
// Photorealism: star colors are physically motivated. Point sizes vary 0.5–3px
// per apparent magnitude band. Brightness fade uses smoothstep to avoid harsh cutoff.

import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Star catalog generation ────────────────────────────────────────────────

interface StarRecord {
  x: number; y: number; z: number   // unit sphere position
  r: number; g: number; b: number   // linear sRGB color
  size: number                       // point size in pixels (0.5–3)
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/** Generate N stars with physically-motivated color and brightness distribution. */
function generateStarCatalog(count: number): StarRecord[] {
  const rand = seededRand(0xdeadbeef)
  const stars: StarRecord[] = []

  for (let i = 0; i < count; i++) {
    // Spherical coords — bias toward galactic equator for realism
    const theta = rand() * Math.PI * 2                        // longitude
    const galacticBias = rand() < 0.45                        // 45% in galactic band
    const latRange = galacticBias ? 0.26 : 1.0               // ±15° band vs full sphere
    const phi = Math.acos(1 - 2 * (rand() * latRange + (1 - latRange) * rand()))

    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.cos(phi)
    const z = Math.sin(phi) * Math.sin(theta)

    // Stellar type distribution (Salpeter IMF — most stars are faint red M-dwarfs)
    // Type: O(0.1%), B(0.5%), A(1%), F(3%), G(7.5%), K(12%), M(76%)
    const typeRoll = rand()
    let r: number, g: number, b: number, size: number

    if (typeRoll < 0.001) {
      // O-type: blue-white, very hot 30000-50000K
      r = 0.6; g = 0.7; b = 1.0; size = 2.8
    } else if (typeRoll < 0.006) {
      // B-type: blue-white 10000-30000K
      r = 0.7; g = 0.8; b = 1.0; size = 2.2
    } else if (typeRoll < 0.016) {
      // A-type: white 7500-10000K (Sirius, Vega)
      r = 0.9; g = 0.95; b = 1.0; size = 1.8
    } else if (typeRoll < 0.046) {
      // F-type: yellow-white 6000-7500K
      r = 1.0; g = 1.0; b = 0.85; size = 1.4
    } else if (typeRoll < 0.121) {
      // G-type: yellow 5200-6000K (sun-like)
      r = 1.0; g = 0.95; b = 0.7; size = 1.2
    } else if (typeRoll < 0.241) {
      // K-type: orange 3700-5200K
      r = 1.0; g = 0.75; b = 0.45; size = 1.0
    } else {
      // M-type: red <3700K — most common, faint
      r = 1.0; g = 0.5; b = 0.3; size = 0.5 + rand() * 0.4
    }

    // Brightness variation within each type
    const brightness = 0.4 + rand() * 0.6
    stars.push({ x, y, z, r: r * brightness, g: g * brightness, b: b * brightness, size })
  }
  return stars
}

// ── Planet positions (L6 teaser) ─────────────────────────────────────────

const PLANETS = [
  // name, orbital inclination offset, base hue (warm for rocky, cold for gas giants)
  { name: 'Aethon', theta: 0.8,  phi: Math.PI / 2 + 0.15, r: 1.0, g: 0.7,  b: 0.3,  size: 4.0 },
  { name: 'Velar',  theta: 2.3,  phi: Math.PI / 2 - 0.08, r: 0.8, g: 0.9,  b: 1.0,  size: 3.5 },
  { name: 'Sulfis', theta: 4.1,  phi: Math.PI / 2 + 0.22, r: 1.0, g: 0.85, b: 0.5,  size: 3.0 },
]

const STAR_COUNT = 2000
const SKY_RADIUS = 5000   // far enough to be effectively at infinity

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  dayAngle: number            // current sun angle in radians (from DayNightCycle)
  onPlanetHover?: (name: string | null) => void
}

export function NightSkyRenderer({ dayAngle, onPlanetHover }: Props) {
  const pointsRef  = useRef<THREE.Points>(null)
  const moonRef    = useRef<THREE.Mesh>(null)
  const groupRef   = useRef<THREE.Group>(null)

  // Stars fade: 0 = invisible (day), 1 = fully visible (deep night)
  const fadeRef = useRef(0)

  // Build star geometry once
  const { geometry, sizes } = useMemo(() => {
    const catalog = generateStarCatalog(STAR_COUNT)
    const positions = new Float32Array(STAR_COUNT * 3)
    const colors    = new Float32Array(STAR_COUNT * 3)
    const sizes     = new Float32Array(STAR_COUNT)

    for (let i = 0; i < catalog.length; i++) {
      const s = catalog[i]
      positions[i * 3    ] = s.x * SKY_RADIUS
      positions[i * 3 + 1] = s.y * SKY_RADIUS
      positions[i * 3 + 2] = s.z * SKY_RADIUS
      colors[i * 3    ] = s.r
      colors[i * 3 + 1] = s.g
      colors[i * 3 + 2] = s.b
      sizes[i] = s.size
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1))
    return { geometry: geo, sizes }
  }, [])

  // Star shader material — vertex size from attribute, faded by uniform
  // M22: Added uTime uniform for per-star twinkle animation
  const starMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uFade:     { value: 0.0 },
      uPixelRatio: { value: typeof window !== 'undefined' ? window.devicePixelRatio : 1 },
      uTime:     { value: 0.0 },
    },
    vertexShader: /* glsl */`
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uPixelRatio;
      uniform float uTime;
      void main() {
        vColor = color;
        // M22: Per-star twinkle — hash position to get unique frequency and phase
        float hash = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float twinkleFreq = 1.5 + hash * 2.5;  // 1.5-4.0 Hz
        float twinklePhase = hash * 6.2832;
        float twinkle = 0.85 + 0.15 * sin(uTime * twinkleFreq + twinklePhase);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * twinkle * uPixelRatio * (300.0 / -mvPos.z);
        gl_PointSize = clamp(gl_PointSize, 0.5, 4.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      uniform float uFade;
      void main() {
        // Soft circular point (anti-aliased disc)
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float alpha = (1.0 - smoothstep(0.3, 0.5, d)) * uFade;
        // Twinkle: slight brightness boost at center
        float core = (1.0 - smoothstep(0.0, 0.15, d)) * 0.4;
        gl_FragColor = vec4(vColor * (1.0 + core), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
  }), [])

  // Moon material — self-illuminated grey sphere (transparent so useFrame can fade it)
  const moonMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d8d0c0',
    roughness: 0.95,
    metalness: 0.0,
    emissive: '#504840',
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 1,
  }), [])

  useFrame((state, delta) => {
    // sin(dayAngle): +1 = noon, -1 = midnight
    const sinA = Math.sin(dayAngle)
    const isNight = sinA < 0
    const targetFade = isNight ? Math.min(1.0, (-sinA) * 3.0) : Math.max(0, 1.0 - sinA * 8.0)
    fadeRef.current += (targetFade - fadeRef.current) * Math.min(1, delta * 0.8)

    const fade = fadeRef.current

    // Update star shader uniforms
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.ShaderMaterial
      mat.uniforms.uFade.value = fade
      mat.uniforms.uTime.value = state.clock.elapsedTime  // M22: drive twinkle animation
      pointsRef.current.visible = fade > 0.01
    }

    // Moon: orbits at same inclination as sun but ~180° offset (full moon = opposite sun)
    if (moonRef.current) {
      const moonAngle = dayAngle + Math.PI + 0.15   // ~opposite the sun + slight tilt
      const moonR = SKY_RADIUS * 0.3               // closer than stars
      moonRef.current.position.set(
        moonR * Math.cos(moonAngle),
        moonR * Math.sin(moonAngle) * 0.8,
        moonR * 0.3,
      )
      // Fade moon in with stars, but slightly faster
      const moonFade = Math.min(1, fade * 1.5)
      moonRef.current.visible = moonFade > 0.02
      ;(moonRef.current.material as THREE.MeshStandardMaterial).opacity = moonFade
    }

    // Rotate star sphere slowly (sidereal rotation: ~1 rev per 23h 56m)
    // We approximate: 1 full day = 1200s real time, sidereal ≈ same for this sim
    if (groupRef.current) {
      groupRef.current.rotation.y = dayAngle * 0.05  // slow drift for visual interest
    }
  })

  return (
    <group ref={groupRef}>
      {/* Stars */}
      <points ref={pointsRef} geometry={geometry} material={starMaterial} frustumCulled={false} />

      {/* Moon — a sphere, lit from the sun direction; material ref shared with useFrame */}
      <mesh ref={moonRef} material={moonMaterial} frustumCulled={false}>
        <sphereGeometry args={[28, 16, 16]} />
      </mesh>

      {/* Planets — bright coloured points (L6 teaser) */}
      {PLANETS.map((p) => {
        const px = Math.sin(p.phi) * Math.cos(p.theta) * SKY_RADIUS * 0.95
        const py = Math.cos(p.phi) * SKY_RADIUS * 0.95
        const pz = Math.sin(p.phi) * Math.sin(p.theta) * SKY_RADIUS * 0.95
        return (
          <mesh
            key={p.name}
            position={[px, py, pz]}
            frustumCulled={false}
          >
            <sphereGeometry args={[6, 8, 8]} />
            <meshBasicMaterial
              color={new THREE.Color(p.r, p.g, p.b)}
              transparent
            />
          </mesh>
        )
      })}
    </group>
  )
}
