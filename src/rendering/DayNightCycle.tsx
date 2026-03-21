// DayNightCycle — drives the 20-minute real-time day/night cycle.
//
// Physics basis:
//   Sun orbits at distance 8000m from planet center in the XY plane,
//   completing one revolution every 1200 real seconds (20 minutes).
//   Angular velocity = 2π / 1200 rad/s.
//
//   Directional light intensity follows a cosine envelope:
//     intensity = max(0.05, 2.2 * sin(angle))
//   where angle=π/2 is noon and angle=3π/2 is midnight.
//
//   Sky turbidity and rayleigh scattering increase during dawn/dusk
//   to simulate the longer atmospheric path at low sun angles (Rayleigh
//   scattering ∝ 1/λ⁴ — responsible for orange/red sunrises).

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import { usePlayerStore } from '../store/playerStore'

// One full day = 1200 real seconds (20 minutes)
const DAY_DURATION_S = 1200
const ANGULAR_VEL    = (2 * Math.PI) / DAY_DURATION_S

// Sun orbit radius — far enough to be effectively directional
const SUN_ORBIT_R = 8000

// Start at ~10 o'clock (sun well above horizon, not blinding at spawn)
const START_ANGLE = Math.PI * 0.6

interface SkyParams {
  sunPosition: [number, number, number]
  turbidity: number
  rayleigh: number
}

interface Props {
  onDayAngleChange?: (angle: number) => void
}

export function DayNightCycle({ onDayAngleChange }: Props) {
  const dayAngle = useRef(START_ANGLE)

  const dirLightRef  = useRef<THREE.DirectionalLight>(null)
  const ambLightRef  = useRef<THREE.AmbientLight>(null)
  const hemiLightRef = useRef<THREE.HemisphereLight>(null)

  // Sky params as state so React re-renders Sky when they change.
  // We throttle updates to ~4Hz to avoid excessive re-renders.
  const [skyParams, setSkyParams] = useState<SkyParams>({
    sunPosition: [
      SUN_ORBIT_R * Math.cos(START_ANGLE),
      SUN_ORBIT_R * Math.sin(START_ANGLE),
      3000,
    ],
    turbidity: 4,
    rayleigh: 0.4,
  })
  const skyUpdateTimer = useRef(0)

  // Reusable color objects — no per-frame allocations
  const _daySkyColor    = useRef(new THREE.Color('#87ceeb'))
  const _nightSkyColor  = useRef(new THREE.Color('#060a1a'))
  const _dayGroundColor = useRef(new THREE.Color('#3a4a1a'))
  const _nightGroundColor = useRef(new THREE.Color('#0a0a08'))
  const _tmpColor       = useRef(new THREE.Color())

  useFrame((state, delta) => {
    // Advance day angle
    dayAngle.current = (dayAngle.current + ANGULAR_VEL * delta) % (2 * Math.PI)
    const angle = dayAngle.current

    // sin(angle): 1 at noon, -1 at midnight
    const sinA = Math.sin(angle)
    const sunAboveHorizon = sinA > 0

    // Sun position in world space
    const sx = SUN_ORBIT_R * Math.cos(angle)
    const sy = SUN_ORBIT_R * Math.sin(angle)

    // ── Directional light ────────────────────────────────────────────────────
    if (dirLightRef.current) {
      // Move shadow camera target to follow player so shadows work anywhere on sphere
      const ps = usePlayerStore.getState()
      dirLightRef.current.target.position.set(ps.x, ps.y, ps.z)
      dirLightRef.current.target.updateMatrixWorld()
      dirLightRef.current.position.set(ps.x + sx, ps.y + sy, ps.z + 3000)
      dirLightRef.current.intensity = Math.max(0.02, 2.2 * sinA + 0.05)

      // Warm orange/red at dawn/dusk (low sun angle)
      const horizonProximity = 1 - Math.abs(sinA)
      const isDawnDusk = sunAboveHorizon && horizonProximity > 0.7
      if (isDawnDusk) {
        dirLightRef.current.color.setRGB(1.0, 0.55 + 0.45 * sinA, 0.15 + 0.45 * sinA)
      } else {
        dirLightRef.current.color.setRGB(1.0, 0.97, 0.92)
      }
    }

    // ── Ambient light ────────────────────────────────────────────────────────
    if (ambLightRef.current) {
      ambLightRef.current.intensity = sunAboveHorizon
        ? 0.08 + 0.37 * sinA
        : 0.06  // moonlight
    }

    // ── Hemisphere light ─────────────────────────────────────────────────────
    if (hemiLightRef.current) {
      const t = Math.max(0, sinA)
      _tmpColor.current.copy(_nightSkyColor.current).lerp(_daySkyColor.current, t)
      hemiLightRef.current.color.copy(_tmpColor.current)
      _tmpColor.current.copy(_nightGroundColor.current).lerp(_dayGroundColor.current, t)
      hemiLightRef.current.groundColor.copy(_tmpColor.current)
      hemiLightRef.current.intensity = 0.15 + 0.55 * t
    }

    // ── Fog density ──────────────────────────────────────────────────────────
    if (state.scene.fog instanceof THREE.FogExp2) {
      state.scene.fog.density = sunAboveHorizon
        ? 0.008 + 0.004 * (1 - sinA)
        : 0.014
    }

    // ── Sky params (throttled at ~4Hz — Sky re-render is expensive) ──────────
    skyUpdateTimer.current += delta
    if (skyUpdateTimer.current >= 0.25) {
      skyUpdateTimer.current = 0
      const horizP = Math.max(0, 1 - Math.abs(sinA))
      const turb   = sunAboveHorizon ? 4 + horizP * 14 : 20
      const rayl   = sunAboveHorizon ? 0.4 + horizP * 1.6 : 0.05

      setSkyParams({
        sunPosition: [sx, sy, 3000],
        turbidity: turb,
        rayleigh: rayl,
      })
    }

    onDayAngleChange?.(angle)
  })

  return (
    <>
      {/* Directional sun light with shadow — position driven by dayAngle each frame */}
      <directionalLight
        ref={dirLightRef}
        position={[
          SUN_ORBIT_R * Math.cos(START_ANGLE),
          SUN_ORBIT_R * Math.sin(START_ANGLE),
          3000,
        ]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={10000}
        shadow-camera-left={-600}
        shadow-camera-right={600}
        shadow-camera-top={600}
        shadow-camera-bottom={-600}
      />
      {/* Ambient fill light — dims at night to near-zero */}
      <ambientLight ref={ambLightRef} intensity={0.45} />
      {/* Hemisphere sky/ground bounce — sky color shifts from blue to black at night */}
      <hemisphereLight
        ref={hemiLightRef}
        args={['#87ceeb', '#3a4a1a', 0.7]}
      />
      {/* Sky dome — sun position and atmosphere parameters driven by dayAngle */}
      <Sky
        sunPosition={skyParams.sunPosition}
        turbidity={skyParams.turbidity}
        rayleigh={skyParams.rayleigh}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
    </>
  )
}
