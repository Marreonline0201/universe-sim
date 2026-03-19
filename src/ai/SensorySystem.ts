/**
 * SensorySystem.ts
 *
 * Processes raw ECS world state and the Grid3D into a `SensoryInput` bundle
 * consumed by the Brain each tick.
 *
 * Implements five senses:
 *   1. Vision       — ray-cast FOV; range + FOV from genome.
 *   2. Olfaction    — chemical gradient sampling from grid cells.
 *   3. Hearing      — proximity detection via grid pressure waves.
 *   4. Electroreception — EM field detection (aquatic creatures only).
 *   5. Touch        — ground contact, pressure, pain (body state sensors).
 *
 * All ray-casts and gradient computations are deliberately O(small) per
 * creature to keep the ECS system step under budget.
 */

import type { SensoryInput }  from './NeuralArchitecture'
import type { Phenotype }     from '../biology/GenomeEncoder'
import { Grid3D }             from '../engine/Grid'

// ─── Internal result types ─────────────────────────────────────────────────────

export interface VisionResult {
  nearestFood:        SensoryInput['nearestFood']
  nearestPredator:    SensoryInput['nearestPredator']
  nearestPrey:        SensoryInput['nearestPrey']
  nearestConspecific: SensoryInput['nearestConspecific']
  lightLevel:         number
}

export interface ChemSenseResult {
  foodGradient:   [number, number, number]
  dangerChemical: number
  mateChemical:   number
}

export interface HearingResult {
  /** True if any threatening sound was detected. */
  threatSound: boolean
  /** Approximate direction of loudest sound source. */
  soundDir: [number, number, number] | null
}

// ─── Chemical slot constants (matches Grid3D chemical layout) ─────────────────

// Slots 0-7 in each cell.  We reserve:
//   0 = oxygen / dissolved nutrients (food signal)
//   1 = alarm pheromone
//   2 = mate pheromone
//   3 = territory marker
const CHEM_FOOD   = 0
const CHEM_ALARM  = 1
const CHEM_MATE   = 2

// ─── Entity tag constants (must match ECS component definitions) ───────────────

// These are the ECS component IDs that identify entity roles.
// Kept as plain numbers to avoid circular dependencies with the ECS module.
// The ECS system that calls sense() is responsible for passing the correct world.
const TAG_PREDATOR = 1
const TAG_PREY     = 2
const TAG_CONSPECIFIC = 3

// ─── SensorySystem ────────────────────────────────────────────────────────────

export class SensorySystem {

  /**
   * Main sense update. Reads ECS world and Grid3D to produce a complete
   * SensoryInput for `entityId` at `position`.
   *
   * @param entityId   ECS entity ID.
   * @param position   Current world position [x, y, z].
   * @param phenotype  Decoded genome phenotype.
   * @param grid       Simulation Grid3D.
   * @param world      bitecs World object (any — avoids circular dep).
   */
  sense(
    entityId:  number,
    position:  [number, number, number],
    phenotype: Phenotype,
    grid:      Grid3D,
    world:     any,
  ): SensoryInput {
    // Forward direction: we default to +X if caller has not set it.
    const forward: [number, number, number] = this._getForward(world, entityId)

    // ── Vision ──────────────────────────────────────────────────────────────
    const visionRange = phenotype.visionRange * 2           // 0-30 m
    const fovDeg      = phenotype.visionType >= 5 ? 340     // compound eye
                      : phenotype.visionType >= 2 ? 180     // binocular
                      : phenotype.visionType >= 1 ?  60     // simple
                      : 0                                   // blind
    const numRays = phenotype.visionType >= 4 ? 24
                  : phenotype.visionType >= 2 ? 12
                  : phenotype.visionType >= 1 ?  6
                  : 0

    const vision = this.visionRaycast(position, forward, visionRange, fovDeg, numRays, world)

    // ── Olfaction ────────────────────────────────────────────────────────────
    const chem = this.smellGradient(position, phenotype.olfaction / 15, grid)

    // ── Hearing ──────────────────────────────────────────────────────────────
    const hearingRange = phenotype.hearing > 0 ? phenotype.hearing * 4 : 0
    const hearing = this.hearingDetect(position, hearingRange, world)

    // ── Electroreception (aquatic only) ──────────────────────────────────────
    const elecSensitivity = phenotype.swimSpeed > 5 ? (phenotype.olfaction / 15) : 0
    const emField = this.electroReception(position, elecSensitivity, grid)

    // ── Physical / body state ────────────────────────────────────────────────
    const [cx, cy, cz] = this._worldToCell(position, grid)
    const inBounds = grid.inBounds(cx, cy, cz)

    const temperature = inBounds ? grid.getTemperature(cx, cy, cz) : 15
    const pressure    = inBounds ? grid.getPressure(cx, cy, cz)    : 101325
    const light       = inBounds ? grid.getLight(cx, cy, cz)       : vision.lightLevel

    const groundBelow = inBounds && grid.inBounds(cx, cy - 1, cz)
      ? grid.getMaterial(cx, cy - 1, cz) > 0
      : true

    // Body state fields are read from the ECS Health/Metabolism components.
    // We call the accessor helpers which gracefully return 0 if component absent.
    const hunger  = this._readFloat(world, entityId, 'Hunger')
    const thirst  = this._readFloat(world, entityId, 'Thirst')
    const fatigue = this._readFloat(world, entityId, 'Fatigue')
    const pain    = this._readFloat(world, entityId, 'Pain')
    const health  = this._readFloat(world, entityId, 'Health', 1)
    const energy  = this._readFloat(world, entityId, 'Energy', 1)

    return {
      // Vision
      nearestFood:        vision.nearestFood,
      nearestPredator:    vision.nearestPredator,
      nearestPrey:        vision.nearestPrey,
      nearestConspecific: vision.nearestConspecific,
      lightLevel:         light,

      // Chemical
      foodGradient:   chem.foodGradient,
      dangerChemical: chem.dangerChemical + (emField > 0.5 ? emField * 0.3 : 0),
      mateChemical:   chem.mateChemical,

      // Physical
      temperature,
      pressure,
      groundBelow,

      // Body state
      hunger,
      thirst,
      fatigue,
      pain,
      health,
      energy,
    }
  }

  // ─── Vision ──────────────────────────────────────────────────────────────────

  /**
   * Cast `numRays` evenly distributed within `fovDeg` from `forward`.
   * Returns the closest entity in each category detected.
   *
   * Ray stepping is done in world-space integer cell increments.
   * Each step we look up ECS entities in that cell via a spatial index.
   */
  visionRaycast(
    position:  [number, number, number],
    forward:   [number, number, number],
    range:     number,
    fovDeg:    number,
    numRays:   number,
    world:     any,
  ): VisionResult {
    let nearestFood:        VisionResult['nearestFood']        = null
    let nearestPredator:    VisionResult['nearestPredator']    = null
    let nearestPrey:        VisionResult['nearestPrey']        = null
    let nearestConspecific: VisionResult['nearestConspecific'] = null
    let lightLevel = 128

    if (numRays === 0 || range === 0 || fovDeg === 0) {
      return { nearestFood, nearestPredator, nearestPrey, nearestConspecific, lightLevel }
    }

    const fovRad    = (fovDeg * Math.PI) / 180
    const halfFov   = fovRad / 2
    const forwardAngle = Math.atan2(forward[2], forward[0])

    // Spatial index accessor — the ECS system attaches this to world.
    const spatialQuery: ((x: number, y: number, z: number) => Array<{
      entityId: number; tag: number; speciesId: number
    }>) | undefined = world?.spatialQuery

    for (let r = 0; r < numRays; r++) {
      const angle = forwardAngle - halfFov + (fovRad * r) / Math.max(1, numRays - 1)
      const dirX  = Math.cos(angle)
      const dirZ  = Math.sin(angle)

      // Step along the ray in unit increments.
      for (let step = 1; step <= range; step++) {
        const wx = position[0] + dirX * step
        const wy = position[1]
        const wz = position[2] + dirZ * step

        if (!spatialQuery) break

        const entities = spatialQuery(wx, wy, wz)
        for (const ent of entities) {
          const dist = step
          const dir: [number, number, number] = [dirX * step, 0, dirZ * step]

          switch (ent.tag) {
            case TAG_PREDATOR:
              if (!nearestPredator || dist < nearestPredator.distance) {
                nearestPredator = { distance: dist, direction: dir, speciesId: ent.speciesId }
              }
              break
            case TAG_PREY:
              if (!nearestPrey || dist < nearestPrey.distance) {
                nearestPrey = { distance: dist, direction: dir, speciesId: ent.speciesId }
              }
              break
            case TAG_CONSPECIFIC:
              if (!nearestConspecific || dist < nearestConspecific.distance) {
                nearestConspecific = { distance: dist, direction: dir }
              }
              break
          }

          // Food tag (4) or item with foodType set.
          if (ent.tag === 4) {
            if (!nearestFood || dist < nearestFood.distance) {
              nearestFood = { distance: dist, direction: dir, type: 'plant' }
            }
          }
          if (ent.tag === 5) {
            if (!nearestFood || dist < nearestFood.distance) {
              nearestFood = { distance: dist, direction: dir, type: 'meat' }
            }
          }
        }

        if (nearestPredator && nearestPredator.distance <= step) break
      }
    }

    return { nearestFood, nearestPredator, nearestPrey, nearestConspecific, lightLevel }
  }

  // ─── Olfaction ───────────────────────────────────────────────────────────────

  /**
   * Sample chemical concentrations in a 3x3x3 neighbourhood and
   * compute the gradient direction toward the highest concentration.
   *
   * @param sensitivity  0-1 from genome olfaction field.
   */
  smellGradient(
    position:    [number, number, number],
    sensitivity: number,
    grid:        Grid3D,
  ): ChemSenseResult {
    if (sensitivity < 0.01) {
      return { foodGradient: [0, 0, 0], dangerChemical: 0, mateChemical: 0 }
    }

    const [cx, cy, cz] = this._worldToCell(position, grid)

    // Gradient via central differences on adjacent cells.
    let gx = 0, gy = 0, gz = 0
    let alarmTotal = 0, mateTotal = 0, samples = 0

    const offsets: Array<[number, number, number]> = [
      [-1, 0, 0], [1, 0, 0],
      [0, -1, 0], [0, 1, 0],
      [0, 0, -1], [0, 0, 1],
    ]

    for (const [dx, dy, dz] of offsets) {
      const nx = cx + dx
      const ny = cy + dy
      const nz = cz + dz
      if (!grid.inBounds(nx, ny, nz)) continue

      const food  = grid.getQuantity(nx, ny, nz, CHEM_FOOD)
      const alarm = grid.getQuantity(nx, ny, nz, CHEM_ALARM)
      const mate  = grid.getQuantity(nx, ny, nz, CHEM_MATE)

      gx += dx * food
      gy += dy * food
      gz += dz * food
      alarmTotal += alarm
      mateTotal  += mate
      samples++
    }

    const scale = samples > 0 ? sensitivity / samples : 0
    const gradient = this._normalize3([gx * scale, gy * scale, gz * scale])
    const noiseFloor = 0.05 * (1 - sensitivity)

    return {
      foodGradient:   gradient,
      dangerChemical: Math.max(0, alarmTotal * sensitivity - noiseFloor),
      mateChemical:   Math.max(0, mateTotal  * sensitivity - noiseFloor),
    }
  }

  // ─── Hearing ─────────────────────────────────────────────────────────────────

  /**
   * Detect entities that are emitting sound within `range`.
   * Sound detection is approximated via grid pressure variance —
   * high local pressure variance indicates nearby vibrations.
   */
  hearingDetect(
    position: [number, number, number],
    range:    number,
    world:    any,
  ): HearingResult {
    if (range === 0) return { threatSound: false, soundDir: null }

    // Query sound-emitting entities from ECS spatial index.
    const soundQuery: ((pos: [number,number,number], r: number) => Array<{
      entityId: number; volume: number; isThreat: boolean; position: [number,number,number]
    }>) | undefined = world?.soundQuery

    if (!soundQuery) return { threatSound: false, soundDir: null }

    const sources = soundQuery(position, range)
    if (sources.length === 0) return { threatSound: false, soundDir: null }

    let threatSound = false
    let loudestVol = -Infinity
    let loudestDir: [number, number, number] | null = null

    for (const src of sources) {
      if (src.isThreat) threatSound = true
      if (src.volume > loudestVol) {
        loudestVol = src.volume
        loudestDir = this._normalize3([
          src.position[0] - position[0],
          src.position[1] - position[1],
          src.position[2] - position[2],
        ])
      }
    }

    return { threatSound, soundDir: loudestDir }
  }

  // ─── Electroreception ─────────────────────────────────────────────────────────

  /**
   * Detect local EM field strength from grid data.
   * Only meaningful for aquatic creatures with olfaction > 7 (sensitivity proxy).
   *
   * We use pressure variance across immediate neighbours as an EM proxy
   * (real simulation would have a dedicated EM field channel in the grid).
   */
  electroReception(
    position:    [number, number, number],
    sensitivity: number,
    grid:        Grid3D,
  ): number {
    if (sensitivity < 0.1) return 0

    const [cx, cy, cz] = this._worldToCell(position, grid)
    if (!grid.inBounds(cx, cy, cz)) return 0

    // Sample pressure in immediate neighbourhood.
    let sum = 0, sumSq = 0, count = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nx = cx + dx, ny = cy + dy, nz = cz + dz
          if (!grid.inBounds(nx, ny, nz)) continue
          const p = grid.getPressure(nx, ny, nz)
          sum   += p
          sumSq += p * p
          count++
        }
      }
    }

    if (count < 2) return 0
    const mean = sum / count
    const variance = sumSq / count - mean * mean
    // Normalise variance to a 0-1 EM field estimate.
    const normalised = Math.min(1, Math.sqrt(variance) / 5000)
    return normalised * sensitivity
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Convert a continuous world position to integer grid cell coordinates. */
  private _worldToCell(
    position: [number, number, number],
    grid:     Grid3D,
  ): [number, number, number] {
    return [
      Math.min(grid.sizeX - 1, Math.max(0, Math.floor(position[0]))),
      Math.min(grid.sizeY - 1, Math.max(0, Math.floor(position[1]))),
      Math.min(grid.sizeZ - 1, Math.max(0, Math.floor(position[2]))),
    ]
  }

  private _normalize3(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if (len < 1e-9) return [0, 0, 0]
    return [v[0] / len, v[1] / len, v[2] / len]
  }

  /**
   * Read a named float component from ECS world (returns `defaultVal` if absent).
   * The ECS world is expected to expose components via `world.components[name][entityId]`.
   */
  private _readFloat(
    world:       any,
    entityId:    number,
    componentName: string,
    defaultVal   = 0,
  ): number {
    try {
      const comp = world?.components?.[componentName]
      if (!comp) return defaultVal
      const raw = comp.value?.[entityId]
      if (raw === undefined || raw === null) return defaultVal
      return Math.min(1, Math.max(0, raw))
    } catch {
      return defaultVal
    }
  }

  /**
   * Read the entity's forward direction from the ECS Rotation component.
   * Falls back to +X if not available.
   */
  private _getForward(world: any, entityId: number): [number, number, number] {
    try {
      const rot = world?.components?.Rotation
      if (!rot) return [1, 0, 0]
      const angle = rot.yaw?.[entityId] ?? 0
      return [Math.cos(angle), 0, Math.sin(angle)]
    } catch {
      return [1, 0, 0]
    }
  }
}
