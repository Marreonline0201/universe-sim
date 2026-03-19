import type { GridTransferDescriptor } from '../Grid'
import { CELL_FLOATS } from '../Grid'

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
    tickFluid(msg.dtSim as number)
  }
}

/**
 * Simplified incompressible Navier-Stokes:
 * 1. Advect velocity (semi-Lagrangian)
 * 2. Pressure projection (enforce divergence-free)
 * 3. Apply pressure gradient to velocity
 */
function tickFluid(dt: number): void {
  // Pressure diffusion: high-pressure cells push into low-pressure neighbors
  const viscosity = 0.001  // water-like viscosity coefficient
  for (let z = 1; z < sizeZ - 1; z++) {
    for (let y = 1; y < sizeY - 1; y++) {
      for (let x = 1; x < sizeX - 1; x++) {
        const b = idx(x, y, z)
        const p  = data[b + 2]  // pressure at this cell
        const px = data[idx(x+1,y,z) + 2]
        const py = data[idx(x,y+1,z) + 2]
        const pz = data[idx(x,y,z+1) + 2]
        const nx = data[idx(x-1,y,z) + 2]
        const ny = data[idx(x,y-1,z) + 2]
        const nz = data[idx(x,y,z-1) + 2]
        // Pressure gradient drives velocity
        const density = Math.max(data[b + 3], 0.001)
        data[b + 4] += -dt * (px - nx) / (2 * density)  // dvx = -dt * dP/dx / ρ
        data[b + 5] += -dt * (py - ny) / (2 * density)  // dvy
        data[b + 6] += -dt * (pz - nz) / (2 * density)  // dvz
        // Viscous diffusion
        const lapVx = (data[idx(x+1,y,z)+4] + data[idx(x-1,y,z)+4] +
                       data[idx(x,y+1,z)+4] + data[idx(x,y-1,z)+4] +
                       data[idx(x,y,z+1)+4] + data[idx(x,y,z-1)+4] - 6*data[b+4])
        data[b + 4] += viscosity * dt * lapVx
      }
    }
  }
}
