// FireRenderer — renders visual fire for simulation grid cells above 200°C.
// Reads hot cell list from LocalSimManager at 10Hz and renders:
//  - PointLight at each fire location (orange, intensity scales with temperature)
//  - Small orange sphere mesh as the fire glow
// Mounted inside the R3F Canvas.

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { LocalSimManager } from '../engine/LocalSimManager'

interface HotCell {
  wx: number; wy: number; wz: number; tempC: number
}

interface Props {
  simManager: LocalSimManager | null
}

export function FireRenderer({ simManager }: Props) {
  const [hotCells, setHotCells] = useState<HotCell[]>([])
  const lastUpdateRef = useRef(0)

  useFrame((_, delta) => {
    if (!simManager) return
    lastUpdateRef.current += delta
    if (lastUpdateRef.current < 0.1) return  // update at ~10Hz
    lastUpdateRef.current = 0
    setHotCells(simManager.getHotCells(200))
  })

  if (hotCells.length === 0) return null

  return (
    <>
      {hotCells.map((cell, i) => {
        const intensity = Math.min(5, (cell.tempC - 200) / 200)
        const color = cell.tempC > 800 ? '#ffffff' : cell.tempC > 500 ? '#ffaa33' : '#ff5500'
        return (
          <group key={i} position={[cell.wx, cell.wy, cell.wz]}>
            <pointLight
              color={color}
              intensity={intensity}
              distance={8}
              decay={2}
            />
            <mesh>
              <sphereGeometry args={[0.3, 8, 8]} />
              <meshBasicMaterial color={color} transparent opacity={Math.min(0.9, intensity * 0.3)} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}
