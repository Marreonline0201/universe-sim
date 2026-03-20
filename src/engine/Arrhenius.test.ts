import { describe, it, expect } from 'vitest'
import { arrheniusRate, combustionStep, WOOD_Ea, WOOD_A } from './Arrhenius'

describe('arrheniusRate', () => {
  it('returns 0 below activation temperature (250°C wood ignition)', () => {
    const k = arrheniusRate(WOOD_A, WOOD_Ea, 200)
    expect(k).toBeLessThan(1e-5)
  })

  it('returns meaningful rate at 400°C (fire temperature)', () => {
    const k = arrheniusRate(WOOD_A, WOOD_Ea, 400)
    expect(k).toBeGreaterThan(0.01)
    expect(k).toBeLessThan(1.0)
  })

  it('rate increases with temperature (Arrhenius is monotonic)', () => {
    const k300 = arrheniusRate(WOOD_A, WOOD_Ea, 300)
    const k500 = arrheniusRate(WOOD_A, WOOD_Ea, 500)
    expect(k500).toBeGreaterThan(k300)
  })
})

describe('combustionStep', () => {
  it('does nothing below ignition temp', () => {
    const result = combustionStep({
      materialId: 3,
      tempC: 200,
      woodFraction: 1.0,
      o2Moles: 8.0,
      cellVolume: 1.0,
      dt: 1.0,
    })
    expect(result.dTempC).toBeCloseTo(0, 3)
    expect(result.dWoodFraction).toBeCloseTo(0, 3)
    expect(result.dO2Consumed).toBeCloseTo(0, 3)
  })

  it('produces heat and consumes wood at 400°C', () => {
    const result = combustionStep({
      materialId: 3,
      tempC: 400,
      woodFraction: 1.0,
      o2Moles: 8.0,
      cellVolume: 1.0,
      dt: 1.0,
    })
    expect(result.dTempC).toBeGreaterThan(0)
    expect(result.dWoodFraction).toBeLessThan(0)
    expect(result.dO2Consumed).toBeGreaterThan(0)
  })

  it('produces no heat when O2 is exhausted', () => {
    const result = combustionStep({
      materialId: 3,
      tempC: 600,
      woodFraction: 1.0,
      o2Moles: 0,
      cellVolume: 1.0,
      dt: 1.0,
    })
    expect(result.dTempC).toBeCloseTo(0, 3)
  })
})
