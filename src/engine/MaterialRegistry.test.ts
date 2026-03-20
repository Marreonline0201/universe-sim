import { describe, it, expect } from 'vitest'
import { getMaterialProps, MAT_AIR, MAT_STONE, MAT_WOOD } from './MaterialRegistry'

describe('MaterialRegistry', () => {
  it('returns air properties for material 0', () => {
    const p = getMaterialProps(0)
    expect(p.k).toBeCloseTo(0.026, 3)
    expect(p.Cp).toBeCloseTo(1005, 0)
    expect(p.density).toBeCloseTo(1.225, 3)
    expect(p.ignitionTemp).toBe(Infinity)
    expect(p.combustionJ_kg).toBe(0)
  })

  it('returns wood properties for material 3', () => {
    const p = getMaterialProps(3)
    expect(p.k).toBeCloseTo(0.12, 3)
    expect(p.Cp).toBeCloseTo(1700, 0)
    expect(p.density).toBeCloseTo(600, 0)
    expect(p.ignitionTemp).toBeCloseTo(250, 0)
    expect(p.combustionJ_kg).toBeCloseTo(16_700_000, -5)
  })

  it('returns granite properties for material 1 (stone)', () => {
    const p = getMaterialProps(1)
    expect(p.k).toBeCloseTo(2.9, 2)
    expect(p.Cp).toBeCloseTo(790, 0)
    expect(p.density).toBeCloseTo(2700, 0)
    expect(p.ignitionTemp).toBe(Infinity)
  })

  it('falls back to air for unknown material', () => {
    const p = getMaterialProps(999)
    expect(p.k).toBeCloseTo(0.026, 3)
  })
})
