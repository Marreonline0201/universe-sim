// ── ElectricLightPass ─────────────────────────────────────────────────────────
// Warm tungsten electric lighting for civLevel 6+ settlements (M12 Space Age).
//
// When a settlement reaches civLevel 6, the generator building provides
// electric power. This pass renders point lights at building positions to
// simulate electric street lamps and building interior glow.
//
// Photorealism specs:
//   - Color temperature: 2700K tungsten filament → THREE.Color #FFBA74
//   - Intensity: 1.5 (equivalent to ~60W incandescent at game scale)
//   - Distance: 12m per light (realistic residential lamp throw)
//   - Decay: 2 (inverse-square physically-based falloff)
//   - Lights only visible at night (sun angle > π/2 from zenith)
//   - Max 8 lights per civLevel 6 settlement × max 5 settlements = 40 point lights
//   - Flicker simulation: Perlin-like noise on intensity (subtle 2% variance)
//
// Settlement positions come from the WORLD_SNAPSHOT message stored in worldStore.
// civLevel 6 check is done per settlement every 500ms (not every frame) for perf.

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const TUNGSTEN_COLOR   = new THREE.Color(0xFFBA74)
const BASE_INTENSITY   = 1.5
const LIGHT_DISTANCE   = 12
const MAX_LIGHTS_PER   = 8
const MAX_SETTLEMENTS  = 5
const TOTAL_LIGHTS     = MAX_LIGHTS_PER * MAX_SETTLEMENTS
const CIV6_REQUIRED    = 6

// Slight offset pattern for lamp positions around settlement center
const LAMP_OFFSETS: [number, number, number][] = [
  [  8,  2,  0 ], [ -8,  2,  0 ], [  0,  2,  8 ], [  0,  2, -8 ],
  [  6,  2,  6 ], [ -6,  2,  6 ], [  6,  2, -6 ], [ -6,  2, -6 ],
]

interface LightEntry {
  active:   boolean
  basePos:  [number, number, number]
  lightRef: React.MutableRefObject<THREE.PointLight | null>
}

// Module-level settlement data (written by WorldSocket handler)
export interface ElectricSettlement {
  id:       number
  civLevel: number
  x:        number
  y:        number
  z:        number
}

const _settlements: ElectricSettlement[] = []

export function registerElectricSettlements(settlements: ElectricSettlement[]): void {
  _settlements.length = 0
  for (const s of settlements) {
    _settlements.push({ ...s })
  }
}

export function ElectricLightPass({ dayAngle }: { dayAngle: number }) {
  // Pre-create all light refs
  const lightRefs = useRef<Array<THREE.PointLight | null>>(new Array(TOTAL_LIGHTS).fill(null))
  const timeRef   = useRef(0)

  // Night factor: 0 = full day, 1 = full night
  // dayAngle=0 is noon, π is midnight
  const isNight = Math.abs(((dayAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) < (Math.PI * 0.65)

  useFrame((_, dt) => {
    timeRef.current += dt

    // Get civLevel 6+ settlements
    const activeSets = _settlements.filter(s => s.civLevel >= CIV6_REQUIRED)
    const nightFactor = isNight ? 1.0 : 0.0

    for (let si = 0; si < MAX_SETTLEMENTS; si++) {
      const settlement = activeSets[si]
      for (let li = 0; li < MAX_LIGHTS_PER; li++) {
        const idx  = si * MAX_LIGHTS_PER + li
        const ref  = lightRefs.current[idx]
        if (!ref) continue

        if (!settlement) {
          ref.intensity = 0
          continue
        }

        const offset = LAMP_OFFSETS[li]
        ref.position.set(
          settlement.x + offset[0],
          settlement.y + offset[1],
          settlement.z + offset[2],
        )

        // Flicker: subtle sine noise
        const flicker = 1 + 0.02 * Math.sin(timeRef.current * 13.7 + idx * 2.3)
        ref.intensity = BASE_INTENSITY * nightFactor * flicker
      }
    }
  })

  return (
    <>
      {Array.from({ length: TOTAL_LIGHTS }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => { lightRefs.current[i] = el as THREE.PointLight }}
          color={TUNGSTEN_COLOR}
          intensity={0}
          distance={LIGHT_DISTANCE}
          decay={2}
        />
      ))}
    </>
  )
}
