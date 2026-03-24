import type { GridTransferDescriptor } from '../Grid'
import { CELL_FLOATS } from '../Grid'

// Inline Arrhenius constants (avoid worker import chain)
const WOOD_Ea  = 125_000   // J/mol
const WOOD_A   = 1e8       // s⁻¹
const R        = 8.314     // J/mol·K

// Inline material props needed for combustion
// [ignitionTemp°C, combustionJ_kg, density_kg_m3, Cp_J_kg_K]
const COMBUSTION_PROPS: Record<number, [number, number, number, number]> = {
  3:  [250, 16_700_000, 600,  1700],  // wood
  4:  [220, 15_500_000, 400,  1600],  // bark
  5:  [170, 14_000_000, 80,   1600],  // fiber/tinder
  17: [350, 29_000_000, 1300, 710],   // coal
  21: [170, 14_000_000, 80,   1600],  // fiber (alt mat ID)
}
const O2_KG_PER_KG_WOOD = 1.17
const O2_MOLAR_MASS = 0.032  // kg/mol
const O2_QUANT_SLOT = 0  // index into quantities[0..7]

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
    tickChem(msg.dtSim as number)
    return
  }

  if (msg.type === 'ignite') {
    const { gx, gy, gz, energyJ } = msg as { gx: number; gy: number; gz: number; energyJ: number }
    depositIgnitionEnergy(gx, gy, gz, energyJ)
    return
  }

  if (msg.type === 'place_material') {
    const { gx, gy, gz, materialId, density } = msg as {
      gx: number; gy: number; gz: number; materialId: number; density: number
    }
    if (gx < 0 || gx >= sizeX || gy < 0 || gy >= sizeY || gz < 0 || gz >= sizeZ) return
    const b = idx(gx, gy, gz)
    data[b]     = materialId
    data[b + 3] = density
    return
  }

  if (msg.type === 'cool') {
    // Rain / water suppression: cool all cells within a radius around a grid point.
    const { cgx, cgy, cgz, radiusCells, targetTempC } = msg as {
      cgx: number; cgy: number; cgz: number; radiusCells: number; targetTempC: number
    }
    const r2 = radiusCells * radiusCells
    for (let dz = -radiusCells; dz <= radiusCells; dz++) {
      for (let dy = -radiusCells; dy <= radiusCells; dy++) {
        for (let dx = -radiusCells; dx <= radiusCells; dx++) {
          if (dx*dx + dy*dy + dz*dz > r2) continue
          const gx = cgx + dx, gy = cgy + dy, gz = cgz + dz
          if (gx < 0 || gx >= sizeX || gy < 0 || gy >= sizeY || gz < 0 || gz >= sizeZ) continue
          const b = idx(gx, gy, gz)
          if (data[b + 1] > targetTempC) {
            data[b + 1] = targetTempC
          }
        }
      }
    }
    return
  }
}

function depositIgnitionEnergy(gx: number, gy: number, gz: number, energyJ: number): void {
  if (gx < 0 || gx >= sizeX || gy < 0 || gy >= sizeY || gz < 0 || gz >= sizeZ) return
  const b = idx(gx, gy, gz)
  const mat     = data[b] >>> 0
  const density = Math.max(data[b + 3], 0.001)
  const Cp = COMBUSTION_PROPS[mat] ? COMBUSTION_PROPS[mat][3] : 1005
  const dT = energyJ / (density * Cp)
  data[b + 1] += dT
}

function tickChem(dt: number): void {
  const dtCapped = Math.min(dt, 0.05)

  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        const b   = idx(x, y, z)
        const mat = data[b] >>> 0

        const props = COMBUSTION_PROPS[mat]
        if (!props) continue

        const [ignitionTemp, combustionJ_kg, density0, Cp] = props
        const tempC   = data[b + 1]
        const density = data[b + 3]

        if (tempC < ignitionTemp) continue
        if (density < 1) {
          data[b]     = 0
          data[b + 3] = 1.225
          continue
        }

        const o2Slot  = b + 15 + O2_QUANT_SLOT
        const o2Moles = data[o2Slot]
        if (o2Moles <= 0) continue

        const T_K = tempC + 273.15
        const k   = WOOD_A * Math.exp(-WOOD_Ea / (R * T_K))

        const woodFraction   = Math.min(1, density / density0)
        const burnedFraction = Math.min(woodFraction, k * woodFraction * dtCapped)
        if (burnedFraction <= 0) continue

        const massBurned  = burnedFraction * density0 * 1.0
        const o2Required  = (massBurned * O2_KG_PER_KG_WOOD) / O2_MOLAR_MASS
        const o2Consumed  = Math.min(o2Moles, o2Required)
        const o2Scale     = o2Required > 0 ? o2Consumed / o2Required : 0
        const actualBurned = burnedFraction * o2Scale
        const heatJ       = actualBurned * density0 * combustionJ_kg

        data[b + 3] = Math.max(0, density - actualBurned * density0)
        data[o2Slot] = Math.max(0, o2Moles - o2Consumed)

        const remainingMass = Math.max(data[b + 3], 0.01) * 1.0
        const dT = Math.min(heatJ / (remainingMass * Cp), 500)
        data[b + 1] += dT
      }
    }
  }
}
