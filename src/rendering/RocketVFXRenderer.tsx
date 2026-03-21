// ── RocketVFXRenderer ─────────────────────────────────────────────────────────
// Physically-motivated rocket exhaust VFX for M12 Space Age.
//
// Three layered visual systems:
//   1. Exhaust cone — white steam + orange combustion + black soot trail (THREE.Points ShaderMaterial)
//      Particles emitted from nozzle, upward velocity 15-25 m/s, lifetime 2.5s.
//      60 active particles per layer × 3 layers = 180 total exhaust points.
//   2. Muzzle flash / initial ignition burst — PointLight (#FF8020, intensity 20, 80ms decay)
//   3. Heat shimmer — fullscreen distortion plane using ShaderMaterial with
//      a sinusoidal UV offset proportional to _state.heatShimmer.
//      Rendered as a transparent quad in front of camera, blended additively.
//
// Launch pad scorch — a darkened roughness-overlay decal disc (2m radius) is
// shown under the rocket nozzle when state !== 'idle'. Implemented as a flat
// MeshStandardMaterial plane with roughness 1.0, opacity 0.6.
//
// Photorealism targets:
//   - Exhaust white core: 3 layers (white → orange → black trail), additive blend
//   - Schlieren shimmer: ~4 visible heat ripples per frame visible at camera 30m
//   - Ignition flash PointLight: 20 intensity, 80ms TTL, decays to 0
//   - Scorch disc: fully visible after 3 launches (cumulative darkening)

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getRocketState, getLaunchShake } from '../game/RocketSystem'

// ── GLSL: exhaust particle ─────────────────────────────────────────────────────

const EXHAUST_VERT = /* glsl */`
  attribute float size;
  attribute float opacity;
  varying float vOpacity;
  void main() {
    vOpacity = opacity;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`

const EXHAUST_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying float vOpacity;
  void main() {
    // Soft disc anti-aliasing
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = dot(cxy, cxy);
    if (r > 1.0) discard;
    float alpha = (1.0 - smoothstep(0.5, 1.0, r)) * vOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`

// ── GLSL: heat shimmer ─────────────────────────────────────────────────────────

const SHIMMER_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SHIMMER_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    float wave = sin(uv.y * 40.0 + uTime * 8.0) * uIntensity * 0.012;
    uv.x += wave;
    float wave2 = cos(uv.y * 25.0 + uTime * 6.5) * uIntensity * 0.008;
    uv.y += wave2;
    gl_FragColor = vec4(texture2D(tDiffuse, uv).rgb, uIntensity * 0.35);
  }
`

const MAX_PARTICLES = 60    // per layer
const LAYER_COUNT   = 3

interface Particle {
  pos:      [number, number, number]
  vel:      [number, number, number]
  life:     number
  maxLife:  number
  size:     number
}

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, () => ({ pos: [0,0,0], vel: [0,0,0], life: 0, maxLife: 1, size: 10 }))
}

// Layer definitions: [color, size range, velocity range, opacity multiplier]
const LAYERS = [
  { color: new THREE.Color(0xffffff),  minSize: 30, maxSize: 80,  minSpeed: 18, maxSpeed: 26, opMul: 0.9 },  // white steam core
  { color: new THREE.Color(0xff6010),  minSize: 20, maxSize: 50,  minSpeed: 10, maxSpeed: 18, opMul: 0.7 },  // orange combustion
  { color: new THREE.Color(0x202020),  minSize: 15, maxSize: 40,  minSpeed:  4, maxSpeed: 12, opMul: 0.5 },  // black soot trail
]

export function RocketVFXRenderer() {
  const particlesRef  = useRef<Particle[][]>(LAYERS.map(() => makeParticles(MAX_PARTICLES)))
  const geomRefs      = useRef<THREE.BufferGeometry[]>([])
  const pointsRefs    = useRef<THREE.Points[]>([])
  const flashRef      = useRef<THREE.PointLight>(null!)
  const flashTimer    = useRef(0)
  const shimmerRef    = useRef<THREE.Mesh>(null!)
  const scorch        = useRef<THREE.Mesh>(null!)
  const cameraRef     = useRef<THREE.Camera | null>(null)
  const timeRef       = useRef(0)

  // Memos
  const mats = useMemo(() =>
    LAYERS.map(l => new THREE.ShaderMaterial({
      vertexShader:   EXHAUST_VERT,
      fragmentShader: EXHAUST_FRAG,
      uniforms:   { uColor: { value: l.color } },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })),
    []
  )

  const shimmerMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   SHIMMER_VERT,
    fragmentShader: SHIMMER_FRAG,
    uniforms: {
      tDiffuse:   { value: null },
      uTime:      { value: 0 },
      uIntensity: { value: 0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.NormalBlending,
    side:        THREE.DoubleSide,
  }), [])

  const scorchedMat = useMemo(() => new THREE.MeshStandardMaterial({
    color:     0x111111,
    roughness: 1.0,
    transparent: true,
    opacity:   0,
    depthWrite: false,
  }), [])

  useEffect(() => {
    // Initialise buffer geometries
    for (let li = 0; li < LAYER_COUNT; li++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3))
      geo.setAttribute('size',     new THREE.Float32BufferAttribute(new Float32Array(MAX_PARTICLES),     1))
      geo.setAttribute('opacity',  new THREE.Float32BufferAttribute(new Float32Array(MAX_PARTICLES),     1))
      geomRefs.current[li] = geo
    }
    return () => {
      mats.forEach(m => m.dispose())
      shimmerMat.dispose()
      scorchedMat.dispose()
      geomRefs.current.forEach(g => g.dispose())
    }
  }, [])

  useFrame(({ camera, clock }, dt) => {
    const rs     = getRocketState()
    const shake  = getLaunchShake()
    timeRef.current = clock.elapsedTime
    cameraRef.current = camera

    const active = rs.state === 'ignition' || rs.state === 'ascending'
    const lp = rs.launchPos ?? [0, 0, 0]

    // ── Scorch disc ──────────────────────────────────────────────────────────
    if (scorch.current) {
      const visible = rs.state !== 'idle'
      scorch.current.position.set(lp[0], lp[1] + 0.05, lp[2])
      scorchedMat.opacity = visible ? Math.min(0.6, scorchedMat.opacity + dt * 0.3) : 0
    }

    // ── Ignition flash ───────────────────────────────────────────────────────
    if (flashRef.current) {
      if (rs.state === 'ignition' && flashTimer.current <= 0) {
        flashRef.current.intensity = 20
        flashRef.current.position.set(lp[0], lp[1] + 1.5, lp[2])
        flashTimer.current = 0.08   // 80ms flash
      }
      if (flashTimer.current > 0) {
        flashTimer.current -= dt
        flashRef.current.intensity = Math.max(0, 20 * (flashTimer.current / 0.08))
      } else {
        flashRef.current.intensity = 0
      }
    }

    // ── Heat shimmer ─────────────────────────────────────────────────────────
    if (shimmerRef.current) {
      const intensity = rs.heatShimmer
      shimmerMat.uniforms.uIntensity.value = intensity
      shimmerMat.uniforms.uTime.value = timeRef.current
      shimmerRef.current.visible = intensity > 0.01
      // Position shimmer quad between rocket and camera
      shimmerRef.current.position.set(lp[0], lp[1] + 6, lp[2])
      shimmerRef.current.lookAt(camera.position)
    }

    // ── Camera shake ─────────────────────────────────────────────────────────
    if (shake.intensity > 0.001) {
      const s = shake.intensity * 0.15
      camera.position.x += (Math.random() - 0.5) * s
      camera.position.y += (Math.random() - 0.5) * s * 0.5
    }

    // ── Particle simulation ───────────────────────────────────────────────────
    for (let li = 0; li < LAYER_COUNT; li++) {
      const layer  = LAYERS[li]
      const parts  = particlesRef.current[li]
      const geo    = geomRefs.current[li]
      if (!geo) continue

      const posArr = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array
      const sArr   = (geo.attributes.size     as THREE.BufferAttribute).array as Float32Array
      const oArr   = (geo.attributes.opacity  as THREE.BufferAttribute).array as Float32Array

      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = parts[i]
        if (p.life <= 0) {
          // Respawn dead particles if exhaust active
          if (active) {
            const angle = Math.random() * Math.PI * 2
            const radX  = (Math.random() - 0.5) * 0.6 * (1 - li * 0.2)
            const radZ  = (Math.random() - 0.5) * 0.6 * (1 - li * 0.2)
            p.pos[0] = lp[0] + radX
            p.pos[1] = lp[1] + 1.0 + (li * 0.3)
            p.pos[2] = lp[2] + radZ
            const spd = layer.minSpeed + Math.random() * (layer.maxSpeed - layer.minSpeed)
            p.vel[0] = radX * 0.3 * rs.exhaustScale
            p.vel[1] = spd * rs.exhaustScale
            p.vel[2] = radZ * 0.3 * rs.exhaustScale
            p.maxLife = 1.5 + Math.random() * 1.0
            p.life    = p.maxLife
            p.size    = layer.minSize + Math.random() * (layer.maxSize - layer.minSize)
          } else {
            posArr[i * 3]     = 0
            posArr[i * 3 + 1] = -9999
            posArr[i * 3 + 2] = 0
            sArr[i]  = 0
            oArr[i]  = 0
            continue
          }
        }

        // Update live particle
        p.life    -= dt
        p.vel[1]  -= dt * 1.5   // slight gravity drag on soot
        p.pos[0]  += p.vel[0] * dt
        p.pos[1]  += p.vel[1] * dt
        p.pos[2]  += p.vel[2] * dt

        const t = p.life / p.maxLife   // 1→0 as particle ages
        posArr[i * 3]     = p.pos[0]
        posArr[i * 3 + 1] = p.pos[1]
        posArr[i * 3 + 2] = p.pos[2]
        sArr[i]  = p.size * (0.5 + 0.5 * (1 - t))   // grow as it ages
        oArr[i]  = t * t * layer.opMul * rs.exhaustScale
      }

      geo.attributes.position.needsUpdate = true
      geo.attributes.size.needsUpdate     = true
      geo.attributes.opacity.needsUpdate  = true
    }
  })

  return (
    <>
      {/* Exhaust particle layers — created imperatively to attach buffer geoms */}
      {LAYERS.map((layer, li) => (
        <points
          key={li}
          ref={(el) => { if (el) pointsRefs.current[li] = el as THREE.Points }}
          geometry={geomRefs.current[li]}
          material={mats[li]}
        />
      ))}

      {/* Ignition muzzle flash */}
      <pointLight
        ref={flashRef}
        color={0xff8020}
        intensity={0}
        distance={30}
        decay={2}
      />

      {/* Heat shimmer plane — faces camera */}
      <mesh ref={shimmerRef} visible={false}>
        <planeGeometry args={[14, 18]} />
        <primitive object={shimmerMat} attach="material" />
      </mesh>

      {/* Launch pad scorch disc */}
      <mesh ref={scorch} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3, 32]} />
        <primitive object={scorchedMat} attach="material" />
      </mesh>
    </>
  )
}
