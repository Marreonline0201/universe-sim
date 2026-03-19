import { SIMULATION } from './constants'

/**
 * Layout of one grid cell in the flat typed-array buffer.
 * Total: 1 + 1 + 1 + 1 + 3 + 8 + 8 + 1 + 1 = 25 floats = 100 bytes
 * Plus 1 Uint16 (material) at byte offset 0 → we align on Float32 boundaries.
 *
 * We store everything as Float32 for simplicity, with material as a packed
 * value in the first float (cast to Uint16 when read).
 *
 * Cell layout (Float32 indices):
 *   [0]   material  (Uint16 cast — material type ID)
 *   [1]   temperature (°C)
 *   [2]   pressure    (Pa)
 *   [3]   density     (kg/m³)
 *   [4-6] velocity[3] (m/s, XYZ)
 *   [7-14] chemicals[8] (chemical type IDs, as floats)
 *   [15-22] quantities[8] (moles of each chemical)
 *   [23]  energy (J)
 *   [24]  light  (0-255 luminosity)
 */
export const CELL_FLOATS = 25
export const CELL_BYTES  = CELL_FLOATS * 4  // 100 bytes

export interface GridCell {
  material:    number      // material type ID
  temperature: number      // °C
  pressure:    number      // Pa
  density:     number      // kg/m³
  velocity:    [number, number, number] // m/s
  chemicals:   number[]    // up to 8 chemical IDs
  quantities:  number[]    // moles per chemical
  energy:      number      // J
  light:       number      // 0-255
}

export class Grid3D {
  readonly sizeX: number
  readonly sizeY: number
  readonly sizeZ: number
  readonly totalCells: number
  readonly buffer: SharedArrayBuffer
  private readonly data: Float32Array

  constructor(sizeX: number, sizeY: number, sizeZ: number) {
    this.sizeX = sizeX
    this.sizeY = sizeY
    this.sizeZ = sizeZ
    this.totalCells = sizeX * sizeY * sizeZ
    this.buffer = new SharedArrayBuffer(this.totalCells * CELL_BYTES)
    this.data = new Float32Array(this.buffer)
    this._initDefaults()
  }

  private _initDefaults(): void {
    // Set sensible defaults for all cells
    for (let i = 0; i < this.totalCells; i++) {
      const base = i * CELL_FLOATS
      this.data[base + 1] = 15    // 15°C default temperature
      this.data[base + 2] = 101325 // 1 atm pressure
      this.data[base + 3] = 1.225  // air density kg/m³
    }
  }

  private _idx(x: number, y: number, z: number): number {
    return (x + this.sizeX * (y + this.sizeY * z)) * CELL_FLOATS
  }

  /** Clamp coordinates to grid bounds */
  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.sizeX && y >= 0 && y < this.sizeY && z >= 0 && z < this.sizeZ
  }

  /** Read a cell into a GridCell object (allocates — use for debugging/UI only) */
  readCell(x: number, y: number, z: number): GridCell {
    const b = this._idx(x, y, z)
    const d = this.data
    return {
      material:    d[b] >>> 0,
      temperature: d[b + 1],
      pressure:    d[b + 2],
      density:     d[b + 3],
      velocity:    [d[b + 4], d[b + 5], d[b + 6]],
      chemicals:   Array.from(d.subarray(b + 7, b + 15)),
      quantities:  Array.from(d.subarray(b + 15, b + 23)),
      energy:      d[b + 23],
      light:       d[b + 24],
    }
  }

  /** Fast direct float access — use in hot paths */
  getTemperature(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 1] }
  setTemperature(x: number, y: number, z: number, t: number): void { this.data[this._idx(x,y,z) + 1] = t }

  getPressure(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 2] }
  setPressure(x: number, y: number, z: number, p: number): void { this.data[this._idx(x,y,z) + 2] = p }

  getDensity(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 3] }
  setDensity(x: number, y: number, z: number, d: number): void { this.data[this._idx(x,y,z) + 3] = d }

  getMaterial(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z)] >>> 0 }
  setMaterial(x: number, y: number, z: number, m: number): void { this.data[this._idx(x,y,z)] = m }

  getVelocityX(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 4] }
  getVelocityY(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 5] }
  getVelocityZ(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 6] }
  setVelocity(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const b = this._idx(x, y, z)
    this.data[b + 4] = vx
    this.data[b + 5] = vy
    this.data[b + 6] = vz
  }

  getChemical(x: number, y: number, z: number, slot: number): number { return this.data[this._idx(x,y,z) + 7 + slot] }
  setChemical(x: number, y: number, z: number, slot: number, id: number): void { this.data[this._idx(x,y,z) + 7 + slot] = id }

  getQuantity(x: number, y: number, z: number, slot: number): number { return this.data[this._idx(x,y,z) + 15 + slot] }
  setQuantity(x: number, y: number, z: number, slot: number, q: number): void { this.data[this._idx(x,y,z) + 15 + slot] = q }

  getEnergy(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 23] }
  setEnergy(x: number, y: number, z: number, e: number): void { this.data[this._idx(x,y,z) + 23] = e }

  getLight(x: number, y: number, z: number): number { return this.data[this._idx(x,y,z) + 24] }
  setLight(x: number, y: number, z: number, l: number): void { this.data[this._idx(x,y,z) + 24] = Math.min(255, Math.max(0, l)) }

  /** Get the raw Float32Array base index for a cell (for workers to use directly) */
  baseIndex(x: number, y: number, z: number): number { return this._idx(x, y, z) }

  /** Serialize grid dimensions for transfer to workers */
  toTransferDescriptor(): GridTransferDescriptor {
    return { buffer: this.buffer, sizeX: this.sizeX, sizeY: this.sizeY, sizeZ: this.sizeZ }
  }
}

export interface GridTransferDescriptor {
  buffer: SharedArrayBuffer
  sizeX: number
  sizeY: number
  sizeZ: number
}
