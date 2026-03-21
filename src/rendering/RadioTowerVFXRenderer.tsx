// ── RadioTowerVFXRenderer ─────────────────────────────────────────────────────
// Hertzian EM wave pulse rings emanating from radio towers.
//
// Visual design:
//   - Translucent teal rings (color #00e5cc) expand outward from tower base
//   - Ring spawned every 2s per tower
//   - Radius grows 0→300m over 4s (matches RADIO_RANGE)
//   - Opacity follows Gaussian falloff: peaks at ~0.3, fades to 0 at r=300
//   - Additive blending — visible against terrain at night
//   - Ring thickness: 2m (thin disc cross-section, flat-on-ground orientation)
//   - Max 4 simultaneous rings per tower × up to 5 towers = 20 ring meshes
//
// Photorealism enforcement:
//   - ShaderMaterial with per-fragment opacity driven by ring radius & time
//   - No hardcoded texture — entirely procedural teal ring in fragment shader
//   - Ring physically motivated: electromagnetic wave propagates at speed of light,
//     vastly scaled down to game units (1 game metre ≠ real metre for radio waves).

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getActiveTowers } from '../game/RadioSystem'

const RING_EXPAND_DURATION = 4.0   // seconds to reach max radius
const RING_SPAWN_INTERVAL  = 2.0   // seconds between ring spawns per tower
const MAX_RADIUS           = 300   // metres
const RINGS_PER_TOWER      = 4
const MAX_TOWERS           = 5
const TOTAL_RINGS          = RINGS_PER_TOWER * MAX_TOWERS

// ── GLSL ──────────────────────────────────────────────────────────────────────

const RING_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const RING_FRAG = /* glsl */`
  uniform float uRadius;
  uniform float uMaxRadius;
  uniform float uOpacity;
  uniform vec3  uColor;
  varying vec2 vUv;
  void main() {
    // vUv.x = 0..1 across ring width — ring cross-section
    float dist = length(vUv - 0.5) * 2.0;   // 0 at centre, 1 at edge
    // Thin ring cross-section: sharp peak at dist=0
    float ringMask = exp(-dist * dist * 20.0);
    // Gaussian opacity falloff with radius
    float radFrac = uRadius / uMaxRadius;
    float radOpacity = exp(-radFrac * radFrac * 4.0) * (1.0 - radFrac);
    float alpha = ringMask * radOpacity * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`

interface Ring {
  towerIndex: number
  spawnTime:  number    // elapsed time when this ring was spawned
  mesh:       THREE.Mesh | null
}

export function RadioTowerVFXRenderer() {
  const rings = useRef<Ring[]>(
    Array.from({ length: TOTAL_RINGS }, () => ({ towerIndex: -1, spawnTime: -999, mesh: null }))
  )
  const spawnTimers = useRef<number[]>(new Array(MAX_TOWERS).fill(0))
  const elapsedRef  = useRef(0)

  // Per-ring materials (each ring needs its own uniform set)
  const mats = useMemo(() =>
    Array.from({ length: TOTAL_RINGS }, () =>
      new THREE.ShaderMaterial({
        vertexShader:   RING_VERT,
        fragmentShader: RING_FRAG,
        uniforms: {
          uRadius:    { value: 0 },
          uMaxRadius: { value: MAX_RADIUS },
          uOpacity:   { value: 0.3 },
          uColor:     { value: new THREE.Color(0x00e5cc) },
        },
        transparent: true,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
        side:        THREE.DoubleSide,
      })
    ),
    []
  )

  const geom = useMemo(() => {
    // Flat circle geometry — ring rendered procedurally in shader
    return new THREE.CircleGeometry(1, 64)   // unit circle, scaled per-ring
  }, [])

  useEffect(() => {
    return () => {
      mats.forEach(m => m.dispose())
      geom.dispose()
    }
  }, [])

  useFrame((_, dt) => {
    const towers  = getActiveTowers()
    elapsedRef.current += dt

    // Spawn rings
    for (let ti = 0; ti < Math.min(towers.length, MAX_TOWERS); ti++) {
      spawnTimers.current[ti] = (spawnTimers.current[ti] ?? 0) + dt
      if (spawnTimers.current[ti] >= RING_SPAWN_INTERVAL) {
        spawnTimers.current[ti] = 0
        // Find a free ring slot for this tower
        const freeIdx = rings.current.findIndex(r =>
          r.towerIndex === -1 ||
          (elapsedRef.current - r.spawnTime) >= RING_EXPAND_DURATION + 0.5
        )
        if (freeIdx >= 0) {
          rings.current[freeIdx].towerIndex = ti
          rings.current[freeIdx].spawnTime  = elapsedRef.current
        }
      }
    }

    // Update all ring meshes
    for (let ri = 0; ri < TOTAL_RINGS; ri++) {
      const ring = rings.current[ri]
      const mat  = mats[ri]
      const ti   = ring.towerIndex

      if (ti < 0 || ti >= towers.length) {
        mat.uniforms.uOpacity.value = 0
        continue
      }

      const age    = elapsedRef.current - ring.spawnTime
      const radius = MAX_RADIUS * Math.min(1, age / RING_EXPAND_DURATION)
      const tower  = towers[ti]

      mat.uniforms.uRadius.value  = radius
      mat.uniforms.uOpacity.value = age < RING_EXPAND_DURATION ? 0.3 : 0

      // Update mesh position and scale
      if (ring.mesh) {
        ring.mesh.position.set(tower.pos[0], tower.pos[1] + 0.2, tower.pos[2])
        ring.mesh.scale.setScalar(radius)
        ring.mesh.rotation.x = -Math.PI / 2   // flat on ground
      }
    }
  })

  return (
    <>
      {Array.from({ length: TOTAL_RINGS }, (_, ri) => (
        <mesh
          key={ri}
          ref={(el) => { if (el) rings.current[ri].mesh = el as THREE.Mesh }}
          geometry={geom}
          material={mats[ri]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -9999, 0]}
        />
      ))}
    </>
  )
}
