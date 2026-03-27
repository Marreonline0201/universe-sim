/**
 * SimulationBootstrap.ts
 *
 * Seeds 50-200 primordial organisms when a world is created.
 *
 * - Places organisms in warm shallow-water biomes on the sphere planet
 * - Creates 3-5 slightly different primordial genomes for genetic diversity
 * - All initial organisms are autotrophs (photosynthesize)
 * - Zero dependency on PlayerController or player stores
 * - Must complete in <100ms
 */

import type { Genome } from './GenomeEncoder'
import { GenomeEncoder } from './GenomeEncoder'
import { MutationEngine } from './MutationEngine'
import { SpeciesRegistry } from './SpeciesRegistry'
import { EcosystemBalance } from './EcosystemBalance'
import { NaturalSelectionSystem } from './NaturalSelectionSystem'

export interface BootstrapResult {
  registry:         SpeciesRegistry
  ecosystem:        EcosystemBalance
  selectionSystem:  NaturalSelectionSystem
  /** Number of organisms seeded */
  organismCount:    number
  /** IDs of the initial species registered */
  speciesIds:       number[]
  /** Elapsed time in ms */
  elapsedMs:        number
}

// ── Warm shallow-water biome descriptor ────────────────────────────────────

/** Biome label used throughout the biology and ecosystem systems. */
const WARM_SHALLOW_WATER_BIOME = 'coral_reef'

/**
 * Environment conditions for warm shallow tropical water.
 * Used as the seeding context for all primordial organisms.
 */
const WARM_SHALLOW_ENV = {
  temperature:       28,   // °C — tropical surface water
  light:             200,  // 0-255 — bright sunlit zone (photic zone)
  predationPressure: 0,    // no predators at time zero
  populationDensity: 0.01, // near-empty niche
}

// ── Genome diversity configuration ────────────────────────────────────────

/** Number of distinct primordial lineages to seed (genetic diversity). */
const PRIMORDIAL_LINEAGE_COUNT = 4

/**
 * Mutagen level applied to create initial genome diversity.
 * High enough to create measurable variation (Hamming distance ~5-15 bits apart),
 * but not so high that organisms immediately die.
 */
const BOOTSTRAP_MUTAGEN_LEVEL = 0.3

/** Total organisms to seed. Spread across all lineages. */
const ORGANISM_TARGET_MIN = 50
const ORGANISM_TARGET_MAX = 120

// ── Seeded LCG for deterministic bootstrapping ────────────────────────────

function makeLcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// ── Bootstrap entry point ─────────────────────────────────────────────────

/**
 * Seeds the simulation with primordial organisms.
 *
 * @param planetRadius Radius of the planet in meters. Used to derive a
 *                     sensible carrying capacity for the initial biome.
 * @param seed         Optional deterministic seed (defaults to 42).
 */
export function bootstrapSimulation(
  planetRadius: number,
  seed = 42
): BootstrapResult {
  const t0  = performance.now()
  const rng = makeLcgRng(seed)

  // ── Create core systems ─────────────────────────────────────────────────
  const registry        = new SpeciesRegistry()
  const ecosystem       = new EcosystemBalance()
  const selectionSystem = new NaturalSelectionSystem(registry, ecosystem, rng)

  // ── Determine organism count scaled to planet size ──────────────────────
  // Small planets (r < 1000 km) get fewer organisms; larger get more.
  // Clamp to min/max range.
  const radiusKm    = planetRadius / 1000
  const scaleFactor = Math.min(1, Math.max(0, Math.log10(radiusKm / 100 + 1)))
  const targetCount = Math.round(
    ORGANISM_TARGET_MIN + scaleFactor * (ORGANISM_TARGET_MAX - ORGANISM_TARGET_MIN)
  )
  const organismCount = Math.max(ORGANISM_TARGET_MIN, Math.min(ORGANISM_TARGET_MAX, targetCount))

  const encoder   = new GenomeEncoder()
  const mutEngine = new MutationEngine()

  // ── Create primordial genome templates ──────────────────────────────────
  // Start from LUCA (Last Universal Common Ancestor) prototype and apply
  // controlled mutations to create a handful of distinct starting lineages.
  const baseGenome = encoder.createPrimordialGenome()

  // Ensure autotroph (dietaryType=0) and mesophile (tempPreference=5 ≈ 28°C)
  encoder.setBits(baseGenome, 24, 4, 0) // dietaryType = autotroph
  encoder.setBits(baseGenome, 20, 4, 5) // tempPreference = mesophile/warm

  const primordialGenomes: Genome[] = []
  for (let i = 0; i < PRIMORDIAL_LINEAGE_COUNT; i++) {
    const variantGenome = baseGenome.slice() as Genome
    // Apply moderate mutations for diversity; skip if lethal result
    mutEngine.mutate(variantGenome, BOOTSTRAP_MUTAGEN_LEVEL, 1, rng, 0)

    // Enforce autotroph regardless of mutation (founding organisms must photosynthesize)
    encoder.setBits(variantGenome, 24, 4, 0) // dietaryType = 0 (autotroph)

    // Enforce non-lethal
    if (mutEngine.isLethal(variantGenome)) {
      // Fall back to base genome for this lineage
      primordialGenomes.push(baseGenome.slice() as Genome)
    } else {
      primordialGenomes.push(variantGenome)
    }
  }

  // ── Register species in the SpeciesRegistry ─────────────────────────────
  const speciesIds: number[] = []
  const carryingCapacity = ecosystem.getCarryingCapacity(WARM_SHALLOW_WATER_BIOME, 'producer')
  // Scale by approximate biome area (very rough — 1% of planet surface)
  const planetSurfaceKm2     = 4 * Math.PI * (planetRadius / 1000) ** 2
  const biomeAreaKm2         = planetSurfaceKm2 * 0.01
  const scaledCarryingCap    = Math.round(carryingCapacity * biomeAreaKm2)

  for (let i = 0; i < PRIMORDIAL_LINEAGE_COUNT; i++) {
    const initialPop = Math.floor(organismCount / PRIMORDIAL_LINEAGE_COUNT)

    const species = registry.register(
      primordialGenomes[i],
      null, // no parent — first life
      0,    // simTime = 0
      {
        initialPop,
        biome:        [WARM_SHALLOW_WATER_BIOME],
        trophicLevel: 'producer',
      }
    )
    speciesIds.push(species.id)

    // Register in ecosystem dynamics
    ecosystem.addSpecies(species.id, initialPop, {
      speciesId:        species.id,
      population:       initialPop,
      growthRate:       0.8,          // autotrophs grow reasonably fast
      carryingCapacity: scaledCarryingCap > 0 ? scaledCarryingCap : 10000,
      preyOf:           [],
      preyUpon:         [],
    })
  }

  // ── Seed individual organisms into the selection system ─────────────────
  let seeded = 0
  for (let i = 0; i < PRIMORDIAL_LINEAGE_COUNT; i++) {
    const speciesId = speciesIds[i]
    const genome    = primordialGenomes[i]
    const lineageShare = Math.round(
      i < PRIMORDIAL_LINEAGE_COUNT - 1
        ? organismCount / PRIMORDIAL_LINEAGE_COUNT
        : organismCount - seeded
    )

    for (let j = 0; j < lineageShare; j++) {
      // Give each individual a slightly different genome (minor drift)
      const indGenome = genome.slice() as Genome
      // Very low individual variance — just a few bit flips
      mutEngine.mutate(indGenome, 0.05, 1, rng, 0)
      // Re-enforce autotroph
      encoder.setBits(indGenome, 24, 4, 0)

      if (!mutEngine.isLethal(indGenome)) {
        selectionSystem.addOrganism(speciesId, indGenome, WARM_SHALLOW_WATER_BIOME)
        seeded++
      }
    }
  }

  // ── Verify quality gate ─────────────────────────────────────────────────
  const actualCount = selectionSystem.getOrganismCount()
  if (actualCount < 50) {
    // Fallback: seed remaining with base genome to guarantee ≥50
    const deficit     = 50 - actualCount
    const fallbackSid = speciesIds[0]
    for (let i = 0; i < deficit; i++) {
      const fb = baseGenome.slice() as Genome
      encoder.setBits(fb, 24, 4, 0)
      selectionSystem.addOrganism(fallbackSid, fb, WARM_SHALLOW_WATER_BIOME)
    }
  }

  return {
    registry,
    ecosystem,
    selectionSystem,
    organismCount: selectionSystem.getOrganismCount(),
    speciesIds,
    elapsedMs: performance.now() - t0,
  }
}
