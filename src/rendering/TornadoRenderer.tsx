// ── TornadoRenderer.tsx ──────────────────────────────────────────────────────
// M35 Track B: Tornado visual + proximity damage system.
//
// - Renders an inverted cone mesh (wide at top, narrow at bottom)
// - Tornado moves at 5 m/s, changes direction every 30s
// - Within 30m: 5 damage/s; within 10m: 20 damage/s + knockback
// - HUD warning dispatched via custom event when within 100m
// - Dissipates after 3-5 minutes

import * as THREE from 'three'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useWeatherStore } from '../store/weatherStore'
import { usePlayerStore } from '../store/playerStore'
import { Health, Position, Velocity } from '../ecs/world'

const TORNADO_SPEED      = 5       // m/s movement speed
const TORNADO_SPIN_RATE  = 3       // rad/s Y rotation
const DIR_CHANGE_PERIOD  = 30      // seconds between direction changes
const LIFETIME_MIN       = 180     // 3 minutes
const LIFETIME_MAX       = 300     // 5 minutes
const DAMAGE_NEAR        = 5       // damage/s at 30m
const DAMAGE_CLOSE       = 20      // damage/s at 10m
const RANGE_NEAR         = 30      // metres
const RANGE_CLOSE        = 10      // metres
const WARN_RANGE         = 100     // metres — show HUD warning

interface TornadoRendererProps {
  playerX: number
  playerY: number
  playerZ: number
  entityId: number
}

export function TornadoRenderer({ playerX, playerY, playerZ, entityId }: TornadoRendererProps) {
  const tornadoPos        = useWeatherStore(s => s.tornadoPos)
  const setTornadoPos     = useWeatherStore(s => s.setTornadoPos)
  const addWarmth         = usePlayerStore(s => s.addWarmth)

  // Internal movement state (kept in refs, not react state — updated every frame)
  const dirRef            = useRef({ x: Math.random() - 0.5, z: Math.random() - 0.5 })
  const dirTimerRef       = useRef(DIR_CHANGE_PERIOD * Math.random())
  const lifetimeRef       = useRef(LIFETIME_MIN + Math.random() * (LIFETIME_MAX - LIFETIME_MIN))
  const meshRef           = useRef<THREE.Mesh | null>(null)
  const warningEmittedRef = useRef(false)

  // Normalise initial direction
  useEffect(() => {
    const d = dirRef.current
    const len = Math.sqrt(d.x * d.x + d.z * d.z) || 1
    dirRef.current = { x: d.x / len, z: d.z / len }
  }, [])

  const coneGeo = useMemo(() => {
    // Inverted cone: wide at top (radiusTop=8), narrow at bottom (radiusBottom=1)
    // Three.js ConeGeometry: args = (radiusTop, radiusBottom, height, segments)
    // We use a standard cone but flip it upside down via rotation
    return new THREE.ConeGeometry(8, 40, 16, 1, true)
  }, [])

  const coneMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x445566,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
    wireframe: false,
  }), [])

  const innerConeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x334455,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)

    if (!tornadoPos) return

    // ── Lifetime countdown ──────────────────────────────────────────────────
    lifetimeRef.current -= dt
    if (lifetimeRef.current <= 0) {
      setTornadoPos(null)
      warningEmittedRef.current = false
      return
    }

    // ── Direction change ────────────────────────────────────────────────────
    dirTimerRef.current -= dt
    if (dirTimerRef.current <= 0) {
      const angle = Math.random() * Math.PI * 2
      dirRef.current = { x: Math.cos(angle), z: Math.sin(angle) }
      dirTimerRef.current = DIR_CHANGE_PERIOD
    }

    // ── Movement ────────────────────────────────────────────────────────────
    const newX = tornadoPos.x + dirRef.current.x * TORNADO_SPEED * dt
    const newZ = tornadoPos.z + dirRef.current.z * TORNADO_SPEED * dt
    setTornadoPos({ x: newX, y: tornadoPos.y, z: newZ })

    // ── Mesh transform ──────────────────────────────────────────────────────
    if (meshRef.current) {
      meshRef.current.position.set(newX, tornadoPos.y, newZ)
      meshRef.current.rotation.y += TORNADO_SPIN_RATE * dt
    }

    // ── Player proximity damage ─────────────────────────────────────────────
    const dx = playerX - newX
    const dz = playerZ - newZ
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < WARN_RANGE) {
      const distInt = Math.round(dist)
      window.dispatchEvent(new CustomEvent('tornado-warning', { detail: { distance: distInt } }))
      warningEmittedRef.current = true
    } else if (warningEmittedRef.current) {
      window.dispatchEvent(new CustomEvent('tornado-warning', { detail: { distance: -1 } }))
      warningEmittedRef.current = false
    }

    if (dist < RANGE_CLOSE) {
      // Heavy damage + knockback
      Health.current[entityId] = Math.max(0, Health.current[entityId] - DAMAGE_CLOSE * dt)
      // Push player away from tornado center
      const pushLen = dist > 0.1 ? dist : 0.1
      const knockX = (dx / pushLen) * 12
      const knockZ = (dz / pushLen) * 12
      Velocity.x[entityId] = (Velocity.x[entityId] || 0) + knockX * dt
      Velocity.z[entityId] = (Velocity.z[entityId] || 0) + knockZ * dt
    } else if (dist < RANGE_NEAR) {
      // Moderate damage
      Health.current[entityId] = Math.max(0, Health.current[entityId] - DAMAGE_NEAR * dt)
      // Moderate push
      const pushLen = dist > 0.1 ? dist : 0.1
      const pushX = (dx / pushLen) * 4
      const pushZ = (dz / pushLen) * 4
      Velocity.x[entityId] = (Velocity.x[entityId] || 0) + pushX * dt
      Velocity.z[entityId] = (Velocity.z[entityId] || 0) + pushZ * dt
    }
  })

  if (!tornadoPos) return null

  return (
    <group position={[tornadoPos.x, tornadoPos.y, tornadoPos.z]}>
      {/* Main tornado cone — inverted (wide top, narrow bottom) */}
      <mesh
        ref={meshRef}
        geometry={coneGeo}
        material={coneMat}
        // Rotate 180° so wide end is at top
        rotation={[Math.PI, 0, 0]}
        frustumCulled={false}
      />
      {/* Inner darker cone for depth */}
      <mesh
        geometry={coneGeo}
        material={innerConeMat}
        rotation={[Math.PI, 0, 0]}
        scale={[0.6, 0.9, 0.6]}
        frustumCulled={false}
      />
      {/* Base swirl — glowing circle at ground level */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -20, 0]}>
        <ringGeometry args={[4, 9, 24]} />
        <meshBasicMaterial
          color={0x334466}
          transparent
          opacity={0.5}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Dust cloud at base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -19, 0]}>
        <circleGeometry args={[6, 16]} />
        <meshBasicMaterial
          color={0x7a7060}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
