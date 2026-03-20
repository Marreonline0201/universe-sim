import type { GridTransferDescriptor } from '../Grid'
import { CELL_FLOATS } from '../Grid'
import { PHYSICS } from '../constants'

// Inline material thermal properties (k in W/m·K, Cp in J/kg·K)
// Must stay in sync with MaterialRegistry.ts — kept inline to avoid worker import chain.
const MATERIAL_K: Record<number, number> = {
  0: 0.026,  // air
  1: 2.9,    // granite/stone
  2: 1.4,    // flint
  3: 0.12,   // wood
  4: 0.10,   // bark
  5: 0.06,   // fiber/tinder
  8: 1.1,    // clay
  15: 80,    // iron
  17: 0.2,   // coal
  21: 0.06,  // fiber (tinder)
  25: 400,   // copper
}
const MATERIAL_Cp: Record<number, number> = {
  0: 1005,   // air
  1: 790,    // granite
  2: 730,    // flint
  3: 1700,   // wood
  4: 1600,   // bark
  5: 1600,   // fiber
  8: 920,    // clay
  15: 449,   // iron
  17: 710,   // coal
  21: 1600,  // fiber
  25: 385,   // copper
}
const DEFAULT_K  = 0.026
const DEFAULT_Cp = 1005

let data: Float32Array
let sizeX: number, sizeY: number, sizeZ: number

function idx(x: number, y: number, z: number): number {
  return (x + sizeX * (y + sizeY * z)) * CELL_FLOATS
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'init') {
    const desc = msg.descriptor as GridTransferDescriptor
    data  = new Float32Array(desc.buffer)
    sizeX = desc.sizeX
    sizeY = desc.sizeY
    sizeZ = desc.sizeZ
    self.postMessage({ type: 'ready' })
    return
  }
  if (msg.type === 'tick') {
    tickThermal(msg.dtSim as number)
  }
}

function tickThermal(dt: number): void {
  const dx = 1.0
  const dtCapped = Math.min(dt, 0.05)

  for (let z = 1; z < sizeZ - 1; z++) {
    for (let y = 1; y < sizeY - 1; y++) {
      for (let x = 1; x < sizeX - 1; x++) {
        const b = idx(x, y, z)
        const mat     = data[b] >>> 0
        const T       = data[b + 1]
        const density = Math.max(data[b + 3], 0.001)

        const k  = MATERIAL_K[mat]  ?? DEFAULT_K
        const Cp = MATERIAL_Cp[mat] ?? DEFAULT_Cp

        const Tx1 = data[idx(x+1,y,z)+1], Tx0 = data[idx(x-1,y,z)+1]
        const Ty1 = data[idx(x,y+1,z)+1], Ty0 = data[idx(x,y-1,z)+1]
        const Tz1 = data[idx(x,y,z+1)+1], Tz0 = data[idx(x,y,z-1)+1]

        const lapT  = (Tx1 + Tx0 + Ty1 + Ty0 + Tz1 + Tz0 - 6*T) / (dx * dx)
        const alpha = k / (density * Cp)
        data[b + 1] += alpha * lapT * dtCapped

        if (T > 500) {
          const T_K = T + 273.15
          const emissivity = 0.9
          const radiated = emissivity * PHYSICS.sigma * T_K**4 * dtCapped
          data[b + 1] -= radiated / (density * Cp * dx)
        }
      }
    }
  }
}
