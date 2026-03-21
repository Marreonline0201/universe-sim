// ── MusketVFXRenderer.tsx ──────────────────────────────────────────────────
// M11 Track A: Renders musket firing visual effects.
//
// Effects:
//   1. Smoke cloud — 40 grey-white particles, rise and expand over 2 seconds.
//      Color: rgba(200,200,200,α) → rgba(160,160,160,0) over lifetime.
//      Size: 0.15m at birth → 0.8m at death (dispersal).
//      Physics: upward drift (0.3 m/s) + random horizontal spread (0.1 m/s).
//      Photorealism: opacity falloff using smoothstep(0.8, 1.0, t) for soft fade.
//
//   2. Muzzle flash — 1 frame point light (PointLight, intensity 8, range 6m)
//      Color: #ffe080 (warm yellow-white, gunpowder combustion temperature ~2000K)
//      Duration: 40ms — only visible for one or two render frames.
//
//   3. Screen shake — applied to camera rig via playerStore.
//      Intensity 0.3 units, exponential decay over 250ms.

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pendingSmokeClouds, tickSmokeClouds, getPendingShake, clearPendingShake } from '../game/GunpowderSystem'
import type { SmokeCloud } from '../game/GunpowderSystem'

const PARTICLE_COUNT = 40

interface ActiveCloud {
  cloud: SmokeCloud
  // Per-particle offsets (seeded random, computed once per cloud)
  offsets: Float32Array   // [dx, dy, dz] per particle × PARTICLE_COUNT
  velocities: Float32Array // [vx, vy, vz] per particle
}

export function MusketVFXRenderer() {
  const activeClouds = useRef<ActiveCloud[]>([])
  const pointsRef = useRef<THREE.Points | null>(null)
  const flashRef  = useRef<THREE.PointLight | null>(null)
  const flashTimer = useRef(0)

  // Camera shake
  const shakeRef = useRef(0)

  // Geometry buffers (max 5 simultaneous clouds × 40 particles = 200 points)
  const MAX_POINTS = 200
  const { positions, colors, sizes, geometry } = useMemo(() => {
    const positions = new Float32Array(MAX_POINTS * 3)
    const colors    = new Float32Array(MAX_POINTS * 3)
    const sizes     = new Float32Array(MAX_POINTS)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage))
    return { positions, colors, sizes, geometry: geo }
  }, [])

  const smokeMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */`
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = color.r;  // r channel used as alpha proxy
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPos.z);
        gl_PointSize = clamp(gl_PointSize, 2.0, 80.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float alpha = (1.0 - smoothstep(0.3, 0.5, d)) * vAlpha;
        gl_FragColor = vec4(vColor * 0.85, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexColors: false,
  }), [])

  useFrame((state, delta) => {
    const now = Date.now()

    // Absorb new smoke clouds from the gunpowder system
    while (pendingSmokeClouds.length > 0) {
      const cloud = pendingSmokeClouds.shift()!
      // Generate random per-particle offsets
      const offsets = new Float32Array(PARTICLE_COUNT * 3)
      const velocities = new Float32Array(PARTICLE_COUNT * 3)
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        offsets[i * 3    ] = (Math.random() - 0.5) * 0.4
        offsets[i * 3 + 1] = Math.random() * 0.2
        offsets[i * 3 + 2] = (Math.random() - 0.5) * 0.4
        velocities[i * 3    ] = (Math.random() - 0.5) * 0.2
        velocities[i * 3 + 1] = 0.3 + Math.random() * 0.3   // upward drift
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2
      }
      activeClouds.current.push({ cloud, offsets, velocities })

      // Muzzle flash
      if (flashRef.current) {
        flashRef.current.position.set(cloud.x, cloud.y, cloud.z)
        flashRef.current.intensity = 8
        flashTimer.current = 40   // 40ms flash duration
      }
    }

    // Decay muzzle flash
    flashTimer.current -= delta * 1000
    if (flashRef.current) {
      flashRef.current.intensity = Math.max(0, flashRef.current.intensity - delta * 200)
    }

    // Update particle positions
    let pointIdx = 0
    activeClouds.current = activeClouds.current.filter((ac) => {
      const elapsed = (now - ac.cloud.startTime) / 1000
      if (elapsed >= ac.cloud.duration / 1000) return false

      const t = elapsed / (ac.cloud.duration / 1000)  // 0–1 lifetime fraction
      const alpha = 1 - t * t   // quadratic falloff

      for (let i = 0; i < PARTICLE_COUNT && pointIdx < MAX_POINTS; i++, pointIdx++) {
        const bi = i * 3
        const age = elapsed
        positions[pointIdx * 3    ] = ac.cloud.x + ac.offsets[bi    ] + ac.velocities[bi    ] * age
        positions[pointIdx * 3 + 1] = ac.cloud.y + ac.offsets[bi + 1] + ac.velocities[bi + 1] * age
        positions[pointIdx * 3 + 2] = ac.cloud.z + ac.offsets[bi + 2] + ac.velocities[bi + 2] * age

        // Color: white-grey, alpha encoded in r channel for shader
        const grey = 0.75 + (1 - t) * 0.25
        colors[pointIdx * 3    ] = alpha  // alpha proxy in r channel
        colors[pointIdx * 3 + 1] = grey
        colors[pointIdx * 3 + 2] = grey

        // Size grows from 8px to 40px as smoke expands
        sizes[pointIdx] = 8 + t * 32
      }
      return true
    })

    // Zero out unused points
    for (let i = pointIdx; i < MAX_POINTS; i++) {
      positions[i * 3] = 0; positions[i * 3+1] = -99999; positions[i * 3+2] = 0
      sizes[i] = 0
    }

    // Update GPU buffers
    if (pointsRef.current) {
      ;(geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(geometry.attributes.color    as THREE.BufferAttribute).needsUpdate = true
      ;(geometry.attributes.size     as THREE.BufferAttribute).needsUpdate = true
    }

    // Screen shake
    const shake = getPendingShake()
    if (shake) {
      const elapsed = (now - shake.startTime) / shake.duration
      if (elapsed < 1) {
        const intensity = shake.intensity * (1 - elapsed)
        state.camera.position.x += (Math.random() - 0.5) * intensity
        state.camera.position.y += (Math.random() - 0.5) * intensity * 0.5
      } else {
        clearPendingShake()
      }
    }

    tickSmokeClouds()
  })

  return (
    <>
      <points ref={pointsRef} geometry={geometry} material={smokeMaterial} frustumCulled={false} />
      <pointLight ref={flashRef} color="#ffe080" intensity={0} distance={6} decay={2} />
    </>
  )
}
