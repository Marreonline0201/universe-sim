// ── UndergroundAtmosphere.tsx ─────────────────────────────────────────────────
// M29 Track A A5: Underground atmosphere effects.
// When player is below terrain surface:
//   - Sets FogExp2 on scene (dark cave atmosphere)
//   - Reduces ambient light intensity
// Restored to normal when above ground.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { usePlayerStore } from '../store/playerStore'
import { useCaveStore } from '../store/caveStore'
import { surfaceRadiusAt } from '../world/SpherePlanet'

const CAVE_FOG_COLOR  = new THREE.Color(0x0a0a12)
const CAVE_FOG_DENSITY = 0.025
const AMBIENT_NORMAL   = 1.0
const AMBIENT_CAVE     = 0.05

// Smooth transition speed (fraction per second)
const TRANSITION_SPEED = 2.0

export function UndergroundAtmosphere() {
  const { scene } = useThree()

  const undergroundRef  = useRef(false)
  const transitionRef   = useRef(0) // 0 = above ground, 1 = underground
  const caveFogRef      = useRef<THREE.FogExp2 | null>(null)
  const origFogRef      = useRef<THREE.FogBase | null>(null)
  const ambientRef      = useRef<THREE.AmbientLight | null>(null)

  // Store original fog on mount
  useEffect(() => {
    origFogRef.current = scene.fog
    return () => {
      // Restore original fog on unmount
      if (origFogRef.current !== undefined) {
        scene.fog = origFogRef.current
      }
    }
  }, [scene])

  useFrame((_state, delta) => {
    const playerStore = usePlayerStore.getState()
    const { x, y, z } = playerStore

    // Check if player is underground
    const surfR = surfaceRadiusAt(x, y, z)
    const playerR = Math.sqrt(x * x + y * y + z * z)
    const isUnder = playerR < surfR - 2

    if (isUnder !== undergroundRef.current) {
      undergroundRef.current = isUnder
      useCaveStore.getState().setUnderground(isUnder)
    }

    // Smooth transition
    const target = isUnder ? 1 : 0
    transitionRef.current += (target - transitionRef.current) * Math.min(1, TRANSITION_SPEED * delta)
    const t = transitionRef.current

    if (t > 0.01) {
      // Apply cave fog
      if (!caveFogRef.current) {
        caveFogRef.current = new THREE.FogExp2(CAVE_FOG_COLOR.getHex(), CAVE_FOG_DENSITY)
      }
      caveFogRef.current.density = CAVE_FOG_DENSITY * t
      scene.fog = caveFogRef.current
    } else {
      // Restore original fog
      scene.fog = origFogRef.current ?? null
    }

    // Adjust ambient light intensity
    if (!ambientRef.current) {
      scene.traverse((obj) => {
        if ((obj as THREE.AmbientLight).isAmbientLight && !ambientRef.current) {
          ambientRef.current = obj as THREE.AmbientLight
        }
      })
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = AMBIENT_NORMAL + (AMBIENT_CAVE - AMBIENT_NORMAL) * t
    }
  })

  return null
}
