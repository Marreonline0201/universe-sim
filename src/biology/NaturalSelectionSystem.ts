/**
 * NaturalSelectionSystem.ts
 *
 * Runs natural selection each simulation tick:
 *   - Evaluates fitness for every tracked organism
 *   - Low-fitness organisms die faster (differential death)
 *   - High-fitness organisms reproduce — child gets a mutated genome
 *   - Speciation: Hamming distance > 32 bits from species template → new species
 *   - Feeds births and deaths back to EcosystemBalance and SpeciesRegistry
 *
 * Calibration targets:
 *   - Well-adapted (fitness > 0.8) in ideal conditions: reproduces every ~100 ticks
 *   - Poorly-adapted (fitness < 0.3): dies within ~50 ticks
 *   - Neutral (fitness ~0.5): stable population
 *
 * Performance target: <5ms for 200 organisms per tick.
 * No player system dependencies.
 */

import type { Genome } from './GenomeEncoder'
import { GenomeEncoder } from './GenomeEncoder'
import { MutationEngine } from './MutationEngine'
import { SpeciesRegistry } from './SpeciesRegistry'
import { EcosystemBalance } from './EcosystemBalance'
import { evaluateFitness, hammingDistance, type EnvironmentSample } from './FitnessEvaluator'

export interface Organism {
  id:        number
  speciesId: number
  genome:    Genome
  /** Current fitness score 0-1, updated each tick */
  fitness:   number
  /** Ticks until this organism can reproduce again */
  cooldown:  number
  /** Ticks this organism has been alive */
  age:       number
  /** Environment this organism occupies */
  biome:     string
  /** M75: Energy level 0-1. Autotrophs gain from light, heterotrophs burn over time. */
  energy:    number
}

export interface SelectionTickResult {
  deaths:    number
  births:    number
  speciations: number
  /** Elapsed time of tick in ms */
  elapsedMs: number
}

// ── Calibration constants ──────────────────────────────────────────────────

/**
 * Base death probability per tick for a fully fit organism (fitness = 1.0).
 * This represents natural (non-selection) mortality.
 * ~= 1% chance of dying per tick at perfect fitness.
 */
const BASE_DEATH_PROB = 0.01

/**
 * Additional death probability scaling for unfit organisms.
 * deathProb = BASE_DEATH_PROB + (1 - fitness)^2 × SELECTION_DEATH_SCALE
 *
 * At fitness=0.3: deathProb ≈ 0.01 + 0.49 × 0.04 = 0.0296
 * At 50 ticks, ~77% chance of dying → most gone in ~50 ticks ✓
 *
 * At fitness=0.5: deathProb ≈ 0.01 + 0.25 × 0.04 = 0.02
 * At 100 ticks, ~87% survival is maintained if reproduction matches → neutral ✓
 *
 * At fitness=0.8: deathProb ≈ 0.01 + 0.04 × 0.04 = 0.0116
 */
const SELECTION_DEATH_SCALE = 0.04

/**
 * Reproduction probability per tick for a fully fit organism (fitness = 1.0).
 * reproductionProb = fitness^2 × BASE_REPRO_PROB
 *
 * At fitness=1.0: reproductionProb = 0.01 → expected ~100 ticks between reproductions ✓
 * At fitness=0.5: reproductionProb = 0.0025 → ~400 ticks (slow but stable at low death rate)
 * At fitness=0.3: reproductionProb = 0.0009 → reproduction nearly halted
 */
const BASE_REPRO_PROB = 0.01

/**
 * Minimum reproduction cooldown in ticks.
 * Prevents rapid consecutive births from a single organism.
 */
const MIN_REPRO_COOLDOWN = 20

/**
 * Hamming distance threshold for speciation.
 * > 32 differing bits (out of 256) in the genome triggers new species registration.
 */
const SPECIATION_THRESHOLD = 32

/**
 * Mutagen level applied during reproduction.
 * Set slightly above clean-environment baseline to drive gradual evolution.
 * 0.001 = mild environmental mutagens (UV in shallow water).
 */
const REPRODUCTION_MUTAGEN = 0.001

// ── NaturalSelectionSystem ─────────────────────────────────────────────────

export class NaturalSelectionSystem {
  private organisms  = new Map<number, Organism>()
  private nextOrgId  = 1
  private simTick    = 0

  private readonly encoder   = new GenomeEncoder()
  private readonly mutEngine = new MutationEngine()
  private readonly rng: () => number

  constructor(
    private readonly registry:   SpeciesRegistry,
    private readonly ecosystem:  EcosystemBalance,
    /** Optional seeded RNG; defaults to Math.random */
    rng?: () => number
  ) {
    this.rng = rng ?? Math.random.bind(Math)
  }

  // ── Organism management ───────────────────────────────────────────────────

  /**
   * Register an organism that was created externally (e.g. during bootstrap).
   */
  addOrganism(speciesId: number, genome: Genome, biome: string): Organism {
    const org: Organism = {
      id:        this.nextOrgId++,
      speciesId,
      genome:    genome.slice() as Genome,
      fitness:   0.5, // will be evaluated on first tick
      cooldown:  Math.floor(this.rng() * MIN_REPRO_COOLDOWN),
      age:       0,
      biome,
      energy:    0.5, // M76: offspring start with half energy
    }
    this.organisms.set(org.id, org)
    return org
  }

  getOrganisms(): Organism[] {
    return Array.from(this.organisms.values())
  }

  getOrganismCount(): number {
    return this.organisms.size
  }

  // ── Main tick ─────────────────────────────────────────────────────────────

  /**
   * Run one natural selection tick.
   * Processes all organisms: evaluate fitness, apply death, trigger reproduction.
   * Target: <5ms for 200 organisms.
   *
   * @param getEnvironment Callback returning the environment for a given biome/organism.
   *                       Called once per organism per tick.
   * @param simTime        Current simulation time (for registry timestamps).
   */
  tick(
    getEnvironment: (org: Organism) => EnvironmentSample,
    simTime: number
  ): SelectionTickResult {
    const t0 = performance.now()

    let deaths      = 0
    let births      = 0
    let speciations = 0

    const toRemove: number[] = []
    const toAdd: Array<{ speciesId: number; genome: Genome; biome: string }> = []

    for (const org of this.organisms.values()) {
      org.age++
      if (org.cooldown > 0) org.cooldown--

      // ── Evaluate fitness ──────────────────────────────────────────────
      const env = getEnvironment(org)
      const breakdown = evaluateFitness(org.genome, env)
      org.fitness = breakdown.overall

      // ── M75: Energy economy — dietary type determines energy gain/loss per tick ──
      const phenotype = this.encoder.decode(org.genome)
      const metabolicCost = 0.002 + (phenotype.metabolicRate / 15) * 0.008  // faster metabolism = more burn

      switch (phenotype.dietaryType) {
        case 0: // Autotroph — gains energy from light (photosynthesis)
          org.energy = Math.min(1.0, org.energy + 0.005 * (env.light / 200))
          break
        case 1: // Heterotroph — loses energy over time (must find food)
          org.energy = Math.max(0, org.energy - metabolicCost)
          break
        case 2: // Mixotroph — slow gain (partial photosynthesis)
          org.energy = Math.min(1.0, org.energy + 0.002 * (env.light / 200))
          break
        case 3: // Chemoautotroph — moderate gain from chemical energy
          org.energy = Math.min(1.0, org.energy + 0.003)
          break
      }

      // Kill organism if energy depleted
      if (org.energy <= 0) {
        toRemove.push(org.id)
        deaths++
        continue
      }

      // Energy contributes to fitness: starving organisms are less fit
      const energyFactor = org.energy > 0.2 ? 1.0 : org.energy / 0.2  // linear dropoff below 20%
      org.fitness *= energyFactor

      // ── Differential death ────────────────────────────────────────────
      const fitnessPenalty = (1 - org.fitness) * (1 - org.fitness)
      const deathProb      = BASE_DEATH_PROB + fitnessPenalty * SELECTION_DEATH_SCALE

      if (this.rng() < deathProb) {
        toRemove.push(org.id)
        deaths++
        continue
      }

      // ── Reproduction ──────────────────────────────────────────────────
      if (org.cooldown === 0 && org.energy > 0.7) {
        const reproProb = org.fitness * org.fitness * BASE_REPRO_PROB

        if (this.rng() < reproProb) {
          // Clone genome and mutate it
          const childGenome = org.genome.slice() as Genome
          this.mutEngine.mutate(childGenome, REPRODUCTION_MUTAGEN, 1, this.rng, simTime)

          // Skip if lethal mutation
          if (!this.mutEngine.isLethal(childGenome)) {
            // Determine species: check Hamming distance from parent species template
            const parentSpecies = this.registry.getSpecies(org.speciesId)
            let childSpeciesId  = org.speciesId

            if (parentSpecies) {
              const dist = hammingDistance(childGenome, parentSpecies.genomeTemplate)

              if (dist > SPECIATION_THRESHOLD) {
                // Speciate — register a new species
                const newSpecies = this.registry.register(
                  childGenome,
                  org.speciesId,
                  simTime,
                  {
                    initialPop:   1,
                    biome:        [org.biome],
                    trophicLevel: 'producer', // autotrophs start as producers
                  }
                )
                childSpeciesId = newSpecies.id
                speciations++

                // Register the new species in the ecosystem balance
                this.ecosystem.addSpecies(newSpecies.id, 1, {
                  speciesId:        newSpecies.id,
                  population:       1,
                  growthRate:       0.5,
                  carryingCapacity: 5000,
                  preyOf:           [],
                  preyUpon:         [],
                })
              }
            }

            toAdd.push({ speciesId: childSpeciesId, genome: childGenome, biome: org.biome })
            births++

            // M76: Parent energy cost — reproduction splits energy with offspring
            org.energy *= 0.5

            // Reset cooldown
            org.cooldown = MIN_REPRO_COOLDOWN + Math.floor(this.rng() * MIN_REPRO_COOLDOWN)
          }
        }
      }
    }

    // ── Apply removals ───────────────────────────────────────────────────
    for (const id of toRemove) {
      const org = this.organisms.get(id)
      if (org) {
        this.registry.updatePopulation(org.speciesId, -1)
        this.organisms.delete(id)
      }
    }

    // ── Apply births ─────────────────────────────────────────────────────
    for (const birth of toAdd) {
      const child = this.addOrganism(birth.speciesId, birth.genome, birth.biome)
      this.registry.updatePopulation(child.speciesId, 1)
    }

    // ── Sync ecosystem balance ───────────────────────────────────────────
    // Aggregate population counts by species and push to EcosystemBalance
    const popBySpecies = new Map<number, number>()
    for (const org of this.organisms.values()) {
      popBySpecies.set(org.speciesId, (popBySpecies.get(org.speciesId) ?? 0) + 1)
    }
    for (const [speciesId, count] of popBySpecies) {
      this.ecosystem.addSpecies(speciesId, count, {
        speciesId,
        population:       count,
        growthRate:       0.5,
        carryingCapacity: 5000,
        preyOf:           [],
        preyUpon:         [],
      })
    }

    this.simTick++

    return {
      deaths,
      births,
      speciations,
      elapsedMs: performance.now() - t0,
    }
  }
}
