// SimGridVisualizer — real-time temperature visualization for the simulation grid.
//
// Reads hot cells from LocalSimManager at 10Hz and renders them as instanced
// billboard quads, color-coded by temperature:
//   80-200°C  : yellow-green (warm, pre-ignition)
//   200-500°C : orange (active combustion)
//   500-1000°C: deep orange-red
//   1000°C+   : white-hot
//
// Toggled on/off with the Tab key. Off by default to avoid visual noise.
//
// Performance: uses THREE.InstancedMesh — 1 draw call regardless of cell count.
// Capped at 512 visible cells to stay within frame budget.

import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { LocalSimManager } from '../engine/LocalSimManager'

interface HotCell { wx: number; wy: number; wz: number; tempC: number }

interface Props {
  simManager: LocalSimManager | null
}

const MAX_CELLS   = 512
const UPDATE_HZ   = 10          // sample grid at 10Hz
const MIN_TEMP_C  = 80          // show cells warmer than this
const QUAD_SIZE   = 1.2         // visual quad size (metres) — slightly larger than grid cell

// Pre-allocated reusables — no per-frame heap allocations
const _matrix = new THREE.Matrix4()
const _scale  = new THREE.Vector3(QUAD_SIZE, QUAD_SIZE, 0.1)
const _pos    = new THREE.Vector3()
const _color  = new THREE.Color()

/** Map temperature (°C) → RGB color on a black-body radiation curve approximation. */
function tempToColor(tempC: number, out: THREE.Color): void {
  if (tempC < 200) {
    // 80-200°C: yellow-green glow (warm, pre-ignition)
    const t = (tempC - 80) / 120
    out.setRGB(0.6 + 0.4 * t, 0.8 - 0.2 * t, 0.1)
  } else if (tempC < 500) {
    // 200-500°C: orange (active combustion)
    const t = (tempC - 200) / 300
    out.setRGB(1.0, 0.5 - 0.2 * t, 0.05)
  } else if (tempC < 1000) {
    // 500-1000°C: bright orange-red
    const t = (tempC - 500) / 500
    out.setRGB(1.0, 0.3 + 0.5 * t, 0.05 + 0.4 * t)
  } else {
    // 1000°C+: white-hot
    const t = Math.min(1, (tempC - 1000) / 500)
    out.setRGB(1.0, 0.8 + 0.2 * t, 0.7 + 0.3 * t)
  }
}

export function SimGridVisualizer({ simManager }: Props) {
  const [visible, setVisible] = useState(false)
  const [cells, setCells]     = useState<HotCell[]>([])
  const meshRef               = useRef<THREE.InstancedMesh>(null)
  const updateTimer           = useRef(0)

  // Tab key toggles visualizer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault()
        setVisible(v => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useFrame((_, delta) => {
    if (!visible || !simManager) return

    // Sample at 10Hz
    updateTimer.current += delta
    if (updateTimer.current >= 1 / UPDATE_HZ) {
      updateTimer.current = 0
      const hot = simManager.getHotCells(MIN_TEMP_C)
      setCells(hot.slice(0, MAX_CELLS))
    }

    // Update instance transforms + colors
    const mesh = meshRef.current
    if (!mesh || cells.length === 0) {
      if (mesh) mesh.count = 0
      return
    }

    const count = Math.min(cells.length, MAX_CELLS)
    for (let i = 0; i < count; i++) {
      const c = cells[i]
      _pos.set(c.wx, c.wy, c.wz)
      _matrix.makeTranslation(_pos.x, _pos.y, _pos.z)
      _matrix.scale(_scale)
      mesh.setMatrixAt(i, _matrix)
      tempToColor(c.tempC, _color)
      mesh.setColorAt(i, _color)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (!visible) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_CELLS]}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 0.1]} />
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.6}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  )
}
