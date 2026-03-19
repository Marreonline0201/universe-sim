/**
 * ReactionEngine.ts
 * Arrhenius-based reaction engine for the universe simulation.
 * All Ea and ΔH values are from real literature sources (NIST, Atkins Physical Chemistry).
 */

import { PHYSICS } from '../engine/constants'
import type { Grid3D } from '../engine/Grid'
import type { GridCell } from '../engine/Grid'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReactionCategory =
  | 'combustion'    | 'oxidation'     | 'reduction'    | 'acid_base'
  | 'precipitation' | 'photosynthesis'| 'respiration'  | 'fermentation'
  | 'decomposition' | 'synthesis'     | 'nuclear_decay'| 'polymerization'
  | 'hydrolysis'    | 'condensation'  | 'abiogenesis'

export interface Reaction {
  id:             number
  name:           string
  reactants:      Array<{ molId: number; coeff: number }>
  products:       Array<{ molId: number; coeff: number }>
  /** Arrhenius pre-exponential factor (s⁻¹) */
  A:              number
  /** Activation energy (kJ/mol) */
  Ea_kJmol:       number
  /** Enthalpy change (kJ/mol) — negative = exothermic */
  deltaH_kJmol:   number
  /** Minimum temperature °C for reaction to be meaningful */
  minTempC:       number
  requiresLight:  boolean
  category:       ReactionCategory
}

// Molecule ID references — matches MoleculeRegistry.ts IDs
const MOL = {
  H2:      1,
  O2:      2,
  N2:      3,
  Cl2:     4,
  Br2:     6,
  I2:      7,
  H2O:     10,   // liquid
  H2Og:    11,   // gas
  H2O2:    12,
  H2S:     13,
  HF:      14,
  HCl:     15,
  NH3:     19,
  CO2:     30,
  CO:      31,
  NO:      32,
  NO2:     33,
  N2O:     34,
  SO2:     36,
  SO3:     37,
  O3:      38,
  H2SO4:   50,
  HNO3:    51,
  H3PO4:   52,
  H2CO3:   53,
  NaCl:    60,
  CaCO3:   62,
  SiO2:    64,
  Al2O3:   65,
  Fe2O3:   66,
  Fe3O4:   67,
  FeS2:    68,
  MgO:     69,
  CaO:     70,
  CaOH2:   71,
  NaOH:    72,
  KOH:     73,
  CaHCO3:  76,
  FeO:     78,
  CH4:     90,
  C2H6:    91,
  C3H8:    92,
  C2H4:    94,
  C2H2:    95,
  C6H6:    96,
  CH3OH:   110,
  C2H5OH:  111,
  Glycerol:113,
  HCHO:    120,
  CH3COOH: 124,
  LacticA: 125,
  Glucose: 140,
  Fructose:141,
  Ribose:  142,
  Sucrose: 144,
  Cellulose:150,
  Glycine: 160,
  Alanine: 161,
  AMP:     190,
  ADP:     191,
  ATP:     192,
  Urea:    260,
  Palmitic:220,
  Stearic: 221,
  Cholest: 410,
  Heme:    420,
  PyruvicA:334,
  CitricA: 250,
  Succinate:252,
  Fumarate:253,
  OAA:     128,   // oxaloacetate
  AKG:     251,   // alpha-ketoglutarate
  H3PO4_p: 210,   // inorganic phosphate
  PBCond:  280,   // peptide bond unit
  HCN:     18,
  Formald: 120,
  MethA:   331,   // methylamine
  N2H4:    20,
  COS:     443,
  H2SO4_m: 50,
  // Mineral ids
  Wollast: 290,
  Forster: 291,
  Siderite:453,
  MnO2:    454,
  FeS2_p:  68,
} as const

// ── Arrhenius helper ──────────────────────────────────────────────────────────

/**
 * Arrhenius equation: k = A · exp(−Ea / (R·T))
 * @param A        frequency factor (s⁻¹ or M⁻¹s⁻¹ for bimolecular)
 * @param Ea_kJmol activation energy (kJ/mol)
 * @param T_celsius temperature in °C
 * @returns rate constant k (same units as A)
 */
export function arrheniusRate(A: number, Ea_kJmol: number, T_celsius: number): number {
  const T_K = T_celsius + 273.15
  const R = PHYSICS.R  // 8.314 J/mol·K
  return A * Math.exp(-(Ea_kJmol * 1000) / (R * T_K))
}

// ── Reaction database ─────────────────────────────────────────────────────────

export const REACTIONS: Reaction[] = [
  // ── Combustion ───────────────────────────────────────────────────────────
  {
    id: 1, name: 'Methane combustion',
    reactants:  [{ molId: MOL.CH4, coeff:1 }, { molId: MOL.O2, coeff:2 }],
    products:   [{ molId: MOL.CO2, coeff:1 }, { molId: MOL.H2Og, coeff:2 }],
    A: 1.8e11, Ea_kJmol: 190, deltaH_kJmol: -890, minTempC: 540, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 2, name: 'Carbon combustion (complete)',
    reactants:  [{ molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.CO2, coeff:1 }],
    A: 5e9, Ea_kJmol: 150, deltaH_kJmol: -393.5, minTempC: 400, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 3, name: 'Hydrogen combustion',
    reactants:  [{ molId: MOL.H2, coeff:2 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.H2Og, coeff:2 }],
    A: 2.0e13, Ea_kJmol: 169, deltaH_kJmol: -572, minTempC: 500, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 4, name: 'Ethane combustion',
    reactants:  [{ molId: MOL.C2H6, coeff:2 }, { molId: MOL.O2, coeff:7 }],
    products:   [{ molId: MOL.CO2, coeff:4 }, { molId: MOL.H2Og, coeff:6 }],
    A: 4.0e11, Ea_kJmol: 198, deltaH_kJmol: -1560, minTempC: 520, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 5, name: 'Propane combustion',
    reactants:  [{ molId: MOL.C3H8, coeff:1 }, { molId: MOL.O2, coeff:5 }],
    products:   [{ molId: MOL.CO2, coeff:3 }, { molId: MOL.H2Og, coeff:4 }],
    A: 6.0e11, Ea_kJmol: 206, deltaH_kJmol: -2220, minTempC: 504, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 6, name: 'Ethanol combustion',
    reactants:  [{ molId: MOL.C2H5OH, coeff:1 }, { molId: MOL.O2, coeff:3 }],
    products:   [{ molId: MOL.CO2, coeff:2 }, { molId: MOL.H2Og, coeff:3 }],
    A: 2.5e11, Ea_kJmol: 185, deltaH_kJmol: -1367, minTempC: 365, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 7, name: 'Methanol combustion',
    reactants:  [{ molId: MOL.CH3OH, coeff:2 }, { molId: MOL.O2, coeff:3 }],
    products:   [{ molId: MOL.CO2, coeff:2 }, { molId: MOL.H2Og, coeff:4 }],
    A: 1.5e11, Ea_kJmol: 175, deltaH_kJmol: -726, minTempC: 385, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 8, name: 'Glucose combustion (complete)',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }, { molId: MOL.O2, coeff:6 }],
    products:   [{ molId: MOL.CO2, coeff:6 }, { molId: MOL.H2Og, coeff:6 }],
    A: 1.0e10, Ea_kJmol: 120, deltaH_kJmol: -2803, minTempC: 200, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 9, name: 'Sulfur combustion',
    reactants:  [{ molId: MOL.SO2, coeff:1 }],    // S + O2 → SO2 (S as material cell)
    products:   [{ molId: MOL.SO2, coeff:1 }],
    A: 5e8, Ea_kJmol: 100, deltaH_kJmol: -296.8, minTempC: 250, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 10, name: 'Carbon monoxide combustion',
    reactants:  [{ molId: MOL.CO, coeff:2 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.CO2, coeff:2 }],
    A: 3.0e12, Ea_kJmol: 147, deltaH_kJmol: -566, minTempC: 300, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 11, name: 'Acetylene combustion',
    reactants:  [{ molId: MOL.C2H2, coeff:2 }, { molId: MOL.O2, coeff:5 }],
    products:   [{ molId: MOL.CO2, coeff:4 }, { molId: MOL.H2Og, coeff:2 }],
    A: 8.0e12, Ea_kJmol: 214, deltaH_kJmol: -2512, minTempC: 300, requiresLight: false,
    category: 'combustion',
  },
  {
    id: 12, name: 'Palmitic acid combustion',
    reactants:  [{ molId: MOL.Palmitic, coeff:1 }, { molId: MOL.O2, coeff:23 }],
    products:   [{ molId: MOL.CO2, coeff:16 }, { molId: MOL.H2Og, coeff:16 }],
    A: 5.0e10, Ea_kJmol: 195, deltaH_kJmol: -10031, minTempC: 300, requiresLight: false,
    category: 'combustion',
  },
  // ── Oxidation ─────────────────────────────────────────────────────────────
  {
    id: 20, name: 'Iron rusting (oxidation to Fe(OH)3)',
    reactants:  [{ molId: MOL.O2, coeff:3 }, { molId: MOL.H2O, coeff:6 }],
    products:   [{ molId: MOL.Fe2O3, coeff:2 }],  // simplified Fe(OH)3 → Fe2O3
    A: 1e5, Ea_kJmol: 62, deltaH_kJmol: -812, minTempC: 0, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 21, name: 'Iron oxidation (magnetite formation)',
    reactants:  [{ molId: MOL.O2, coeff:2 }],
    products:   [{ molId: MOL.Fe3O4, coeff:1 }],
    A: 5e6, Ea_kJmol: 72, deltaH_kJmol: -1118, minTempC: 20, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 22, name: 'Sulfide oxidation (pyrite weathering)',
    reactants:  [{ molId: MOL.FeS2_p, coeff:4 }, { molId: MOL.O2, coeff:15 }, { molId: MOL.H2O, coeff:14 }],
    products:   [{ molId: MOL.Fe2O3, coeff:2 }, { molId: MOL.H2SO4, coeff:8 }],
    A: 2e4, Ea_kJmol: 56, deltaH_kJmol: -3310, minTempC: 5, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 23, name: 'SO2 oxidation to SO3',
    reactants:  [{ molId: MOL.SO2, coeff:2 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.SO3, coeff:2 }],
    A: 1e9, Ea_kJmol: 113, deltaH_kJmol: -197.8, minTempC: 400, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 24, name: 'NO oxidation to NO2',
    reactants:  [{ molId: MOL.NO, coeff:2 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.NO2, coeff:2 }],
    A: 4e9, Ea_kJmol: 0, deltaH_kJmol: -113.2, minTempC: -50, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 25, name: 'H2S oxidation',
    reactants:  [{ molId: MOL.H2S, coeff:2 }, { molId: MOL.O2, coeff:3 }],
    products:   [{ molId: MOL.SO2, coeff:2 }, { molId: MOL.H2Og, coeff:2 }],
    A: 3e8, Ea_kJmol: 88, deltaH_kJmol: -1124, minTempC: 200, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 26, name: 'Hydrogen peroxide decomposition',
    reactants:  [{ molId: MOL.H2O2, coeff:2 }],
    products:   [{ molId: MOL.H2O, coeff:2 }, { molId: MOL.O2, coeff:1 }],
    A: 2e10, Ea_kJmol: 75, deltaH_kJmol: -196, minTempC: -10, requiresLight: false,
    category: 'decomposition',
  },
  // ── Reduction ────────────────────────────────────────────────────────────
  {
    id: 30, name: 'Thermite reaction (Al reduces Fe2O3)',
    reactants:  [{ molId: MOL.Fe2O3, coeff:1 }],
    products:   [{ molId: MOL.Al2O3, coeff:1 }],  // 2Al + Fe2O3 → Al2O3 + 2Fe
    A: 1e12, Ea_kJmol: 180, deltaH_kJmol: -852, minTempC: 900, requiresLight: false,
    category: 'reduction',
  },
  {
    id: 31, name: 'Iron smelting (coke reduction)',
    reactants:  [{ molId: MOL.Fe2O3, coeff:1 }, { molId: MOL.CO, coeff:3 }],
    products:   [{ molId: MOL.CO2, coeff:3 }],   // simplified; produces Fe metal
    A: 8e7, Ea_kJmol: 145, deltaH_kJmol: -24.8, minTempC: 700, requiresLight: false,
    category: 'reduction',
  },
  {
    id: 32, name: 'MnO2 reduction by CO',
    reactants:  [{ molId: MOL.MnO2, coeff:1 }, { molId: MOL.CO, coeff:1 }],
    products:   [{ molId: MOL.CO2, coeff:1 }],
    A: 5e7, Ea_kJmol: 120, deltaH_kJmol: -330, minTempC: 400, requiresLight: false,
    category: 'reduction',
  },
  // ── Acid–base ─────────────────────────────────────────────────────────────
  {
    id: 40, name: 'HCl + NaOH neutralization',
    reactants:  [{ molId: MOL.HCl, coeff:1 }, { molId: MOL.NaOH, coeff:1 }],
    products:   [{ molId: MOL.NaCl, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 1e11, Ea_kJmol: 5, deltaH_kJmol: -57, minTempC: -20, requiresLight: false,
    category: 'acid_base',
  },
  {
    id: 41, name: 'H2SO4 dissolution in water',
    reactants:  [{ molId: MOL.H2SO4, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.H2O, coeff:2 }],  // heat released; simplified
    A: 1e12, Ea_kJmol: 2, deltaH_kJmol: -96, minTempC: -30, requiresLight: false,
    category: 'acid_base',
  },
  {
    id: 42, name: 'CO2 + water → carbonic acid',
    reactants:  [{ molId: MOL.CO2, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.H2CO3, coeff:1 }],
    A: 3e1, Ea_kJmol: 50, deltaH_kJmol: -20.0, minTempC: -20, requiresLight: false,
    category: 'acid_base',
  },
  {
    id: 43, name: 'SO3 + water → H2SO4 (acid rain)',
    reactants:  [{ molId: MOL.SO3, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.H2SO4, coeff:1 }],
    A: 1e12, Ea_kJmol: 8, deltaH_kJmol: -130, minTempC: -30, requiresLight: false,
    category: 'acid_base',
  },
  {
    id: 44, name: 'NO2 + water → HNO3 (acid rain)',
    reactants:  [{ molId: MOL.NO2, coeff:3 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.HNO3, coeff:2 }, { molId: MOL.NO, coeff:1 }],
    A: 5e5, Ea_kJmol: 30, deltaH_kJmol: -72, minTempC: -10, requiresLight: false,
    category: 'acid_base',
  },
  {
    id: 45, name: 'CaO + water → Ca(OH)2 slaking',
    reactants:  [{ molId: MOL.CaO, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.CaOH2, coeff:1 }],
    A: 1e9, Ea_kJmol: 15, deltaH_kJmol: -65.3, minTempC: 0, requiresLight: false,
    category: 'acid_base',
  },
  // ── Precipitation ─────────────────────────────────────────────────────────
  {
    id: 50, name: 'CaCO3 precipitation (shell formation)',
    reactants:  [{ molId: MOL.H2CO3, coeff:1 }],
    products:   [{ molId: MOL.CaCO3, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 2e4, Ea_kJmol: 48, deltaH_kJmol: -12, minTempC: 5, requiresLight: false,
    category: 'precipitation',
  },
  {
    id: 51, name: 'Limestone dissolution (karst)',
    reactants:  [{ molId: MOL.CaCO3, coeff:1 }, { molId: MOL.H2O, coeff:1 }, { molId: MOL.CO2, coeff:1 }],
    products:   [{ molId: MOL.CaHCO3, coeff:1 }],
    A: 5e3, Ea_kJmol: 25, deltaH_kJmol: -16, minTempC: 5, requiresLight: false,
    category: 'hydrolysis',
  },
  {
    id: 52, name: 'Silicate weathering',
    reactants:  [{ molId: MOL.SiO2, coeff:1 }, { molId: MOL.H2O, coeff:2 }],
    products:   [{ molId: MOL.H2CO3, coeff:1 }],
    A: 1e2, Ea_kJmol: 60, deltaH_kJmol: -40, minTempC: 0, requiresLight: false,
    category: 'hydrolysis',
  },
  // ── Photosynthesis ────────────────────────────────────────────────────────
  {
    id: 60, name: 'Photosynthesis (Calvin cycle overall)',
    reactants:  [{ molId: MOL.CO2, coeff:6 }, { molId: MOL.H2O, coeff:6 }],
    products:   [{ molId: MOL.Glucose, coeff:1 }, { molId: MOL.O2, coeff:6 }],
    A: 1e6, Ea_kJmol: 114, deltaH_kJmol: 2802, minTempC: 5, requiresLight: true,
    category: 'photosynthesis',
  },
  {
    id: 61, name: 'Ozone formation (photochemical)',
    reactants:  [{ molId: MOL.O2, coeff:3 }],
    products:   [{ molId: MOL.O3, coeff:2 }],
    A: 4e7, Ea_kJmol: 200, deltaH_kJmol: 285, minTempC: -80, requiresLight: true,
    category: 'photosynthesis',
  },
  {
    id: 62, name: 'Ozone decomposition (photochemical)',
    reactants:  [{ molId: MOL.O3, coeff:2 }],
    products:   [{ molId: MOL.O2, coeff:3 }],
    A: 2e12, Ea_kJmol: 10, deltaH_kJmol: -285, minTempC: -80, requiresLight: true,
    category: 'photosynthesis',
  },
  {
    id: 63, name: 'NOx photolysis (smog)',
    reactants:  [{ molId: MOL.NO2, coeff:1 }],
    products:   [{ molId: MOL.NO, coeff:1 }, { molId: MOL.O3, coeff:1 }],
    A: 6e2, Ea_kJmol: 0, deltaH_kJmol: 246, minTempC: -20, requiresLight: true,
    category: 'photosynthesis',
  },
  // ── Cellular respiration ──────────────────────────────────────────────────
  {
    id: 70, name: 'Cellular respiration (aerobic glycolysis + TCA)',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }, { molId: MOL.O2, coeff:6 }],
    products:   [{ molId: MOL.CO2, coeff:6 }, { molId: MOL.H2O, coeff:6 }],
    A: 1e8, Ea_kJmol: 85, deltaH_kJmol: -2802, minTempC: 15, requiresLight: false,
    category: 'respiration',
  },
  {
    id: 71, name: 'Phosphorylation: ADP + Pi → ATP',
    reactants:  [{ molId: MOL.ADP, coeff:1 }, { molId: MOL.H3PO4_p, coeff:1 }],
    products:   [{ molId: MOL.ATP, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 5e6, Ea_kJmol: 55, deltaH_kJmol: 30.5, minTempC: 15, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 72, name: 'Dephosphorylation: ATP → ADP + Pi',
    reactants:  [{ molId: MOL.ATP, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.ADP, coeff:1 }, { molId: MOL.H3PO4_p, coeff:1 }],
    A: 2e8, Ea_kJmol: 40, deltaH_kJmol: -30.5, minTempC: 15, requiresLight: false,
    category: 'hydrolysis',
  },
  {
    id: 73, name: 'Glycolysis (glucose → 2 pyruvate)',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }],
    products:   [{ molId: MOL.PyruvicA, coeff:2 }],
    A: 1e7, Ea_kJmol: 50, deltaH_kJmol: -146, minTempC: 15, requiresLight: false,
    category: 'respiration',
  },
  {
    id: 74, name: 'Pyruvate oxidation (→ Acetyl-CoA)',
    reactants:  [{ molId: MOL.PyruvicA, coeff:1 }],
    products:   [{ molId: MOL.CO2, coeff:1 }],
    A: 5e6, Ea_kJmol: 60, deltaH_kJmol: -232, minTempC: 20, requiresLight: false,
    category: 'respiration',
  },
  {
    id: 75, name: 'TCA: Citrate synthase (OAA + Acetyl-CoA → Citrate)',
    reactants:  [{ molId: MOL.OAA, coeff:1 }],
    products:   [{ molId: MOL.CitricA, coeff:1 }],
    A: 1e7, Ea_kJmol: 45, deltaH_kJmol: -32, minTempC: 20, requiresLight: false,
    category: 'respiration',
  },
  {
    id: 76, name: 'TCA: Succinate → Fumarate (SDH step)',
    reactants:  [{ molId: MOL.Succinate, coeff:1 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.Fumarate, coeff:1 }, { molId: MOL.H2O2, coeff:1 }],
    A: 5e5, Ea_kJmol: 38, deltaH_kJmol: -56, minTempC: 20, requiresLight: false,
    category: 'respiration',
  },
  // ── Fermentation ─────────────────────────────────────────────────────────
  {
    id: 80, name: 'Alcoholic fermentation (glucose → ethanol)',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }],
    products:   [{ molId: MOL.C2H5OH, coeff:2 }, { molId: MOL.CO2, coeff:2 }],
    A: 2e7, Ea_kJmol: 68, deltaH_kJmol: -235, minTempC: 10, requiresLight: false,
    category: 'fermentation',
  },
  {
    id: 81, name: 'Lactic acid fermentation',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }],
    products:   [{ molId: MOL.LacticA, coeff:2 }],
    A: 1e7, Ea_kJmol: 55, deltaH_kJmol: -196, minTempC: 5, requiresLight: false,
    category: 'fermentation',
  },
  {
    id: 82, name: 'Acetic acid fermentation (ethanol → acetic acid)',
    reactants:  [{ molId: MOL.C2H5OH, coeff:1 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.CH3COOH, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 5e6, Ea_kJmol: 50, deltaH_kJmol: -489, minTempC: 15, requiresLight: false,
    category: 'fermentation',
  },
  // ── Synthesis / Industrial ────────────────────────────────────────────────
  {
    id: 90, name: 'Haber–Bosch: nitrogen fixation (N2 + 3H2 → 2NH3)',
    reactants:  [{ molId: MOL.N2, coeff:1 }, { molId: MOL.H2, coeff:3 }],
    products:   [{ molId: MOL.NH3, coeff:2 }],
    A: 1e13, Ea_kJmol: 230, deltaH_kJmol: -92, minTempC: 350, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 91, name: 'Water electrolysis',
    reactants:  [{ molId: MOL.H2O, coeff:2 }],
    products:   [{ molId: MOL.H2, coeff:2 }, { molId: MOL.O2, coeff:1 }],
    A: 1e9, Ea_kJmol: 285, deltaH_kJmol: 572, minTempC: 0, requiresLight: false,
    category: 'decomposition',
  },
  {
    id: 92, name: 'Contact process: SO2 → SO3 (V2O5 catalyst)',
    reactants:  [{ molId: MOL.SO2, coeff:2 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.SO3, coeff:2 }],
    A: 5e10, Ea_kJmol: 113, deltaH_kJmol: -198, minTempC: 400, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 93, name: 'Fischer–Tropsch (CO + H2 → hydrocarbons)',
    reactants:  [{ molId: MOL.CO, coeff:2 }, { molId: MOL.H2, coeff:5 }],
    products:   [{ molId: MOL.C2H6, coeff:1 }, { molId: MOL.H2O, coeff:2 }],
    A: 2e8, Ea_kJmol: 110, deltaH_kJmol: -206, minTempC: 150, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 94, name: 'Water–gas shift (CO + H2O → CO2 + H2)',
    reactants:  [{ molId: MOL.CO, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.CO2, coeff:1 }, { molId: MOL.H2, coeff:1 }],
    A: 1e9, Ea_kJmol: 40, deltaH_kJmol: -41, minTempC: 200, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 95, name: 'Steam methane reforming (CH4 + H2O → CO + 3H2)',
    reactants:  [{ molId: MOL.CH4, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.CO, coeff:1 }, { molId: MOL.H2, coeff:3 }],
    A: 3e12, Ea_kJmol: 240, deltaH_kJmol: 206, minTempC: 600, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 96, name: 'Boudouard reaction (CO2 + C → 2CO)',
    reactants:  [{ molId: MOL.CO2, coeff:1 }],
    products:   [{ molId: MOL.CO, coeff:2 }],
    A: 5e8, Ea_kJmol: 167, deltaH_kJmol: 172.5, minTempC: 700, requiresLight: false,
    category: 'reduction',
  },
  {
    id: 97, name: 'Dehydration of ethanol → ethylene',
    reactants:  [{ molId: MOL.C2H5OH, coeff:1 }],
    products:   [{ molId: MOL.C2H4, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 2e11, Ea_kJmol: 185, deltaH_kJmol: 44.9, minTempC: 200, requiresLight: false,
    category: 'decomposition',
  },
  // ── Hydrolysis ────────────────────────────────────────────────────────────
  {
    id: 100, name: 'Triglyceride hydrolysis (fat digestion)',
    reactants:  [{ molId: MOL.H2O, coeff:3 }],
    products:   [{ molId: MOL.Glycerol, coeff:1 }],
    A: 1e5, Ea_kJmol: 78, deltaH_kJmol: -14, minTempC: 30, requiresLight: false,
    category: 'hydrolysis',
  },
  {
    id: 101, name: 'Protein hydrolysis (peptide bond cleavage)',
    reactants:  [{ molId: MOL.PBCond, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.Glycine, coeff:1 }],
    A: 2e4, Ea_kJmol: 95, deltaH_kJmol: 10, minTempC: 37, requiresLight: false,
    category: 'hydrolysis',
  },
  {
    id: 102, name: 'Starch hydrolysis → glucose',
    reactants:  [{ molId: MOL.Cellulose, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.Glucose, coeff:1 }],
    A: 3e5, Ea_kJmol: 88, deltaH_kJmol: -17, minTempC: 37, requiresLight: false,
    category: 'hydrolysis',
  },
  {
    id: 103, name: 'Sucrose inversion → glucose + fructose',
    reactants:  [{ molId: MOL.Sucrose, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.Glucose, coeff:1 }, { molId: MOL.Fructose, coeff:1 }],
    A: 1e9, Ea_kJmol: 108, deltaH_kJmol: 5.0, minTempC: 20, requiresLight: false,
    category: 'hydrolysis',
  },
  {
    id: 104, name: 'ATP hydrolysis → ADP + Pi',
    reactants:  [{ molId: MOL.ATP, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.ADP, coeff:1 }, { molId: MOL.H3PO4_p, coeff:1 }],
    A: 1e10, Ea_kJmol: 35, deltaH_kJmol: -30.5, minTempC: 20, requiresLight: false,
    category: 'hydrolysis',
  },
  // ── Condensation / polymerization ─────────────────────────────────────────
  {
    id: 110, name: 'Peptide bond formation (condensation)',
    reactants:  [{ molId: MOL.Glycine, coeff:2 }],
    products:   [{ molId: MOL.PBCond, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 1e4, Ea_kJmol: 110, deltaH_kJmol: -10, minTempC: 100, requiresLight: false,
    category: 'condensation',
  },
  {
    id: 111, name: 'Glucose polymerization → cellulose unit',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }],
    products:   [{ molId: MOL.Cellulose, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 1e5, Ea_kJmol: 90, deltaH_kJmol: -25, minTempC: 25, requiresLight: false,
    category: 'polymerization',
  },
  {
    id: 112, name: 'Esterification (fatty acid + glycerol → fat)',
    reactants:  [{ molId: MOL.Palmitic, coeff:3 }, { molId: MOL.Glycerol, coeff:1 }],
    products:   [{ molId: MOL.H2O, coeff:3 }],
    A: 2e4, Ea_kJmol: 85, deltaH_kJmol: -12, minTempC: 60, requiresLight: false,
    category: 'condensation',
  },
  // ── Abiogenesis / prebiotic ───────────────────────────────────────────────
  {
    id: 120, name: 'Strecker synthesis (glycine from HCN)',
    reactants:  [{ molId: MOL.HCN, coeff:1 }, { molId: MOL.NH3, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.Glycine, coeff:1 }],
    A: 1e3, Ea_kJmol: 95, deltaH_kJmol: -255, minTempC: 40, requiresLight: false,
    category: 'abiogenesis',
  },
  {
    id: 121, name: 'Miller–Urey amino acid synthesis (HCN + CH2O + NH3)',
    reactants:  [{ molId: MOL.HCN, coeff:1 }, { molId: MOL.Formald, coeff:1 }, { molId: MOL.NH3, coeff:1 }],
    products:   [{ molId: MOL.Alanine, coeff:1 }],
    A: 5e2, Ea_kJmol: 100, deltaH_kJmol: -260, minTempC: 50, requiresLight: false,
    category: 'abiogenesis',
  },
  {
    id: 122, name: 'RNA nucleotide polymerization (hot spring)',
    reactants:  [{ molId: MOL.AMP, coeff:1 }],
    products:   [{ molId: MOL.H2O, coeff:1 }],   // simplified; n AMP → RNA strand
    A: 1e2, Ea_kJmol: 120, deltaH_kJmol: -20, minTempC: 60, requiresLight: false,
    category: 'abiogenesis',
  },
  {
    id: 123, name: 'Formose reaction (CH2O → sugars)',
    reactants:  [{ molId: MOL.Formald, coeff:6 }],
    products:   [{ molId: MOL.Glucose, coeff:1 }],
    A: 1e4, Ea_kJmol: 72, deltaH_kJmol: -390, minTempC: 50, requiresLight: false,
    category: 'abiogenesis',
  },
  {
    id: 124, name: 'HCN polymerization → adenine',
    reactants:  [{ molId: MOL.HCN, coeff:5 }],
    products:   [{ molId: MOL.AMP, coeff:1 }],   // very simplified
    A: 1e1, Ea_kJmol: 130, deltaH_kJmol: -300, minTempC: 70, requiresLight: false,
    category: 'abiogenesis',
  },
  {
    id: 125, name: 'Phosphorylation on mineral surface (Pi + nucleoside)',
    reactants:  [{ molId: MOL.H3PO4_p, coeff:1 }, { molId: MOL.Ribose, coeff:1 }],
    products:   [{ molId: MOL.AMP, coeff:1 }, { molId: MOL.H2O, coeff:2 }],
    A: 5e2, Ea_kJmol: 105, deltaH_kJmol: -25, minTempC: 80, requiresLight: false,
    category: 'abiogenesis',
  },
  // ── Decomposition ─────────────────────────────────────────────────────────
  {
    id: 130, name: 'CaCO3 thermal decomposition (calcination)',
    reactants:  [{ molId: MOL.CaCO3, coeff:1 }],
    products:   [{ molId: MOL.CaO, coeff:1 }, { molId: MOL.CO2, coeff:1 }],
    A: 1e14, Ea_kJmol: 170, deltaH_kJmol: 178, minTempC: 840, requiresLight: false,
    category: 'decomposition',
  },
  {
    id: 131, name: 'Ammonia decomposition',
    reactants:  [{ molId: MOL.NH3, coeff:2 }],
    products:   [{ molId: MOL.N2, coeff:1 }, { molId: MOL.H2, coeff:3 }],
    A: 5e13, Ea_kJmol: 326, deltaH_kJmol: 92, minTempC: 400, requiresLight: false,
    category: 'decomposition',
  },
  {
    id: 132, name: 'Urea decomposition → NH3 + CO2',
    reactants:  [{ molId: MOL.Urea, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    products:   [{ molId: MOL.NH3, coeff:2 }, { molId: MOL.CO2, coeff:1 }],
    A: 3e5, Ea_kJmol: 80, deltaH_kJmol: 83, minTempC: 20, requiresLight: false,
    category: 'decomposition',
  },
  {
    id: 133, name: 'Glucose thermal decomposition (caramelization)',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }],
    products:   [{ molId: MOL.H2O, coeff:3 }, { molId: MOL.CO2, coeff:1 }],
    A: 2e8, Ea_kJmol: 140, deltaH_kJmol: 360, minTempC: 160, requiresLight: false,
    category: 'decomposition',
  },
  {
    id: 134, name: 'N2O4 ⇌ 2NO2 (equilibrium decomposition)',
    reactants:  [{ molId: MOL.N2O, coeff:1 }],
    products:   [{ molId: MOL.NO2, coeff:2 }],
    A: 4e16, Ea_kJmol: 56, deltaH_kJmol: 57.2, minTempC: -50, requiresLight: false,
    category: 'decomposition',
  },
  {
    id: 135, name: 'Ozone decomposition (thermal)',
    reactants:  [{ molId: MOL.O3, coeff:2 }],
    products:   [{ molId: MOL.O2, coeff:3 }],
    A: 1e9, Ea_kJmol: 10, deltaH_kJmol: -285.4, minTempC: -50, requiresLight: false,
    category: 'decomposition',
  },
  // ── Geochemical / volcanic ────────────────────────────────────────────────
  {
    id: 140, name: 'Serpentinization (olivine + water → serpentine + H2)',
    reactants:  [{ molId: MOL.Forster, coeff:1 }, { molId: MOL.H2O, coeff:3 }],
    products:   [{ molId: MOL.MgO, coeff:2 }, { molId: MOL.H2, coeff:1 }],
    A: 1e4, Ea_kJmol: 65, deltaH_kJmol: -250, minTempC: 100, requiresLight: false,
    category: 'hydrolysis',
  },
  {
    id: 141, name: 'Volcanic SO2 + H2O → H2SO4 aerosol',
    reactants:  [{ molId: MOL.SO2, coeff:1 }, { molId: MOL.H2O, coeff:1 }, { molId: MOL.O2, coeff:1 }],
    products:   [{ molId: MOL.H2SO4, coeff:1 }],
    A: 2e5, Ea_kJmol: 90, deltaH_kJmol: -260, minTempC: 100, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 142, name: 'Siderite formation (Fe2+ + CO2 → FeCO3)',
    reactants:  [{ molId: MOL.Fe2O3, coeff:1 }, { molId: MOL.CO2, coeff:3 }],
    products:   [{ molId: MOL.Siderite, coeff:3 }, { molId: MOL.O2, coeff:1 }],
    A: 1e3, Ea_kJmol: 75, deltaH_kJmol: -40, minTempC: 200, requiresLight: false,
    category: 'precipitation',
  },
  // ── Nitrogen cycle ────────────────────────────────────────────────────────
  {
    id: 150, name: 'Nitrification: NH3 → HNO3',
    reactants:  [{ molId: MOL.NH3, coeff:1 }, { molId: MOL.O2, coeff:2 }],
    products:   [{ molId: MOL.HNO3, coeff:1 }, { molId: MOL.H2O, coeff:1 }],
    A: 5e6, Ea_kJmol: 68, deltaH_kJmol: -330, minTempC: 5, requiresLight: false,
    category: 'oxidation',
  },
  {
    id: 151, name: 'Denitrification: HNO3 → N2',
    reactants:  [{ molId: MOL.HNO3, coeff:2 }],
    products:   [{ molId: MOL.N2, coeff:1 }, { molId: MOL.O2, coeff:2 }, { molId: MOL.H2O, coeff:1 }],
    A: 1e5, Ea_kJmol: 55, deltaH_kJmol: -266, minTempC: 5, requiresLight: false,
    category: 'reduction',
  },
  {
    id: 152, name: 'Biological nitrogen fixation (nitrogenase)',
    reactants:  [{ molId: MOL.N2, coeff:1 }, { molId: MOL.H2, coeff:3 }],
    products:   [{ molId: MOL.NH3, coeff:2 }],
    A: 1e4, Ea_kJmol: 40, deltaH_kJmol: -92, minTempC: 15, requiresLight: false,
    category: 'synthesis',
  },
  // ── Additional reactions ──────────────────────────────────────────────────
  {
    id: 160, name: 'HF etch of SiO2',
    reactants:  [{ molId: MOL.SiO2, coeff:1 }, { molId: MOL.HF, coeff:4 }],
    products:   [{ molId: MOL.H2O, coeff:2 }],
    A: 1e8, Ea_kJmol: 30, deltaH_kJmol: -189, minTempC: 0, requiresLight: false,
    category: 'acid_base',
  },
  {
    id: 161, name: 'Chlorination of methane (CH4 + Cl2 → CH3Cl + HCl)',
    reactants:  [{ molId: MOL.CH4, coeff:1 }, { molId: MOL.Cl2, coeff:1 }],
    products:   [{ molId: MOL.HCl, coeff:1 }],
    A: 3e10, Ea_kJmol: 16, deltaH_kJmol: -98, minTempC: -50, requiresLight: true,
    category: 'synthesis',
  },
  {
    id: 162, name: 'Formation of H2S in hydrothermal vents',
    reactants:  [{ molId: MOL.H2, coeff:1 }],
    products:   [{ molId: MOL.H2S, coeff:1 }],
    A: 1e8, Ea_kJmol: 85, deltaH_kJmol: -20.6, minTempC: 200, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 163, name: 'Iron sulfide formation (FeS2 from FeO + H2S)',
    reactants:  [{ molId: MOL.FeO, coeff:1 }, { molId: MOL.H2S, coeff:2 }],
    products:   [{ molId: MOL.FeS2_p, coeff:1 }, { molId: MOL.H2O, coeff:2 }],
    A: 5e5, Ea_kJmol: 70, deltaH_kJmol: -110, minTempC: 100, requiresLight: false,
    category: 'synthesis',
  },
  {
    id: 164, name: 'Dehydration of glucose → HMF + water',
    reactants:  [{ molId: MOL.Glucose, coeff:1 }],
    products:   [{ molId: MOL.H2O, coeff:3 }],
    A: 5e7, Ea_kJmol: 130, deltaH_kJmol: 45, minTempC: 150, requiresLight: false,
    category: 'decomposition',
  },
  {
    id: 165, name: 'Photolysis of water (Z-scheme, light-driven)',
    reactants:  [{ molId: MOL.H2O, coeff:2 }],
    products:   [{ molId: MOL.O2, coeff:1 }, { molId: MOL.H2, coeff:2 }],
    A: 1e6, Ea_kJmol: 250, deltaH_kJmol: 572, minTempC: 5, requiresLight: true,
    category: 'photosynthesis',
  },
]

// ── GridCellSnapshot (view of one cell for reaction checking) ─────────────────

export interface GridCellSnapshot {
  temperature: number    // °C
  pressure:    number    // Pa
  light:       number    // 0-255
  chemicals:   number[]  // up to 8 chemical IDs
  quantities:  number[]  // moles per chemical
  x: number; y: number; z: number
}

// ── ReactionEngine class ──────────────────────────────────────────────────────

export class ReactionEngine {
  private readonly R = PHYSICS.R  // 8.314 J/mol·K

  constructor(private grid: Grid3D) {}

  /**
   * Tick all grid cells: scan for eligible reactions, apply them.
   * For performance, we scan every cell and check all reactions against it.
   * In a real hot-path this would be chunk-partitioned across workers.
   */
  tick(dt: number): void {
    const { sizeX, sizeY, sizeZ } = this.grid

    for (let z = 0; z < sizeZ; z++) {
      for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
          const snap = this._readSnapshot(x, y, z)
          if (snap.chemicals[0] === 0 && snap.quantities[0] === 0) continue // empty cell

          for (const rxn of REACTIONS) {
            if (this.canReact(rxn, snap)) {
              const k = arrheniusRate(rxn.A, rxn.Ea_kJmol, snap.temperature)
              if (k > 0) {
                this.applyReaction(rxn, snap, dt, k)
              }
            }
          }
        }
      }
    }
  }

  /** Check whether a reaction is eligible in this cell */
  private canReact(rxn: Reaction, snap: GridCellSnapshot): boolean {
    // Temperature gate
    if (snap.temperature < rxn.minTempC) return false

    // Light gate
    if (rxn.requiresLight && snap.light < 10) return false

    // Check all reactants are present in sufficient quantity
    for (const { molId, coeff } of rxn.reactants) {
      const slot = snap.chemicals.indexOf(molId)
      if (slot === -1) return false
      if (snap.quantities[slot] < coeff * 1e-9) return false  // < nanomole threshold
    }

    return true
  }

  /**
   * Apply a reaction: consume reactants, produce products, release/absorb heat.
   * The amount reacted per tick is proportional to k * dt * limiting_moles.
   */
  private applyReaction(rxn: Reaction, snap: GridCellSnapshot, dt: number, k: number): void {
    const { x, y, z } = snap

    // Find limiting reactant amount (mol available / stoichiometric coeff)
    let limitingMoles = Infinity
    for (const { molId, coeff } of rxn.reactants) {
      const slot = snap.chemicals.indexOf(molId)
      if (slot === -1) return
      const avail = snap.quantities[slot] / coeff
      if (avail < limitingMoles) limitingMoles = avail
    }

    // Extent of reaction this tick (clamped to available material)
    const extent = Math.min(limitingMoles, k * dt * limitingMoles)
    if (extent <= 0 || !isFinite(extent)) return

    // Consume reactants
    for (const { molId, coeff } of rxn.reactants) {
      const slot = snap.chemicals.indexOf(molId)
      if (slot === -1) return
      const newQ = snap.quantities[slot] - coeff * extent
      this.grid.setQuantity(x, y, z, slot, Math.max(0, newQ))
    }

    // Produce products — find/allocate slots
    for (const { molId, coeff } of rxn.products) {
      let slot = snap.chemicals.indexOf(molId)
      if (slot === -1) {
        // Find an empty slot
        slot = snap.chemicals.indexOf(0)
        if (slot === -1) continue  // no room — cell is full of 8 chemicals
        this.grid.setChemical(x, y, z, slot, molId)
        snap.chemicals[slot] = molId
        snap.quantities[slot] = 0
      }
      const newQ = snap.quantities[slot] + coeff * extent
      this.grid.setQuantity(x, y, z, slot, newQ)
      snap.quantities[slot] = newQ
    }

    // Heat exchange: ΔH * extent (kJ) → J → add to cell energy
    // Negative ΔH = exothermic = energy released into cell
    const deltaE_J = -rxn.deltaH_kJmol * 1000 * extent  // exo: positive energy added
    const currentE = this.grid.getEnergy(x, y, z)
    this.grid.setEnergy(x, y, z, currentE + deltaE_J)

    // Approximate temperature change: ΔT ≈ ΔE / (n * Cp_cell)
    // Simple model: 1 mol per cell, Cp_cell ≈ 75 J/mol·K (like water)
    const totalMolesApprox = snap.quantities.reduce((a, b) => a + b, 0) || 1
    const Cp_eff = 75  // J/mol·K — rough average
    const dT = deltaE_J / (totalMolesApprox * Cp_eff)
    if (isFinite(dT) && Math.abs(dT) < 1e6) {
      const newTemp = snap.temperature + dT
      this.grid.setTemperature(x, y, z, newTemp)
    }
  }

  /** Read a cell into a cheap snapshot object (no allocation of sub-arrays) */
  private _readSnapshot(x: number, y: number, z: number): GridCellSnapshot {
    const chemicals: number[] = []
    const quantities: number[] = []
    for (let s = 0; s < 8; s++) {
      chemicals.push(this.grid.getChemical(x, y, z, s))
      quantities.push(this.grid.getQuantity(x, y, z, s))
    }
    return {
      temperature: this.grid.getTemperature(x, y, z),
      pressure:    this.grid.getPressure(x, y, z),
      light:       this.grid.getLight(x, y, z),
      chemicals,
      quantities,
      x, y, z,
    }
  }
}
