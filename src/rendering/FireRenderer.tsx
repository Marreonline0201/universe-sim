// FireRenderer — renders photorealistic fire for simulation grid cells above 200°C.
//
// Renders per hot cell:
//   1. Flickering point light — two-frequency noise mimics turbulent flame oscillation
//   2. Billboard fire sprite — radial gradient DataTexture, additive blending
//   3. Rising smoke puffs — gray-white billboards, opacity fades, scale expands upward
//
// Physics basis for flicker frequencies:
//   Real flame flicker: 2-20 Hz (Rayleigh-Taylor instability at flame front).
//   We use two sine waves at 7 Hz and 13 Hz to approximate broadband turbulence.
//   Smoke rise velocity: ~0.8 m/s (measured for wood fire smoke, 300-500°C plume).

import { useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { LocalSimManager } from '../engine/LocalSimManager'

interface HotCell { wx: number; wy: number; wz: number; tempC: number }

interface Props { simManager: LocalSimManager | null }

// ── Fire sprite texture (programmatic radial gradient — no asset file needed) ──

function makeFireTexture(): THREE.DataTexture {
  const SIZE = 64
  const data = new Uint8Array(SIZE * SIZE * 4)
  const center = SIZE / 2

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (x - center) / center
      const dy = (y - center) / center
      // Elongated radial: taller than wide (flame shape)
      const r  = Math.sqrt(dx * dx * 1.4 + dy * dy * 0.7)
      // Sharp cutoff + soft falloff
      const alpha = Math.max(0, 1 - r * r * 2.5)
      const idx = (y * SIZE + x) * 4
      data[idx + 0] = 255
      data[idx + 1] = 255
      data[idx + 2] = 255
      data[idx + 3] = Math.round(alpha * 255)
    }
  }

  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

// ── Smoke puff texture (softer radial gradient) ────────────────────────────────

function makeSmokeTexture(): THREE.DataTexture {
  const SIZE = 64
  const data = new Uint8Array(SIZE * SIZE * 4)
  const center = SIZE / 2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (x - center) / center
      const dy = (y - center) / center
      const r = Math.sqrt(dx * dx + dy * dy)
      const alpha = Math.max(0, 1 - r * r * 1.8)
      const idx = (y * SIZE + x) * 4
      data[idx + 0] = 200
      data[idx + 1] = 200
      data[idx + 2] = 200
      data[idx + 3] = Math.round(alpha * 220)
    }
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

// ── Smoke puff state ──────────────────────────────────────────────────────────
const SMOKE_PER_FIRE = 3
const MAX_FIRES      = 32
const MAX_SMOKE      = MAX_FIRES * SMOKE_PER_FIRE  // 96 puffs

interface SmokePuff {
  wx: number; wy: number; wz: number
  age: number        // 0-1 lifecycle
  cycleOffset: number // stagger puff births
}

export function FireRenderer({ simManager }: Props) {
  const [hotCells, setHotCells] = useState<HotCell[]>([])
  const lastUpdateRef  = useRef(0)
  const elapsedRef     = useRef(0)

  // Instanced mesh refs
  const fireRef  = useRef<THREE.InstancedMesh>(null)
  const smokeRef = useRef<THREE.InstancedMesh>(null)

  // Point light refs — one per fire slot
  const lightRefs = useRef<Array<THREE.PointLight | null>>(
    new Array(MAX_FIRES).fill(null)
  )

  // Smoke puff ring buffer
  const smokePuffs = useRef<SmokePuff[]>(
    Array.from({ length: MAX_SMOKE }, (_, i) => ({
      wx: 0, wy: 0, wz: 0,
      age: (i / MAX_SMOKE),  // staggered start ages
      cycleOffset: (i % SMOKE_PER_FIRE) / SMOKE_PER_FIRE,
    }))
  )

  const fireTex  = useMemo(() => makeFireTexture(),  [])
  const smokeTex = useMemo(() => makeSmokeTexture(), [])

  // Pre-allocated matrix + color — zero per-frame heap allocations
  const _mat   = useRef(new THREE.Matrix4())
  const _scale = useRef(new THREE.Vector3())
  const _pos   = useRef(new THREE.Vector3())
  const _col   = useRef(new THREE.Color())
  const _euler = useRef(new THREE.Euler())
  const _quat  = useRef(new THREE.Quaternion())

  useFrame((state, delta) => {
    if (!simManager) return
    elapsedRef.current += delta

    // Sample grid at 10Hz
    lastUpdateRef.current += delta
    if (lastUpdateRef.current >= 0.1) {
      lastUpdateRef.current = 0
      setHotCells(simManager.getHotCells(200))
    }

    const t      = elapsedRef.current
    const cells  = hotCells
    const count  = Math.min(cells.length, MAX_FIRES)
    const fire   = fireRef.current
    const smoke  = smokeRef.current

    if (!fire || !smoke) return

    // ── Fire sprites ──────────────────────────────────────────────────────────
    for (let i = 0; i < count; i++) {
      const c = cells[i]

      // Two-frequency flicker: 7Hz + 13Hz (broadband turbulence approximation)
      const flicker = Math.sin(t * 7.0 + i * 1.73) * 0.28
                    + Math.sin(t * 13.0 + i * 3.14) * 0.14

      // Flame height scales with temperature (taller = hotter)
      const height = 0.4 + (c.tempC - 200) / 600 * 0.8  // 0.4–1.2m
      const width  = height * 0.65

      _pos.current.set(c.wx, c.wy + height * 0.5, c.wz)

      // Billboard: face camera always — use state.camera
      _euler.current.setFromRotationMatrix(state.camera.matrix)
      _quat.current.setFromEuler(_euler.current)
      _mat.current.makeRotationFromQuaternion(_quat.current)
      _scale.current.set(width * (1 + flicker * 0.15), height * (1 + flicker * 0.1), 1)
      _mat.current.scale(_scale.current)
      _mat.current.setPosition(_pos.current)
      fire.setMatrixAt(i, _mat.current)

      // Color: deep red (200°C) → orange (500°C) → yellow (800°C) → white (1200°C)
      const tNorm = Math.min(1, (c.tempC - 200) / 1000)
      if (tNorm < 0.33) {
        _col.current.setRGB(1.0, 0.2 + tNorm * 1.2, 0.0)
      } else if (tNorm < 0.66) {
        _col.current.setRGB(1.0, 0.6 + tNorm * 0.5, 0.0 + tNorm * 0.3)
      } else {
        _col.current.setRGB(1.0, 0.9 + tNorm * 0.1, 0.5 + tNorm * 0.5)
      }
      fire.setColorAt(i, _col.current)

      // ── Point light flicker ────────────────────────────────────────────────
      const light = lightRefs.current[i]
      if (light) {
        const base = Math.min(6, (c.tempC - 200) / 150)
        light.intensity = Math.max(0.1, base + flicker * base * 0.4)
        light.position.set(c.wx, c.wy + 0.5, c.wz)
        // Warm orange during combustion, white-hot at extreme temps
        if (c.tempC > 1000) {
          light.color.setRGB(1.0, 0.95, 0.85)
        } else if (c.tempC > 500) {
          light.color.setRGB(1.0, 0.6, 0.1)
        } else {
          light.color.setRGB(1.0, 0.4, 0.05)
        }
      }
    }
    fire.count = count
    fire.instanceMatrix.needsUpdate = true
    if (fire.instanceColor) fire.instanceColor.needsUpdate = true

    // ── Smoke puffs ───────────────────────────────────────────────────────────
    const SMOKE_RISE_SPEED = 0.8  // m/s — measured wood fire plume
    const SMOKE_LIFETIME   = 3.0  // seconds per puff cycle

    let smokeCount = 0
    for (let i = 0; i < count; i++) {
      const c = cells[i]
      for (let p = 0; p < SMOKE_PER_FIRE; p++) {
        const puffIdx = i * SMOKE_PER_FIRE + p
        if (puffIdx >= MAX_SMOKE) break
        const puff = smokePuffs.current[puffIdx]

        // Advance lifecycle — stagger by cycleOffset so puffs don't all birth together
        puff.age = (puff.age + delta / SMOKE_LIFETIME) % 1.0
        const life = (puff.age + puff.cycleOffset) % 1.0  // 0=birth, 1=death

        // Smoke rises; puff starts at fire base, ends ~2.4m above
        const riseY = life * SMOKE_RISE_SPEED * SMOKE_LIFETIME
        // Slight outward drift
        const drift = life * 0.4
        _pos.current.set(
          c.wx + Math.sin(puffIdx * 2.39 + t * 0.3) * drift,
          c.wy + riseY + 0.2,
          c.wz + Math.cos(puffIdx * 1.61 + t * 0.2) * drift,
        )

        // Opacity: fade in quickly, fade out slowly
        const opacity = life < 0.2
          ? life / 0.2
          : 1 - ((life - 0.2) / 0.8)

        // Scale: starts small, expands as it rises; multiplied by opacity so
        // puffs shrink to zero at birth/death (achieves per-puff fade without
        // a custom shader — THREE.Color has no alpha, so scale-fade is the
        // only way to vary apparent transparency per-instance).
        const puffScale = (0.3 + life * 0.9) * opacity

        // Billboard
        _euler.current.setFromRotationMatrix(state.camera.matrix)
        _quat.current.setFromEuler(_euler.current)
        _mat.current.makeRotationFromQuaternion(_quat.current)
        _scale.current.set(puffScale, puffScale, 1)
        _mat.current.scale(_scale.current)
        _mat.current.setPosition(_pos.current)
        smoke.setMatrixAt(smokeCount, _mat.current)

        // Smoke color: near-white when visible, darker gray as it ages
        const gray = 0.72 + (1 - life) * 0.18
        _col.current.setRGB(gray, gray, gray)
        smoke.setColorAt(smokeCount, _col.current)

        smokeCount++
      }
    }
    smoke.count = smokeCount
    smoke.instanceMatrix.needsUpdate = true
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true
  })

  if (hotCells.length === 0) return null

  const cells = hotCells
  const count = Math.min(cells.length, MAX_FIRES)

  return (
    <>
      {/* Point lights — one per fire cell */}
      {cells.slice(0, count).map((c, i) => (
        <pointLight
          key={i}
          ref={el => { lightRefs.current[i] = el }}
          color="#ff6600"
          intensity={2}
          distance={10}
          decay={2}
          position={[c.wx, c.wy + 0.5, c.wz]}
        />
      ))}

      {/* Fire sprites — additive instanced billboards */}
      <instancedMesh
        ref={fireRef}
        args={[undefined, undefined, MAX_FIRES]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={fireTex}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>

      {/* Smoke puffs — subtractive/normal instanced billboards */}
      <instancedMesh
        ref={smokeRef}
        args={[undefined, undefined, MAX_SMOKE]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={smokeTex}
          vertexColors
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.NormalBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </>
  )
}
