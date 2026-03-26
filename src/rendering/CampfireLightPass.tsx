// ── CampfireLightPass ─────────────────────────────────────────────────────────
// M27 Track C: Dynamic point lights for campfire_pit + torch buildings.
//
// C1: Campfire point light
//   Color #ff6633, intensity 2.0, distance 15, decay 2.
//   Flicker: Math.sin(time * 3.5) * 0.3 + 1.7 base intensity.
//   Max 5 lights — nearest 5 campfires to player.
//
// C2: Campfire shadow casting
//   Only nearest campfire casts shadows (shadow.mapSize 512×512) to keep GPU cost low.
//   castShadow = false on all others.
//
// C5: Torch building light
//   If player places a Torch building (id: 'torch'), adds PointLight:
//   color #ffcc44, intensity 1.2, distance 8, no shadow.
//   Same lifecycle as campfire lights — managed from the same pool.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildingSystem } from '../game/GameSingletons'
import { usePlayerStore } from '../store/playerStore'

const MAX_CAMPFIRE_LIGHTS = 5
const MAX_TORCH_LIGHTS    = 5

const CAMPFIRE_COLOR  = new THREE.Color(0xff6633)
const CAMPFIRE_BASE_I = 1.7
const CAMPFIRE_DIST   = 15
const CAMPFIRE_DECAY  = 2

const TORCH_COLOR  = new THREE.Color(0xffcc44)
const TORCH_BASE_I = 1.2
const TORCH_DIST   = 8
const TORCH_DECAY  = 2

// Pre-allocated scratch — no per-frame heap allocations
const _playerPos  = new THREE.Vector3()
const _bPos       = new THREE.Vector3()
const _bNorm      = new THREE.Vector3()

export function CampfireLightPass() {
  const campfireRefs = useRef<Array<THREE.PointLight | null>>(new Array(MAX_CAMPFIRE_LIGHTS).fill(null))
  const torchRefs    = useRef<Array<THREE.PointLight | null>>(new Array(MAX_TORCH_LIGHTS).fill(null))
  const timeRef      = useRef(0)

  useFrame((_, dt) => {
    timeRef.current += dt
    const t = timeRef.current

    const ps = usePlayerStore.getState()
    _playerPos.set(ps.x, ps.y, ps.z)

    // ── Campfires ──────────────────────────────────────────────────────────────
    const campfires = buildingSystem.getAllBuildings()
      .filter(b => b.typeId === 'campfire_pit')

    // Sort by distance to player — nearest first
    campfires.sort((a, b) => {
      const dxa = a.position[0] - ps.x, dya = a.position[1] - ps.y, dza = a.position[2] - ps.z
      const dxb = b.position[0] - ps.x, dyb = b.position[1] - ps.y, dzb = b.position[2] - ps.z
      return (dxa * dxa + dya * dya + dza * dza) - (dxb * dxb + dyb * dyb + dzb * dzb)
    })

    const flickerBase = Math.sin(t * 3.5) * 0.3 + CAMPFIRE_BASE_I

    for (let i = 0; i < MAX_CAMPFIRE_LIGHTS; i++) {
      const light = campfireRefs.current[i]
      if (!light) continue
      const campfire = campfires[i]
      if (!campfire) {
        light.intensity = 0
        light.visible = false
        continue
      }

      // Position light slightly above building center (no allocations)
      const [bx, by, bz] = campfire.position
      _bPos.set(bx, by, bz)
      _bNorm.copy(_bPos).normalize()
      light.position.set(
        bx + _bNorm.x * 1.5,
        by + _bNorm.y * 1.5,
        bz + _bNorm.z * 1.5,
      )

      // Individual flicker offset per campfire index
      const flicker = flickerBase + Math.sin(t * 5.3 + i * 1.7) * 0.1
      light.intensity = flicker
      light.visible = true

      // Only nearest campfire casts shadows (C2)
      const shouldCast = (i === 0)
      if (shouldCast && !light.castShadow) {
        // Set map size once when shadow casting is first enabled
        light.shadow.mapSize.set(512, 512)
      }
      light.castShadow = shouldCast
    }

    // ── Torches ────────────────────────────────────────────────────────────────
    const torches = buildingSystem.getAllBuildings()
      .filter(b => b.typeId === 'torch')

    torches.sort((a, b) => {
      const dxa = a.position[0] - ps.x, dya = a.position[1] - ps.y, dza = a.position[2] - ps.z
      const dxb = b.position[0] - ps.x, dyb = b.position[1] - ps.y, dzb = b.position[2] - ps.z
      return (dxa * dxa + dya * dya + dza * dza) - (dxb * dxb + dyb * dyb + dzb * dzb)
    })

    const torchFlicker = Math.sin(t * 4.1) * 0.08 + TORCH_BASE_I

    for (let i = 0; i < MAX_TORCH_LIGHTS; i++) {
      const light = torchRefs.current[i]
      if (!light) continue
      const torch = torches[i]
      if (!torch) {
        light.intensity = 0
        light.visible = false
        continue
      }

      const [tx, ty, tz] = torch.position
      _bPos.set(tx, ty, tz)
      _bNorm.copy(_bPos).normalize()
      light.position.set(
        tx + _bNorm.x * 2.0,
        ty + _bNorm.y * 2.0,
        tz + _bNorm.z * 2.0,
      )

      const flicker = torchFlicker + Math.sin(t * 6.1 + i * 2.1) * 0.05
      light.intensity = flicker
      light.visible = true
      // No shadow on torches (C5)
      light.castShadow = false
    }
  })

  return (
    <>
      {/* Campfire point lights */}
      {Array.from({ length: MAX_CAMPFIRE_LIGHTS }, (_, i) => (
        <pointLight
          key={`campfire-${i}`}
          ref={(el) => { campfireRefs.current[i] = el as THREE.PointLight }}
          color={CAMPFIRE_COLOR}
          intensity={0}
          distance={CAMPFIRE_DIST}
          decay={CAMPFIRE_DECAY}
          castShadow={false}
          shadow-camera-near={0.5}
          shadow-camera-far={20}
          shadow-bias={-0.002}
        />
      ))}
      {/* Torch point lights — no shadow */}
      {Array.from({ length: MAX_TORCH_LIGHTS }, (_, i) => (
        <pointLight
          key={`torch-${i}`}
          ref={(el) => { torchRefs.current[i] = el as THREE.PointLight }}
          color={TORCH_COLOR}
          intensity={0}
          distance={TORCH_DIST}
          decay={TORCH_DECAY}
          castShadow={false}
        />
      ))}
    </>
  )
}
