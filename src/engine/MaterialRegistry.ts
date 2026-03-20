export interface MaterialProps {
  k: number
  Cp: number
  density: number
  ignitionTemp: number
  combustionJ_kg: number
}

export const MAT_AIR   = 0
export const MAT_STONE = 1
export const MAT_FLINT = 2
export const MAT_WOOD  = 3
export const MAT_BARK  = 4
export const MAT_COAL  = 17
export const MAT_TINDER = 21

const PROPS: Record<number, MaterialProps> = {
  0:  { k: 0.026, Cp: 1005,  density: 1.225,  ignitionTemp: Infinity, combustionJ_kg: 0 },
  1:  { k: 2.9,   Cp: 790,   density: 2700,   ignitionTemp: Infinity, combustionJ_kg: 0 },
  2:  { k: 1.4,   Cp: 730,   density: 2650,   ignitionTemp: Infinity, combustionJ_kg: 0 },
  3:  { k: 0.12,  Cp: 1700,  density: 600,    ignitionTemp: 250,      combustionJ_kg: 16_700_000 },
  4:  { k: 0.10,  Cp: 1600,  density: 400,    ignitionTemp: 220,      combustionJ_kg: 15_500_000 },
  5:  { k: 0.06,  Cp: 1600,  density: 80,     ignitionTemp: 170,      combustionJ_kg: 14_000_000 },
  8:  { k: 1.1,   Cp: 920,   density: 1800,   ignitionTemp: Infinity, combustionJ_kg: 0 },
  17: { k: 0.2,   Cp: 710,   density: 1300,   ignitionTemp: 350,      combustionJ_kg: 29_000_000 },
  21: { k: 0.06,  Cp: 1600,  density: 80,     ignitionTemp: 170,      combustionJ_kg: 14_000_000 },
  25: { k: 400,   Cp: 385,   density: 8960,   ignitionTemp: Infinity, combustionJ_kg: 0 },
  15: { k: 80,    Cp: 449,   density: 7874,   ignitionTemp: Infinity, combustionJ_kg: 0 },
}

const AIR_PROPS = PROPS[0]

export function getMaterialProps(materialId: number): MaterialProps {
  return PROPS[materialId] ?? AIR_PROPS
}
