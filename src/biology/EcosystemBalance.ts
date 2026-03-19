/**
 * EcosystemBalance.ts
 *
 * Multi-species Lotka-Volterra predator-prey dynamics with:
 *   - Generalized N-species LV equations with carrying capacity (logistic growth)
 *   - 4th-order Runge-Kutta (RK4) integration for numerical stability
 *   - Evolutionary arms race tracking (escalation index)
 *   - Biome-specific carrying capacity estimates
 *   - Collapse risk assessment
 *
 * Mathematical model:
 *
 *   Logistic growth with predation (per species i):
 *
 *   dNᵢ/dt = rᵢ × Nᵢ × (1 - Nᵢ/Kᵢ)
 *            - Σⱼ βᵢⱼ × Nᵢ × Nⱼ   (predation losses: j preys on i)
 *            + Σⱼ δⱼᵢ × Nᵢ × Nⱼ   (predation gains: i preys on j, conversion efficiency δ)
 *
 *   Classic LV (no carrying capacity):
 *     dPrey/dt      = α × Prey - β × Prey × Predator
 *     dPredator/dt  = δ × Prey × Predator - γ × Predator
 *
 *   Real parameter ranges:
 *     α (prey growth rate):          0.5 – 2.0 /year
 *     β (predation rate):            0.01 – 0.1
 *     γ (predator natural mortality): 0.1 – 0.5 /year
 *     δ (predator conversion efficiency): 0.01 – 0.1
 *     K (carrying capacity):         biome-dependent (see BIOME_CARRYING_CAPACITY)
 */

export interface PredatorPreyRelation {
  predatorSpeciesId: number
  preySpeciesId:     number
  /** β: rate at which predators kill prey (per predator per prey per year) */
  predationRate:     number
  /** δ: fraction of consumed prey converted to predator biomass */
  conversionEfficiency: number
}

export interface PopulationDynamics {
  speciesId:        number
  population:       number
  /** α: intrinsic growth rate (/year). For predators, this is negative (natural mortality γ). */
  growthRate:       number
  /** K: carrying capacity. 0 or Infinity = no cap (classic LV). */
  carryingCapacity: number
  /** Predator-prey relationships where this species is the prey */
  preyOf:     Array<{ predatorSpeciesId: number; predationRate: number }>
  /** Predator-prey relationships where this species is the predator */
  preyUpon:   Array<{ preySpeciesId: number; predationRate: number }>
}

// ─── Biome carrying capacity estimates ────────────────────────────────────────
// Real-world approximate values in individuals/km² for a "medium" organism.
// Source: empirical ecology literature (Whittaker 1975, Sala 2000, IPCC AR6)

type BiomeKey =
  | 'tropical_rainforest' | 'temperate_forest' | 'boreal_forest'
  | 'tropical_grassland'  | 'temperate_grassland' | 'desert'
  | 'tundra' | 'wetland' | 'coral_reef' | 'open_ocean' | 'deep_ocean'
  | 'freshwater' | 'mangrove' | 'alpine' | 'cave'

const BIOME_CARRYING_CAPACITY: Record<BiomeKey, Record<string, number>> = {
  tropical_rainforest: {
    producer:            50000,  // plants/km²
    primary_consumer:    2000,
    secondary_consumer:  200,
    tertiary_consumer:   10,
    decomposer:          100000,
    omnivore:            500,
  },
  temperate_forest: {
    producer:            30000,
    primary_consumer:    1000,
    secondary_consumer:  100,
    tertiary_consumer:   5,
    decomposer:          50000,
    omnivore:            200,
  },
  boreal_forest: {
    producer:            15000,
    primary_consumer:    500,
    secondary_consumer:  50,
    tertiary_consumer:   2,
    decomposer:          20000,
    omnivore:            100,
  },
  tropical_grassland: {
    producer:            20000,
    primary_consumer:    5000,
    secondary_consumer:  300,
    tertiary_consumer:   15,
    decomposer:          30000,
    omnivore:            800,
  },
  temperate_grassland: {
    producer:            10000,
    primary_consumer:    2000,
    secondary_consumer:  100,
    tertiary_consumer:   5,
    decomposer:          15000,
    omnivore:            300,
  },
  desert: {
    producer:            500,
    primary_consumer:    50,
    secondary_consumer:  5,
    tertiary_consumer:   0.5,
    decomposer:          1000,
    omnivore:            20,
  },
  tundra: {
    producer:            1000,
    primary_consumer:    200,
    secondary_consumer:  20,
    tertiary_consumer:   1,
    decomposer:          5000,
    omnivore:            50,
  },
  wetland: {
    producer:            40000,
    primary_consumer:    3000,
    secondary_consumer:  400,
    tertiary_consumer:   20,
    decomposer:          80000,
    omnivore:            600,
  },
  coral_reef: {
    producer:            100000,
    primary_consumer:    10000,
    secondary_consumer:  1000,
    tertiary_consumer:   50,
    decomposer:          200000,
    omnivore:            2000,
  },
  open_ocean: {
    producer:            10000,  // phytoplankton-equivalent
    primary_consumer:    1000,
    secondary_consumer:  50,
    tertiary_consumer:   2,
    decomposer:          5000,
    omnivore:            100,
  },
  deep_ocean: {
    producer:            10,
    primary_consumer:    5,
    secondary_consumer:  1,
    tertiary_consumer:   0.1,
    decomposer:          100,
    omnivore:            2,
  },
  freshwater: {
    producer:            25000,
    primary_consumer:    2000,
    secondary_consumer:  200,
    tertiary_consumer:   10,
    decomposer:          50000,
    omnivore:            400,
  },
  mangrove: {
    producer:            35000,
    primary_consumer:    3000,
    secondary_consumer:  300,
    tertiary_consumer:   15,
    decomposer:          60000,
    omnivore:            500,
  },
  alpine: {
    producer:            5000,
    primary_consumer:    300,
    secondary_consumer:  30,
    tertiary_consumer:   2,
    decomposer:          10000,
    omnivore:            80,
  },
  cave: {
    producer:            100,   // chemolithotrophs
    primary_consumer:    20,
    secondary_consumer:  5,
    tertiary_consumer:   0.5,
    decomposer:          500,
    omnivore:            10,
  },
}

// ─── Arms race tracking ──────────────────────────────────────────────────────

interface ArmsRaceRecord {
  predatorId:      number
  preyId:          number
  escalationScore: number  // cumulative escalation index (increases when both adapt)
  /** Historical snapshots for trend analysis */
  history:         Array<{ time: number; predatorFitness: number; preyFitness: number }>
}

// ─── EcosystemBalance ────────────────────────────────────────────────────────

export class EcosystemBalance {
  private populations = new Map<number, PopulationDynamics>()
  private relations   = new Map<string, PredatorPreyRelation>()  // key = `${predatorId}:${preyId}`
  private armsRaces   = new Map<string, ArmsRaceRecord>()
  private simTime     = 0  // current simulation time (years)

  // ─── Species management ────────────────────────────────────────────────

  addSpecies(speciesId: number, initialPop: number, role: PopulationDynamics): void {
    this.populations.set(speciesId, {
      ...role,
      speciesId,
      population: Math.max(0, initialPop),
    })
  }

  removeSpecies(speciesId: number): void {
    this.populations.delete(speciesId)

    // Clean up relations involving this species
    for (const key of this.relations.keys()) {
      const [p, r] = key.split(':').map(Number)
      if (p === speciesId || r === speciesId) {
        this.relations.delete(key)
      }
    }
  }

  addPredatorPreyRelationship(
    predatorId:  number,
    preyId:      number,
    /** β: predation rate (prey killed per predator per prey per year) */
    predationRate:        number,
    /** δ: conversion efficiency (fraction of killed prey → new predator biomass) */
    conversionEfficiency = 0.1
  ): void {
    const key      = `${predatorId}:${preyId}`
    const relation: PredatorPreyRelation = {
      predatorSpeciesId: predatorId,
      preySpeciesId:     preyId,
      predationRate:     Math.max(0, predationRate),
      conversionEfficiency: Math.max(0, Math.min(1, conversionEfficiency)),
    }
    this.relations.set(key, relation)

    // Update the PopulationDynamics cross-references
    const predator = this.populations.get(predatorId)
    if (predator) {
      const existing = predator.preyUpon.findIndex(r => r.preySpeciesId === preyId)
      if (existing >= 0) {
        predator.preyUpon[existing].predationRate = predationRate
      } else {
        predator.preyUpon.push({ preySpeciesId: preyId, predationRate })
      }
    }

    const prey = this.populations.get(preyId)
    if (prey) {
      const existing = prey.preyOf.findIndex(r => r.predatorSpeciesId === predatorId)
      if (existing >= 0) {
        prey.preyOf[existing].predationRate = predationRate
      } else {
        prey.preyOf.push({ predatorSpeciesId: predatorId, predationRate })
      }
    }

    // Initialize arms race record
    if (!this.armsRaces.has(key)) {
      this.armsRaces.set(key, {
        predatorId,
        preyId,
        escalationScore: 0,
        history: [],
      })
    }
  }

  getPopulation(speciesId: number): number {
    return this.populations.get(speciesId)?.population ?? 0
  }

  // ─── RK4 Integration ──────────────────────────────────────────────────

  /**
   * Advance all population dynamics by dtYears using 4th-order Runge-Kutta.
   *
   * RK4 provides O(h⁴) accuracy per step, far superior to Euler's O(h) and
   * critical for stability of LV equations (which oscillate near fixed points).
   *
   * For dt > 0.1 years, the integrator automatically sub-steps to maintain
   * numerical stability (step size ≤ 0.05 years).
   */
  tick(dtYears: number): void {
    if (dtYears <= 0) return

    // Sub-step for numerical stability
    const maxStepSize = 0.05  // years (≈18 days)
    const steps       = Math.ceil(dtYears / maxStepSize)
    const dt          = dtYears / steps

    for (let step = 0; step < steps; step++) {
      this.rk4Step(dt)
    }

    this.simTime += dtYears

    // Update arms race escalation scores
    this.updateArmsRaces()
  }

  /**
   * Single RK4 integration step.
   *
   * For N populations y = [N₁, N₂, ..., Nₙ]:
   *   k₁ = f(t,       y)
   *   k₂ = f(t + h/2, y + h/2 × k₁)
   *   k₃ = f(t + h/2, y + h/2 × k₂)
   *   k₄ = f(t + h,   y + h   × k₃)
   *   y(t+h) = y + h/6 × (k₁ + 2k₂ + 2k₃ + k₄)
   */
  private rk4Step(dt: number): void {
    const ids      = Array.from(this.populations.keys())
    const popVec   = ids.map(id => this.populations.get(id)!.population)

    const f = (pops: number[]): number[] => this.derivatives(ids, pops)

    const k1 = f(popVec)
    const k2 = f(popVec.map((p, i) => p + dt * 0.5 * k1[i]))
    const k3 = f(popVec.map((p, i) => p + dt * 0.5 * k2[i]))
    const k4 = f(popVec.map((p, i) => p + dt * k3[i]))

    for (let i = 0; i < ids.length; i++) {
      const newPop = popVec[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
      const dyn    = this.populations.get(ids[i])!

      // Floor at 0 (extinction boundary) and at carrying capacity
      dyn.population = Math.max(0, newPop)
      if (dyn.carryingCapacity > 0 && isFinite(dyn.carryingCapacity)) {
        dyn.population = Math.min(dyn.population, dyn.carryingCapacity * 2)  // allow 2× K temporarily
      }
    }
  }

  /**
   * Compute dN/dt for all species simultaneously.
   *
   * Generalized Lotka-Volterra with logistic growth:
   *
   * For species i:
   *   dNᵢ/dt = rᵢ × Nᵢ × (1 - Nᵢ/Kᵢ)          ← logistic term
   *            - Σⱼ βⱼᵢ × Nⱼ × Nᵢ               ← predation losses (j eats i)
   *            + Σⱼ δᵢⱼ × βᵢⱼ × Nᵢ × Nⱼ         ← predation gains (i eats j)
   *
   * If Kᵢ = Infinity or 0: use classic LV (no logistic cap)
   */
  private derivatives(ids: number[], pops: number[]): number[] {
    const derivs = new Array(ids.length).fill(0)

    // Build a lookup: speciesId → index in ids/pops array
    const idx = new Map<number, number>()
    ids.forEach((id, i) => idx.set(id, i))

    for (let i = 0; i < ids.length; i++) {
      const id   = ids[i]
      const dyn  = this.populations.get(id)!
      const Ni   = pops[i]

      if (Ni <= 0) {
        derivs[i] = 0
        continue
      }

      // Logistic growth term
      let dN = dyn.growthRate * Ni
      if (dyn.carryingCapacity > 0 && isFinite(dyn.carryingCapacity)) {
        dN *= (1 - Ni / dyn.carryingCapacity)
      }

      // Predation losses: j preys on i
      for (const rel of dyn.preyOf) {
        const j     = idx.get(rel.predatorSpeciesId)
        if (j === undefined) continue
        const Nj    = Math.max(0, pops[j])
        dN -= rel.predationRate * Ni * Nj
      }

      // Predation gains: i preys on j
      for (const rel of dyn.preyUpon) {
        const j     = idx.get(rel.preySpeciesId)
        if (j === undefined) continue
        const Nj    = Math.max(0, pops[j])
        const key   = `${id}:${rel.preySpeciesId}`
        const relation = this.relations.get(key)
        const delta = relation?.conversionEfficiency ?? 0.1
        dN += delta * rel.predationRate * Ni * Nj
      }

      derivs[i] = dN
    }

    return derivs
  }

  // ─── Carrying capacity ────────────────────────────────────────────────

  /**
   * Real-world carrying capacity estimate for a biome and trophic level.
   * Returns individuals per km². Caller must scale by area.
   */
  getCarryingCapacity(biomeId: string, trophicLevel: string): number {
    const biome  = BIOME_CARRYING_CAPACITY[biomeId as BiomeKey]
    if (!biome) {
      // Unknown biome — use temperate forest as default
      return BIOME_CARRYING_CAPACITY.temperate_forest[trophicLevel] ?? 100
    }
    return biome[trophicLevel] ?? 100
  }

  // ─── Collapse risk ────────────────────────────────────────────────────

  /**
   * Assess population collapse risk for each species.
   *
   * Risk levels:
   *   critical: population < 1% of peak OR < 10 individuals (minimum viable population)
   *   high:     population < 5% of peak OR all food sources at critical risk
   *   medium:   population < 20% of peak OR declining > 50% per year
   *   low:      otherwise
   */
  checkCollapseRisk(): Array<{
    speciesId:  number
    riskLevel:  'low' | 'medium' | 'high' | 'critical'
    reason:     string
  }> {
    const results: Array<{ speciesId: number; riskLevel: 'low' | 'medium' | 'high' | 'critical'; reason: string }> = []

    // Minimum viable population threshold (real MVP for vertebrates ≈ 50-500)
    const MVP = 50

    for (const [id, dyn] of this.populations) {
      const N    = dyn.population
      const K    = dyn.carryingCapacity || Infinity
      const Krat = isFinite(K) ? N / K : 1

      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
      let reason = ''

      if (N < MVP || N < 1) {
        riskLevel = 'critical'
        reason    = `Population ${N.toFixed(0)} below minimum viable population (${MVP})`
      } else if (Krat < 0.01) {
        riskLevel = 'critical'
        reason    = `Population at ${(Krat * 100).toFixed(2)}% of carrying capacity`
      } else if (Krat < 0.05) {
        riskLevel = 'high'
        reason    = `Population at ${(Krat * 100).toFixed(1)}% of carrying capacity`
      } else if (Krat < 0.2) {
        // Check if prey are also at risk (cascade collapse)
        const preyAtRisk = dyn.preyUpon.some(rel => {
          const prey = this.populations.get(rel.preySpeciesId)
          if (!prey) return false
          const preyK = prey.carryingCapacity || Infinity
          return isFinite(preyK) ? prey.population / preyK < 0.05 : prey.population < MVP
        })

        riskLevel = preyAtRisk ? 'high' : 'medium'
        reason    = preyAtRisk
          ? `Population low and prey species also at risk — cascade collapse possible`
          : `Population at ${(Krat * 100).toFixed(1)}% of carrying capacity`
      }

      results.push({ speciesId: id, riskLevel, reason })
    }

    // Sort by risk level severity
    const riskOrder: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }
    results.sort((a, b) => riskOrder[b.riskLevel] - riskOrder[a.riskLevel])

    return results
  }

  // ─── Evolutionary arms race ───────────────────────────────────────────

  /**
   * Track predator-prey arms race escalation (Red Queen dynamics).
   *
   * Escalation score increases when:
   *   - Both predator and prey populations cycle with increasing amplitude
   *   - Predation rate has been modified (via genome-driven trait changes)
   *
   * This models the "Red Queen" hypothesis: species must continually evolve
   * just to maintain their relative fitness against co-evolving partners.
   * (Van Valen 1973 — each species runs to stay in the same place.)
   */
  getEvolutionaryArmsRace(): Array<{
    predatorId:      number
    preyId:          number
    escalationScore: number
  }> {
    const results: Array<{ predatorId: number; preyId: number; escalationScore: number }> = []

    for (const [, race] of this.armsRaces) {
      results.push({
        predatorId:      race.predatorId,
        preyId:          race.preyId,
        escalationScore: race.escalationScore,
      })
    }

    // Sort by escalation intensity (most intense arms races first)
    results.sort((a, b) => b.escalationScore - a.escalationScore)
    return results
  }

  /**
   * Update arms race escalation scores based on current population dynamics.
   * Called automatically in tick().
   *
   * Escalation model:
   *   - If predator and prey populations are both large → low pressure, score decays
   *   - If prey is near collapse (predator winning) or predator is starving (prey winning)
   *     → score increases (selective pressure for adaptation)
   *   - Oscillating cycles with increasing amplitude → higher score
   */
  private updateArmsRaces(): void {
    for (const [key, race] of this.armsRaces) {
      const predator = this.populations.get(race.predatorId)
      const prey     = this.populations.get(race.preyId)

      if (!predator || !prey) continue

      const predPop  = predator.population
      const preyPop  = prey.population
      const predK    = predator.carryingCapacity || Infinity
      const preyK    = prey.carryingCapacity || Infinity

      const predRat  = isFinite(predK) ? predPop / predK : 0.5
      const preyRat  = isFinite(preyK) ? preyPop / preyK : 0.5

      // Record snapshot
      race.history.push({
        time:           this.simTime,
        predatorFitness: predRat,
        preyFitness:    preyRat,
      })

      // Keep only last 100 snapshots
      if (race.history.length > 100) race.history.shift()

      // Escalation signal: imbalance between predator and prey success
      // If one is thriving at the expense of the other → selection pressure → arms race
      const imbalance = Math.abs(predRat - preyRat)

      // Compute variance in recent history (oscillation amplitude)
      let oscillationAmplitude = 0
      if (race.history.length >= 4) {
        const recentPrey = race.history.slice(-10).map(h => h.preyFitness)
        const meanPrey   = recentPrey.reduce((a, b) => a + b, 0) / recentPrey.length
        const varPrey    = recentPrey.reduce((a, b) => a + (b - meanPrey) ** 2, 0) / recentPrey.length
        oscillationAmplitude = Math.sqrt(varPrey)
      }

      // Escalation increases with imbalance and oscillation; decays slowly toward zero
      const escalationDelta = imbalance * 2 + oscillationAmplitude * 5 - 0.01  // slow decay
      race.escalationScore  = Math.max(0, race.escalationScore + escalationDelta)
    }
  }

  // ─── Bulk queries ─────────────────────────────────────────────────────

  getAllPopulations(): Map<number, number> {
    const result = new Map<number, number>()
    for (const [id, dyn] of this.populations) {
      result.set(id, dyn.population)
    }
    return result
  }

  getTotalBiomass(): number {
    let total = 0
    for (const dyn of this.populations.values()) {
      total += dyn.population
    }
    return total
  }

  getSimTime(): number {
    return this.simTime
  }
}
