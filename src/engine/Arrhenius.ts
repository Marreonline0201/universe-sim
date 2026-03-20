// Arrhenius reaction engine — pure math functions.
// Rate equation: k = A × exp(-Ea / (R × T))

import { PHYSICS } from './constants'
import { getMaterialProps } from './MaterialRegistry'

export const WOOD_Ea = 125_000   // J/mol (Grønli 1996)
export const WOOD_A  = 1e8       // s⁻¹

const O2_KG_PER_KG_WOOD = 1.17
const O2_MOLAR_MASS = 0.032  // kg/mol

export function arrheniusRate(A: number, Ea: number, tempC: number): number {
  const T_K = tempC + 273.15
  return A * Math.exp(-Ea / (PHYSICS.R * T_K))
}

export interface CombustionInput {
  materialId: number
  tempC: number
  woodFraction: number
  o2Moles: number
  cellVolume: number
  dt: number
}

export interface CombustionResult {
  dTempC: number
  dWoodFraction: number
  dO2Consumed: number
}

export function combustionStep(input: CombustionInput): CombustionResult {
  const zero: CombustionResult = { dTempC: 0, dWoodFraction: 0, dO2Consumed: 0 }
  const { materialId, tempC, woodFraction, o2Moles, cellVolume, dt } = input

  const props = getMaterialProps(materialId)
  if (props.combustionJ_kg === 0) return zero
  if (tempC < props.ignitionTemp) return zero
  if (woodFraction <= 0) return zero
  if (o2Moles <= 0) return zero

  const k = arrheniusRate(WOOD_A, WOOD_Ea, tempC)
  const burnedFraction = Math.min(woodFraction, k * woodFraction * dt)
  if (burnedFraction <= 0) return zero

  const massBurned = burnedFraction * props.density * cellVolume
  const heatJ = massBurned * props.combustionJ_kg

  const o2Required = (massBurned * O2_KG_PER_KG_WOOD) / O2_MOLAR_MASS
  const o2Consumed = Math.min(o2Moles, o2Required)

  const o2Scale = o2Required > 0 ? o2Consumed / o2Required : 0
  const actualHeatJ = heatJ * o2Scale
  const actualBurned = burnedFraction * o2Scale

  const thermalMass = Math.max(woodFraction - actualBurned, 0.01) * props.density * cellVolume
  const dTempC = actualHeatJ / (thermalMass * props.Cp)

  return {
    dTempC: Math.min(dTempC, 2000),
    dWoodFraction: -actualBurned,
    dO2Consumed: o2Consumed,
  }
}
