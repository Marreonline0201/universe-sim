/**
 * SimulationIntegration.ts
 *
 * Bridge between NaturalSelectionSystem (pure data organisms) and the ECS/renderer.
 *
 * Responsibilities:
 *   1. On bootstrap: call bootstrapSimulation(), create ECS entities for each organism
 *   2. Each tick: call NaturalSelectionSystem.tick(), sync births/deaths to ECS
 *   3. Maintain a bidirectional map: NaturalSelection organism ID <-> ECS entity ID
 *
 * The CreatureRenderer queries ECS entities with Position + CreatureBody, so
 * organisms become visible automatically once they have ECS entities.
 *
 * Zero dependency on player systems.
 */

import { GenomeEncoder } from './GenomeEncoder'
import { bootstrapSimulation, type BootstrapResult } from './SimulationBootstrap'
import { NaturalSelectionSystem, type Organism, type SelectionTickResult } from './NaturalSelectionSystem'
import { world, createCreatureEntity, Position, CreatureBody, DietaryType } from '../ecs/world'
import { removeEntity } from 'bitecs'
import { PLANET_RADIUS } from '../world/SpherePlanet'
import { creatureWander } from '../ecs/systems/CreatureWanderSystem'

// ── Module state ─────────────────────────────────────────────────────────────

let bootstrapResult: BootstrapResult | null = null
let encoder: GenomeEncoder | null = null

/** Maps NaturalSelectionSystem organism ID -> ECS entity ID */
const orgToEcs = new Map<number, number>()
/** Maps ECS entity ID -> NaturalSelectionSystem organism ID */
const ecsToOrg = new Map<number, number>()

/** Cumulative tick stats for the dashboard */
let totalDeaths = 0
let totalBirths = 0
let totalSpeciations = 0
let tickCount = 0
let lastTickResult: SelectionTickResult | null = null

// ── M74: Speciation event ring buffer for visual pulse ────────────────────────
// Stores ECS entity IDs that just speciated, with timestamp for TTL expiry.
// CreatureRenderer reads this to apply a brief flash/pulse on newly speciated organisms.

interface SpeciationEvent {
  eid: number
  timestamp: number  // performance.now() when the event occurred
}

const MAX_SPECIATION_EVENTS = 20
const SPECIATION_EVENT_TTL_MS = 2000  // 2 seconds visible pulse

const speciationEvents: SpeciationEvent[] = []

/**
 * Get active speciation events (not yet expired).
 * Called by CreatureRenderer each frame.
 */
export function getActiveSpeciationEvents(): SpeciationEvent[] {
  const now = performance.now()
  // Prune expired events
  while (speciationEvents.length > 0 && now - speciationEvents[0].timestamp > SPECIATION_EVENT_TTL_MS) {
    speciationEvents.shift()
  }
  return speciationEvents
}

/**
 * Get the normalized progress (0-1) of a speciation event.
 * 0 = just happened, 1 = about to expire.
 */
export function getSpeciationProgress(event: SpeciationEvent): number {
  const elapsed = performance.now() - event.timestamp
  return Math.min(1, elapsed / SPECIATION_EVENT_TTL_MS)
}

// ── M76: Birth event ring buffer for visual pulse ────────────────────────
interface BirthEvent {
  eid: number
  parentEid: number
  timestamp: number
}

const MAX_BIRTH_EVENTS = 30
const BIRTH_EVENT_TTL_MS = 1500  // 1.5 seconds visible pulse

const birthEvents: BirthEvent[] = []

export function getActiveBirthEvents(): BirthEvent[] {
  const now = performance.now()
  while (birthEvents.length > 0 && now - birthEvents[0].timestamp > BIRTH_EVENT_TTL_MS) {
    birthEvents.shift()
  }
  return birthEvents
}

export function getBirthProgress(event: BirthEvent): number {
  const elapsed = performance.now() - event.timestamp
  return Math.min(1, elapsed / BIRTH_EVENT_TTL_MS)
}

// ── M78: Population history ring buffer for dashboard chart ─────────────
interface PopulationSnapshot {
  tick: number
  organismCount: number
  speciesCount: number
}

const MAX_HISTORY = 200
const populationHistory: PopulationSnapshot[] = []

/**
 * Get population history for the last 200 ticks.
 * Called by EcosystemDashboard to render the line chart.
 */
export function getPopulationHistory(): PopulationSnapshot[] {
  return populationHistory
}

// ── Genome -> ECS mapping helpers ────────────────────────────────────────────

/**
 * Derive a physical size in meters from genome sizeClass (0-15).
 * M73: Scaled to 8-20m so organisms are prominent on a 4000m-radius planet.
 */
function sizeFromGenome(sizeClass: number): number {
  return 8 + (sizeClass / 15) * 12
}

/**
 * Derive mass in kg from sizeClass. Tiny aquatic organisms.
 */
function massFromGenome(sizeClass: number): number {
  return 0.001 + (sizeClass / 15) * 0.5
}

// ── Seeded position generation ───────────────────────────────────────────────

/**
 * Place an organism on the planet surface in warm shallow water.
 * We spread organisms in a ring around the equator (y ~ 0 on the sphere)
 * with some randomness, at the planet surface.
 */
function generateOrganismPosition(rng: () => number): [number, number, number] {
  // Equatorial band: latitude within +/- 30 degrees
  const lat = (rng() - 0.5) * (Math.PI / 3)  // -30 to +30 deg
  const lon = rng() * Math.PI * 2

  const r = PLANET_RADIUS + 1  // just above surface (shallow water)
  const cosLat = Math.cos(lat)
  const x = r * cosLat * Math.cos(lon)
  const y = r * Math.sin(lat)
  const z = r * cosLat * Math.sin(lon)

  return [x, y, z]
}

// ── Simple LCG RNG matching SimulationBootstrap ──────────────────────────────

function makeLcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the simulation and create ECS entities for all organisms.
 * Call once during world setup (in SceneRoot after engine.init()).
 *
 * @returns Number of organisms spawned
 */
export function initializeSimulation(seed = 42): number {
  encoder = new GenomeEncoder()
  bootstrapResult = bootstrapSimulation(PLANET_RADIUS, seed)

  const posRng = makeLcgRng(seed + 12345)

  // Create ECS entities for each organism in the selection system
  const organisms = bootstrapResult.selectionSystem.getOrganisms()

  for (const org of organisms) {
    const phenotype = encoder.decode(org.genome)
    const size = sizeFromGenome(phenotype.sizeClass)
    const mass = massFromGenome(phenotype.sizeClass)
    const [x, y, z] = generateOrganismPosition(posRng)

    const eid = createCreatureEntity(world, {
      x, y, z,
      speciesId: org.speciesId,
      genome: org.genome,
      neuralLevel: phenotype.neuralLevel as 0|1|2|3|4,
      mass,
      size,
      dietaryType: phenotype.dietaryType,
    })

    orgToEcs.set(org.id, eid)
    ecsToOrg.set(eid, org.id)

    // M75: Register organism with wander system so it moves on planet surface
    const wanderAngle = posRng() * Math.PI * 2
    const wanderSpeed = 0.1 + posRng() * 0.2  // slow drift: 0.1-0.3 m/s
    creatureWander.set(eid, {
      vx: Math.cos(wanderAngle) * wanderSpeed,
      vy: 0,
      vz: Math.sin(wanderAngle) * wanderSpeed,
      timer: 2 + posRng() * 6,
    })
  }

  console.log(
    `[SimIntegration] Bootstrap complete: ${organisms.length} organisms, ` +
    `${bootstrapResult.speciesIds.length} species, ${bootstrapResult.elapsedMs.toFixed(1)}ms`
  )

  return organisms.length
}

/**
 * Run one natural selection tick and sync results to ECS.
 * Call from the GameLoop each frame (or at a reduced rate for performance).
 *
 * @param simTime Current simulation time in seconds
 * @returns Tick result or null if simulation not initialized
 */
export function tickSimulation(simTime: number): SelectionTickResult | null {
  if (!bootstrapResult || !encoder) return null

  const selectionSystem = bootstrapResult.selectionSystem

  // M79: Dynamic environment — light varies with day/night cycle, temperature with latitude
  // Day/night cycle: simTime in seconds, 1 full cycle = 600s (10 min real time)
  const dayPhase = (simTime % 600) / 600  // 0-1, where 0.0-0.5 is day, 0.5-1.0 is night
  const sunIntensity = Math.max(0, Math.cos(dayPhase * Math.PI * 2))  // 1 at noon, 0 at midnight
  const baseLight = 30 + sunIntensity * 220  // 30-250 range (never fully dark for deep-sea chemoautotrophs)

  const popDensity = selectionSystem.getOrganismCount() / 10000

  const result = selectionSystem.tick(
    (org) => {
      // Per-organism environment based on their ECS position (latitude -> temperature)
      const eid = orgToEcs.get(org.id)
      let temperature = 28  // default warm water
      let light = baseLight

      if (eid !== undefined) {
        // Latitude from y-position on sphere: y/radius gives sin(latitude)
        const py = Position.y[eid]
        const r = Math.sqrt(
          Position.x[eid] * Position.x[eid] +
          Position.y[eid] * Position.y[eid] +
          Position.z[eid] * Position.z[eid]
        )
        if (r > 10) {
          const sinLat = py / r  // -1 (south pole) to 1 (north pole)
          // Temperature: equator ~30C, poles ~-5C
          temperature = 30 - Math.abs(sinLat) * 35
          // Light reduction at high latitudes (oblique sun angle)
          light = baseLight * (0.3 + 0.7 * (1 - Math.abs(sinLat)))
        }
      }

      // M77: Calculate predation pressure from heterotroph density in area
      // Simple approximation: ratio of heterotrophs to total organisms
      const predationPressure = popDensity * 0.3  // mild predation scales with density

      return {
        temperature,
        light,
        predationPressure,
        populationDensity: popDensity,
      }
    },
    simTime,
  )

  // ── Sync deaths: remove ECS entities for dead organisms ────────────────
  // Check which organisms we tracked that no longer exist in the system
  const currentOrgs = new Set<number>()
  for (const org of selectionSystem.getOrganisms()) {
    currentOrgs.add(org.id)
  }

  const deadOrgIds: number[] = []
  for (const orgId of orgToEcs.keys()) {
    if (!currentOrgs.has(orgId)) {
      deadOrgIds.push(orgId)
    }
  }

  for (const orgId of deadOrgIds) {
    const eid = orgToEcs.get(orgId)
    if (eid !== undefined) {
      try {
        removeEntity(world, eid)
      } catch (_e) {
        // Entity may already be removed
      }
      // M75: Clean up wander state for dead organisms (prevent memory leak)
      creatureWander.delete(eid)
      orgToEcs.delete(orgId)
      ecsToOrg.delete(eid)
    }
  }

  // ── Sync births: create ECS entities for new organisms ─────────────────
  // M74: Track species IDs that existed before this tick for speciation detection
  const knownSpeciesBeforeTick = new Set<number>()
  for (const org of selectionSystem.getOrganisms()) {
    if (orgToEcs.has(org.id)) {
      knownSpeciesBeforeTick.add(org.speciesId)
    }
  }

  const posRng = makeLcgRng((simTime * 1000) | 0)

  for (const org of selectionSystem.getOrganisms()) {
    if (!orgToEcs.has(org.id)) {
      // New organism — needs an ECS entity
      const phenotype = encoder!.decode(org.genome)
      const size = sizeFromGenome(phenotype.sizeClass)
      const mass = massFromGenome(phenotype.sizeClass)

      // M76: Spawn offspring near parent (find any organism of same species as proxy)
      let x: number = 0, y: number = 0, z: number = 0
      let foundParent = false
      for (const [oId, eId] of orgToEcs) {
        if (oId !== org.id) {
          const px = Position.x[eId], py = Position.y[eId], pz = Position.z[eId]
          if (px !== 0 || py !== 0 || pz !== 0) {
            const offsetAngle = posRng() * Math.PI * 2
            const offsetDist = 5 + posRng() * 15
            x = px + Math.cos(offsetAngle) * offsetDist
            y = py
            z = pz + Math.sin(offsetAngle) * offsetDist
            const len = Math.sqrt(x*x + y*y + z*z)
            if (len > 10) {
              const r = PLANET_RADIUS + 1
              x = (x/len) * r
              y = (y/len) * r
              z = (z/len) * r
            }
            foundParent = true
            break
          }
        }
      }
      if (!foundParent) {
        [x, y, z] = generateOrganismPosition(posRng)
      }

      const eid = createCreatureEntity(world, {
        x, y, z,
        speciesId: org.speciesId,
        genome: org.genome,
        neuralLevel: phenotype.neuralLevel as 0|1|2|3|4,
        mass,
        size,
        dietaryType: phenotype.dietaryType,
      })

      orgToEcs.set(org.id, eid)
      ecsToOrg.set(eid, org.id)

      // M75: Register newborn with wander system so it moves
      const bornAngle = posRng() * Math.PI * 2
      const bornSpeed = 0.1 + posRng() * 0.2
      creatureWander.set(eid, {
        vx: Math.cos(bornAngle) * bornSpeed,
        vy: 0,
        vz: Math.sin(bornAngle) * bornSpeed,
        timer: 2 + posRng() * 6,
      })

      // M76: Record birth event for visual pulse
      if (birthEvents.length >= MAX_BIRTH_EVENTS) {
        birthEvents.shift()
      }
      let parentEid = 0
      for (const [oId, eId] of orgToEcs) {
        if (oId !== org.id && eId !== eid) {
          parentEid = eId
          break
        }
      }
      birthEvents.push({ eid, parentEid, timestamp: performance.now() })

      // M74: If this organism belongs to a species not seen before this tick,
      // it is a speciation event — emit a visual pulse
      if (!knownSpeciesBeforeTick.has(org.speciesId)) {
        if (speciationEvents.length >= MAX_SPECIATION_EVENTS) {
          speciationEvents.shift()  // evict oldest
        }
        speciationEvents.push({ eid, timestamp: performance.now() })
      }
    }
  }

  // ── Update cumulative stats ────────────────────────────────────────────
  totalDeaths += result.deaths
  totalBirths += result.births
  totalSpeciations += result.speciations
  tickCount++
  lastTickResult = result

  // M78: Record population snapshot for history chart
  const orgCount = bootstrapResult.selectionSystem.getOrganismCount()
  const specCount = bootstrapResult.registry.getAllSpecies().length
  if (populationHistory.length >= MAX_HISTORY) {
    populationHistory.shift()
  }
  populationHistory.push({
    tick: tickCount,
    organismCount: orgCount,
    speciesCount: specCount,
  })

  return result
}

/**
 * Get current simulation statistics for the dashboard HUD.
 */
export function getSimulationStats() {
  if (!bootstrapResult) {
    return {
      organismCount: 0,
      speciesCount: 0,
      totalDeaths: 0,
      totalBirths: 0,
      totalSpeciations: 0,
      tickCount: 0,
      lastTickMs: 0,
    }
  }

  return {
    organismCount: bootstrapResult.selectionSystem.getOrganismCount(),
    speciesCount: bootstrapResult.registry.getAllSpecies().length,
    totalDeaths,
    totalBirths,
    totalSpeciations,
    tickCount,
    lastTickMs: lastTickResult?.elapsedMs ?? 0,
  }
}

/**
 * Check if the simulation has been initialized.
 */
export function isSimulationActive(): boolean {
  return bootstrapResult !== null
}

// ── M_vis: Organism position snapshot for 2D population dot map ─────────────

export interface OrganismDot {
  /** Normalized X position on planet surface (-1 to 1) */
  nx: number
  /** Normalized Z position on planet surface (-1 to 1) */
  nz: number
  /** Species color hue (0-360) */
  hue: number
  /** Diet type: 0=autotroph, 1=heterotroph */
  dietType: number
}

/**
 * Get a snapshot of all organism positions projected onto a 2D top-down map.
 * Returns normalized (x, z) coords — divide by planet radius to get -1..1 range.
 * Called by EcosystemDashboard to render the population dot map.
 */
export function getOrganismDots(): OrganismDot[] {
  if (!bootstrapResult) return []

  const r = PLANET_RADIUS
  const dots: OrganismDot[] = []

  for (const [, eid] of orgToEcs) {
    const px = Position.x[eid]
    const py = Position.y[eid]
    const pz = Position.z[eid]
    if (px === 0 && py === 0 && pz === 0) continue

    // Project onto equatorial plane (top-down view)
    const nx = px / r   // -1 to 1
    const nz = pz / r   // -1 to 1

    // Look up species id from ECS for color
    const speciesId = CreatureBody.speciesId[eid] ?? 0
    const hue = (speciesId * 137.5) % 360

    const dietType = DietaryType.type[eid] ?? 0

    dots.push({ nx, nz, hue, dietType })
  }

  return dots
}

/**
 * M80: Spawn a new random organism at a specific world position.
 * Used by player [O] key to seed organisms in spectator mode.
 * Creates a random genome (mild mutations from primordial), registers with
 * NaturalSelectionSystem, and creates the ECS entity.
 *
 * @returns ECS entity ID of the spawned organism, or -1 if simulation not active
 */
export function spawnOrganismAt(x: number, y: number, z: number): number {
  if (!bootstrapResult || !encoder) return -1

  const selectionSystem = bootstrapResult.selectionSystem
  const registry = bootstrapResult.registry

  // Create a random genome by mutating a primordial template
  const primordial = encoder.createPrimordialGenome()
  const rng = () => Math.random()

  // Randomize some genome bytes for diversity (simple approach — flip random bits)
  for (let i = 0; i < 10; i++) {
    const byteIdx = Math.floor(rng() * 32)
    const bitIdx = Math.floor(rng() * 8)
    primordial[byteIdx] ^= (1 << bitIdx)  // flip a random bit
  }

  // Register with NaturalSelectionSystem
  const org = selectionSystem.addOrganism(
    registry.getAllSpecies()[0]?.id ?? 1,
    primordial,
    'coral_reef'
  )

  // Update population count
  registry.updatePopulation(org.speciesId, 1)

  // Create ECS entity
  const phenotype = encoder.decode(org.genome)
  const size = sizeFromGenome(phenotype.sizeClass)
  const mass = massFromGenome(phenotype.sizeClass)

  const eid = createCreatureEntity(world, {
    x, y, z,
    speciesId: org.speciesId,
    genome: org.genome,
    neuralLevel: phenotype.neuralLevel as 0|1|2|3|4,
    mass,
    size,
    dietaryType: phenotype.dietaryType,
  })

  orgToEcs.set(org.id, eid)
  ecsToOrg.set(eid, org.id)

  // Register with wander system
  const angle = Math.random() * Math.PI * 2
  const speed = 0.1 + Math.random() * 0.2
  creatureWander.set(eid, {
    vx: Math.cos(angle) * speed,
    vy: 0,
    vz: Math.sin(angle) * speed,
    timer: 2 + Math.random() * 6,
  })

  // Record birth event
  if (birthEvents.length >= MAX_BIRTH_EVENTS) {
    birthEvents.shift()
  }
  birthEvents.push({ eid, parentEid: 0, timestamp: performance.now() })

  console.log('[SimIntegration] M80: Player-seeded organism at', x.toFixed(1), y.toFixed(1), z.toFixed(1))

  return eid
}
