import { PHYSICS } from './constants'

export interface GridOrigin { x: number; y: number; z: number }
export interface GridSize   { sizeX: number; sizeY: number; sizeZ: number }
export interface GridCoord  { gx: number; gy: number; gz: number }

export function worldToGrid(
  wx: number, wy: number, wz: number,
  origin: GridOrigin,
  cellSize: number,
): GridCoord {
  return {
    gx: Math.floor((wx - origin.x) / cellSize),
    gy: Math.floor((wy - origin.y) / cellSize),
    gz: Math.floor((wz - origin.z) / cellSize),
  }
}

export function gridToWorldCenter(
  gx: number, gy: number, gz: number,
  origin: GridOrigin,
  cellSize: number,
): { x: number; y: number; z: number } {
  return {
    x: origin.x + (gx + 0.5) * cellSize,
    y: origin.y + (gy + 0.5) * cellSize,
    z: origin.z + (gz + 0.5) * cellSize,
  }
}

export function isInBounds(gx: number, gy: number, gz: number, grid: GridSize): boolean {
  return gx >= 0 && gx < grid.sizeX &&
         gy >= 0 && gy < grid.sizeY &&
         gz >= 0 && gz < grid.sizeZ
}

export function initO2Moles(
  tempC: number,
  pressurePa: number,
  cellVolumeM3: number,
  isAir = true,
): number {
  if (!isAir) return 0
  const T_K = tempC + 273.15
  const totalMoles = (pressurePa * cellVolumeM3) / (PHYSICS.R * T_K)
  return totalMoles * 0.21
}

export function computeGridOrigin(
  spawnX: number,
  spawnY: number,
  spawnZ: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  cellSize: number,
): GridOrigin {
  void sizeY
  return {
    x: spawnX - (sizeX / 2) * cellSize,
    y: spawnY - 4 * cellSize,
    z: spawnZ - (sizeZ / 2) * cellSize,
  }
}
