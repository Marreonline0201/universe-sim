import { createWorld, addComponent, addEntity, defineComponent, Types } from 'bitecs'

// Create the bitecs world
export const world = createWorld()

// ============================================================
// COMPONENTS — typed arrays, cache-friendly
// ============================================================

/** 3D position in world space (meters) */
export const Position = defineComponent({
  x: Types.f32, y: Types.f32, z: Types.f32
})

/** Linear velocity (m/s) */
export const Velocity = defineComponent({
  x: Types.f32, y: Types.f32, z: Types.f32
})

/** Rotation (quaternion) */
export const Rotation = defineComponent({
  x: Types.f32, y: Types.f32, z: Types.f32, w: Types.f32
})

/** Health stats */
export const Health = defineComponent({
  current: Types.f32,  // 0 = dead
  max: Types.f32,
  regenRate: Types.f32,  // HP per second
})

/** Creature body (links to genome and phenotype) */
export const CreatureBody = defineComponent({
  speciesId: Types.ui32,
  age: Types.f32,           // simulation seconds
  size: Types.f32,          // body size in meters
  mass: Types.f32,          // kg
  neuralLevel: Types.ui8,   // 0-4
})

/** Energy and metabolic needs */
export const Metabolism = defineComponent({
  energy: Types.f32,       // 0-1 (ATP reserves)
  hunger: Types.f32,       // 0-1 (1 = starving)
  thirst: Types.f32,       // 0-1
  fatigue: Types.f32,      // 0-1
  metabolicRate: Types.f32, // J/s base consumption
})

/** Dietary classification for predator/prey behavior (M77) */
export const DietaryType = defineComponent({
  type: Types.ui8,   // 0=autotroph, 1=heterotroph, 2=mixotroph, 3=chemoautotroph
})

/** Genome reference (stores index into a genome buffer) */
export const Genome = defineComponent({
  bufferIndex: Types.ui32,  // index into genomeBuffer SharedArrayBuffer
})

/** Brain state */
export const BrainState = defineComponent({
  currentState: Types.ui8,  // CreatureState enum value
  stateTimer: Types.f32,    // seconds in current state
  goalId: Types.ui8,        // current GOAP goal
  emotionValence: Types.f32, // -1 to 1
  emotionArousal: Types.f32, // 0-1
})

/** Social */
export const Social = defineComponent({
  groupId: Types.ui32,
  role: Types.ui8,
  reputation: Types.f32,
})

/** Player-controlled flag */
export const PlayerControlled = defineComponent({})

/** Physics body (Rapier body handle) */
export const RigidBody = defineComponent({
  handle: Types.ui32,
})

/** Item/resource in the world */
export const Item = defineComponent({
  type: Types.ui16,
  quantity: Types.f32,
  materialId: Types.ui16,
})

/** Marker components */
export const IsDead = defineComponent({})
export const IsEating = defineComponent({})
export const IsFleeing = defineComponent({})
export const IsAttacking = defineComponent({})

// ============================================================
// Genome storage (SharedArrayBuffer for workers)
// 32 bytes per genome, up to 100,000 creatures
// ============================================================
export const MAX_CREATURES = 100_000
export const GENOME_BYTES = 32
export const genomeBuffer = new SharedArrayBuffer(MAX_CREATURES * GENOME_BYTES)
export const genomeArray = new Uint8Array(genomeBuffer)

/** Write genome to the shared buffer */
export function writeGenome(bufferIndex: number, genome: Uint8Array): void {
  const offset = bufferIndex * GENOME_BYTES
  genomeArray.set(genome.subarray(0, GENOME_BYTES), offset)
}

/** Read genome from the shared buffer */
export function readGenome(bufferIndex: number): Uint8Array {
  const offset = bufferIndex * GENOME_BYTES
  return genomeArray.slice(offset, offset + GENOME_BYTES)
}

// ============================================================
// Entity factories
// ============================================================

/** Create a creature entity with all required components */
export function createCreatureEntity(
  w: ReturnType<typeof createWorld>,
  opts: {
    x: number; y: number; z: number
    speciesId: number
    genome: Uint8Array
    neuralLevel: 0|1|2|3|4
    mass: number
    size: number
    dietaryType: number
  }
): number {
  const eid = addEntity(w)
  addComponent(w, Position, eid)
  Position.x[eid] = opts.x
  Position.y[eid] = opts.y
  Position.z[eid] = opts.z
  addComponent(w, Velocity, eid)
  addComponent(w, Rotation, eid)
  Rotation.w[eid] = 1  // identity quaternion
  addComponent(w, Health, eid)
  // Scale HP with mass: insects ~5 HP, small animals ~20, large mammals ~80
  const baseHp = Math.max(5, Math.round(opts.mass * 2))
  Health.current[eid] = baseHp
  Health.max[eid] = baseHp
  Health.regenRate[eid] = 0.05
  addComponent(w, CreatureBody, eid)
  CreatureBody.speciesId[eid] = opts.speciesId
  CreatureBody.neuralLevel[eid] = opts.neuralLevel
  CreatureBody.mass[eid] = opts.mass
  CreatureBody.size[eid] = opts.size
  addComponent(w, Metabolism, eid)
  Metabolism.energy[eid] = 1.0
  Metabolism.hunger[eid] = 0
  Metabolism.thirst[eid] = 0
  Metabolism.fatigue[eid] = 0
  Metabolism.metabolicRate[eid] = opts.mass * 0.001  // ~1 W per kg (real mammal range)
  addComponent(w, Genome, eid)
  Genome.bufferIndex[eid] = eid  // use entity ID as genome buffer index
  writeGenome(eid, opts.genome)
  addComponent(w, DietaryType, eid)
  DietaryType.type[eid] = opts.dietaryType
  addComponent(w, BrainState, eid)
  addComponent(w, Social, eid)
  return eid
}

/** Create the player entity */
export function createPlayerEntity(w: ReturnType<typeof createWorld>, x: number, y: number, z: number): number {
  const eid = createCreatureEntity(w, {
    x, y, z, speciesId: 0, genome: new Uint8Array(32),
    neuralLevel: 4, mass: 70, size: 1.8, dietaryType: 1  // heterotroph (omnivore human)
  })
  addComponent(w, PlayerControlled, eid)
  return eid
}
