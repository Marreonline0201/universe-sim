// ── CarRenderer.tsx ───────────────────────────────────────────────────────────
// Loads the procedurally-generated car.glb (produced by scripts/generate-car.mjs).
// The GLB contains named meshes: body, glass, bumpers, headlights, taillights,
// tires, rims — all with PBR materials set during generation.
//
// To regenerate the model: node scripts/generate-car.mjs
// Output lands in public/models/car.glb and is served at /models/car.glb.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Preload so the model is ready before first render
useGLTF.preload('/models/car.glb')

// ── Wheel positions (Z-axis axle, same as GLB geometry) ──────────────────────
const WR  = 0.31
const HBW = 0.88
const WHEELS: [number, number, number][] = [
  [+1.35, WR, +(HBW + 0.02)],
  [+1.35, WR, -(HBW + 0.02)],
  [-1.35, WR, +(HBW + 0.02)],
  [-1.35, WR, -(HBW + 0.02)],
]

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CarProps {
  position?:       [number, number, number]
  rotationY?:      number
  color?:          string   // hex body-paint colour
  wheelsSpinning?: boolean
}

export function Car({
  position       = [0, 0, 0],
  rotationY      = 0,
  color          = '#1f3d5c',
  wheelsSpinning = false,
}: CarProps) {
  const { scene } = useGLTF('/models/car.glb')

  // Clone scene so multiple cars don't share the same Three.js object
  const cloned = useMemo(() => scene.clone(true), [scene])

  // Override body paint colour whenever `color` changes
  useEffect(() => {
    const c = new THREE.Color(color)
    cloned.traverse((obj) => {
      if (obj.name === 'body' && obj instanceof THREE.Mesh) {
        const mat = (obj.material as THREE.MeshStandardMaterial).clone()
        mat.color = c
        obj.material = mat
      }
    })
  }, [cloned, color])

  // Separate wheel groups so they can spin independently
  const wheelGroupRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])

  // Build per-wheel tire+rim geometry from the cloned scene (extracted once)
  const wheelGeos = useMemo<{ tireMesh: THREE.Mesh | null; rimMesh: THREE.Mesh | null }>(() => {
    let tireMesh: THREE.Mesh | null = null
    let rimMesh:  THREE.Mesh | null = null
    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (obj.name === 'tires') tireMesh = obj as THREE.Mesh
      if (obj.name === 'rims')  rimMesh  = obj as THREE.Mesh
    })
    return { tireMesh, rimMesh }
  }, [cloned])

  useFrame((_st, dt) => {
    if (!wheelsSpinning) return
    for (const wg of wheelGroupRefs.current) {
      if (wg) wg.rotation.z -= dt * 8
    }
  })

  // Hide the merged tire/rim meshes from the cloned scene — we render them
  // individually inside spinning wheel groups instead.
  useEffect(() => {
    cloned.traverse((obj) => {
      if (obj.name === 'tires' || obj.name === 'rims') obj.visible = false
    })
  }, [cloned])

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Static body (body, glass, bumpers, lights) */}
      <primitive object={cloned} castShadow receiveShadow />

      {/* Spinning wheel groups — each contains a single-wheel slice of the geometry */}
      {WHEELS.map(([wx, wy, wz], i) => (
        <group
          key={i}
          ref={el => { wheelGroupRefs.current[i] = el }}
          position={[wx, wy, wz]}
        >
          {wheelGeos.tireMesh && (
            <mesh
              geometry={wheelGeos.tireMesh.geometry}
              material={wheelGeos.tireMesh.material}
              position={[-wx, -wy, -wz]}
              castShadow
            />
          )}
          {wheelGeos.rimMesh && (
            <mesh
              geometry={wheelGeos.rimMesh.geometry}
              material={wheelGeos.rimMesh.material}
              position={[-wx, -wy, -wz]}
              castShadow
            />
          )}
        </group>
      ))}

      {/* Headlight fill lights */}
      <pointLight position={[3.0, 0.7, -0.5]} color="#fff5e0" intensity={2} distance={18} decay={2} />
      <pointLight position={[3.0, 0.7,  0.5]} color="#fff5e0" intensity={2} distance={18} decay={2} />
    </group>
  )
}

// Re-export as CarRenderer for direct Scene use
export { Car as CarRenderer }
