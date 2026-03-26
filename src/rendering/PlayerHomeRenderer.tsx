/**
 * PlayerHomeRenderer — renders a small wooden cabin at the player's home position.
 *
 * Structure:
 *   - Base: BoxGeometry(4, 2.5, 4) brown wood material
 *   - Roof: ConeGeometry(3, 2, 4) dark brown, rotated 45° to align with walls
 *   - Door: PlaneGeometry(0.8, 1.5) dark material on front face
 *   - Windows: 2x PlaneGeometry(0.6, 0.6) emissive yellow on sides
 *   - Chimney: CylinderGeometry(0.15, 0.15, 1.2) top-left of roof
 *   - Smoke: 4 small SphereGeometry(0.1) rising from chimney with uTime offset
 *   - Light: PointLight above door (#ffcc77, 0.8, 12)
 *   - Sign: HTML overlay "🏠 [username]'s Home"
 */
import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { usePlayerStore } from '../store/playerStore'
import { getLocalUsername } from '../net/useWorldSocket'

const WOOD_COLOR   = '#7B4B2A'
const ROOF_COLOR   = '#4A2E14'
const DOOR_COLOR   = '#3B1F08'
const WINDOW_COLOR = '#ffee88'

// Geometry + material singletons (created once, shared across renders)
let _baseGeo:    THREE.BoxGeometry     | null = null
let _roofGeo:    THREE.ConeGeometry    | null = null
let _doorGeo:    THREE.PlaneGeometry   | null = null
let _winGeo:     THREE.PlaneGeometry   | null = null
let _chimneyGeo: THREE.CylinderGeometry| null = null
let _smokeGeo:   THREE.SphereGeometry  | null = null

let _woodMat:    THREE.MeshStandardMaterial | null = null
let _roofMat:    THREE.MeshStandardMaterial | null = null
let _doorMat:    THREE.MeshStandardMaterial | null = null
let _winMat:     THREE.MeshStandardMaterial | null = null
let _smokeMat:   THREE.MeshStandardMaterial | null = null

function getGeos() {
  if (!_baseGeo)    _baseGeo    = new THREE.BoxGeometry(4, 2.5, 4)
  if (!_roofGeo)    _roofGeo    = new THREE.ConeGeometry(3, 2, 4)
  if (!_doorGeo)    _doorGeo    = new THREE.PlaneGeometry(0.8, 1.5)
  if (!_winGeo)     _winGeo     = new THREE.PlaneGeometry(0.6, 0.6)
  if (!_chimneyGeo) _chimneyGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8)
  if (!_smokeGeo)   _smokeGeo   = new THREE.SphereGeometry(0.1, 6, 6)

  if (!_woodMat)  _woodMat  = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 0.9, metalness: 0 })
  if (!_roofMat)  _roofMat  = new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.85, metalness: 0 })
  if (!_doorMat)  _doorMat  = new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
  if (!_winMat)   _winMat   = new THREE.MeshStandardMaterial({ color: WINDOW_COLOR, emissive: new THREE.Color(WINDOW_COLOR), emissiveIntensity: 0.3, side: THREE.DoubleSide })
  if (!_smokeMat) _smokeMat = new THREE.MeshStandardMaterial({ color: '#cccccc', transparent: true, opacity: 0.4, roughness: 1 })

  return { _baseGeo, _roofGeo, _doorGeo, _winGeo, _chimneyGeo, _smokeGeo, _woodMat, _roofMat, _doorMat, _winMat, _smokeMat }
}

// 4 smoke puff offsets (phase spread so they don't all move at once)
const SMOKE_PHASES = [0, 1.5, 3.0, 4.5]

export function PlayerHomeRenderer() {
  const homePosition = usePlayerStore(s => s.homePosition)
  const homeSet      = usePlayerStore(s => s.homeSet)
  const username     = getLocalUsername()
  const smokeRefs    = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)]

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    smokeRefs.forEach((ref, i) => {
      if (!ref.current) return
      const phase = SMOKE_PHASES[i]
      const cycle = ((t * 0.5 + phase) % 3.0) / 3.0  // 0→1 over 6 seconds per puff
      const rise  = cycle * 2.5  // rises 2.5 units
      const fade  = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2  // fade in/out
      ref.current.position.y = rise + 0.6
      ;(ref.current.material as THREE.MeshStandardMaterial).opacity = fade * 0.45
    })
  })

  if (!homeSet || !homePosition) return null

  const [hx, hy, hz] = homePosition

  const {
    _baseGeo, _roofGeo, _doorGeo, _winGeo, _chimneyGeo, _smokeGeo,
    _woodMat, _roofMat, _doorMat, _winMat, _smokeMat,
  } = getGeos()

  // Compute "up" direction at home position for orientation
  const homeVec = new THREE.Vector3(hx, hy, hz).normalize()
  const quat    = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), homeVec)

  const displayName = username ? `${username}'s Home` : 'Your Home'

  return (
    <group position={[hx, hy, hz]} quaternion={quat}>
      {/* ── Base (cabin walls) ── */}
      <mesh geometry={_baseGeo} material={_woodMat} position={[0, 1.25, 0]} castShadow receiveShadow />

      {/* ── Roof (cone, rotated so flat faces align with walls) ── */}
      <mesh
        geometry={_roofGeo}
        material={_roofMat}
        position={[0, 3.5, 0]}
        rotation={[0, Math.PI / 4, 0]}
        castShadow
      />

      {/* ── Door (front face, z+2) ── */}
      <mesh
        geometry={_doorGeo}
        material={_doorMat}
        position={[0, 0.75, 2.01]}
      />

      {/* ── Windows (side faces) ── */}
      <mesh
        geometry={_winGeo}
        material={_winMat}
        position={[2.01, 1.4, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <mesh
        geometry={_winGeo}
        material={_winMat}
        position={[-2.01, 1.4, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />

      {/* ── Chimney (top-left rear of roof) ── */}
      <mesh geometry={_chimneyGeo} material={_woodMat} position={[-1, 4.2, -1]} castShadow />

      {/* ── Smoke puffs rising from chimney ── */}
      {SMOKE_PHASES.map((_, i) => (
        <mesh
          key={i}
          ref={smokeRefs[i]}
          geometry={_smokeGeo}
          material={_smokeMat}
          position={[-1, 0.6, -1]}
        />
      ))}

      {/* ── Warm point light above door ── */}
      <pointLight
        color="#ffcc77"
        intensity={0.8}
        distance={12}
        decay={2}
        position={[0, 3.5, 2.5]}
      />

      {/* ── Ownership sign HTML overlay ── */}
      <Html
        position={[0, 5.5, 0]}
        center
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        distanceFactor={12}
        occlude={false}
      >
        <div style={{
          background: 'rgba(10,8,4,0.85)',
          border: '1px solid rgba(123,75,42,0.6)',
          borderRadius: 4,
          padding: '3px 10px',
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#e8c97a',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}>
          {'\uD83C\uDFE0'} {displayName}
        </div>
      </Html>
    </group>
  )
}
