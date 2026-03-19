import type { GridTransferDescriptor } from '../Grid'
import { CELL_FLOATS } from '../Grid'
import { PHYSICS, THERMO } from '../constants'

let data: Float32Array
let sizeX: number, sizeY: number, sizeZ: number

function idx(x: number, y: number, z: number): number {
  return (x + sizeX * (y + sizeY * z)) * CELL_FLOATS
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'init') {
    const desc = msg.descriptor as GridTransferDescriptor
    data = new Float32Array(desc.buffer)
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

/**
 * Fourier heat conduction: Q = k * A * ΔT / Δx
 * Each cell conducts heat to 6 neighbors proportional to temperature difference.
 * Uses material-specific thermal conductivity (approximated from material ID).
 */
function tickThermal(dt: number): void {
  const kappa = THERMO.k_water  // default conductivity (W/m·K) — should be per material
  const dx = 1.0               // cell size = 1 m
  const cp = THERMO.Cp_water   // specific heat (J/kg·K)

  for (let z = 1; z < sizeZ - 1; z++) {
    for (let y = 1; y < sizeY - 1; y++) {
      for (let x = 1; x < sizeX - 1; x++) {
        const b = idx(x, y, z)
        const T  = data[b + 1]
        const density = Math.max(data[b + 3], 0.001)
        const Tx1 = data[idx(x+1,y,z)+1], Tx0 = data[idx(x-1,y,z)+1]
        const Ty1 = data[idx(x,y+1,z)+1], Ty0 = data[idx(x,y-1,z)+1]
        const Tz1 = data[idx(x,y,z+1)+1], Tz0 = data[idx(x,y,z-1)+1]
        // Laplacian of T
        const lapT = (Tx1 + Tx0 + Ty1 + Ty0 + Tz1 + Tz0 - 6*T) / (dx*dx)
        // dT/dt = α * ∇²T   where α = k/(ρ·cp)
        const alpha = kappa / (density * cp)
        data[b + 1] += alpha * lapT * dt

        // Stefan-Boltzmann radiation from very hot cells (> 500°C)
        if (T > 500) {
          const T_K = T + 273.15
          const radiated = PHYSICS.sigma * T_K * T_K * T_K * T_K * dt  // W/m²·s = J/m²
          const dT_rad = -radiated / (density * cp * dx)  // temperature drop
          data[b + 1] += dT_rad
        }
      }
    }
  }
}
