// LocalSimManager — player-local simulation grid controller.

import * as THREE from 'three'
import { CELL_FLOATS } from './Grid'
import { computeGridOrigin, worldToGrid, isInBounds, initO2Moles } from './GridCoords'
import { getMaterialProps, MAT_AIR, MAT_STONE, MAT_WOOD } from './MaterialRegistry'
import type { SimulationEngine } from './SimulationEngine'
import { terrainHeightAt, PLANET_RADIUS } from '../world/SpherePlanet'

const O2_CHEM_SLOT   = 0
const O2_QUANT_SLOT  = 0
const CHEM_OFFSET    = 7
const QUANT_OFFSET   = 15
const CELL_SIZE      = 1.0

export const FLINT_IGNITION_J = 5000

// ── Biome temperature model ───────────────────────────────────────────────────
// Based on real atmospheric science:
//   • Environmental lapse rate (ELR): -6.5°C per 1000m altitude (ICAO std atm)
//   • Latitude effect: equator ~27°C, poles ~-20°C, using sphere Y as latitude proxy
//   • Regional noise: ±10°C variation to create weather regions
//
// Fidelity tier: A (Approximate) — ELR is correct, latitude is simplified

function _hash(a: number, b: number): number {
  let h = ((a * 1664525 + b * 1013904223) ^ 0x9e3779b9) >>> 0
  h ^= h >>> 16
  h  = Math.imul(h, 0x45d9f3b) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 0xffffffff
}

/** Smooth low-frequency noise in 2D — used for regional weather variation. */
function _weatherNoise(nx: number, nz: number): number {
  const ix = Math.floor(nx), iz = Math.floor(nz)
  const fx = nx - ix, fz = nz - iz
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz)
  return (
    _hash(ix,   iz)   * (1 - ux) * (1 - uz) +
    _hash(ix+1, iz)   * ux       * (1 - uz) +
    _hash(ix,   iz+1) * (1 - ux) * uz       +
    _hash(ix+1, iz+1) * ux       * uz
  ) * 2 - 1  // [-1, 1]
}

/**
 * Compute biome ambient temperature (°C) for a world-space position.
 *
 * @param wx  World X
 * @param wy  World Y (used to derive altitude above planet surface)
 * @param wz  World Z
 * @param dir Normalized sphere direction at (wx, wy, wz)
 */
export function biomeTemperatureAt(
  wx: number, wy: number, wz: number,
  dir: THREE.Vector3,
): number {
  const heightAboveSurface = terrainHeightAt(dir)
  const surfaceY = PLANET_RADIUS + heightAboveSurface

  // Altitude above terrain surface (meters)
  const altitude = Math.max(0, wy - surfaceY)

  // ELR: -6.5°C per 1000m.  Sea-level base = 15°C
  const altitudeEffect = -0.0065 * altitude

  // Latitude proxy: dir.y = 0 at equator, ±1 at poles (simplified spherical latitude)
  // Real surface temperature ranges from ~27°C (equator) to ~-20°C (poles)
  const latitudeEffect = -35 * Math.abs(dir.y)  // -35°C range equator→pole

  // Regional weather variation: low-frequency noise ±10°C
  // Scale factor 0.003 → noise features ~330m in sphere-space
  const weatherEffect = _weatherNoise(dir.x * 0.003, dir.z * 0.003) * 10

  const temp = 15 + altitudeEffect + latitudeEffect + weatherEffect

  // Clamp to realistic range: -40°C (polar mountain) to 48°C (hot desert)
  return Math.max(-40, Math.min(48, temp))
}

export class LocalSimManager {
  private engine: SimulationEngine
  private data: Float32Array
  private sizeX: number
  private sizeY: number
  private sizeZ: number

  // Seeded PRNG for deterministic ambient fire placement
  private _rand: () => number

  constructor(engine: SimulationEngine) {
    this.engine = engine
    const g     = engine.grid
    this.data   = new Float32Array(g.buffer)
    this.sizeX  = g.sizeX
    this.sizeY  = g.sizeY
    this.sizeZ  = g.sizeZ
    this._rand  = _makeRand(99997)
  }

  initFromSpawn(spawnX: number, spawnY: number, spawnZ: number): void {
    const origin = computeGridOrigin(spawnX, spawnY, spawnZ, this.sizeX, this.sizeY, this.sizeZ, CELL_SIZE)
    this.engine.gridOrigin = origin
    this._fillFromTerrain(origin)
  }

  /**
   * Pre-place 6 burning wood clusters around the spawn area so the fire system
   * is visibly active the moment the player loads in — no player action required.
   *
   * Call this after initFromSpawn().
   */
  placeAmbientFires(
    spawnX: number, spawnY: number, spawnZ: number,
  ): Array<{ x: number; y: number; z: number }> {
    const spawnDir = new THREE.Vector3(spawnX, spawnY, spawnZ).normalize()
    const perpBase = Math.abs(spawnDir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0)
    const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()
    const dir     = new THREE.Vector3()
    const placements: Array<{ x: number; y: number; z: number }> = []
    const rand    = this._rand
    const FIRE_COUNT = 6

    for (let i = 0; i < FIRE_COUNT; i++) {
      // Place fire clusters 60–300m from spawn in random arc directions
      const angle   = rand() * Math.PI * 2
      const arcDist = (60 + rand() * 240) / PLANET_RADIUS

      const axis = tangent.clone().applyAxisAngle(spawnDir, angle)
      dir.copy(spawnDir).applyAxisAngle(axis, arcDist)

      const h = terrainHeightAt(dir)
      if (h < 2) continue  // skip ocean / near water
      const r = PLANET_RADIUS + h + 0.5  // just above surface

      const wx = dir.x * r
      const wy = dir.y * r
      const wz = dir.z * r

      // Place a 2×2 cluster of wood cells and ignite them
      const offsets = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]]
      for (const [ox, oy, oz] of offsets) {
        this.placeWood(wx + ox, wy + oy, wz + oz)
      }
      // High ignition energy so fires survive initial O2 depletion
      this.ignite(wx, wy, wz, 25_000)
      this.ignite(wx + 1, wy, wz + 1, 20_000)

      placements.push({ x: wx, y: wy, z: wz })
    }

    return placements
  }

  private _fillFromTerrain(origin: { x: number; y: number; z: number }): void {
    const { sizeX, sizeY, sizeZ, data } = this
    const dir = new THREE.Vector3()

    for (let gz = 0; gz < sizeZ; gz++) {
      for (let gx = 0; gx < sizeX; gx++) {
        const wx = origin.x + (gx + 0.5) * CELL_SIZE
        const wz = origin.z + (gz + 0.5) * CELL_SIZE

        const approxR = PLANET_RADIUS
        dir.set(wx, Math.sqrt(Math.max(0, approxR*approxR - wx*wx - wz*wz)), wz).normalize()
        const heightAboveSurface = terrainHeightAt(dir)
        const surfaceY = PLANET_RADIUS + heightAboveSurface

        for (let gy = 0; gy < sizeY; gy++) {
          const wy  = origin.y + (gy + 0.5) * CELL_SIZE
          const b   = (gx + sizeX * (gy + sizeY * gz)) * CELL_FLOATS
          const isAir = wy > surfaceY

          if (isAir) {
            // ── Biome-correct ambient temperature ─────────────────────────
            // Replace the flat 15°C with a physically-derived temperature:
            //   - Atmospheric lapse rate (-6.5°C/1000m)
            //   - Latitude cooling (sphere Y proxy)
            //   - Regional weather noise (±10°C)
            const ambientT = biomeTemperatureAt(wx, wy, wz, dir)

            data[b]     = MAT_AIR
            data[b + 1] = ambientT
            data[b + 2] = 101_325
            data[b + 3] = 1.225
            data[b + CHEM_OFFSET  + O2_CHEM_SLOT] = 8
            data[b + QUANT_OFFSET + O2_QUANT_SLOT] = initO2Moles(ambientT, 101_325, CELL_SIZE ** 3, true)
          } else {
            // Ground cells are slightly cooler than the air above them
            const groundT = biomeTemperatureAt(wx, surfaceY, wz, dir) - 2
            data[b]     = MAT_STONE
            data[b + 1] = groundT
            data[b + 2] = 101_325
            data[b + 3] = getMaterialProps(MAT_STONE).density
            data[b + QUANT_OFFSET + O2_QUANT_SLOT] = 0
          }
        }
      }
    }
  }

  placeWood(wx: number, wy: number, wz: number, materialId = MAT_WOOD): void {
    const gc = worldToGrid(wx, wy, wz, this.engine.gridOrigin, CELL_SIZE)
    if (!isInBounds(gc.gx, gc.gy, gc.gz, { sizeX: this.sizeX, sizeY: this.sizeY, sizeZ: this.sizeZ })) return
    const props = getMaterialProps(materialId)
    this.engine.sendToChem({
      type: 'place_material',
      gx: gc.gx, gy: gc.gy, gz: gc.gz,
      materialId,
      density: props.density,
    })
  }

  ignite(wx: number, wy: number, wz: number, energyJ = FLINT_IGNITION_J): void {
    const gc = worldToGrid(wx, wy, wz, this.engine.gridOrigin, CELL_SIZE)
    if (!isInBounds(gc.gx, gc.gy, gc.gz, { sizeX: this.sizeX, sizeY: this.sizeY, sizeZ: this.sizeZ })) return
    this.engine.sendToChem({ type: 'ignite', gx: gc.gx, gy: gc.gy, gz: gc.gz, energyJ })
  }

  /** Cool all cells within worldRadius metres of a world position to ≤ targetTempC.
   *  Used by rain/storm weather to suppress fires near the player. */
  suppressFire(wx: number, wy: number, wz: number, worldRadius: number, targetTempC = 20): void {
    const gc = worldToGrid(wx, wy, wz, this.engine.gridOrigin, CELL_SIZE)
    const radiusCells = Math.ceil(worldRadius / CELL_SIZE)
    this.engine.sendToChem({
      type: 'cool',
      cgx: gc.gx, cgy: gc.gy, cgz: gc.gz,
      radiusCells,
      targetTempC,
    })
  }

  /**
   * Get temperature (°C) at a world-space position from the simulation grid.
   * Falls back to biomeTemperatureAt() if the position is outside the grid bounds
   * (e.g., when the player walks to a region not yet loaded).
   */
  getTemperatureAt(wx: number, wy: number, wz: number): number {
    const gc = worldToGrid(wx, wy, wz, this.engine.gridOrigin, CELL_SIZE)
    if (!isInBounds(gc.gx, gc.gy, gc.gz, { sizeX: this.sizeX, sizeY: this.sizeY, sizeZ: this.sizeZ })) {
      // Outside grid: compute biome temperature directly
      const len = Math.sqrt(wx*wx + wy*wy + wz*wz)
      const dir = new THREE.Vector3(wx/len, wy/len, wz/len)
      return biomeTemperatureAt(wx, wy, wz, dir)
    }
    return this.data[(gc.gx + this.sizeX * (gc.gy + this.sizeY * gc.gz)) * CELL_FLOATS + 1]
  }

  getHotCells(minTempC = 200): Array<{ wx: number; wy: number; wz: number; tempC: number }> {
    const { sizeX, sizeY, sizeZ, data } = this
    const origin = this.engine.gridOrigin
    const result: Array<{ wx: number; wy: number; wz: number; tempC: number }> = []

    for (let gz = 0; gz < sizeZ; gz++) {
      for (let gy = 0; gy < sizeY; gy++) {
        for (let gx = 0; gx < sizeX; gx++) {
          const b = (gx + sizeX * (gy + sizeY * gz)) * CELL_FLOATS
          const tempC = data[b + 1]
          if (tempC >= minTempC) {
            result.push({
              wx: origin.x + (gx + 0.5) * CELL_SIZE,
              wy: origin.y + (gy + 0.5) * CELL_SIZE,
              wz: origin.z + (gz + 0.5) * CELL_SIZE,
              tempC,
            })
          }
        }
      }
    }

    result.sort((a, b) => b.tempC - a.tempC)
    return result.slice(0, 32)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}
