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
import { world, createCreatureEntity, Position } from '../ecs/world'
import { removeEntity } from 'bitecs'
import { PLANET_RADIUS } from '../world/SpherePlanet'

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
    })

    orgToEcs.set(org.id, eid)
    ecsToOrg.set(eid, org.id)
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

  // Provide environment for each organism (simplified: all in warm shallow water)
  const result = selectionSystem.tick(
    (_org) => ({
      temperature: 28,         // warm shallow water
      light: 200,              // bright photic zone
      predationPressure: 0,    // no predators yet in primordial soup
      populationDensity: selectionSystem.getOrganismCount() / 10000,
    }),
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

      // Spawn near parent's biome area (equatorial)
      const [x, y, z] = generateOrganismPosition(posRng)

      const eid = createCreatureEntity(world, {
        x, y, z,
        speciesId: org.speciesId,
        genome: org.genome,
        neuralLevel: phenotype.neuralLevel as 0|1|2|3|4,
        mass,
        size,
      })

      orgToEcs.set(org.id, eid)
      ecsToOrg.set(eid, org.id)

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
