// ── VelarGatewayRenderer.tsx ──────────────────────────────────────────────────
// M14 Track B: Renders the Velar Gateway — a teal portal structure that appears
// on the home planet after the player decodes the Velar response message.
//
// Visual design:
//   • Standing ring (torus) 6m radius, 0.4m tube, teal emissive glow
//   • Rotating inner energy disc (flat circle, additive blend, animated)
//   • Velar glyphs etched into the ring (SVG-to-geometry approximation via instanced thin boxes)
//   • Particle halo — 80 particles orbiting the ring plane
//   • When inactive: ring pulses slowly (dim teal)
//   • When active: inner disc visible, particles fast, bright white-teal

import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useVelarStore } from '../store/velarStore'
import { PLANET_RADIUS, terrainHeightAt, getSpawnPosition } from '../world/SpherePlanet'
import { VELAR_GATEWAY_COORDS } from '../game/VelarLanguageSystem'

const RING_RADIUS   = 6    // meters
const RING_TUBE     = 0.45
const GATEWAY_COLOR = '#00e8d0'

function useGatewayPosition(): [number, number, number] {
  return useMemo(() => {
    const [sx, sy, sz] = getSpawnPosition()
    const spawnDir = new THREE.Vector3(sx, sy, sz).normalize()
    const up = Math.abs(spawnDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
    const tangent = new THREE.Vector3().crossVectors(spawnDir, up).normalize()
    const arcDist = VELAR_GATEWAY_COORDS.arcDistFromSpawn / PLANET_RADIUS
    const axis    = tangent.clone().applyAxisAngle(spawnDir, VELAR_GATEWAY_COORDS.angleFromNorth)
    const dir     = spawnDir.clone().applyAxisAngle(axis, arcDist)
    const h       = terrainHeightAt(dir)
    const r       = PLANET_RADIUS + Math.max(0, h) + RING_RADIUS * 0.5
    return [dir.x * r, dir.y * r, dir.z * r]
  }, [])
}

// ── Particle system (80 orbiting particles) ────────────────────────────────

const PARTICLE_COUNT = 80
function makeParticleGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const phases    = new Float32Array(PARTICLE_COUNT)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const a = (i / PARTICLE_COUNT) * Math.PI * 2
    const orbitR = RING_RADIUS + (Math.random() - 0.5) * 2
    positions[i * 3]     = Math.cos(a) * orbitR
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.8
    positions[i * 3 + 2] = Math.sin(a) * orbitR
    phases[i] = Math.random() * Math.PI * 2
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('phase',    new THREE.Float32BufferAttribute(phases,    1))
  return geo
}

export function VelarGatewayRenderer() {
  const gatewayRevealed = useVelarStore(s => s.gatewayRevealed)
  const gatewayActive   = useVelarStore(s => s.gatewayActive)

  const ringRef   = useRef<THREE.Mesh>(null)
  const discRef   = useRef<THREE.Mesh>(null)
  const glowRef   = useRef<THREE.PointLight>(null)
  const ptGeoRef  = useRef(makeParticleGeometry())
  const ptRef     = useRef<THREE.Points>(null)

  const [gx, gy, gz] = useGatewayPosition()

  // Quaternion to align ring with surface normal at gateway position
  const ringQuat = useMemo(() => {
    const surfaceNorm = new THREE.Vector3(gx, gy, gz).normalize()
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfaceNorm)
  }, [gx, gy, gz])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (!gatewayRevealed) return

    // Ring pulse
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshStandardMaterial
      const intensity = gatewayActive
        ? 1.0 + 0.4 * Math.sin(t * 4)
        : 0.35 + 0.15 * Math.sin(t * 1.2)
      mat.emissiveIntensity = intensity
    }

    // Disc rotation
    if (discRef.current && gatewayActive) {
      discRef.current.rotation.z = t * 1.5
    }

    // Point light pulse
    if (glowRef.current) {
      glowRef.current.intensity = gatewayActive
        ? 3.0 + Math.sin(t * 3) * 0.8
        : 0.8 + Math.sin(t * 1.5) * 0.2
    }

    // Particle orbit
    if (ptRef.current && ptGeoRef.current) {
      const pos   = ptGeoRef.current.attributes.position as THREE.BufferAttribute
      const phase = ptGeoRef.current.attributes.phase    as THREE.BufferAttribute
      const speed = gatewayActive ? 0.8 : 0.2
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const a      = (i / PARTICLE_COUNT) * Math.PI * 2 + t * speed + phase.getX(i)
        const orbitR = RING_RADIUS + Math.sin(phase.getX(i) + t * 0.3) * 1.2
        pos.setXYZ(i,
          Math.cos(a) * orbitR,
          Math.sin(phase.getX(i) * 2 + t * 0.4) * 0.5,
          Math.sin(a) * orbitR,
        )
      }
      pos.needsUpdate = true
    }
  })

  if (!gatewayRevealed) return null

  return (
    <group position={[gx, gy, gz]} quaternion={ringQuat}>
      {/* Main ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 20, 80]} />
        <meshStandardMaterial
          color={GATEWAY_COLOR}
          emissive={GATEWAY_COLOR}
          emissiveIntensity={0.4}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Inner energy disc — visible when active */}
      {gatewayActive && (
        <mesh ref={discRef} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[RING_RADIUS - 0.5, 64]} />
          <meshBasicMaterial
            color={GATEWAY_COLOR}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Orbiting particles */}
      <points ref={ptRef} geometry={ptGeoRef.current}>
        <pointsMaterial
          color={GATEWAY_COLOR}
          size={0.2}
          sizeAttenuation
          transparent
          opacity={gatewayActive ? 0.9 : 0.4}
        />
      </points>

      {/* Glow light */}
      <pointLight
        ref={glowRef}
        color={GATEWAY_COLOR}
        intensity={0.8}
        distance={40}
        decay={2}
      />

      {/* Ground pedestal */}
      <mesh position={[0, -(RING_RADIUS * 0.45), 0]}>
        <cylinderGeometry args={[1.2, 1.8, 0.6, 12]} />
        <meshStandardMaterial color="#1a2a28" roughness={0.8} metalness={0.3} />
      </mesh>
    </group>
  )
}
