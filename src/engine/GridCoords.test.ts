import { describe, it, expect } from 'vitest'
import { worldToGrid, gridToWorldCenter, isInBounds, initO2Moles } from './GridCoords'

const ORIGIN = { x: -32, y: 1996, z: -32 }  // 64×32×64 grid origin, spawn at center
const CELL_SIZE = 1.0
const GRID = { sizeX: 64, sizeY: 32, sizeZ: 64 }

describe('GridCoords.worldToGrid', () => {
  it('maps origin-corner world pos to cell 0,0,0', () => {
    const g = worldToGrid(-32, 1996, -32, ORIGIN, CELL_SIZE)
    expect(g).toEqual({ gx: 0, gy: 0, gz: 0 })
  })

  it('maps spawn world pos to grid center cell 32,4,32', () => {
    const g = worldToGrid(0, 2000, 0, ORIGIN, CELL_SIZE)
    expect(g.gx).toBe(32)
    expect(g.gy).toBe(4)
    expect(g.gz).toBe(32)
  })

  it('floors fractional positions', () => {
    const g = worldToGrid(0.9, 1996.9, 0.9, ORIGIN, CELL_SIZE)
    expect(g.gx).toBe(32)
    expect(g.gy).toBe(0)
    expect(g.gz).toBe(32)
  })
})

describe('GridCoords.gridToWorldCenter', () => {
  it('round-trips through worldToGrid', () => {
    const w = gridToWorldCenter(32, 4, 32, ORIGIN, CELL_SIZE)
    expect(w.x).toBeCloseTo(0.5, 5)
    expect(w.y).toBeCloseTo(2000.5, 5)
    expect(w.z).toBeCloseTo(0.5, 5)
  })
})

describe('GridCoords.isInBounds', () => {
  it('returns true for valid coords', () => {
    expect(isInBounds(0, 0, 0, GRID)).toBe(true)
    expect(isInBounds(63, 31, 63, GRID)).toBe(true)
  })
  it('returns false for out-of-bounds', () => {
    expect(isInBounds(-1, 0, 0, GRID)).toBe(false)
    expect(isInBounds(64, 0, 0, GRID)).toBe(false)
  })
})

describe('GridCoords.initO2Moles', () => {
  it('returns ~8.7 mol/m³ for air at 20°C 1 atm', () => {
    expect(initO2Moles(20, 101325, 1.0)).toBeCloseTo(8.72, 1)
  })
  it('returns 0 for solid material (no O2 in rock)', () => {
    expect(initO2Moles(20, 101325, 1.0, false)).toBe(0)
  })
})
