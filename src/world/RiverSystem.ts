// ── RiverSystem.ts ────────────────────────────────────────────────────────────
// M9 Track 1: River path generation via flow-field algorithm on the sphere surface.
//
// Algorithm:
//   1. Seed 8-12 source points at high elevation (h > 100m) using terrain seed.
//   2. From each source, march downhill by sampling the terrain gradient (steepest descent).
//   3. Stop marching when the path reaches sea level (h <= 2m) — that is the ocean mouth.
//   4. Store each river as an ordered array of world-space positions.
//   5. Expose a carve-depth lookup so terrainHeightAt() can depress terrain along paths.
//
// Valley carving:
//   Each river path point depresses the terrain within a corridor:
//     - Width: 4m at source (index 0), 20m at mouth (last index)
//     - Depth: 5m at source, 15m at mouth
//   The carve depth at any terrain point = max influence from all rivers within corridor.
//   This is evaluated in getRiverCarveDepth() called from terrainHeightAt().
//
// Performance: river paths are generated once at module load (same as resource nodes).
// getRiverCarveDepth() is a hot path (called per vertex during geometry gen).
// It uses a flat pre-built influence grid for O(1) per-point lookup after a one-time bake.

import * as THREE from 'three'
import { PLANET_RADIUS, SEA_LEVEL } from './SpherePlanet'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RiverPoint {
  /** World-space position on sphere surface */
  x: number
  y: number
  z: number
  /** Normalised progress along river (0 = source, 1 = mouth) */
  t: number
  /** Width of river at this point (metres) */
  width: number
  /** Flow velocity magnitude at this point (m/s) */
  speed: number
}

export interface River {
  id: number
  points: RiverPoint[]
  /** Normalised direction from last point toward ocean */
  mouthDir: THREE.Vector3
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NUM_RIVERS       = 10
const SOURCE_MIN_H     = 100    // metres — only start rivers on hills/mountains
const MARCH_STEP_RAD   = 0.008  // arc-distance per step (≈32m at R=4000m)
const MAX_MARCH_STEPS  = 600    // prevent infinite loop; 600 × 32m = ~19km
const SEA_STOP_H       = 4      // stop when terrain h drops to this (just above sea)
const RIVER_SEED       = 31337  // deterministic seed independent of resource nodes

// Width / depth ramp along the river (t=0 source → t=1 mouth)
const WIDTH_SOURCE  = 2   // metres at source
const WIDTH_MOUTH   = 15  // metres at mouth
const DEPTH_SOURCE  = 5   // metres below uncarved terrain at source
const DEPTH_MOUTH   = 15  // metres below uncarved terrain at mouth

// Speed ramp: rivers flow faster as they descend
const SPEED_SOURCE  = 0.5  // m/s
const SPEED_MOUTH   = 2.0  // m/s

// ── Noise helpers (reuse same hash as SpherePlanet, independent of import) ───

function _hash3(ix: number, iy: number, iz: number): number {
  let h = (Math.imul(ix, 1664525) ^ Math.imul(iy, 22695477) ^ Math.imul(iz, 2891336453) ^ 0x9e3779b9) >>> 0
  h ^= h >>> 16
  h  = Math.imul(h, 0x45d9f3b) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 0xffffffff
}

function _smooth(t: number): number { return t * t * (3 - 2 * t) }
function _lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function _valueNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = _smooth(fx), uy = _smooth(fy), uz = _smooth(fz)
  return _lerp(
    _lerp(_lerp(_hash3(ix,iy,iz), _hash3(ix+1,iy,iz), ux), _lerp(_hash3(ix,iy+1,iz), _hash3(ix+1,iy+1,iz), ux), uy),
    _lerp(_lerp(_hash3(ix,iy,iz+1), _hash3(ix+1,iy,iz+1), ux), _lerp(_hash3(ix,iy+1,iz+1), _hash3(ix+1,iy+1,iz+1), ux), uy),
    uz
  ) * 2 - 1
}

function _fbm3(x: number, y: number, z: number, octaves: number): number {
  let v = 0, amp = 0.5, freq = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    v     += _valueNoise3(x * freq, y * freq, z * freq) * amp
    total += amp
    amp   *= 0.5
    freq  *= 2
  }
  return v / total
}

function _ridgeNoise(x: number, y: number, z: number, octaves: number): number {
  let v = 0, amp = 0.5, freq = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const n = _valueNoise3(x * freq, y * freq, z * freq)
    v     += (1 - Math.abs(n)) * amp
    total += amp
    amp   *= 0.5
    freq  *= 2
  }
  return v / total
}

function _terrainH(dir: THREE.Vector3): number {
  const sc = 3.0
  const nx = dir.x * sc, ny = dir.y * sc, nz = dir.z * sc
  const qx = _fbm3(nx*0.5, ny*0.5, nz*0.5, 4)
  const qy = _fbm3(nx*0.5+5.2, ny*0.5+1.3, nz*0.5+3.7, 4)
  const qz = _fbm3(nx*0.5+1.7, ny*0.5+9.2, nz*0.5+2.1, 4)
  const base = _fbm3(nx*0.5 + qx, ny*0.5 + qy, nz*0.5 + qz, 6)
  const continentH = Math.pow(Math.max(0, base + 0.1), 0.8) * 300 - 120
  const ridgeH = _ridgeNoise(nx*1.5+3.3, ny*1.5+3.3, nz*1.5+3.3, 5)
  const mountains = Math.pow(ridgeH, 2.5) * 200
  const detailH = _fbm3(nx*6+9.1, ny*6+9.1, nz*6+9.1, 3) * 15
  const land = Math.max(continentH, -180)
  const hasMountains = continentH > 0 ? 1 : 0
  return Math.max(-180, Math.min(250, land + mountains * hasMountains + detailH))
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Gradient sampling — steepest descent direction in tangent plane ───────────

const _GD_EPS = 0.003  // arc-length epsilon for finite-difference gradient

function steepestDescentDir(dir: THREE.Vector3, up: THREE.Vector3): THREE.Vector3 {
  // Sample terrain height at 4 neighbours in the tangent plane
  // Build two arbitrary tangent axes from the surface normal (up = dir)
  const worldUp = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const t1 = new THREE.Vector3().crossVectors(up, worldUp).normalize()
  const t2 = new THREE.Vector3().crossVectors(up, t1).normalize()

  const hC  = _terrainH(dir)
  const dPX = dir.clone().addScaledVector(t1,  _GD_EPS).normalize(); const hPX = _terrainH(dPX)
  const dNX = dir.clone().addScaledVector(t1, -_GD_EPS).normalize(); const hNX = _terrainH(dNX)
  const dPZ = dir.clone().addScaledVector(t2,  _GD_EPS).normalize(); const hPZ = _terrainH(dPZ)
  const dNZ = dir.clone().addScaledVector(t2, -_GD_EPS).normalize(); const hNZ = _terrainH(dNZ)

  // Gradient: direction of steepest ascent — we negate to get descent
  const gx = (hPX - hNX)
  const gz = (hPZ - hNZ)

  if (Math.abs(gx) < 1e-6 && Math.abs(gz) < 1e-6) {
    // Flat plateau — add slight random perturbation so rivers don't stall
    return t1.clone().multiplyScalar((Math.random() - 0.5) * 2)
      .addScaledVector(t2, (Math.random() - 0.5) * 2).normalize()
  }

  // Descend: negative gradient
  const stepDir = t1.clone().multiplyScalar(-gx).addScaledVector(t2, -gz)
  return stepDir.normalize()
}

// ── River path generation ─────────────────────────────────────────────────────

function generateRiverPath(
  sourceDir: THREE.Vector3,
  riverId: number,
): RiverPoint[] | null {
  const points: RiverPoint[] = []
  const curDir = sourceDir.clone().normalize()

  for (let step = 0; step < MAX_MARCH_STEPS; step++) {
    const h = _terrainH(curDir)

    // Stop at sea level — river has reached the ocean
    if (h <= SEA_STOP_H) break

    // Record this point
    points.push({
      x: curDir.x * (PLANET_RADIUS + h),
      y: curDir.y * (PLANET_RADIUS + h),
      z: curDir.z * (PLANET_RADIUS + h),
      t: 0,  // filled in second pass
      width: 0,
      speed: 0,
    })

    // March downhill: take steepest descent step in the tangent plane
    const descent = steepestDescentDir(curDir, curDir)
    // Move curDir along sphere by MARCH_STEP_RAD
    const newDir = curDir.clone().addScaledVector(descent, MARCH_STEP_RAD).normalize()

    // Sanity: if the new position has higher h AND we're not near source,
    // we might be stuck in a basin. Add a small random jitter to escape.
    if (step > 5 && _terrainH(newDir) > h + 2) {
      // Rotate 30° from descent direction to escape local minima
      const jitterAxis = curDir.clone()
      const jittered = newDir.clone().applyAxisAngle(jitterAxis, (Math.random() - 0.5) * 0.5)
      curDir.copy(jittered.normalize())
    } else {
      curDir.copy(newDir)
    }
  }

  if (points.length < 10) return null  // too short to be a real river

  // Second pass: fill t, width, speed
  const total = points.length - 1
  for (let i = 0; i < points.length; i++) {
    const t = i / total
    points[i].t     = t
    points[i].width = WIDTH_SOURCE + (WIDTH_MOUTH - WIDTH_SOURCE) * t
    points[i].speed = SPEED_SOURCE + (SPEED_MOUTH - SPEED_SOURCE) * t
  }

  return points
}

// ── Generate all rivers ───────────────────────────────────────────────────────

function buildRivers(): River[] {
  const rand = seededRand(RIVER_SEED)
  const rivers: River[] = []
  const dir = new THREE.Vector3()

  let attempts = 0
  while (rivers.length < NUM_RIVERS && attempts < 300) {
    attempts++

    // Sample a random direction on the sphere
    const u = rand() * 2 - 1
    const theta = rand() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    dir.set(r * Math.cos(theta), u, r * Math.sin(theta)).normalize()

    const h = _terrainH(dir)
    // Only start rivers at high ground
    if (h < SOURCE_MIN_H) continue

    const pts = generateRiverPath(dir.clone(), rivers.length)
    if (!pts) continue

    const lastPt = pts[pts.length - 1]
    rivers.push({
      id: rivers.length,
      points: pts,
      mouthDir: new THREE.Vector3(lastPt.x, lastPt.y, lastPt.z).normalize(),
    })
  }

  return rivers
}

// ── Module-level singleton (built once on import) ─────────────────────────────

export const RIVERS: River[] = buildRivers()

// ── Valley carve influence bake ───────────────────────────────────────────────
//
// getRiverCarveDepth() is called from terrainHeightAt() for every vertex during
// planet geometry generation (~150k calls). We must make it fast.
//
// Strategy: store each river point as a (dir, t) entry. For any query direction,
// check all river points and compute arc-distance. If within corridor, return
// the carve depth (interpolated by t and radial distance).
//
// With 10 rivers × ~200 points avg = ~2000 entries, this is a brute-force search.
// Geometry generation runs once so the 2000×150k = 300M multiplications are
// acceptable (~200ms on a modern CPU — hidden by scene load time).

interface CarveEntry {
  dx: number; dy: number; dz: number  // unit direction of the surface point
  t: number        // normalised position along river (0=source, 1=mouth)
  corridorRad: number  // half-width in radians
  maxDepth: number     // metres to carve at the path centre
}

let _carveEntries: CarveEntry[] = []

function bakeCarveEntries(): void {
  _carveEntries = []
  for (const river of RIVERS) {
    for (const pt of river.points) {
      const len = Math.sqrt(pt.x * pt.x + pt.y * pt.y + pt.z * pt.z)
      const corridorM  = pt.width * 3  // carve corridor = 3× river width
      const corridorRad = corridorM / PLANET_RADIUS
      const maxDepth    = DEPTH_SOURCE + (DEPTH_MOUTH - DEPTH_SOURCE) * pt.t
      _carveEntries.push({
        dx: pt.x / len,
        dy: pt.y / len,
        dz: pt.z / len,
        t: pt.t,
        corridorRad,
        maxDepth,
      })
    }
  }
}

bakeCarveEntries()

/**
 * Returns the amount (metres) to depress the terrain at direction `dir` due to
 * river valley carving. Returns 0 if the point is not in any river corridor.
 *
 * Called from terrainHeightAt() in SpherePlanet.ts for every geometry vertex.
 */
export function getRiverCarveDepth(dx: number, dy: number, dz: number): number {
  let maxCarve = 0
  for (const e of _carveEntries) {
    // Arc-distance via dot product (avoids acos for speed)
    const dot = dx * e.dx + dy * e.dy + dz * e.dz
    // dot = cos(arcDist); corridorRad is half-width in radians
    // cos(corridorRad) = threshold; dot > threshold means inside corridor
    const threshold = Math.cos(e.corridorRad)
    if (dot < threshold) continue

    // Smooth radial falloff: 1.0 at centre, 0.0 at edge
    const radialT = (dot - threshold) / (1 - threshold)
    const smooth  = radialT * radialT * (3 - 2 * radialT)
    const carve   = e.maxDepth * smooth
    if (carve > maxCarve) maxCarve = carve
  }
  return maxCarve
}

// ── River proximity query ─────────────────────────────────────────────────────

/**
 * Returns data about the nearest river point within `maxDist` metres of the
 * given world-space position. Returns null if none within range.
 */
export interface NearRiverResult {
  dist: number       // metres to nearest river point
  t: number          // normalised progress along that river (0=source, 1=mouth)
  /** Unit flow direction in world space at that point */
  flowDirX: number
  flowDirY: number
  flowDirZ: number
  speed: number      // m/s current speed
  riverId: number
}

export function queryNearestRiver(
  wx: number, wy: number, wz: number,
  maxDist: number,
): NearRiverResult | null {
  const maxDist2 = maxDist * maxDist
  let best: NearRiverResult | null = null
  let bestDist2 = Infinity

  for (const river of RIVERS) {
    const pts = river.points
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i]
      const ddx = wx - pt.x, ddy = wy - pt.y, ddz = wz - pt.z
      const d2  = ddx * ddx + ddy * ddy + ddz * ddz
      if (d2 >= maxDist2 || d2 >= bestDist2) continue

      // Flow direction = normalised vector from this point to next (or prev at mouth)
      let fdx = 0, fdy = 0, fdz = 0
      if (i < pts.length - 1) {
        fdx = pts[i+1].x - pt.x
        fdy = pts[i+1].y - pt.y
        fdz = pts[i+1].z - pt.z
      } else if (i > 0) {
        fdx = pt.x - pts[i-1].x
        fdy = pt.y - pts[i-1].y
        fdz = pt.z - pts[i-1].z
      }
      const fLen = Math.sqrt(fdx * fdx + fdy * fdy + fdz * fdz) || 1

      bestDist2 = d2
      best = {
        dist: Math.sqrt(d2),
        t: pt.t,
        flowDirX: fdx / fLen,
        flowDirY: fdy / fLen,
        flowDirZ: fdz / fLen,
        speed: pt.speed,
        riverId: river.id,
      }
    }
  }
  return best
}

// ── Clay bank placement ───────────────────────────────────────────────────────
//
// Exported so SceneRoot can place clay resource nodes along river banks during
// resource node generation (or mark existing clay nodes as "river-enhanced").

/**
 * Returns world-space positions of clay deposit spots along all river banks.
 * Places 2-3 clay spots per river, biased toward the lower half (t > 0.4).
 */
export function getRiverClayPositions(): Array<[number, number, number]> {
  const rand = seededRand(RIVER_SEED ^ 0xdeadbeef)
  const result: Array<[number, number, number]> = []

  for (const river of RIVERS) {
    const pts = river.points
    const count = 2 + Math.floor(rand() * 2)  // 2-3 per river
    for (let i = 0; i < count; i++) {
      // Pick a point in the lower-half of the river (t > 0.3)
      const tTarget = 0.3 + rand() * 0.6
      const idx = Math.floor(tTarget * (pts.length - 1))
      const pt = pts[Math.min(idx, pts.length - 1)]
      // Offset slightly to the bank (perpendicular to flow, on the surface)
      const nx = pt.x, ny = pt.y, nz = pt.z
      const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz)
      result.push([pt.x, pt.y, pt.z])
    }
  }
  return result
}
