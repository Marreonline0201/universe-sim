import type { GridTransferDescriptor } from '../Grid'
import { CELL_FLOATS } from '../Grid'
import { PHYSICS, THERMO } from '../constants'

let data: Float32Array
let sizeX: number, sizeY: number, sizeZ: number
let totalCells: number

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
    totalCells = sizeX * sizeY * sizeZ
    self.postMessage({ type: 'ready' })
    return
  }
  if (msg.type === 'tick') {
    tickPhysics(msg.dtSim as number)
  }
}

/**
 * Gravity: pull fluid density downward using real g_earth.
 * Applies a downward pressure gradient each tick.
 * F = ρ·g·V, pressure = F/A
 */
function tickPhysics(dt: number): void {
  const g = PHYSICS.g_earth
  // Apply gravity to fluid velocity (Y = up)
  for (let z = 0; z < sizeZ; z++) {
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        const b = idx(x, y, z)
        const density = data[b + 3]
        if (density <= 0) continue
        // Gravitational acceleration adds downward velocity
        data[b + 5] -= g * dt  // vy -= g * dt
        // Clamp velocity to prevent instability
        const vy = data[b + 5]
        if (Math.abs(vy) > 100) data[b + 5] = Math.sign(vy) * 100
      }
    }
  }
}
