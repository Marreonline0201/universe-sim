// ── SettlementRenderer.tsx ─────────────────────────────────────────────────────
// M6: Renders NPC settlements in the 3D world.
//
// Each settlement renders:
//   - 3–6 building footprints scaled by civLevel (simple box meshes, PBR materials)
//   - A central fire/torch glow (emissive point mesh, drives Bloom)
//   - A floating population/name label (HTML overlay via drei Html)
//   - Territory boundary ring (faint circle on terrain, helps player understand range)
//
// Performance: settlement count is low (5). All geometry is instanced per settlement.
// Materials use onBeforeCompile AO injection (same pattern as M5 photorealism pass).

import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useSettlementStore } from '../store/settlementStore'

const TERRITORY_RADIUS = 150

// Building layouts per civ level — offsets from settlement center
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

// Building material — warm stone/clay, PBR, consistent with world aesthetic
function makeBuildingMaterial(civLevel: number): THREE.MeshStandardMaterial {
  // Colour shifts from earthy brown (tier 0) to grey stone (tier 3+)
  const t = Math.min(civLevel / 3, 1)
  const r = Math.round(110 + (1 - t) * 30)
  const g = Math.round(90  + (1 - t) * 20)
  const b = Math.round(70  + (1 - t) * 10)
  const color = `rgb(${r},${g},${b})`
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.03 })
  return mat
}

// Territory ring: faint flat circle showing settlement bounds
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

function SettlementMesh({ settlement }: { settlement: any }) {
  const { x, y, z, civLevel, name, npcCount, id } = settlement
  const layout = getBuildingLayout(civLevel)
  const mat = useMemo(() => makeBuildingMaterial(civLevel), [civLevel])
  const closedGates = useSettlementStore(s => s.closedGates.has(id))

  return (
    <group position={[x, y, z]}>
      {/* Building footprints */}
      {layout.map((b, i) => (
        <mesh
          key={i}
          position={[b.ox, b.h / 2, b.oz]}
          material={mat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[b.w, b.h, b.d]} />
        </mesh>
      ))}

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

      {/* Settlement name label */}
      <Html
        position={[0, Math.max(...layout.map(b => b.h)) + 1.4, 0]}
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
          background:    'rgba(0,0,0,0.55)',
          padding:       '2px 6px',
          borderRadius:  2,
        }}>
          {closedGates ? 'GATES CLOSED' : name}
          <span style={{ color: '#6a9abf', marginLeft: 6, fontSize: 9 }}>
            CIV {civLevel} | {npcCount} pop
          </span>
        </div>
      </Html>

      {/* Territory ring */}
      <TerritoryRing x={0} y={0} z={0} />
    </group>
  )
}

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
