// ── SpherePlanet ────────────────────────────────────────────────────────────────
// Spherical planet geometry and terrain generation.
//
// Architecture:
//  • The planet is a sphere of radius PLANET_RADIUS meters, centered at (0,0,0).
//  • "Up" for any surface point = normalize(position).
//  • Terrain height is computed via 3D FBM noise — seamless across all faces.
//  • Geometry: cube-sphere mapping (6 faces, each subdivided NxN, then normalized).
//    This avoids UV seams and polar singularities that affect lat/lon spheres.
//
// How cube-sphere works:
//   Take each face of a unit cube. Subdivide into NxN grid.
//   For each vertex, normalize the cube point to the unit sphere surface.
//   Scale by (PLANET_RADIUS + terrainHeight). Done.

import * as THREE from 'three'
import { MAT } from '../player/Inventory'

let _terrainSeed = 42

export function setTerrainSeed(seed: number): void {
  _terrainSeed = seed >>> 0
}

export function getTerrainSeed(): number {
  return _terrainSeed
}

// M9: River valley carving — imported lazily to avoid circular dependency.
// RiverSystem imports terrainHeightAt indirectly via its own _terrainH copy,
// so there is no circular import here.
let _getRiverCarveDepth: ((dx: number, dy: number, dz: number) => number) | null = null
export function registerRiverCarveDepth(fn: (dx: number, dy: number, dz: number) => number): void {
  _getRiverCarveDepth = fn
}

// Planet radius in meters. 4000m gives a horizon at ~120m eye height —
// obviously a sphere but big enough for a meaningful open world (~200 km²).
export const PLANET_RADIUS = 4000

// Sea level: terrain below 0 is underwater
export const SEA_LEVEL = 0

// ── Noise functions (3D, no seams) ───────────────────────────────────────────

function hash3(ix: number, iy: number, iz: number): number {
  let h = (Math.imul(ix, 1664525) ^ Math.imul(iy, 22695477) ^ Math.imul(iz, 2891336453) ^ _terrainSeed ^ 0x9e3779b9) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x45d9f3b) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 0xffffffff
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function valueNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = smoothstep(fx), uy = smoothstep(fy), uz = smoothstep(fz)

  return lerp(
    lerp(
      lerp(hash3(ix,   iy,   iz),   hash3(ix+1, iy,   iz),   ux),
      lerp(hash3(ix,   iy+1, iz),   hash3(ix+1, iy+1, iz),   ux),
      uy
    ),
    lerp(
      lerp(hash3(ix,   iy,   iz+1), hash3(ix+1, iy,   iz+1), ux),
      lerp(hash3(ix,   iy+1, iz+1), hash3(ix+1, iy+1, iz+1), ux),
      uy
    ),
    uz
  ) * 2 - 1
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    value    += valueNoise3(x * frequency, y * frequency, z * frequency) * amplitude
    total    += amplitude
    amplitude *= 0.5
    frequency *= 2.0
  }
  return value / total  // [-1, 1]
}

// Domain-warped FBM: sample noise at position offset by another noise field.
// Produces more natural, varied terrain (avoids the "FBM looks like hills" problem).
function fbmWarped(x: number, y: number, z: number): number {
  // First warp layer: low-frequency offset
  const qx = fbm3(x,       y,       z,       4)
  const qy = fbm3(x + 5.2, y + 1.3, z + 3.7, 4)
  const qz = fbm3(x + 1.7, y + 9.2, z + 2.1, 4)

  // Sample FBM at warped position
  return fbm3(x + 1.0 * qx, y + 1.0 * qy, z + 1.0 * qz, 6)
}

// Ridged noise: inverts valleys to create sharp mountain ridges
function ridgeNoise(x: number, y: number, z: number, octaves: number): number {
  let value = 0, amplitude = 0.5, frequency = 1, total = 0
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise3(x * frequency, y * frequency, z * frequency)
    value    += (1 - Math.abs(n)) * amplitude  // ridge = 1 - |noise|
    total    += amplitude
    amplitude *= 0.5
    frequency *= 2.0
  }
  return value / total  // [0, 1]
}

// ── Terrain height ────────────────────────────────────────────────────────────

/**
 * Returns terrain height in meters (relative to PLANET_RADIUS) for a given
 * unit-sphere direction vector. Values can be negative (ocean floor).
 *
 * The noise is sampled in 3D sphere-space so the terrain wraps seamlessly
 * with no seams or polar distortion.
 */
export function terrainHeightAt(dir: THREE.Vector3): number {
  // Scale: frequency 3 → features ~600m wide (1/3 of planet radius)
  const scale = 3.0
  const nx = dir.x * scale
  const ny = dir.y * scale
  const nz = dir.z * scale

  // Base continent shape: warped FBM gives organic coastlines
  const baseH = fbmWarped(nx * 0.5, ny * 0.5, nz * 0.5)

  // Continental shelf: values above threshold become land, below = ocean
  // This creates a bimodal distribution (ocean troughs + continental plateaus)
  const continentH = Math.pow(Math.max(0, baseH + 0.1), 0.8) * 300 - 120

  // Mountain ridges: additional ridged noise layered on land
  const ridgeH = ridgeNoise(nx * 1.5 + 3.3, ny * 1.5 + 3.3, nz * 1.5 + 3.3, 5)
  const mountains = Math.pow(ridgeH, 2.5) * 200

  // Detail noise: small-scale features (10-40m)
  const detailH = fbm3(nx * 6 + 9.1, ny * 6 + 9.1, nz * 6 + 9.1, 3) * 15

  // Combine: mountains only appear on land, not under ocean
  const land = Math.max(continentH, -180)
  const hasMountains = continentH > 0 ? 1 : 0
  let h = land + mountains * hasMountains + detailH

  // M9: River valley carving — depress terrain along river corridors
  if (_getRiverCarveDepth) {
    const carve = _getRiverCarveDepth(dir.x, dir.y, dir.z)
    if (carve > 0) h -= carve
  }

  return Math.max(-180, Math.min(250, h))
}

// ── Biome colors ──────────────────────────────────────────────────────────────

// A simple lookup color for the planet mesh vertex colors.
// Real biomes based on: height, latitude (approximated by |dir.y|), and some noise.
export function biomeColor(dir: THREE.Vector3, height: number): THREE.Color {
  const lat = Math.abs(dir.y)  // 0 = equator, 1 = pole

  // Deep ocean
  if (height < -80) return new THREE.Color(0.03, 0.08, 0.28)
  // Shallow ocean / continental shelf
  if (height < 0)   return new THREE.Color(0.06 + 0.05 * (height + 80) / 80, 0.22, 0.52)
  // Beach strip
  if (height < 6)   return new THREE.Color(0.82, 0.76, 0.52)

  // Snow caps — polar regions and high peaks
  if (lat > 0.82)              return new THREE.Color(0.92, 0.96, 1.00)
  if (height > 220)            return new THREE.Color(0.92, 0.96, 1.00)
  // Rock above snowline
  if (height > 180)            return new THREE.Color(0.58, 0.54, 0.50)
  // Alpine
  if (height > 120)            return new THREE.Color(0.45, 0.42, 0.38)

  // Polar tundra
  if (lat > 0.70)              return new THREE.Color(0.56, 0.58, 0.44)

  // Desert (sub-tropical dry zones)
  if (lat > 0.25 && lat < 0.40 && height < 80) return new THREE.Color(0.80, 0.65, 0.36)

  // Tropical rainforest (equator, low elevation)
  if (lat < 0.20 && height < 60)  return new THREE.Color(0.14, 0.38, 0.10)
  // Savanna (equator, mid elevation)
  if (lat < 0.30 && height < 100) return new THREE.Color(0.55, 0.58, 0.25)

  // Temperate forest (mid latitudes)
  if (lat < 0.55) return new THREE.Color(0.22, 0.44, 0.16)
  // Taiga (high latitudes)
  return new THREE.Color(0.20, 0.35, 0.18)
}

// ── Real Earth-like Geological Layers ────────────────────────────────────────
//
// Earth radius = 6,371 km.  PLANET_RADIUS = 4000 m.
// Scale factor: 4000 / 6,371,000 ≈ 0.000628
// All radii below are from the PLANET CENTER in game meters.
//
//  Layer         Earth radius range   Game radius range   Key minerals
//  Inner Core    0 – 1,221 km         0 – 766 m           solid Fe-Ni
//  Outer Core    1,221 – 3,480 km     766 – 2,185 m       liquid Fe-Ni
//  Lower Mantle  3,480 – 5,160 km     2,185 – 3,238 m     bridgmanite (MgSiO₃)
//  Upper Mantle  5,160 – 5,954 km     3,238 – 3,737 m     olivine, pyroxene
//  Crust         5,954 – 6,371 km     3,737 – 4,000 m     granite, basalt, sediment

export interface GeologicalLayer {
  /** Human-readable name */
  name: string
  /** Primary mineralogy / composition */
  composition: string
  /** Physical state */
  state: 'solid' | 'liquid' | 'plastic'
  /** Temperature at the top of the layer (°C) */
  tempC_min: number
  /** Temperature at the bottom of the layer (°C) */
  tempC_max: number
  /** Pressure at top of layer (GPa) */
  pressureGPa_min: number
  /** Pressure at bottom of layer (GPa) */
  pressureGPa_max: number
  /** Average density (kg/m³) */
  densityKgm3: number
  /** MAT IDs that can be dug/mined from this layer */
  digMaterials: ReadonlyArray<number>
  /** Representative hex color for cross-section display */
  colorHex: string
  /** Inner boundary radius from planet center (game meters) */
  innerRadiusM: number
  /** Outer boundary radius from planet center (game meters) */
  outerRadiusM: number
}

/**
 * All geological layers ordered from centre → surface.
 * Values are Earth-accurate, radii proportionally scaled to PLANET_RADIUS = 4000 m.
 */
export const GEOLOGICAL_LAYERS: ReadonlyArray<GeologicalLayer> = [
  {
    name: 'Inner Core',
    composition: 'Solid iron-nickel alloy (Fe ~85 %, Ni ~5 %, trace Si/S)',
    state: 'solid',
    tempC_min: 5_400, tempC_max: 5_700,
    pressureGPa_min: 330, pressureGPa_max: 360,
    densityKgm3: 13_000,
    digMaterials: [MAT.IRON, MAT.IRON_ORE],
    colorHex: '#e8c060',   // glowing gold-yellow
    innerRadiusM: 0, outerRadiusM: 766,
  },
  {
    name: 'Outer Core',
    composition: 'Liquid iron-nickel alloy (Fe ~80 %, Ni ~5 %, O/S/Si traces) — drives the geodynamo',
    state: 'liquid',
    tempC_min: 4_000, tempC_max: 5_400,
    pressureGPa_min: 135, pressureGPa_max: 330,
    densityKgm3: 11_000,
    digMaterials: [MAT.IRON_ORE, MAT.IRON],
    colorHex: '#d95f02',   // molten orange-red
    innerRadiusM: 766, outerRadiusM: 2_185,
  },
  {
    name: 'Lower Mantle',
    composition: 'Bridgmanite (MgSiO₃ perovskite), ferropericlase, post-perovskite near CMB',
    state: 'solid',
    tempC_min: 2_000, tempC_max: 4_000,
    pressureGPa_min: 24, pressureGPa_max: 135,
    densityKgm3: 5_000,
    digMaterials: [MAT.STONE, MAT.IRON_ORE, MAT.SILICON],
    colorHex: '#8b4513',   // dark rust-brown
    innerRadiusM: 2_185, outerRadiusM: 3_238,
  },
  {
    name: 'Upper Mantle',
    composition: 'Olivine (Mg,Fe)₂SiO₄, orthopyroxene, clinopyroxene, garnet — bulk peridotite',
    state: 'plastic',
    tempC_min: 500, tempC_max: 2_000,
    pressureGPa_min: 1.5, pressureGPa_max: 24,
    densityKgm3: 3_300,
    digMaterials: [MAT.STONE, MAT.IRON_ORE],
    colorHex: '#6b7a3a',   // olive-green (olivine)
    innerRadiusM: 3_238, outerRadiusM: 3_737,
  },
  {
    name: 'Crust',
    composition: 'Oceanic: basalt/gabbro (dense, thin 5–10 km);  Continental: granite/granodiorite + sedimentary cover (light, 30–70 km)',
    state: 'solid',
    tempC_min: 0, tempC_max: 500,
    pressureGPa_min: 0, pressureGPa_max: 1.5,
    densityKgm3: 2_800,
    digMaterials: [MAT.STONE, MAT.CLAY, MAT.SAND, MAT.FLINT, MAT.IRON_ORE, MAT.COAL],
    colorHex: '#a49a8a',   // grey-brown rock
    innerRadiusM: 3_737, outerRadiusM: 4_000,
  },
]

/**
 * Returns the geological layer for a given radius from the planet centre (game metres).
 * Example: getLayerAtRadius(PLANET_RADIUS - 50) → Crust layer (50 m below surface).
 */
export function getLayerAtRadius(radiusFromCenter: number): GeologicalLayer {
  for (const layer of GEOLOGICAL_LAYERS) {
    if (radiusFromCenter >= layer.innerRadiusM && radiusFromCenter < layer.outerRadiusM) {
      return layer
    }
  }
  return GEOLOGICAL_LAYERS[GEOLOGICAL_LAYERS.length - 1]  // default: crust
}

/**
 * Returns the geological layer at a given depth below the terrain surface (metres).
 * depth = 0 → crust surface;  depth = 300 → deeper crust / upper mantle boundary.
 */
export function getLayerAtDepth(depthBelowSurface: number): GeologicalLayer {
  return getLayerAtRadius(PLANET_RADIUS - Math.max(0, depthBelowSurface))
}

/**
 * Returns biome-appropriate surface dig materials based on terrain type.
 * Reflects what you'd find in the top ~2 m: topsoil in forests, sand on beaches,
 * rock on mountain peaks — geologically accurate for surficial deposits.
 */
export function getSurfaceDigMaterials(dir: THREE.Vector3, height: number): ReadonlyArray<number> {
  const lat = Math.abs(dir.y)

  if (height < -80)                                    return [MAT.STONE, MAT.CLAY]            // deep-ocean sediment
  if (height < 0)                                      return [MAT.CLAY, MAT.SAND]             // shallow ocean floor
  if (height < 6)                                      return [MAT.SAND, MAT.CLAY]             // beach / tidal flat
  if (height > 180 || lat > 0.82)                      return [MAT.STONE, MAT.FLINT]           // bare rock / polar bedrock
  if (height > 100)                                    return [MAT.STONE, MAT.FLINT, MAT.IRON_ORE]  // highland / mountain
  if (lat > 0.25 && lat < 0.40 && height < 80)        return [MAT.SAND, MAT.CLAY]             // desert dunes
  if (lat < 0.20 && height < 60)                       return [MAT.CLAY, MAT.STONE]            // tropical forest floor
  return [MAT.CLAY, MAT.STONE]                                                                  // temperate soil
}

// ── Cube-sphere geometry ──────────────────────────────────────────────────────

// The 6 cube face local axes: [faceNormal, rightAxis, upAxis]
// face normal + right * s + up * t gives cube-face points in range [-2, 2]
const CUBE_FACES: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [
  [new THREE.Vector3( 1,  0,  0), new THREE.Vector3( 0,  0,  1), new THREE.Vector3( 0,  1,  0)],
  [new THREE.Vector3(-1,  0,  0), new THREE.Vector3( 0,  0, -1), new THREE.Vector3( 0,  1,  0)],
  [new THREE.Vector3( 0,  1,  0), new THREE.Vector3( 1,  0,  0), new THREE.Vector3( 0,  0,  1)],
  [new THREE.Vector3( 0, -1,  0), new THREE.Vector3( 1,  0,  0), new THREE.Vector3( 0,  0, -1)],
  [new THREE.Vector3( 0,  0,  1), new THREE.Vector3(-1,  0,  0), new THREE.Vector3( 0,  1,  0)],
  [new THREE.Vector3( 0,  0, -1), new THREE.Vector3( 1,  0,  0), new THREE.Vector3( 0,  1,  0)],
]

/**
 * Generate the full planet sphere geometry.
 * Uses cube-sphere mapping: 6 cube faces, each subdivided into `segs × segs` quads,
 * then projected onto the unit sphere and scaled by PLANET_RADIUS + terrain height.
 *
 * `segs=64` → ~25k triangles → 60fps on any modern GPU.
 * `segs=128` → ~100k triangles → still fine, more terrain detail.
 */
export function generatePlanetGeometry(segs: number = 64): THREE.BufferGeometry {
  const vertsPerFace = (segs + 1) * (segs + 1)
  const trisPerFace  = segs * segs * 2
  const totalVerts   = 6 * vertsPerFace
  const totalTris    = 6 * trisPerFace

  const positions = new Float32Array(totalVerts * 3)
  const normals   = new Float32Array(totalVerts * 3)
  const colors    = new Float32Array(totalVerts * 3)
  const indices   = new Uint32Array(totalTris * 3)

  let vIdx = 0
  let iIdx = 0
  const dir = new THREE.Vector3()

  for (let f = 0; f < 6; f++) {
    const [faceNorm, right, up] = CUBE_FACES[f]
    const vBase = f * vertsPerFace

    // Write vertices
    for (let row = 0; row <= segs; row++) {
      for (let col = 0; col <= segs; col++) {
        // Map [0, segs] → [-1, 1]
        const s = (col / segs) * 2 - 1
        const t = (row / segs) * 2 - 1

        // Point on cube face
        dir.set(
          faceNorm.x + right.x * s + up.x * t,
          faceNorm.y + right.y * s + up.y * t,
          faceNorm.z + right.z * s + up.z * t,
        ).normalize()  // project to unit sphere

        const h     = terrainHeightAt(dir)
        const r     = PLANET_RADIUS + h
        const c     = biomeColor(dir, h)

        positions[vIdx * 3]     = dir.x * r
        positions[vIdx * 3 + 1] = dir.y * r
        positions[vIdx * 3 + 2] = dir.z * r

        // Normal = sphere normal (sufficient for Lambertian; could add slope for bumpmapping)
        normals[vIdx * 3]     = dir.x
        normals[vIdx * 3 + 1] = dir.y
        normals[vIdx * 3 + 2] = dir.z

        colors[vIdx * 3]     = c.r
        colors[vIdx * 3 + 1] = c.g
        colors[vIdx * 3 + 2] = c.b

        vIdx++
      }
    }

    // Write quad indices
    for (let row = 0; row < segs; row++) {
      for (let col = 0; col < segs; col++) {
        const tl = vBase + row * (segs + 1) + col
        const tr = tl + 1
        const bl = tl + (segs + 1)
        const br = bl + 1

        indices[iIdx++] = tl; indices[iIdx++] = bl; indices[iIdx++] = tr
        indices[iIdx++] = tr; indices[iIdx++] = bl; indices[iIdx++] = br
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals,   3))
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  return geo
}

// ── Ocean geometry ────────────────────────────────────────────────────────────

/**
 * Generates a smooth sphere at exactly PLANET_RADIUS for the ocean surface.
 * Rendered as a semi-transparent blue plane over ocean terrain.
 */
export function generateOceanGeometry(segs: number = 48): THREE.BufferGeometry {
  return new THREE.SphereGeometry(PLANET_RADIUS + 1, segs, segs)
}

// ── Utility: surface position ─────────────────────────────────────────────────

// Reusable direction vector for surfaceRadiusAt — avoids per-call allocation
const _srDir = new THREE.Vector3()

/**
 * Given a world-space player position, return the radius of the terrain surface
 * directly below (i.e., in the same radial direction). This is used for ground
 * detection: if dist(playerPos, origin) < surfaceRadiusAt(playerPos), player is underground.
 * NOTE: not re-entrant — do not call from within terrainHeightAt or biomeColor.
 */
export function surfaceRadiusAt(px: number, py: number, pz: number): number {
  const len = Math.sqrt(px * px + py * py + pz * pz)
  if (len < 1) return PLANET_RADIUS
  _srDir.set(px / len, py / len, pz / len)
  const h = terrainHeightAt(_srDir)
  return PLANET_RADIUS + Math.max(h, SEA_LEVEL)  // can't go below sea level from above
}

/**
 * Returns the spawn position on the planet surface.
 *
 * Prefers non-polar, non-tundra land so the player spawns in a temperate or
 * tropical biome rather than an all-snow polar cap.  biomeColor() assigns snow
 * when |dir.y| > 0.82 and tundra when |dir.y| > 0.70, so we cap at 0.65.
 *
 * Two-pass scan:
 *   Pass 1 — find land (h ≥ 10) with |dir.y| < 0.65  (temperate / tropical)
 *   Pass 2 — find any land if pass 1 produced nothing  (polar fallback)
 */
export function getSpawnPosition(): [number, number, number] {
  const v  = new THREE.Vector3()
  const v2 = new THREE.Vector3()

  // Scan the full sphere at 5° resolution (36×72 = 2592 points).
  // Score each land point to pick the BEST spawn, not the first one found.
  //
  // Biome rules that produce snow/rock:
  //   snow: |dir.y| > 0.82  OR  height > 220
  //   rock: height > 180
  //   alpine: height > 120
  //
  // Target: |dir.y| < 0.68 (temperate/tropical latitude) AND 25 ≤ h ≤ 120
  // This lands the player in temperate forest, savanna, or desert — never snow.
  // Flatness bonus: prefer areas where all 4 grid-neighbours are also inland —
  // this prevents spawning on cliff edges or narrow ridgelines.
  const LAT_STEPS = 36
  const LON_STEPS = 72

  let bestScore = -Infinity
  let bestDir: [number, number, number] = [0, 1, 0]
  let bestH = 10

  for (let la = 0; la <= LAT_STEPS; la++) {
    const lat    = (la / LAT_STEPS) * Math.PI
    const sinLat = Math.sin(lat)
    const cosLat = Math.cos(lat)
    for (let lo = 0; lo < LON_STEPS; lo++) {
      const lon = (lo / LON_STEPS) * Math.PI * 2
      v.set(sinLat * Math.cos(lon), cosLat, sinLat * Math.sin(lon)).normalize()
      const h = terrainHeightAt(v)
      if (h < 10) continue  // ocean/sea — skip

      const absY = Math.abs(v.y)

      // Heavy penalty for polar latitudes (|v.y| > 0.68 → tundra/snow)
      const polarPenalty = absY > 0.68 ? (absY - 0.68) * 12.0 : 0

      // Heavy penalty for high altitude (h > 120 → alpine/rock/snow)
      const altPenalty = h > 120 ? (h - 120) * 0.15 : 0

      // Bonus for being clearly inland (h in 30–100 is the sweet spot)
      const inlandBonus = h >= 30 && h <= 100 ? 3.0 : (h >= 10 ? 1.0 : 0)

      // Flatness bonus: sample 4 grid neighbours and check height range.
      // Cliff edges (any neighbour < 5m or steep range > 50m) score 0.
      // Flat meadows (range < 15m, all neighbours inland) score +3.
      let minNH = h, maxNH = h
      let neighborEdge = false
      for (let d = 0; d < 4; d++) {
        const la2 = la + (d === 0 ? -1 : d === 1 ? 1 : 0)
        const lo2 = (lo + (d === 2 ? -1 : d === 3 ? 1 : 0) + LON_STEPS) % LON_STEPS
        if (la2 < 0 || la2 > LAT_STEPS) continue
        const lat2 = (la2 / LAT_STEPS) * Math.PI
        const lon2 = (lo2 / LON_STEPS) * Math.PI * 2
        v2.set(
          Math.sin(lat2) * Math.cos(lon2),
          Math.cos(lat2),
          Math.sin(lat2) * Math.sin(lon2),
        )
        const nh = terrainHeightAt(v2)
        if (nh < 5) { neighborEdge = true; break }
        if (nh < minNH) minNH = nh
        if (nh > maxNH) maxNH = nh
      }
      if (neighborEdge) continue  // cliff edge — skip entirely

      const slopeRange    = maxNH - minNH
      const flatnessBonus = slopeRange < 15 ? 3.0 : slopeRange < 40 ? 1.0 : 0

      const score = inlandBonus + flatnessBonus - polarPenalty - altPenalty
      if (score > bestScore) {
        bestScore = score
        bestDir   = [v.x, v.y, v.z]
        bestH     = h
      }
    }
  }

  const [bx, by, bz] = bestDir
  v.set(bx, by, bz).normalize()
  const r = PLANET_RADIUS + Math.max(bestH, SEA_LEVEL) + 1.0
  return [v.x * r, v.y * r, v.z * r]
}
