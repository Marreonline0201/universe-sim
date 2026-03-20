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

export class LocalSimManager {
  private engine: SimulationEngine
  private data: Float32Array
  private sizeX: number
  private sizeY: number
  private sizeZ: number

  constructor(engine: SimulationEngine) {
    this.engine = engine
    const g     = engine.grid
    this.data   = new Float32Array(g.buffer)
    this.sizeX  = g.sizeX
    this.sizeY  = g.sizeY
    this.sizeZ  = g.sizeZ
  }

  initFromSpawn(spawnX: number, spawnY: number, spawnZ: number): void {
    const origin = computeGridOrigin(spawnX, spawnY, spawnZ, this.sizeX, this.sizeY, this.sizeZ, CELL_SIZE)
    this.engine.gridOrigin = origin
    this._fillFromTerrain(origin)
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
            data[b]     = MAT_AIR
            data[b + 1] = 15
            data[b + 2] = 101_325
            data[b + 3] = 1.225
            data[b + CHEM_OFFSET  + O2_CHEM_SLOT] = 8
            data[b + QUANT_OFFSET + O2_QUANT_SLOT] = initO2Moles(15, 101_325, CELL_SIZE ** 3, true)
          } else {
            data[b]     = MAT_STONE
            data[b + 1] = 12
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

  getTemperatureAt(wx: number, wy: number, wz: number): number {
    const gc = worldToGrid(wx, wy, wz, this.engine.gridOrigin, CELL_SIZE)
    if (!isInBounds(gc.gx, gc.gy, gc.gz, { sizeX: this.sizeX, sizeY: this.sizeY, sizeZ: this.sizeZ })) return 15
    const b = (gc.gx + this.sizeX * (gc.gy + this.sizeY * gc.gz)) * CELL_FLOATS
    return this.data[b + 1]
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
