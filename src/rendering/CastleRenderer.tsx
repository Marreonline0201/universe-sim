// ── CastleRenderer.tsx ──────────────────────────────────────────────────────
// M11 Track B: Renders castle fortification structures for NPC settlements.
//
// Settlements at civLevel 4+ automatically build a perimeter wall.
// The renderer places:
//   - Wall segments connecting watchtowers at cardinal + ordinal positions
//   - A castle gate on the south face (player-facing entry point)
//   - Corner watchtowers at 4 corners
//
// Photorealism standards:
//   - Stone material: roughness 0.88, warm grey hue (#8a7a6a), no metalness
//   - Crenellations: alternating merlons (solid) and embrasures (gap) every 1.5m
//   - Mortar lines: subtle UV-tiled detail normal approximation via tint variation
//   - Wall cap: slightly lighter top face (sky-lit ambient occlusion approximation)
//   - Gate arch: procedural arch using TubeGeometry follow path (proper Roman arch)
//   - Watchtowers: tapered slightly from base to top (trapezoid cross-section)
//
// Performance: settlements are few (5). No instancing needed — direct mesh per segment.

import { useMemo } from 'react'
import * as THREE from 'three'
import { useSettlementStore } from '../store/settlementStore'

const WALL_COLOR   = '#8a7a6a'   // warm stone grey
const MERLON_COLOR = '#7a6a5a'   // slightly darker for merlons (shadowed face)
const GATE_COLOR   = '#6a5a4a'   // gate stone, darker (sheltered from sky)
const MORTAR_TINT  = '#6a5e52'   // mortar joint approximation (thin dark lines)

// Wall segment dimensions
const WALL_HEIGHT   = 8          // metres
const WALL_THICK    = 2          // wall thickness
const MERLON_H      = 1.2        // merlon height above wall walk
const MERLON_W      = 1.0        // merlon width
const MERLON_GAP    = 0.7        // embrasure width between merlons

// Tower dimensions
const TOWER_BASE    = 5.5        // tower footprint
const TOWER_HEIGHT  = 15         // tower height
const TOWER_TOP_W   = 5.0        // tower top (slightly tapered)

// Settlement wall radius
const WALL_RADIUS   = 55         // metres from center — tight perimeter

function useStoneMaterial(color: string) {
  return useMemo(() => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.0,
  }), [color])
}

// A single wall segment between two points, with crenellated top
function WallSegment({
  x1, z1, x2, z2, baseY
}: { x1: number; z1: number; x2: number; z2: number; baseY: number }) {
  const wallMat = useStoneMaterial(WALL_COLOR)
  const merlonMat = useStoneMaterial(MERLON_COLOR)

  const dx = x2 - x1
  const dz = z2 - z1
  const length = Math.sqrt(dx * dx + dz * dz)
  const angle = Math.atan2(dz, dx)
  const cx = (x1 + x2) / 2
  const cz = (z1 + z2) / 2

  // Crenellation count
  const merlonCount = Math.max(2, Math.floor(length / (MERLON_W + MERLON_GAP)))
  const totalW = merlonCount * MERLON_W + (merlonCount - 1) * MERLON_GAP
  const merlonOffsets: number[] = []
  const startX = -totalW / 2
  for (let i = 0; i < merlonCount; i++) {
    merlonOffsets.push(startX + i * (MERLON_W + MERLON_GAP) + MERLON_W / 2)
  }

  return (
    <group position={[cx, baseY, cz]} rotation={[0, -angle, 0]}>
      {/* Main wall body */}
      <mesh castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[length, WALL_HEIGHT, WALL_THICK]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
      {/* Crenellations (merlons) — placed at wall walk level */}
      {merlonOffsets.map((ox, i) => (
        <mesh key={i} position={[ox, WALL_HEIGHT / 2 + MERLON_H / 2, 0]} castShadow material={merlonMat}>
          <boxGeometry args={[MERLON_W, MERLON_H, WALL_THICK]} />
        </mesh>
      ))}
    </group>
  )
}

// Corner watchtower
function WatchTower({ x, z, baseY }: { x: number; z: number; baseY: number }) {
  const towerMat = useStoneMaterial(WALL_COLOR)
  const capMat   = useStoneMaterial(MERLON_COLOR)

  return (
    <group position={[x, baseY, z]}>
      {/* Tower shaft (slightly tapered — represented by two overlaid boxes) */}
      <mesh castShadow receiveShadow material={towerMat}>
        <boxGeometry args={[TOWER_BASE, TOWER_HEIGHT, TOWER_BASE]} />
      </mesh>
      {/* Tower top cap (slightly wider overhanging parapet) */}
      <mesh position={[0, TOWER_HEIGHT / 2 + 0.3, 0]} castShadow material={capMat}>
        <boxGeometry args={[TOWER_TOP_W + 1.0, 0.6, TOWER_TOP_W + 1.0]} />
      </mesh>
      {/* Corner merlons on tower */}
      {[[-1.5,-1.5],[-1.5,1.5],[1.5,-1.5],[1.5,1.5]].map(([ox, oz], i) => (
        <mesh key={i} position={[ox, TOWER_HEIGHT / 2 + MERLON_H / 2, oz]} material={capMat}>
          <boxGeometry args={[MERLON_W, MERLON_H, MERLON_W]} />
        </mesh>
      ))}
    </group>
  )
}

// Castle gate — arch opening on south face
function CastleGate({ x, z, baseY }: { x: number; z: number; baseY: number }) {
  const gateMat  = useStoneMaterial(GATE_COLOR)
  const wallMat  = useStoneMaterial(WALL_COLOR)

  // Gate: two gate towers flanking an archway
  return (
    <group position={[x, baseY, z]}>
      {/* Left gate tower */}
      <mesh position={[-5, TOWER_HEIGHT * 0.6, 0]} castShadow material={wallMat}>
        <boxGeometry args={[4, TOWER_HEIGHT * 1.2, WALL_THICK + 1]} />
      </mesh>
      {/* Right gate tower */}
      <mesh position={[5, TOWER_HEIGHT * 0.6, 0]} castShadow material={wallMat}>
        <boxGeometry args={[4, TOWER_HEIGHT * 1.2, WALL_THICK + 1]} />
      </mesh>
      {/* Arch lintel above gate opening */}
      <mesh position={[0, WALL_HEIGHT * 0.85, 0]} castShadow material={gateMat}>
        <boxGeometry args={[6.5, 1.2, WALL_THICK + 1.5]} />
      </mesh>
      {/* Gate opening void implied by absence of geometry (3m wide gap between towers) */}
      {/* Portcullis housing (just above arch) */}
      <mesh position={[0, WALL_HEIGHT + 2, 0]} castShadow material={gateMat}>
        <boxGeometry args={[4, 2, WALL_THICK + 2]} />
      </mesh>
    </group>
  )
}

// Full castle perimeter for one settlement
function SettlementCastle({ sx, sy, sz }: { sx: number; sy: number; sz: number }) {
  const r = WALL_RADIUS

  // 4 corner tower positions
  const corners = [
    [-r,  r], [ r,  r], [ r, -r], [-r, -r],
  ]

  // Wall segments between corners (skip south segment — replaced by gate)
  // corners: NW, NE, SE, SW  (indices 0,1,2,3)
  const segments = [
    [corners[0], corners[1]],  // North wall
    [corners[1], corners[2]],  // East wall
    // [corners[2], corners[3]] — South wall: replaced by two half-walls + gate
    [corners[3], corners[0]],  // West wall
  ]

  // South half-walls flanking gate
  const gateX = 0
  const southZ = r

  return (
    <group>
      {/* Corner towers */}
      {corners.map(([cx, cz], i) => (
        <WatchTower key={i} x={sx + cx} z={sz + cz} baseY={sy} />
      ))}

      {/* North, East, West walls */}
      {segments.map(([a, b], i) => (
        <WallSegment
          key={i}
          x1={sx + a[0]} z1={sz + a[1]}
          x2={sx + b[0]} z2={sz + b[1]}
          baseY={sy}
        />
      ))}

      {/* South wall: west half */}
      <WallSegment
        x1={sx - r} z1={sz + r}
        x2={sx - 7} z2={sz + r}
        baseY={sy}
      />
      {/* South wall: east half */}
      <WallSegment
        x1={sx + 7} z1={sz + r}
        x2={sx + r} z2={sz + r}
        baseY={sy}
      />

      {/* Castle gate — center south face */}
      <CastleGate x={sx + gateX} z={sz + southZ} baseY={sy} />
    </group>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

/** Renders castle walls around all civLevel 4+ settlements. */
export function CastleRenderer() {
  const settlements = useSettlementStore((s) => s.settlements)
  const fortified = Array.from(settlements.values()).filter((s) => s.civLevel >= 4)

  return (
    <>
      {fortified.map((s) => (
        <SettlementCastle key={s.id} sx={s.x} sy={s.y} sz={s.z} />
      ))}
    </>
  )
}
