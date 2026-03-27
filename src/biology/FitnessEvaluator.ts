/**
 * FitnessEvaluator.ts
 *
 * Pure function: (genome, environment) → fitness score 0-1
 *
 * Fitness components:
 *   - Temperature tolerance match (genome preference vs grid cell temp)
 *   - Food availability (autotrophs need light)
 *   - Predation pressure (external input 0-1)
 *   - Size-metabolism efficiency (larger organisms need more energy)
 *
 * All component scores are in [0, 1] and combined as a weighted harmonic mean
 * to prevent any single bottleneck from being fully compensated by other factors
 * (the "Liebig's law of the minimum" approximation).
 */

import type { Genome } from './GenomeEncoder'
import { GenomeEncoder } from './GenomeEncoder'

const encoder = new GenomeEncoder()

export interface EnvironmentSample {
  /** Grid cell temperature in °C */
  temperature: number
  /** Light level 0-255 */
  light: number
  /** Predation pressure 0-1 (proportion of population under active predation) */
  predationPressure: number
  /** Local population density 0-1 (fraction of carrying capacity) */
  populationDensity: number
}

export interface FitnessBreakdown {
  /** Overall fitness 0-1 */
  overall: number
  /** Temperature match component 0-1 */
  temperatureFitness: number
  /** Food / energy availability component 0-1 */
  foodFitness: number
  /** Survival under predation component 0-1 */
  predationFitness: number
  /** Size-metabolism efficiency component 0-1 */
  metabolicFitness: number
}

// Temperature bands (°C) mapped from tempPreference nibble (0-15)
// 0=psychrophile (<5°C), 5=mesophile (20-37°C), 10=thermophile (45-65°C), 15=hyperthermophile (>80°C)
const TEMP_PREFERENCE_CENTER = [
  -5,  // 0 psychrophile extreme cold
   0,  // 1
   5,  // 2
  10,  // 3
  15,  // 4
  28,  // 5 mesophile (E. coli optimum)
  37,  // 6 mesophile warm (human body temp)
  42,  // 7
  50,  // 8 thermophile
  55,  // 9
  65,  // 10
  72,  // 11
  80,  // 12 hyperthermophile
  90,  // 13
  100, // 14
  110, // 15
]

// Tolerance window (±°C) around preferred temp where fitness is > 0.1
// Extremophiles have tighter windows; mesophiles are more generalist
const TEMP_TOLERANCE_WIDTH = [
   5, 8, 8, 10, 12, 20, 20, 15, 12, 12, 10, 8, 8, 6, 6, 5,
]

/**
 * Evaluate fitness of a genome in a given environment.
 * Pure function — no side effects, no object allocation beyond the return value.
 */
export function evaluateFitness(genome: Genome, env: EnvironmentSample): FitnessBreakdown {
  const phenotype = encoder.decode(genome)

  // ── Temperature fitness ────────────────────────────────────────────────────
  // Gaussian bell curve centered on preferred temperature with biome-appropriate width
  const prefIdx    = Math.min(15, Math.max(0, phenotype.tempPreference))
  const prefCenter = TEMP_PREFERENCE_CENTER[prefIdx]
  const tolerance  = TEMP_TOLERANCE_WIDTH[prefIdx]
  const tempDelta  = Math.abs(env.temperature - prefCenter)
  // Score drops to ~0.37 at the tolerance boundary, ~0 at 2× tolerance
  const temperatureFitness = Math.exp(-(tempDelta * tempDelta) / (2 * tolerance * tolerance))

  // ── Food / energy availability ─────────────────────────────────────────────
  // Autotrophs (dietaryType=0, 2=mixotroph, 3=chemoautotroph) need light for photosynthesis.
  // Heterotrophs (dietaryType=1) are assumed to find prey — handled by population dynamics.
  let foodFitness: number
  if (phenotype.dietaryType === 0) {
    // Pure autotroph: fitness scales directly with light (normalized 0-255)
    foodFitness = env.light / 255
  } else if (phenotype.dietaryType === 2) {
    // Mixotroph: partial photosynthesis benefit + baseline heterotrophic ability
    foodFitness = 0.4 + 0.6 * (env.light / 255)
  } else if (phenotype.dietaryType === 3) {
    // Chemoautotroph: light-independent, moderate baseline fitness
    foodFitness = 0.65
  } else {
    // Heterotroph: food availability encoded via population density proxy
    // High density → competition → lower individual food access
    foodFitness = Math.max(0.1, 1.0 - env.populationDensity * 0.6)
  }

  // ── Predation survival ────────────────────────────────────────────────────
  // Defenses reduce predation mortality. Armor, camouflage, venom each contribute.
  let defenseScore = 0
  if (phenotype.hasArmor)      defenseScore += 0.25 + phenotype.armorThickness / 60
  if (phenotype.hasCamouflage) defenseScore += 0.20
  if (phenotype.hasVenom)      defenseScore += 0.10 + phenotype.venomPotency / 150
  // Swimming speed helps escape predators in aquatic environments
  defenseScore += phenotype.swimSpeed / 90

  // Clamp defense to [0, 0.9] — no organism is perfectly immune
  defenseScore = Math.min(0.9, defenseScore)
  // Predation fitness: high defense score reduces impact of predation pressure
  const predationFitness = 1.0 - env.predationPressure * (1.0 - defenseScore)

  // ── Metabolic efficiency ──────────────────────────────────────────────────
  // Large organisms with high metabolic rates need abundant food.
  // Small, slow-metabolism organisms are more efficient per unit of food.
  //
  // Penalty = metabolicRate × sizeClass / 225   (both 0-15, product 0-225)
  // Efficiency = 1 - penalty × food_scarcity
  const metabolicDemand = (phenotype.metabolicRate * (phenotype.sizeClass + 1)) / 240
  // Food scarcity amplifies metabolic penalty
  const foodScarcity    = 1.0 - foodFitness
  const metabolicFitness = Math.max(0.05, 1.0 - metabolicDemand * foodScarcity * 1.5)

  // ── Combine with weighted harmonic mean ──────────────────────────────────
  // Weights: temperature is most critical for primordial organisms,
  // followed by food, then metabolic efficiency, then predation (early life has no predators)
  const weights = [0.35, 0.30, 0.20, 0.15]
  const components = [temperatureFitness, foodFitness, metabolicFitness, predationFitness]

  // Harmonic mean: punishes any bottleneck severely
  let weightedInvSum = 0
  let totalWeight    = 0
  for (let i = 0; i < components.length; i++) {
    const c = Math.max(0.001, components[i]) // prevent division by zero
    weightedInvSum += weights[i] / c
    totalWeight    += weights[i]
  }
  const overall = totalWeight / weightedInvSum

  return {
    overall:           Math.max(0, Math.min(1, overall)),
    temperatureFitness: Math.max(0, Math.min(1, temperatureFitness)),
    foodFitness:        Math.max(0, Math.min(1, foodFitness)),
    predationFitness:   Math.max(0, Math.min(1, predationFitness)),
    metabolicFitness:   Math.max(0, Math.min(1, metabolicFitness)),
  }
}

/**
 * Compute Hamming distance (differing bits) between two genomes.
 * Used for speciation threshold detection.
 */
export function hammingDistance(a: Genome, b: Genome): number {
  let dist = 0
  for (let i = 0; i < 32; i++) {
    let xor = a[i] ^ b[i]
    // Count set bits (Brian Kernighan's method)
    while (xor) {
      xor &= xor - 1
      dist++
    }
  }
  return dist
}
