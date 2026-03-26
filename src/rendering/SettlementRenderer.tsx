// ── SettlementRenderer.tsx ─────────────────────────────────────────────────────
// M6: Renders NPC settlements in the 3D world.
// M21 Track B: Visual upgrades — roofs, chimneys, smoke particles, market stalls,
//              NPC activity dots, street paths.
// M31 Track B: Settlement growth visuals —
//              • Tier-based PointLight color (T0 campfire orange → T5 cool blue-white)
//              • Population counter overlay: 👥 {npcCount} + colored T{civLevel} badge
//              • Activity indicators: 💰 recent trade, 🔨 crafting hint, ⚔ combat hint
//
// Each settlement renders:
//   - 3–6 building footprints scaled by civLevel (simple box meshes, PBR materials)
//   - Pyramid roofs on each building (ConeGeometry, tier-dependent color)
//   - Chimney + smoke particles at civLevel >= 2
//   - Market stalls at civLevel >= 1
//   - NPC activity dots (animated small spheres)
//   - Dirt path lines between buildings at civLevel >= 2
//   - A central fire/torch glow (emissive point mesh, drives Bloom)
//   - A tier-appropriate ambient PointLight
//   - A floating population/name label (HTML overlay via drei Html)
//   - Territory boundary ring (faint circle on terrain, helps player understand range)
//
// Performance: settlement count is low (5). All geometry is instanced per settlement.
// Smoke uses instanced spheres (20 per chimney). NPC dots use instanced spheres.

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useSettlementStore } from '../store/settlementStore'
import { usePlayerStore } from '../store/playerStore'
// M36 Track C: Building meshes
import { useBuildingStore } from '../store/buildingStore'
import type { BuildingType } from '../game/BuildingSystem'

const TERRITORY_RADIUS = 150

// ── Tier-based PointLight config ──────────────────────────────────────────────
// T0: campfire orange  T1: warm amber  T2: lantern yellow
// T3: lantern warm-white  T4: bright warm white  T5: cool blue-white

interface TierLightConfig {
  color:     string
  intensity: number
  distance:  number
}

const TIER_LIGHTS: TierLightConfig[] = [
  { color: '#ff6a10', intensity: 3,   distance: 18  },   // T0 campfire orange
  { color: '#ff8c30', intensity: 3.5, distance: 22  },   // T1 warm amber
  { color: '#ffa84c', intensity: 4,   distance: 28  },   // T2 lantern yellow
  { color: '#ffe0a0', intensity: 5,   distance: 36  },   // T3 lantern warm-white
  { color: '#fff5e0', intensity: 6,   distance: 45  },   // T4 bright warm-white
  { color: '#c0e0ff', intensity: 7,   distance: 60  },   // T5 cool blue-white
]

function getTierLight(civLevel: number): TierLightConfig {
  const idx = Math.max(0, Math.min(civLevel, TIER_LIGHTS.length - 1))
  return TIER_LIGHTS[idx]
}

// ── Tier badge color ───────────────────────────────────────────────────────────

function getTierBadgeColor(civLevel: number): string {
  if (civLevel <= 0)  return '#66cc66'   // green  T0
  if (civLevel === 1) return '#99cc44'   // lime   T1
  if (civLevel === 2) return '#cccc22'   // yellow T2
  if (civLevel === 3) return '#cc8822'   // orange T3
  if (civLevel === 4) return '#cc4422'   // red-orange T4
  return '#ff2244'                       // red    T5+
}

// ── Building layouts per civ level ────────────────────────────────────────────

const BUILDING_LAYOUTS: Array<Array<{ ox: number; oz: number; w: number; h: number; d: number }>> = [
  // Level 0 — 2 huts
  [{ ox: 0, oz: 0, w: 2, h: 1.5, d: 2 }, { ox: 3, oz: 1, w: 1.5, h: 1.2, d: 1.5 }],
  // Level 1 — 3 buildings
  [{ ox: 0, oz: 0, w: 2.5, h: 2, d: 2.5 }, { ox: 4, oz: 0, w: 2, h: 1.8, d: 2 }, { ox: -3, oz: 2, w: 1.5, h: 1.5, d: 1.5 }],
  // Level 2 — 4 buildings
  [{ ox: 0, oz: 0, w: 3, h: 2.5, d: 3 }, { ox: 5, oz: 0, w: 2.5, h: 2, d: 2 }, { ox: -4, oz: 1, w: 2, h: 1.8, d: 2 }, { ox: 1, oz: -5, w: 2, h: 1.6, d: 2 }],
  // Level 3+ — 5 buildings + larger scale
  [{ ox: 0, oz: 0, w: 4, h: 3, d: 4 }, { ox: 6, oz: 1, w: 3, h: 2.5, d: 3 }, { ox: -5, oz: 2, w: 2.5, h: 2.5, d: 2.5 }, { ox: 2, oz: -6, w: 2.5, h: 2, d: 2.5 }, { ox: -3, oz: -4, w: 2, h: 2, d: 2 }],
]

function getBuildingLayout(civLevel: number) {
  const idx = Math.min(civLevel, BUILDING_LAYOUTS.length - 1)
  return BUILDING_LAYOUTS[idx]
}

// ── Materials ─────────────────────────────────────────────────────────────────

function makeBuildingMaterial(civLevel: number): THREE.MeshStandardMaterial {
  // T3+ gets a reddish-orange brick tone; lower tiers stay earthy brown-grey
  if (civLevel >= 3) {
    const t = Math.min((civLevel - 3) / 2, 1)
    const r = Math.round(160 - t * 30)
    const g = Math.round(80  - t * 20)
    const b = Math.round(60  - t * 10)
    return new THREE.MeshStandardMaterial({ color: `rgb(${r},${g},${b})`, roughness: 0.82, metalness: 0.04 })
  }
  const t = Math.min(civLevel / 3, 1)
  const r = Math.round(110 + (1 - t) * 30)
  const g = Math.round(90  + (1 - t) * 20)
  const b = Math.round(70  + (1 - t) * 10)
  return new THREE.MeshStandardMaterial({ color: `rgb(${r},${g},${b})`, roughness: 0.88, metalness: 0.03 })
}

function makeRoofMaterial(civLevel: number): THREE.MeshStandardMaterial {
  // Tier 0-1: straw/thatch brown; Tier 2+: slate grey; Tier 5: metallic sheen
  if (civLevel >= 5) return new THREE.MeshStandardMaterial({ color: '#a0b8c8', roughness: 0.3, metalness: 0.55 })
  const color = civLevel >= 2 ? '#556677' : '#8B7355'
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.01 })
}

// Market stall awning colors
const AWNING_COLORS = ['#b85c2c', '#8b2222', '#c49620', '#3a6b3a']

// ── Smoke particles (per-settlement instanced spheres) ────────────────────────

const SMOKE_COUNT = 20
const SMOKE_RISE_SPEED = 0.5   // m/s upward
const SMOKE_MAX_HEIGHT = 8     // metres above chimney before reset
const SMOKE_WIND_FACTOR = 0.3  // horizontal drift from wind

function SmokeParticles({ chimneyX, chimneyY, chimneyZ }: { chimneyX: number; chimneyY: number; chimneyZ: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const positions = useMemo(() => {
    const arr = new Float32Array(SMOKE_COUNT * 4)  // x, y, z, age
    for (let i = 0; i < SMOKE_COUNT; i++) {
      arr[i * 4 + 0] = 0
      arr[i * 4 + 1] = Math.random() * SMOKE_MAX_HEIGHT
      arr[i * 4 + 2] = 0
      arr[i * 4 + 3] = Math.random() * 3
    }
    return arr
  }, [])
  const mat4 = useMemo(() => new THREE.Matrix4(), [])
  const _scaleVec = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(delta, 0.1)

    for (let i = 0; i < SMOKE_COUNT; i++) {
      let ox = positions[i * 4 + 0]
      let oy = positions[i * 4 + 1]
      let oz = positions[i * 4 + 2]
      let age = positions[i * 4 + 3]

      oy += SMOKE_RISE_SPEED * dt
      ox += (Math.sin(age * 2) * SMOKE_WIND_FACTOR) * dt
      oz += (Math.cos(age * 1.5) * SMOKE_WIND_FACTOR * 0.5) * dt
      age += dt

      if (oy > SMOKE_MAX_HEIGHT) {
        ox = (Math.random() - 0.5) * 0.3
        oy = 0
        oz = (Math.random() - 0.5) * 0.3
        age = 0
      }

      positions[i * 4 + 0] = ox
      positions[i * 4 + 1] = oy
      positions[i * 4 + 2] = oz
      positions[i * 4 + 3] = age

      const heightFrac = oy / SMOKE_MAX_HEIGHT
      const scale = 0.15 + heightFrac * 0.25

      mat4.makeTranslation(chimneyX + ox, chimneyY + oy, chimneyZ + oz)
      _scaleVec.set(scale, scale, scale)
      mat4.scale(_scaleVec)
      mesh.setMatrixAt(i, mat4)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SMOKE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshBasicMaterial color="#888888" transparent opacity={0.3} depthWrite={false} />
    </instancedMesh>
  )
}

// ── NPC activity dots (animated spheres moving within settlement) ──────────────

const NPC_DOT_SPEED = 0.3
const NPC_DOT_RADIUS = 5
const NPC_DOT_SIZE = 0.15

function NpcActivityDots({ npcCount, settlementX, settlementY, settlementZ }: {
  npcCount: number; settlementX: number; settlementY: number; settlementZ: number
}) {
  const count = Math.min(npcCount, 12)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const _dotScale = useMemo(() => new THREE.Vector3(NPC_DOT_SIZE, NPC_DOT_SIZE, NPC_DOT_SIZE), [])
  const dotState = useMemo(() => {
    const arr = new Float32Array(count * 5)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = Math.random() * NPC_DOT_RADIUS
      arr[i * 5 + 0] = Math.cos(angle) * r
      arr[i * 5 + 1] = Math.sin(angle) * r
      const tAngle = Math.random() * Math.PI * 2
      const tR = Math.random() * NPC_DOT_RADIUS
      arr[i * 5 + 2] = Math.cos(tAngle) * tR
      arr[i * 5 + 3] = Math.sin(tAngle) * tR
      arr[i * 5 + 4] = 2 + Math.random() * 2
    }
    return arr
  }, [count])
  const mat4 = useMemo(() => new THREE.Matrix4(), [])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(delta, 0.1)

    for (let i = 0; i < count; i++) {
      let dx = dotState[i * 5 + 0]
      let dz = dotState[i * 5 + 1]
      const tx = dotState[i * 5 + 2]
      const tz = dotState[i * 5 + 3]
      let timer = dotState[i * 5 + 4]

      const toX = tx - dx, toZ = tz - dz
      const dist = Math.sqrt(toX * toX + toZ * toZ)
      if (dist > 0.2) {
        dx += (toX / dist) * NPC_DOT_SPEED * dt
        dz += (toZ / dist) * NPC_DOT_SPEED * dt
      }

      timer -= dt
      if (timer <= 0 || dist < 0.2) {
        const angle = Math.random() * Math.PI * 2
        const r = Math.random() * NPC_DOT_RADIUS
        dotState[i * 5 + 2] = Math.cos(angle) * r
        dotState[i * 5 + 3] = Math.sin(angle) * r
        timer = 2 + Math.random() * 2
      }

      dotState[i * 5 + 0] = dx
      dotState[i * 5 + 1] = dz
      dotState[i * 5 + 4] = timer

      mat4.makeTranslation(settlementX + dx, settlementY + 0.3, settlementZ + dz)
      mat4.scale(_dotScale)
      mesh.setMatrixAt(i, mat4)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshStandardMaterial color="#d4a574" roughness={0.7} metalness={0.0} />
    </instancedMesh>
  )
}

// ── Territory ring ────────────────────────────────────────────────────────────

function TerritoryRing({ x, y, z }: { x: number; y: number; z: number }) {
  const lineMesh = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, TERRITORY_RADIUS, TERRITORY_RADIUS, 0, Math.PI * 2, false, 0)
    const points = curve.getPoints(80).map(p => new THREE.Vector3(p.x, 0.1, p.y))
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color: '#4a6a8a', transparent: true, opacity: 0.18 })
    return new THREE.LineLoop(geo, mat)
  }, [])

  return <primitive object={lineMesh} position={[x, y, z]} />
}

// ── Market Stalls ─────────────────────────────────────────────────────────────

function MarketStalls({ civLevel }: { civLevel: number }) {
  if (civLevel < 1) return null
  const stallCount = civLevel >= 3 ? 2 : 1

  const stalls = useMemo(() => {
    const s = []
    for (let i = 0; i < stallCount; i++) {
      const angle = (i / stallCount) * Math.PI * 2 + Math.PI * 0.25
      const dist = 2.5 + civLevel * 0.5
      s.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        colorIdx: i,
      })
    }
    return s
  }, [civLevel, stallCount])

  return (
    <>
      {stalls.map((stall, i) => (
        <group key={i} position={[stall.x, 0, stall.z]}>
          {/* Table */}
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[1.2, 0.08, 0.8]} />
            <meshStandardMaterial color="#8B6914" roughness={0.9} metalness={0.01} />
          </mesh>
          {/* Table legs */}
          {([-0.5, 0.5] as const).flatMap((lx) =>
            ([-0.3, 0.3] as const).map((lz, li) => (
              <mesh key={`${lx}-${lz}-${li}`} position={[lx, 0.2, lz]}>
                <boxGeometry args={[0.06, 0.4, 0.06]} />
                <meshStandardMaterial color="#6B4E14" roughness={0.9} />
              </mesh>
            ))
          )}
          {/* Awning */}
          <mesh position={[0, 1.1, -0.1]} rotation={[-0.3, 0, 0]} castShadow>
            <planeGeometry args={[1.6, 1.0]} />
            <meshStandardMaterial
              color={AWNING_COLORS[stall.colorIdx % AWNING_COLORS.length]}
              roughness={0.85}
              metalness={0.01}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Awning poles */}
          <mesh position={[-0.7, 0.6, -0.4]}>
            <boxGeometry args={[0.04, 1.2, 0.04]} />
            <meshStandardMaterial color="#6B4E14" roughness={0.9} />
          </mesh>
          <mesh position={[0.7, 0.6, -0.4]}>
            <boxGeometry args={[0.04, 1.2, 0.04]} />
            <meshStandardMaterial color="#6B4E14" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  )
}

// ── Street Paths ──────────────────────────────────────────────────────────────

function StreetPaths({ layout, civLevel }: { layout: Array<{ ox: number; oz: number; w: number; h: number; d: number }>; civLevel: number }) {
  if (civLevel < 2 || layout.length < 2) return null

  const paths = useMemo(() => {
    const result: Array<{ x1: number; z1: number; x2: number; z2: number }> = []
    for (let i = 0; i < Math.min(layout.length - 1, 3); i++) {
      result.push({ x1: layout[i].ox, z1: layout[i].oz, x2: layout[i + 1].ox, z2: layout[i + 1].oz })
    }
    if (layout.length >= 3) {
      result.push({
        x1: layout[layout.length - 1].ox,
        z1: layout[layout.length - 1].oz,
        x2: layout[0].ox,
        z2: layout[0].oz,
      })
    }
    return result
  }, [layout])

  return (
    <>
      {paths.map((p, i) => {
        const dx = p.x2 - p.x1
        const dz = p.z2 - p.z1
        const length = Math.sqrt(dx * dx + dz * dz)
        const angle = Math.atan2(dx, dz)
        const cx = (p.x1 + p.x2) / 2
        const cz = (p.z1 + p.z2) / 2

        return (
          <mesh key={i} position={[cx, 0.02, cz]} rotation={[0, angle, 0]} receiveShadow>
            <planeGeometry args={[0.5, length]} />
            <meshStandardMaterial color="#5a4a32" roughness={0.95} metalness={0.0} side={THREE.DoubleSide} />
          </mesh>
        )
      })}
    </>
  )
}

// ── Population + Activity label (HTML overlay) ────────────────────────────────

const TRADE_ACTIVE_MS = 60_000  // 60 seconds

function SettlementLabel({
  settlementId,
  name,
  civLevel,
  npcCount,
  closedGates,
  labelHeight,
}: {
  settlementId: number
  name:         string
  civLevel:     number
  npcCount:     number
  closedGates:  boolean
  labelHeight:  number
}) {
  // Read last trade time from store
  const lastTradeTime = useSettlementStore(s => s.lastTradeTime.get(settlementId) ?? 0)
  const tradeActive   = (Date.now() - lastTradeTime) < TRADE_ACTIVE_MS

  const tierColor = getTierBadgeColor(civLevel)

  // Activity icons — crafting hint for T2+ (always has a forge), combat for T3+ (has guards)
  const activityIcons: string[] = []
  if (tradeActive)    activityIcons.push('💰')
  if (civLevel >= 2)  activityIcons.push('🔨')
  if (civLevel >= 3)  activityIcons.push('⚔')

  return (
    <Html
      position={[0, labelHeight + 1.8, 0]}
      center
      distanceFactor={80}
      style={{ pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      <div style={{
        fontFamily:    'monospace',
        fontSize:      11,
        color:         closedGates ? '#c05050' : '#c8b880',
        letterSpacing: 2,
        textTransform: 'uppercase',
        textShadow:    '0 1px 4px rgba(0,0,0,0.9)',
        background:    'rgba(0,0,0,0.6)',
        padding:       '3px 7px 2px',
        borderRadius:  3,
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           2,
      }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {closedGates ? 'GATES CLOSED' : name}
        </div>

        {/* Stats row: population + tier badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, letterSpacing: 1 }}>
          <span style={{ color: '#9abfd8' }}>👥 {npcCount}</span>
          <span style={{
            color:         tierColor,
            fontWeight:    700,
            border:        `1px solid ${tierColor}`,
            borderRadius:  2,
            padding:       '0px 4px',
            fontSize:      8,
          }}>
            T{civLevel}
          </span>
        </div>

        {/* Activity icons row */}
        {activityIcons.length > 0 && (
          <div style={{ fontSize: 10, letterSpacing: 3 }}>
            {activityIcons.join(' ')}
          </div>
        )}
      </div>
    </Html>
  )
}

// ── M36 Track C: Completed building meshes ─────────────────────────────────────
// Each building type renders at an offset from the settlement center.
// Under-construction buildings show wireframe scaffolding.

const BUILDING_OFFSETS: Record<BuildingType, [number, number, number]> = {
  barracks:   [ 12, 0,  2],
  library:    [-12, 0,  4],
  market:     [  6, 0, 10],
  watchtower: [-10, 0,-10],
  healer_hut: [  8, 0, -8],
  forge:      [-14, 0, -4],
}

function BarracksMesh() {
  // Rectangular building 8×4×5, brown-red material
  return (
    <group>
      <mesh position={[0, 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[8, 4, 5]} />
        <meshStandardMaterial color="#8b3a2c" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 4.8, 0]} castShadow>
        <coneGeometry args={[5, 1.6, 4]} />
        <meshStandardMaterial color="#5a2a1e" roughness={0.9} metalness={0.02} />
      </mesh>
      {/* Weapon rack detail */}
      <mesh position={[0, 1.5, 2.6]}>
        <boxGeometry args={[3, 1.5, 0.1]} />
        <meshStandardMaterial color="#4a3020" roughness={0.95} />
      </mesh>
    </group>
  )
}

function LibraryMesh() {
  // Tall narrow building 4×7×4, dark wood
  return (
    <group>
      <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 7, 4]} />
        <meshStandardMaterial color="#3d2b1a" roughness={0.85} metalness={0.03} />
      </mesh>
      {/* Tall pointed roof */}
      <mesh position={[0, 7.5, 0]} castShadow>
        <coneGeometry args={[3, 2.5, 4]} />
        <meshStandardMaterial color="#2a1e0f" roughness={0.9} />
      </mesh>
      {/* Doorway arch */}
      <mesh position={[0, 1.2, 2.1]}>
        <boxGeometry args={[1.2, 2.4, 0.12]} />
        <meshStandardMaterial color="#1a1008" roughness={0.95} />
      </mesh>
    </group>
  )
}

function HealerHutMesh() {
  // Small rounded-looking building 4×3.5×4 with green cross on roof
  return (
    <group>
      <mesh position={[0, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 3.5, 4]} />
        <meshStandardMaterial color="#4a7840" roughness={0.85} metalness={0.02} />
      </mesh>
      {/* Roof */}
      <mesh position={[0, 3.6, 0]} castShadow>
        <coneGeometry args={[3, 1.2, 4]} />
        <meshStandardMaterial color="#2e5228" roughness={0.9} />
      </mesh>
      {/* Green cross on roof (horizontal bar) */}
      <mesh position={[0, 4.5, 0]} rotation={[0, 0, 0]}>
        <planeGeometry args={[1.8, 0.5]} />
        <meshStandardMaterial
          color="#00cc44"
          emissive="#00aa33"
          emissiveIntensity={1.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Green cross (vertical bar) */}
      <mesh position={[0, 4.5, 0]}>
        <planeGeometry args={[0.5, 1.8]} />
        <meshStandardMaterial
          color="#00cc44"
          emissive="#00aa33"
          emissiveIntensity={1.2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

function ForgeMesh() {
  // Squat 5×4×5 dark stone building with chimney and orange glow
  return (
    <group>
      <mesh position={[0, 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 4, 5]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.9} metalness={0.08} />
      </mesh>
      {/* Flat-ish roof */}
      <mesh position={[0, 4.3, 0]} castShadow>
        <coneGeometry args={[3.5, 0.8, 4]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.95} />
      </mesh>
      {/* Chimney */}
      <mesh position={[1.5, 5, 1.5]} castShadow>
        <boxGeometry args={[0.6, 2, 0.6]} />
        <meshStandardMaterial color="#222222" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Forge glow */}
      <pointLight position={[0, 1.5, 0]} color="#ff4400" intensity={4} distance={8} decay={2} />
      <mesh position={[0, 0.5, 2.6]}>
        <sphereGeometry args={[0.3, 8, 6]} />
        <meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={3} />
      </mesh>
    </group>
  )
}

function WatchtowerMesh() {
  // Tall thin 2×12×2 stone tower with light at top
  return (
    <group>
      <mesh position={[0, 6, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 12, 2]} />
        <meshStandardMaterial color="#7a7068" roughness={0.88} metalness={0.04} />
      </mesh>
      {/* Battlements cap */}
      <mesh position={[0, 12.4, 0]} castShadow>
        <boxGeometry args={[2.6, 0.8, 2.6]} />
        <meshStandardMaterial color="#6a6058" roughness={0.9} />
      </mesh>
      {/* Light at top */}
      <pointLight position={[0, 13, 0]} color="#ffe8a0" intensity={3} distance={25} decay={2} />
      <mesh position={[0, 12.8, 0]}>
        <sphereGeometry args={[0.18, 6, 4]} />
        <meshStandardMaterial color="#ffe880" emissive="#ffcc40" emissiveIntensity={2} />
      </mesh>
    </group>
  )
}

function MarketMesh() {
  // Open-sided pavilion: edge frame + roof, gold trim
  return (
    <group>
      {/* Roof plane */}
      <mesh position={[0, 4, 0]} castShadow>
        <boxGeometry args={[8, 0.2, 6]} />
        <meshStandardMaterial color="#b8841a" roughness={0.8} metalness={0.15} />
      </mesh>
      {/* Four corner columns */}
      {([-3.5, 3.5] as const).flatMap((px) =>
        ([-2.5, 2.5] as const).map((pz, i) => (
          <mesh key={`col-${px}-${pz}-${i}`} position={[px, 2, pz]} castShadow>
            <boxGeometry args={[0.3, 4, 0.3]} />
            <meshStandardMaterial color="#c8a030" roughness={0.7} metalness={0.3} />
          </mesh>
        ))
      )}
      {/* Edge wire frame */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(8, 4, 6)]} />
        <lineBasicMaterial color="#c8a030" />
      </lineSegments>
    </group>
  )
}

// Scaffolding for in-progress buildings
function ScaffoldingMesh() {
  const geo = useMemo(() => new THREE.BoxGeometry(5, 5, 5), [])
  return (
    <mesh position={[0, 2.5, 0]}>
      <primitive object={geo} attach="geometry" />
      <meshStandardMaterial color="#8B6914" wireframe opacity={0.6} transparent />
    </mesh>
  )
}

const BUILDING_MESH_MAP: Record<BuildingType, () => JSX.Element | null> = {
  barracks:   BarracksMesh,
  library:    LibraryMesh,
  healer_hut: HealerHutMesh,
  forge:      ForgeMesh,
  watchtower: WatchtowerMesh,
  market:     MarketMesh,
}

function SettlementBuildings({ settlementId }: { settlementId: number }) {
  const isBuildingComplete  = useBuildingStore(s => s.isBuildingComplete)
  const getBuildingProgress = useBuildingStore(s => s.getBuildingProgress)
  const getAvailableBuildings = useBuildingStore(s => s.getAvailableBuildings)
  const settlement = useSettlementStore(s => s.settlements.get(settlementId))
  const civLevel   = settlement?.civLevel ?? 0

  const types = getAvailableBuildings(civLevel)

  return (
    <>
      {types.map(type => {
        const [ox, oy, oz] = BUILDING_OFFSETS[type]
        const complete  = isBuildingComplete(settlementId, type)
        const pct       = getBuildingProgress(settlementId, type)
        const MeshComp  = BUILDING_MESH_MAP[type]

        if (!complete && pct === 0) return null  // not started, don't show

        return (
          <group key={type} position={[ox, oy, oz]}>
            {complete ? <MeshComp /> : <ScaffoldingMesh />}
          </group>
        )
      })}
    </>
  )
}

// ── Settlement Mesh (main building group) ─────────────────────────────────────

function SettlementMesh({ settlement }: { settlement: any }) {
  const { x, y, z, civLevel, name, npcCount, id } = settlement
  const layout = getBuildingLayout(civLevel)
  const mat = useMemo(() => makeBuildingMaterial(civLevel), [civLevel])
  const roofMat = useMemo(() => makeRoofMaterial(civLevel), [civLevel])
  const closedGates = useSettlementStore(s => s.closedGates.has(id))

  // Tier-based point light config
  const tierLight = useMemo(() => getTierLight(civLevel), [civLevel])

  // Check if player is within 100m (for NPC dots LOD)
  const playerX = usePlayerStore(s => s.x)
  const playerY = usePlayerStore(s => s.y)
  const playerZ = usePlayerStore(s => s.z)
  const pdx = playerX - x, pdy = playerY - y, pdz = playerZ - z
  const playerDist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
  const playerNear = playerDist < 100

  // Chimney position: on corner of largest building (first in layout)
  const mainBuilding = layout[0]
  const chimneyX = mainBuilding.ox + mainBuilding.w * 0.35
  const chimneyZ = mainBuilding.oz + mainBuilding.d * 0.35
  const chimneyTopY = mainBuilding.h + mainBuilding.h * 0.4 + 0.8

  // Label height: just above roof peak of tallest building
  const labelHeight = Math.max(...layout.map(b => b.h + b.h * 0.4))

  return (
    <group position={[x, y, z]}>
      {/* Building footprints + roofs */}
      {layout.map((b, i) => {
        const roofHeight = b.h * 0.4
        const roofRadius = Math.max(b.w, b.d) * 0.6
        return (
          <group key={i}>
            {/* Building body */}
            <mesh position={[b.ox, b.h / 2, b.oz]} material={mat} castShadow receiveShadow>
              <boxGeometry args={[b.w, b.h, b.d]} />
            </mesh>
            {/* Pyramid roof */}
            <mesh position={[b.ox, b.h + roofHeight / 2, b.oz]} material={roofMat} castShadow>
              <coneGeometry args={[roofRadius, roofHeight, 4]} />
            </mesh>
          </group>
        )
      })}

      {/* Chimney + smoke (civLevel >= 2) */}
      {civLevel >= 2 && (
        <>
          <mesh position={[chimneyX, mainBuilding.h + mainBuilding.h * 0.2 + 0.4, chimneyZ]} castShadow>
            <boxGeometry args={[0.3, 0.8, 0.3]} />
            <meshStandardMaterial color="#444444" roughness={0.85} metalness={0.02} />
          </mesh>
          <SmokeParticles chimneyX={chimneyX} chimneyY={chimneyTopY} chimneyZ={chimneyZ} />
        </>
      )}

      {/* Market stalls (civLevel >= 1) */}
      <MarketStalls civLevel={civLevel} />

      {/* Street paths (civLevel >= 2) */}
      <StreetPaths layout={layout} civLevel={civLevel} />

      {/* NPC activity dots (only when player is within 100m) */}
      {playerNear && npcCount > 0 && (
        <NpcActivityDots npcCount={npcCount} settlementX={0} settlementY={0.3} settlementZ={0} />
      )}

      {/* Central fire glow — emissive, drives Bloom postprocessing */}
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial
          color="#ff8c30"
          emissive="#ff6010"
          emissiveIntensity={closedGates ? 0.2 : 2.5}
          roughness={0.2}
        />
      </mesh>

      {/* Tier-appropriate ambient PointLight — color shifts T0→T5 */}
      <pointLight
        position={[0, mainBuilding.h * 0.5 + 1, 0]}
        color={tierLight.color}
        intensity={closedGates ? tierLight.intensity * 0.25 : tierLight.intensity}
        distance={tierLight.distance}
        decay={2}
      />

      {/* T5: street lights — two additional cool point lights on settlement perimeter */}
      {civLevel >= 5 && (
        <>
          <pointLight position={[8, 3, 0]}  color="#c8e8ff" intensity={3} distance={20} decay={2} />
          <pointLight position={[-8, 3, 0]} color="#c8e8ff" intensity={3} distance={20} decay={2} />
        </>
      )}

      {/* Population + name + activity label */}
      <SettlementLabel
        settlementId={id}
        name={name}
        civLevel={civLevel}
        npcCount={npcCount}
        closedGates={closedGates}
        labelHeight={labelHeight}
      />

      {/* Territory ring */}
      <TerritoryRing x={0} y={0} z={0} />

      {/* M36 Track C: Completed/in-progress buildings */}
      <SettlementBuildings settlementId={id} />
    </group>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SettlementRenderer() {
  const settlementsMap = useSettlementStore(s => s.settlements)
  const settlements = Array.from(settlementsMap.values())

  if (settlements.length === 0) return null

  return (
    <>
      {settlements.map(s => (
        <SettlementMesh key={s.id} settlement={s} />
      ))}
    </>
  )
}
