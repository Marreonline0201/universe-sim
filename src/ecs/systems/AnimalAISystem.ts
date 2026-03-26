// ── AnimalAISystem.ts ──────────────────────────────────────────────────────────
// M9 Track 2: Animal AI — Deer, Wolf, Boar
//
// Architecture:
//   Animals are stored in a module-level Map (animalRegistry) for zero-allocation
//   per-frame access. ECS Position is written each tick; AnimalRenderer reads it.
//
// Behavior state machine (per species):
//   Deer:  GRAZING → FLEEING (player < 25m, or < 10m if crouching)
//          FLEEING → GRAZING (player > 40m)
//          Flocking: Reynolds separation/alignment/cohesion within 30m of 3 nearest
//
//   Wolf:  PATROLLING → HUNTING_DEER (deer within 30m)
//          PATROLLING → ATTACKING_PLAYER (player within 20m AND murderCount >= 3)
//          HUNTING_DEER: moves toward nearest deer, attacks at < 10m
//          ATTACKING_PLAYER: moves toward player, damages at < 2.5m
//          PATROLLING: wander with pack (2-4 wolves share a patrol center)
//
//   Boar:  ROAMING → CHARGING (player within 8m)
//          CHARGING: locks target, rushes at CHARGE_SPEED, deals damage on contact
//          After 5s charge, returns to ROAMING
//
// Physics: same sphere-surface projection as CreatureAI in SceneRoot.
// Loot: dropped into module-level pendingLoot[] array; SceneRoot drains each frame.

import * as THREE from 'three'
import { terrainHeightAt, PLANET_RADIUS } from '../../world/SpherePlanet'
import { GenomeEncoder, type Genome } from '../../biology/GenomeEncoder'
import { MutationEngine } from '../../biology/MutationEngine'
import { applyBoidRules } from '../../ai/FlockingSystem'

// ── Genome decoder (singleton, allocation-free per-frame) ─────────────────────
const _encoder = new GenomeEncoder()
const _mutationEngine = new MutationEngine()

/**
 * Phenotype stats derived from a genome, used to parameterize per-animal AI.
 * Computed once at spawn; stored on the AnimalEntity.
 */
export interface AnimalGenomePhenotype {
  /** Movement speed multiplier (1.0 = baseline species speed). 0.5–2.0 range. */
  speedMult: number
  /** Detection/awareness radius in meters. */
  detectionRange: number
  /** Attack damage per hit (HP). */
  attackDamage: number
  /** Maximum health override (if genome is set; else species default). */
  maxHealth: number
  /** Armor damage reduction factor (0 = none, 0.5 = halves damage). */
  armorReduction: number
  /**
   * Behavior tier:
   *   0 = simple wander (reflex only)
   *   1 = instinct (BehaviorTree lite — prey or predator BT logic)
   *   2 = learning (full BehaviorTree)
   *   3+ = GOAP
   */
  behaviorTier: 0 | 1 | 2 | 3
  /** Raw genome bytes for crossover/mutation on reproduction. */
  genome: Genome
}

// ── Enums ─────────────────────────────────────────────────────────────────────

export type AnimalSpecies = 'deer' | 'wolf' | 'boar' | 'bird'

export type AnimalBehavior =
  | 'GRAZING'
  | 'FLEEING'
  | 'PATROLLING'
  | 'HUNTING_DEER'
  | 'ATTACKING_PLAYER'
  | 'ROAMING'
  | 'CHARGING'
  | 'AGGRO'    // M24: retaliation state — wolves/boars chase attacker
  | 'FLOCKING' // M25: bird/deer coordinated group movement
  | 'SCATTER'  // M25: deer scatter after wolf/player threat, regroup after scatterTimer
  | 'DEAD'

// ── Data types ─────────────────────────────────────────────────────────────────

export interface AnimalEntity {
  id: number
  species: AnimalSpecies
  behavior: AnimalBehavior

  // Position on sphere surface
  x: number
  y: number
  z: number

  // Velocity in world space (tangent to sphere)
  vx: number
  vy: number
  vz: number

  health: number
  maxHealth: number

  // Species-specific state
  packId: number       // wolves + birds: shared group index
  chargeTimer: number  // boar: seconds remaining in current charge
  stateTimer: number   // general purpose state duration timer
  wanderTimer: number  // seconds until direction change
  deadTimer: number    // seconds since death (despawn at 120)

  // M25: deer scatter/regroup timer (seconds until regroup after scattering)
  scatterTimer: number

  // M25: birds — figure-eight patrol phase angle (radians)
  flightPhase: number

  // For wolf pack patrol / bird flock: shared center
  patrolCx: number
  patrolCy: number
  patrolCz: number

  /** Genome-derived phenotype stats. Optional — absent means use hardcoded species defaults. */
  phenotype?: AnimalGenomePhenotype

  // M32 Track B: Taming system
  /** True if this animal has been tamed by a player. */
  tamed: boolean
  /** Player entity ID that owns this animal (set on taming). */
  ownerId: number
  /** Display name chosen by the player after taming (default: species name). */
  petName: string
  /** Alert timer after a failed tame attempt — animal is wary for 30s. */
  tameAlertTimer: number
  /** Seconds since last product drop (leather for deer, meat for boar). */
  productTimer: number
}

export interface LootDrop {
  x: number; y: number; z: number
  materialId: number
  quantity: number
  label: string
}

// ── Module-level registries ────────────────────────────────────────────────────

let _nextId = 1
export const animalRegistry = new Map<number, AnimalEntity>()
export const pendingLoot: LootDrop[] = []

// ── M24: Respawn queue ────────────────────────────────────────────────────────
interface RespawnEntry {
  species: AnimalSpecies
  x: number; y: number; z: number
  timer: number  // seconds remaining until respawn
  packId: number
  patrolCx: number; patrolCy: number; patrolCz: number
}
const respawnQueue: RespawnEntry[] = []
const RESPAWN_DELAY = 120  // 2 minutes

// ── M24: Aggro timer tracking (per animal) ──────────────────────────────────
const aggroTimers = new Map<number, number>()  // animalId → seconds remaining
const AGGRO_TIMEOUT = 30  // disengage after 30s
const AGGRO_DISENGAGE_DIST = 50  // disengage if player >50m away

// Population caps
const CAP_DEER  = 20
const CAP_WOLF  = 8
const CAP_BOAR  = 10
// CAP_BIRD defined with bird constants below

// Behavior constants
const DEER_FLEE_RADIUS       = 25   // m — normal flee trigger
const DEER_FLEE_RADIUS_CROUCH = 10  // m — crouch reduces detection
const DEER_STOP_FLEE_RADIUS  = 40   // m — stop fleeing when this far
const DEER_FLOCK_RADIUS      = 30   // m — Reynolds cohesion radius
const DEER_SPEED_GRAZE       = 1.0  // m/s
const DEER_SPEED_FLEE        = 7.0  // m/s

const WOLF_PATROL_RADIUS     = 80   // m
const WOLF_HUNT_RADIUS       = 30   // m — detect deer
const WOLF_PLAYER_RADIUS     = 20   // m — detect player
const WOLF_ATTACK_RADIUS     = 2.5  // m — melee hit
const WOLF_DEER_ATTACK_RADIUS = 10  // m — kill deer
const WOLF_SPEED_PATROL      = 2.5  // m/s
const WOLF_SPEED_HUNT        = 6.0  // m/s
const WOLF_ATTACK_COOLDOWN   = 1.5  // s
const WOLF_DAMAGE            = 8    // HP per hit (on 100HP player scale)

const BOAR_TRIGGER_RADIUS    = 8    // m
const BOAR_CHARGE_SPEED      = 9.0  // m/s
const BOAR_ROAM_SPEED        = 1.5  // m/s
const BOAR_CHARGE_DURATION   = 5    // s
const BOAR_DAMAGE            = 12   // HP per ram

// M25: Deer herd behaviour
const DEER_HERD_SIZE_MIN     = 3    // minimum herd size to enable flocking
const DEER_HERD_SIZE_MAX     = 6    // maximum herd (groups cluster by packId)
const DEER_WOLF_ALERT_RADIUS = 15   // m — detect wolf, scatter herd
const DEER_SCATTER_DURATION  = 10   // s — scatter then regroup
const DEER_SCATTER_SPEED     = 8.0  // m/s — scatter burst speed

// M25: Bird flock behaviour
const BIRD_FLOCK_MIN         = 8    // minimum birds per flock
const BIRD_FLOCK_MAX         = 15   // maximum birds per flock
const CAP_BIRD               = 30   // population cap
const BIRD_ALTITUDE          = 40   // m above terrain
const BIRD_SPEED             = 12.0 // m/s cruise
const BIRD_FIGURE8_RADIUS    = 80   // m — half-width of figure-eight patrol
const BIRD_TIGHTEN_RADIUS    = 30   // m — player proximity tightens formation
const BIRD_TIGHTEN_FACTOR    = 0.4  // scale boid radii when tightening

// Material IDs (must match Inventory.ts MAT constants)
const MAT_RAW_MEAT   = 42
const MAT_LEATHER    = 24
const MAT_BONE       = 6
const MAT_WOLF_PELT  = 57  // NEW in M9
const MAT_BOAR_TUSK  = 58  // NEW in M9

// ── Genome phenotype decoder ──────────────────────────────────────────────────

/**
 * Decode a genome into behavior-relevant phenotype stats for animals.
 *
 * Genome bit layout (per GenomeEncoder.ts):
 *   bits 32-35  = visionType  (0=none … 6=camera)
 *   bits 36-39  = visionRange (0-15 → 0-30m)
 *   bits 48-51  = swimSpeed   (0-15)
 *   bits 52-55  = walkSpeed   (0-15)
 *   bits 56-59  = flySpeed    (0-15)
 *   bit  64/65  = hasArmor
 *   bits 68-71  = armorThickness (0-15)
 *   bits 72-75  = venomPotency   (0-15)
 *   bits 76-79  = weaponType     (0-6)
 *   bits 96-103 = neuralComplexity (0-255 → level 0-4)
 */
export function decodeAnimalPhenotype(
  genome: Genome,
  species: AnimalSpecies,
): AnimalGenomePhenotype {
  const p = _encoder.decode(genome)

  // ── Speed multiplier from best locomotion speed ──────────────────────────
  // Take the max of swim/walk/fly speed (0-15), normalize to 0.5–2.0
  const bestLoco = Math.max(p.swimSpeed, p.walkSpeed, p.flySpeed, p.burrowSpeed)
  // 0 → 0.5x, 7 → 1.0x (baseline), 15 → 2.0x
  const speedMult = 0.5 + (bestLoco / 15) * 1.5

  // ── Detection range from vision ───────────────────────────────────────────
  // visionRange 0-15 maps to 0-30m; if no vision (visionType=0), use olfaction fallback
  let detectionRange: number
  if (p.visionType === 0) {
    // No vision — fall back to olfaction (0-15 → 5-20m)
    detectionRange = 5 + (p.olfaction / 15) * 15
  } else {
    // Camera/compound/UV eyes: visionRange 0-15 → 5-40m
    detectionRange = 5 + (p.visionRange / 15) * 35
  }

  // ── Attack damage from weapon type and venom ──────────────────────────────
  // weaponType: 0=none,1=claws,2=beak,3=teeth,4=spines,5=electric,6=chemical
  const weaponBase = [0, 8, 6, 7, 5, 12, 10][Math.min(p.weaponType, 6)]
  const venomBonus = p.hasVenom ? Math.round(p.venomPotency / 15 * 6) : 0
  // Scale by species baseline — preserve game balance
  const speciesDmgBase = species === 'wolf' ? WOLF_DAMAGE
                       : species === 'boar' ? BOAR_DAMAGE
                       : 3  // deer baseline (critters)
  // Blend 50/50 between genome and hardcoded species baseline
  const attackDamage = Math.max(1, Math.round((speciesDmgBase + weaponBase + venomBonus) / 2))

  // ── Max health from size class + armor ────────────────────────────────────
  // sizeClass 0-15: maps roughly to HP (small → large)
  const speciesBaseHp = species === 'deer' ? 40
                      : species === 'wolf' ? 30
                      : 60  // boar
  const armorBonus = p.hasArmor ? Math.round(p.armorThickness / 15 * 20) : 0
  const maxHealth = speciesBaseHp + armorBonus

  // ── Armor damage reduction ────────────────────────────────────────────────
  // armorThickness 0-15 → 0-40% damage reduction
  const armorReduction = p.hasArmor ? (p.armorThickness / 15) * 0.4 : 0

  // ── Behavior tier from neural complexity ──────────────────────────────────
  // neuralLevel: 0=reflex,1=instinct,2=learning,3=reasoning,4=abstract
  // Map to behavior tier: 0-1→simple wander, 1→instinct BT, 2→full BT, 3+→GOAP
  let behaviorTier: 0 | 1 | 2 | 3
  if (p.neuralLevel <= 0)      behaviorTier = 0  // reflex: pure wander
  else if (p.neuralLevel === 1) behaviorTier = 1  // instinct: BT lite
  else if (p.neuralLevel === 2) behaviorTier = 2  // learning: full BehaviorTree
  else                          behaviorTier = 3  // reasoning: GOAP

  return { speedMult, detectionRange, attackDamage, maxHealth, armorReduction, behaviorTier, genome }
}

// ── Seeded RNG (same pattern as rest of codebase) ─────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Surface projection helper ─────────────────────────────────────────────────

function projectOntoSurface(x: number, y: number, z: number, size: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < 10) return [x, y, z]
  const nx = x / len, ny = y / len, nz = z / len
  const dir = new THREE.Vector3(nx, ny, nz)
  const h = terrainHeightAt(dir)
  if (h < 0) return [x, y, z]  // don't walk into ocean
  const r = PLANET_RADIUS + Math.max(0, h) + size * 0.5
  return [nx * r, ny * r, nz * r]
}

// ── Population counts ─────────────────────────────────────────────────────────

export function countSpecies(species: AnimalSpecies): number {
  let n = 0
  for (const a of animalRegistry.values()) {
    if (a.species === species && a.behavior !== 'DEAD') n++
  }
  return n
}

// ── Spawn helpers ─────────────────────────────────────────────────────────────

export function spawnAnimal(
  species: AnimalSpecies,
  x: number, y: number, z: number,
  packId = 0,
  patrolCx = x, patrolCy = y, patrolCz = z,
  genome?: Genome,
): AnimalEntity {
  const id = _nextId++

  // Decode genome phenotype if provided, otherwise use species defaults
  const phenotype = genome ? decodeAnimalPhenotype(genome, species) : undefined

  const maxHp = phenotype ? phenotype.maxHealth
              : species === 'deer' ? 40
              : species === 'wolf' ? 30
              : species === 'bird' ? 10
              : 60  // boar

  const animal: AnimalEntity = {
    id, species,
    behavior: species === 'deer' ? 'GRAZING'
            : species === 'wolf' ? 'PATROLLING'
            : species === 'bird' ? 'FLOCKING'
            : 'ROAMING',
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    health: maxHp, maxHealth: maxHp,
    packId, chargeTimer: 0, stateTimer: 0,
    wanderTimer: 1 + Math.random() * 4,
    deadTimer: 0,
    scatterTimer: 0,
    flightPhase: Math.random() * Math.PI * 2,
    patrolCx, patrolCy, patrolCz,
    phenotype,
    // M32 Track B: Taming
    tamed: false,
    ownerId: -1,
    petName: species,
    tameAlertTimer: 0,
    productTimer: 0,
  }
  animalRegistry.set(id, animal)

  // [GenomeDebug] Log spawn with decoded phenotype so developer can verify genome → behavior wiring
  if (phenotype) {
    console.log(
      `[GenomeDebug] Spawned ${species} #${id}: ` +
      `speedMult=${phenotype.speedMult.toFixed(2)} ` +
      `detectionRange=${phenotype.detectionRange.toFixed(1)}m ` +
      `attackDamage=${phenotype.attackDamage} ` +
      `maxHealth=${phenotype.maxHealth} ` +
      `armorReduction=${(phenotype.armorReduction * 100).toFixed(0)}% ` +
      `behaviorTier=${phenotype.behaviorTier}`
    )
  }

  return animal
}

/**
 * Generate a plausible random genome for a given species.
 * Sets neural complexity, locomotion, vision, and weapon bits to species-appropriate ranges.
 */
function generateSpeciesGenome(species: AnimalSpecies, rng: () => number): Genome {
  const genome = new Uint8Array(32)
  // Fill with random data as base
  for (let b = 0; b < 32; b++) genome[b] = Math.floor(rng() * 256)

  // Tune bits per species using GenomeEncoder bit layout
  if (species === 'deer') {
    // Neural: level 1 (instinct) — score 16-63 → byte 12 bits 0-7
    genome[12] = 20 + Math.floor(rng() * 30)   // 20-49: solidly level 1
    // Locomotion: good walk speed (bits 52-55 = byte 6 bits 4-7) — 8-13
    genome[6] = (genome[6] & 0x0F) | ((8 + Math.floor(rng() * 6)) << 4)
    // Vision: good color vision (bits 32-35 = byte 4 bits 0-3 = type 2), range 6-12
    genome[4] = (genome[4] & 0xF0) | 2                              // visionType=2 (color)
    genome[4] = (genome[4] & 0x0F) | ((6 + Math.floor(rng() * 7)) << 4) // visionRange
    // Weapon: none (bits 76-79 = byte 9 bits 4-7 = 0)
    genome[9] = genome[9] & 0x0F
  } else if (species === 'wolf') {
    // Neural: level 2 (learning) — score 64-127 → byte 12
    genome[12] = 70 + Math.floor(rng() * 50)   // 70-119: level 2
    // Locomotion: fast walk/run (bits 52-55 = byte 6 bits 4-7) — 10-14
    genome[6] = (genome[6] & 0x0F) | ((10 + Math.floor(rng() * 5)) << 4)
    // Vision: compound eyes, medium range (bits 32-35 type=5, bits 36-39 range=8-12)
    genome[4] = (genome[4] & 0xF0) | 5                              // visionType=5
    genome[4] = (genome[4] & 0x0F) | ((8 + Math.floor(rng() * 5)) << 4)  // visionRange
    // Weapon: claws (bits 76-79 = byte 9 bits 4-7 = 1)
    genome[9] = (genome[9] & 0x0F) | (1 << 4)
  } else {
    // boar
    // Neural: level 1 (instinct) — score 16-63
    genome[12] = 25 + Math.floor(rng() * 35)   // 25-59: level 1
    // Locomotion: moderate walk (bits 52-55 = byte 6 bits 4-7) — 7-11
    genome[6] = (genome[6] & 0x0F) | ((7 + Math.floor(rng() * 5)) << 4)
    // Vision: light/dark only (bits 32-35 type=1), short range
    genome[4] = (genome[4] & 0xF0) | 1                              // visionType=1
    genome[4] = (genome[4] & 0x0F) | ((3 + Math.floor(rng() * 4)) << 4)  // visionRange 3-6
    // Weapon: spines/tusks (bits 76-79 = byte 9 bits 4-7 = 4)
    genome[9] = (genome[9] & 0x0F) | (4 << 4)
    // Armor: bit 64-65 (byte 8 bit 0 and 1) — boars are tough
    genome[8] = genome[8] | 0x03
    // Armor thickness bits 68-71 = byte 8 bits 4-7 — medium (6-10)
    genome[8] = (genome[8] & 0x0F) | ((6 + Math.floor(rng() * 5)) << 4)
  }

  return genome
}

/** Spawn the initial animal population around a spawn point. */
export function spawnInitialAnimals(
  spawnX: number, spawnY: number, spawnZ: number,
): void {
  const rand = seededRand(31337)
  const spawnDir = new THREE.Vector3(spawnX, spawnY, spawnZ).normalize()
  const perpBase = Math.abs(spawnDir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()

  function randomSurfacePos(minDist: number, maxDist: number): [number, number, number] | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle   = rand() * Math.PI * 2
      const arcDist = (minDist + rand() * (maxDist - minDist)) / PLANET_RADIUS
      const axis    = tangent.clone().applyAxisAngle(spawnDir, angle)
      const dir     = spawnDir.clone().applyAxisAngle(axis, arcDist)
      const h       = terrainHeightAt(dir)
      if (h < 1) continue
      const r = PLANET_RADIUS + h + 1
      return [dir.x * r, dir.y * r, dir.z * r]
    }
    return null
  }

  // ── Deer: 3 herds of 3-4 each (packId per herd, cap 20) ─────────────────
  // M25: Deer now spawn in named herds so boid rules can group same-packId
  for (let herd = 0; herd < 3; herd++) {
    const center = randomSurfacePos(80, 400)
    if (!center) continue
    const [hcx, hcy, hcz] = center
    const herdSize = 3 + Math.floor(rand() * 2)  // 3-4 per herd
    for (let i = 0; i < herdSize; i++) {
      // Spread herd members within 20m of center
      const angle  = rand() * Math.PI * 2
      const spread = 5 + rand() * 15
      const nx = hcx + Math.cos(angle) * spread
      const nz = hcz + Math.sin(angle) * spread
      const projected = projectOntoSurface(nx, hcy, nz, 1.0)
      const genome = generateSpeciesGenome('deer', rand)
      spawnAnimal('deer', projected[0], projected[1], projected[2], herd, hcx, hcy, hcz, genome)
    }
  }

  // ── Wolves: 4 initial in 2 packs of 2 ────────────────────────────────────
  for (let pack = 0; pack < 2; pack++) {
    const center = randomSurfacePos(200, 600)
    if (!center) continue
    const [cx, cy, cz] = center
    for (let i = 0; i < 2; i++) {
      // Spread pack members within 15m of center
      const angle  = rand() * Math.PI * 2
      const spread = 8 + rand() * 7
      const nx = cx + Math.cos(angle) * spread
      const nz = cz + Math.sin(angle) * spread
      const projected = projectOntoSurface(nx, cy, nz, 0.7)
      const genome = generateSpeciesGenome('wolf', rand)
      spawnAnimal('wolf', projected[0], projected[1], projected[2], pack, cx, cy, cz, genome)
    }
  }

  // ── Boars: 5 initial ─────────────────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const pos = randomSurfacePos(100, 500)
    if (!pos) continue
    const genome = generateSpeciesGenome('boar', rand)
    spawnAnimal('boar', pos[0], pos[1], pos[2], 0, pos[0], pos[1], pos[2], genome)
  }

  // ── Birds: 2 flocks of 8-10 each (M25) ───────────────────────────────────
  // Birds patrol figure-eight paths high above the terrain.
  // packId is the flock index so boid rules group same-flock birds.
  for (let flock = 0; flock < 2; flock++) {
    const center = randomSurfacePos(150, 500)
    if (!center) continue
    const [bcx, bcy, bcz] = center
    const flockSize = BIRD_FLOCK_MIN + Math.floor(rand() * (BIRD_FLOCK_MAX - BIRD_FLOCK_MIN + 1))
    for (let i = 0; i < flockSize; i++) {
      // Spread birds within 15m of flock center at BIRD_ALTITUDE above terrain
      const angle  = rand() * Math.PI * 2
      const spread = 5 + rand() * 10
      const bx = bcx + Math.cos(angle) * spread
      const bz = bcz + Math.sin(angle) * spread
      // Elevate to bird altitude
      const len = Math.sqrt(bx * bx + bcy * bcy + bz * bz)
      const nx = bx / len, ny = bcy / len, nz = bz / len
      const birdR = PLANET_RADIUS + BIRD_ALTITUDE
      const birdX = nx * birdR, birdY = ny * birdR, birdZ = nz * birdR
      spawnAnimal('bird', birdX, birdY, birdZ, flock + 100, bcx, bcy, bcz)
    }
  }
}

// ── Wolf attack cooldown tracker ──────────────────────────────────────────────
const wolfAttackCooldowns = new Map<number, number>()

// ── Main tick ─────────────────────────────────────────────────────────────────

export interface AnimalTickContext {
  dt: number
  playerX: number
  playerY: number
  playerZ: number
  playerMurderCount: number
  playerCrouching: boolean
  onPlayerDamaged: (hp: number) => void
  onAnimalKilled: (animal: AnimalEntity) => void
  /** M32: Called when a tamed animal produces a resource drop (once per 5 in-game minutes). */
  onTamedProductDrop?: (animal: AnimalEntity, materialId: number, label: string) => void
}

// ── M32 Track B: Taming constants ────────────────────────────────────────────
/** 5 in-game minutes = 5 * 60s (real-time). Tunable. */
const TAME_PRODUCT_INTERVAL = 300   // seconds between passive drops
const TAME_FOLLOW_START     = 5     // m — start moving toward player
const TAME_FOLLOW_STOP      = 3     // m — stop following when this close
const TAME_MAX_FOLLOW_DIST  = 15    // m — follow range
const TAME_FOLLOW_SPEED     = 3.5   // m/s

const _v3 = new THREE.Vector3()

export function tickAnimalAI(ctx: AnimalTickContext): void {
  const {
    dt, playerX, playerY, playerZ,
    playerMurderCount, playerCrouching,
    onPlayerDamaged, onAnimalKilled,
  } = ctx

  const toDelete: number[] = []
  const deerPositions: AnimalEntity[] = []
  const birdPositions: AnimalEntity[] = []

  // Collect live deer and birds for flocking calculations
  for (const a of animalRegistry.values()) {
    if (a.behavior === 'DEAD') continue
    if (a.species === 'deer') deerPositions.push(a)
    if (a.species === 'bird') birdPositions.push(a)
  }

  for (const animal of animalRegistry.values()) {
    if (animal.behavior === 'DEAD') {
      animal.deadTimer += dt
      if (animal.deadTimer >= 120) toDelete.push(animal.id)
      continue
    }

    const { species } = animal
    animal.stateTimer += dt

    // M32: Tick tame alert countdown
    if (animal.tameAlertTimer > 0) {
      animal.tameAlertTimer -= dt
      if (animal.tameAlertTimer < 0) animal.tameAlertTimer = 0
    }

    // M32: Tamed animal logic — override normal AI for tamed deer/boar
    if (animal.tamed && (species === 'deer' || species === 'boar')) {
      tickTamedAnimal(animal, ctx)
    } else {
      switch (species) {
        case 'deer': tickDeer(animal, ctx, deerPositions); break
        case 'wolf': tickWolf(animal, ctx, deerPositions, onPlayerDamaged); break
        case 'boar': tickBoar(animal, ctx, onPlayerDamaged); break
        case 'bird': tickBird(animal, ctx, birdPositions); break
      }
    }

    // Clamp position to surface after movement — birds float at altitude, others walk terrain
    if (species === 'bird') {
      // Birds: keep above terrain at BIRD_ALTITUDE; don't clamp to ground
      const len = Math.sqrt(animal.x * animal.x + animal.y * animal.y + animal.z * animal.z)
      if (len > 1) {
        const nx = animal.x / len, ny = animal.y / len, nz = animal.z / len
        const dir = new THREE.Vector3(nx, ny, nz)
        const h = Math.max(0, terrainHeightAt(dir))
        const targetR = PLANET_RADIUS + h + BIRD_ALTITUDE
        // Gently drift toward target altitude
        const currentR = len
        const rDelta = (targetR - currentR) * 2 * dt
        const newR = currentR + rDelta
        animal.x = nx * newR; animal.y = ny * newR; animal.z = nz * newR
      }
    } else {
      const size = species === 'deer' ? 1.0 : species === 'wolf' ? 0.7 : 1.2
      const [sx, sy, sz] = projectOntoSurface(animal.x, animal.y, animal.z, size)
      if (sy > 0) {
        animal.x = sx; animal.y = sy; animal.z = sz
      }
    }
  }

  for (const id of toDelete) animalRegistry.delete(id)
}

// ── M32: Tamed animal AI ──────────────────────────────────────────────────────
// Tamed deer and boar follow the player within 15m and produce resources
// passively every TAME_PRODUCT_INTERVAL seconds.

function tickTamedAnimal(a: AnimalEntity, ctx: AnimalTickContext): void {
  const { dt, playerX, playerY, playerZ, onTamedProductDrop } = ctx

  const dpx = playerX - a.x
  const dpy = playerY - a.y
  const dpz = playerZ - a.z
  const playerDist = Math.sqrt(dpx * dpx + dpy * dpy + dpz * dpz)

  // Follow logic: move toward player if >5m, stop if <3m
  if (playerDist > TAME_FOLLOW_START && playerDist < TAME_MAX_FOLLOW_DIST) {
    const invD = 1 / playerDist
    a.vx = dpx * invD * TAME_FOLLOW_SPEED
    a.vz = dpz * invD * TAME_FOLLOW_SPEED
    a.behavior = 'GRAZING'  // visually neutral
  } else if (playerDist <= TAME_FOLLOW_STOP || playerDist >= TAME_MAX_FOLLOW_DIST) {
    a.vx *= 0.85  // decelerate
    a.vz *= 0.85
  }

  a.x += a.vx * dt
  a.y += dpy * 0  // no vertical drift
  a.z += a.vz * dt

  // Passive product timer
  a.productTimer += dt
  if (a.productTimer >= TAME_PRODUCT_INTERVAL) {
    a.productTimer = 0
    // Deer produces Leather (shedding), Boar produces Raw Meat
    if (a.species === 'deer') {
      onTamedProductDrop?.(a, MAT_LEATHER, 'Leather')
    } else if (a.species === 'boar') {
      onTamedProductDrop?.(a, MAT_RAW_MEAT, 'Meat')
    }
  }
}

// ── M32: Taming API ───────────────────────────────────────────────────────────

/**
 * Attempt to tame the nearest non-aggro, non-tamed deer or boar within range.
 * Returns the animal entity if an attempt was made (success or fail), null if none in range.
 * `survivalLevel` is the player's Survival skill level (0-10).
 */
export function attemptTameNearestAnimal(
  px: number, py: number, pz: number,
  survivalLevel: number,
  range = 3,
): { animal: AnimalEntity; success: boolean } | null {
  let nearest: AnimalEntity | null = null
  let nearestDist = range

  for (const a of animalRegistry.values()) {
    if (a.behavior === 'DEAD') continue
    if (a.species !== 'deer' && a.species !== 'boar') continue
    if (a.tamed) continue
    if (a.tameAlertTimer > 0) continue  // on alert — won't accept
    // Only non-aggro animals: deer must be GRAZING/FLOCKING, boar must be ROAMING
    const isNonAggro = a.species === 'deer'
      ? (a.behavior === 'GRAZING' || a.behavior === 'FLOCKING')
      : a.behavior === 'ROAMING'
    if (!isNonAggro) continue

    const dx = a.x - px, dy = a.y - py, dz = a.z - pz
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < nearestDist) { nearestDist = d; nearest = a }
  }

  if (!nearest) return null

  // Success chance: 30% base + 5% per Survival level
  const chance = 0.30 + survivalLevel * 0.05
  const success = Math.random() < chance

  if (success) {
    nearest.tamed = true
    nearest.ownerId = 0  // local player ID
    nearest.petName = nearest.species  // default name (caller can rename)
    nearest.productTimer = 0
    // Tamed animal stops fleeing
    nearest.behavior = nearest.species === 'deer' ? 'GRAZING' : 'ROAMING'
  } else {
    // Failed tame — animal goes on alert for 30s
    nearest.tameAlertTimer = 30
    if (nearest.species === 'deer') {
      nearest.behavior = 'FLEEING'
      nearest.stateTimer = 0
    }
  }

  return { animal: nearest, success }
}

/**
 * Find the nearest tameable (non-tamed, non-aggro) deer or boar within range.
 * Used by GameLoop to show the "[F] Tame {species}" prompt.
 */
export function findNearestTameableAnimal(
  px: number, py: number, pz: number,
  range = 3,
): AnimalEntity | null {
  let nearest: AnimalEntity | null = null
  let nearestDist = range

  for (const a of animalRegistry.values()) {
    if (a.behavior === 'DEAD') continue
    if (a.species !== 'deer' && a.species !== 'boar') continue
    if (a.tamed) continue
    if (a.tameAlertTimer > 0) continue
    const isNonAggro = a.species === 'deer'
      ? (a.behavior === 'GRAZING' || a.behavior === 'FLOCKING')
      : a.behavior === 'ROAMING'
    if (!isNonAggro) continue

    const dx = a.x - px, dy = a.y - py, dz = a.z - pz
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < nearestDist) { nearestDist = d; nearest = a }
  }

  return nearest
}

/**
 * Rename a tamed animal by id.
 */
export function renameTamedAnimal(animalId: number, name: string): boolean {
  const a = animalRegistry.get(animalId)
  if (!a || !a.tamed) return false
  a.petName = name.trim().slice(0, 24) || a.species
  return true
}

// ── Deer AI ───────────────────────────────────────────────────────────────────

function tickDeer(
  a: AnimalEntity,
  ctx: AnimalTickContext,
  allDeer: AnimalEntity[],
): void {
  const { dt, playerX, playerY, playerZ, playerCrouching } = ctx

  const dpx = playerX - a.x
  const dpy = playerY - a.y
  const dpz = playerZ - a.z
  const playerDist = Math.sqrt(dpx * dpx + dpy * dpy + dpz * dpz)

  // Apply genome phenotype: speed and detection range
  const speedMult = a.phenotype?.speedMult ?? 1.0
  const detectionBonus = a.phenotype ? (a.phenotype.detectionRange - 15) * 0.5 : 0  // genome shifts baseline
  const fleeRadiusBase = playerCrouching
    ? DEER_FLEE_RADIUS_CROUCH
    : Math.max(10, DEER_FLEE_RADIUS + detectionBonus)
  const fleeRadius = fleeRadiusBase

  // [GenomeDebug] Deer phenotype — log once per new state entry
  if (a.stateTimer < 0.05) {
    console.log(
      `[GenomeDebug] Deer #${a.id} phenotype: speedMult=${speedMult.toFixed(2)} ` +
      `fleeRadius=${fleeRadius.toFixed(1)}m behaviorTier=${a.phenotype?.behaviorTier ?? 1} ` +
      `maxHealth=${a.maxHealth} state=${a.behavior}`
    )
  }

  // ── M25: Wolf proximity detection — scatter the whole herd ───────────────
  // Check for nearby wolves (predator threat triggers coordinated scatter)
  if (a.behavior === 'GRAZING' || a.behavior === 'FLOCKING') {
    for (const other of animalRegistry.values()) {
      if (other.species !== 'wolf' || other.behavior === 'DEAD') continue
      const wx = other.x - a.x, wy = other.y - a.y, wz = other.z - a.z
      const wolfDist = Math.sqrt(wx * wx + wy * wy + wz * wz)
      if (wolfDist < DEER_WOLF_ALERT_RADIUS) {
        // Scatter this deer and nearby herd-mates (same packId)
        a.behavior = 'SCATTER'
        a.scatterTimer = DEER_SCATTER_DURATION
        a.stateTimer = 0
        // Pick random scatter direction away from wolf
        const angle = Math.random() * Math.PI * 2
        const scatterSpeed = DEER_SCATTER_SPEED * speedMult
        a.vx = Math.cos(angle) * scatterSpeed
        a.vz = Math.sin(angle) * scatterSpeed
        break
      }
    }
  }

  // ── State transitions ─────────────────────────────────────────────────────
  if (a.behavior === 'GRAZING' && playerDist < fleeRadius) {
    a.behavior = 'FLEEING'
    a.stateTimer = 0
  } else if (a.behavior === 'FLEEING' && playerDist > DEER_STOP_FLEE_RADIUS) {
    a.behavior = 'GRAZING'
    a.stateTimer = 0
  } else if (a.behavior === 'SCATTER') {
    a.scatterTimer -= dt
    if (a.scatterTimer <= 0) {
      // Regroup: return to flocking with herd-mates
      a.behavior = 'FLOCKING'
      a.stateTimer = 0
    }
  } else if (a.behavior === 'FLOCKING' && playerDist < fleeRadius) {
    a.behavior = 'FLEEING'
    a.stateTimer = 0
  } else if (a.behavior === 'FLEEING' && playerDist > DEER_STOP_FLEE_RADIUS) {
    a.behavior = 'FLOCKING'
    a.stateTimer = 0
  }

  // ── Behavior tier (reflex-only: pure wander, no flocking) ────────────────
  const behaviorTier = a.phenotype?.behaviorTier ?? 1

  // ── GRAZING: slow wander with legacy partial flocking ────────────────────
  if (a.behavior === 'GRAZING') {
    a.wanderTimer -= dt
    if (a.wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2
      const grazeSpeed = DEER_SPEED_GRAZE * speedMult
      a.vx = Math.cos(angle) * grazeSpeed
      a.vz = Math.sin(angle) * grazeSpeed
      a.vy = 0
      a.wanderTimer = 3 + Math.random() * 5
    }

    // Tier 0 (reflex only): pure wander, no flocking
    if (behaviorTier < 1) {
      const grazeSpeedClamped = DEER_SPEED_GRAZE * speedMult
      const spd0 = Math.sqrt(a.vx * a.vx + a.vz * a.vz)
      if (spd0 > grazeSpeedClamped) {
        a.vx = (a.vx / spd0) * grazeSpeedClamped
        a.vz = (a.vz / spd0) * grazeSpeedClamped
      }
      a.x += a.vx * dt
      a.y += a.vy * dt
      a.z += a.vz * dt
      return
    }

    // Tier 1+: apply full boid rules from FlockingSystem
    const sameHerd = allDeer.filter(d => d.packId === a.packId && d.id !== a.id)
    const boidDelta = applyBoidRules(a, sameHerd)
    a.vx += boidDelta.dvx * dt * 0.5
    a.vz += boidDelta.dvz * dt * 0.5

    const grazeSpeedMax = DEER_SPEED_GRAZE * speedMult
    const spd = Math.sqrt(a.vx * a.vx + a.vz * a.vz)
    if (spd > grazeSpeedMax) {
      a.vx = (a.vx / spd) * grazeSpeedMax
      a.vz = (a.vz / spd) * grazeSpeedMax
    }
  }

  // ── FLOCKING: full Reynolds boid herd movement ────────────────────────────
  if (a.behavior === 'FLOCKING') {
    // Only flock with deer in same pack (herd group)
    const sameHerd = allDeer.filter(d => d.packId === a.packId && d.id !== a.id)

    if (sameHerd.length >= DEER_HERD_SIZE_MIN - 1) {
      const boidDelta = applyBoidRules(a, sameHerd)
      a.vx += boidDelta.dvx * dt
      a.vz += boidDelta.dvz * dt
    } else {
      // Herd too small — wander toward nearest deer regardless of pack
      a.wanderTimer -= dt
      if (a.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2
        const grazeSpeed = DEER_SPEED_GRAZE * speedMult
        a.vx = Math.cos(angle) * grazeSpeed
        a.vz = Math.sin(angle) * grazeSpeed
        a.wanderTimer = 3 + Math.random() * 5
      }
    }

    const flockSpeedMax = DEER_SPEED_GRAZE * speedMult * 1.2
    const flockSpd = Math.sqrt(a.vx * a.vx + a.vz * a.vz)
    if (flockSpd > flockSpeedMax) {
      a.vx = (a.vx / flockSpd) * flockSpeedMax
      a.vz = (a.vz / flockSpd) * flockSpeedMax
    }
  }

  // ── SCATTER: burst away for DEER_SCATTER_DURATION, then regroup ───────────
  if (a.behavior === 'SCATTER') {
    // Maintain scatter velocity — boid separation pushes herd-mates apart
    const sameHerd = allDeer.filter(d => d.packId === a.packId && d.id !== a.id)
    // Only apply separation rule during scatter (push apart, not cohesion)
    for (const other of sameHerd) {
      const dx = a.x - other.x, dz = a.z - other.z
      const d2 = dx * dx + dz * dz
      if (d2 < 25 && d2 > 0.001) {
        const d = Math.sqrt(d2)
        a.vx += (dx / d) * 2.0
        a.vz += (dz / d) * 2.0
      }
    }
    const scatterSpeedMax = DEER_SCATTER_SPEED * speedMult
    const scatterSpd = Math.sqrt(a.vx * a.vx + a.vz * a.vz)
    if (scatterSpd > scatterSpeedMax) {
      a.vx = (a.vx / scatterSpd) * scatterSpeedMax
      a.vz = (a.vz / scatterSpd) * scatterSpeedMax
    }
  }

  // ── FLEEING: run directly away from player ────────────────────────────────
  if (a.behavior === 'FLEEING') {
    if (playerDist > 0.1) {
      const invD = 1 / playerDist
      const fleeSpeed = DEER_SPEED_FLEE * speedMult
      a.vx = -(dpx * invD) * fleeSpeed
      a.vz = -(dpz * invD) * fleeSpeed
      a.vy = 0
    }
  }

  // ── Apply velocity ────────────────────────────────────────────────────────
  a.x += a.vx * dt
  a.y += a.vy * dt
  a.z += a.vz * dt
}

// ── Bird AI ───────────────────────────────────────────────────────────────────
// M25: Birds flock at altitude in figure-eight patrol paths, tighten formation
// when the player approaches within BIRD_TIGHTEN_RADIUS.

function tickBird(
  a: AnimalEntity,
  ctx: AnimalTickContext,
  allBirds: AnimalEntity[],
): void {
  const { dt, playerX, playerY, playerZ } = ctx

  // Player proximity — tighten formation
  const dpx = playerX - a.x
  const dpy = playerY - a.y
  const dpz = playerZ - a.z
  const playerDist = Math.sqrt(dpx * dpx + dpy * dpy + dpz * dpz)
  const tightening = playerDist < BIRD_TIGHTEN_RADIUS ? BIRD_TIGHTEN_FACTOR : 1.0

  // ── Figure-eight patrol target ────────────────────────────────────────────
  // Lissajous figure-eight: x = R·sin(t), z = R·sin(2t) centered on patrolCx/Cz
  a.flightPhase += dt * 0.3  // angular speed: one loop ~21s
  const t = a.flightPhase
  const figR = BIRD_FIGURE8_RADIUS * tightening
  const targetX = a.patrolCx + figR * Math.sin(t)
  const targetZ = a.patrolCz + figR * Math.sin(2 * t) * 0.5
  const targetY = a.patrolCy  // altitude maintained by outer loop

  // Direction toward figure-eight waypoint
  const wtx = targetX - a.x
  const wty = targetY - a.y
  const wtz = targetZ - a.z
  const wtDist = Math.sqrt(wtx * wtx + wty * wty + wtz * wtz)

  if (wtDist > 1) {
    const invD = 1 / wtDist
    a.vx = wtx * invD * BIRD_SPEED
    a.vy = wty * invD * BIRD_SPEED * 0.3  // gentle vertical adjustment
    a.vz = wtz * invD * BIRD_SPEED
  }

  // ── Apply boid rules within same flock (packId) ───────────────────────────
  const sameFlock = allBirds.filter(b => b.packId === a.packId && b.id !== a.id)
  if (sameFlock.length > 0) {
    const boidDelta = applyBoidRules(a, sameFlock)
    // Scale separation/cohesion radii by tightening factor: formation tightens near player
    a.vx += boidDelta.dvx * dt * tightening
    a.vy += boidDelta.dvy * dt * tightening * 0.3
    a.vz += boidDelta.dvz * dt * tightening
  }

  // Clamp to cruise speed
  const spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy + a.vz * a.vz)
  if (spd > BIRD_SPEED) {
    const invSpd = BIRD_SPEED / spd
    a.vx *= invSpd; a.vy *= invSpd; a.vz *= invSpd
  }

  // Apply velocity
  a.x += a.vx * dt
  a.y += a.vy * dt
  a.z += a.vz * dt
}

// ── Wolf AI ───────────────────────────────────────────────────────────────────

function tickWolf(
  a: AnimalEntity,
  ctx: AnimalTickContext,
  allDeer: AnimalEntity[],
  onPlayerDamaged: (hp: number) => void,
): void {
  const { dt, playerX, playerY, playerZ, playerMurderCount } = ctx

  const dpx = playerX - a.x
  const dpy = playerY - a.y
  const dpz = playerZ - a.z
  const playerDist = Math.sqrt(dpx * dpx + dpy * dpy + dpz * dpz)

  // Genome-derived stats: scale patrol/hunt speed and detection radius
  const speedMult = a.phenotype?.speedMult ?? 1.0
  const detectionRange = a.phenotype?.detectionRange ?? WOLF_HUNT_RADIUS
  const attackDamage = a.phenotype?.attackDamage ?? WOLF_DAMAGE
  const armorReduction = a.phenotype?.armorReduction ?? 0

  const huntRadius   = Math.max(15, detectionRange)
  const playerRadius = Math.max(10, detectionRange * 0.67)

  // Behavior tier: higher-tier wolves have more sophisticated hunt patterns
  // Tier 0: simple wander only — very rare for wolves given their genome
  // Tier 1+: standard state machine
  const behaviorTier = a.phenotype?.behaviorTier ?? 1

  // ── State transitions ─────────────────────────────────────────────────────
  if (a.behavior === 'PATROLLING') {
    // Check for player threat (bloodthirsty: murder_count >= 3)
    if (playerMurderCount >= 3 && playerDist < playerRadius) {
      a.behavior = 'ATTACKING_PLAYER'
      a.stateTimer = 0
    } else {
      // Check for nearby deer to hunt (use genome-derived detection range)
      let nearestDeer: AnimalEntity | null = null
      let nearestDeerDist = huntRadius
      for (const deer of allDeer) {
        if (deer.behavior === 'DEAD') continue
        const dx = deer.x - a.x, dy = deer.y - a.y, dz = deer.z - a.z
        const d  = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < nearestDeerDist) { nearestDeerDist = d; nearestDeer = deer }
      }
      if (nearestDeer) {
        a.behavior = 'HUNTING_DEER'
        a.stateTimer = 0
      }
    }
  } else if (a.behavior === 'HUNTING_DEER') {
    // Re-evaluate: if no deer within 2× hunt radius, return to patrol
    const giveUpRange = huntRadius * 2
    let hasDeer = false
    for (const deer of allDeer) {
      if (deer.behavior === 'DEAD') continue
      const dx = deer.x - a.x, dy = deer.y - a.y, dz = deer.z - a.z
      const d  = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < giveUpRange) { hasDeer = true; break }
    }
    if (!hasDeer) a.behavior = 'PATROLLING'
    // Wolves always prioritize a murderous player
    if (playerMurderCount >= 3 && playerDist < playerRadius) {
      a.behavior = 'ATTACKING_PLAYER'
    }
  } else if (a.behavior === 'ATTACKING_PLAYER') {
    // Disengage if player flees beyond 50m
    if (playerDist > 50) a.behavior = 'PATROLLING'
  } else if (a.behavior === 'AGGRO') {
    // M24: Aggro retaliation — chase player who attacked
    const aggroTimeLeft = aggroTimers.get(a.id) ?? 0
    if (aggroTimeLeft <= 0 || playerDist > AGGRO_DISENGAGE_DIST) {
      a.behavior = 'PATROLLING'
      a.stateTimer = 0
      aggroTimers.delete(a.id)
    }
  }

  // ── Behavior execution ────────────────────────────────────────────────────
  const patrolSpeed = WOLF_SPEED_PATROL * speedMult
  const huntSpeed   = WOLF_SPEED_HUNT   * speedMult

  if (a.behavior === 'PATROLLING') {
    // Tier 0 wolves (reflex-only): pure random wander, ignore pack center
    if (behaviorTier === 0) {
      a.wanderTimer -= dt
      if (a.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2
        a.vx = Math.cos(angle) * patrolSpeed
        a.vz = Math.sin(angle) * patrolSpeed
        a.wanderTimer = 4 + Math.random() * 6
      }
    } else {
      a.wanderTimer -= dt
      if (a.wanderTimer <= 0) {
        // Patrol around pack center
        const angle   = Math.random() * Math.PI * 2
        const radius  = 20 + Math.random() * 40
        const tx = a.patrolCx + Math.cos(angle) * radius
        const tz = a.patrolCz + Math.sin(angle) * radius
        const dx = tx - a.x, dz = tz - a.z
        const d  = Math.sqrt(dx * dx + dz * dz) + 0.001
        a.vx = (dx / d) * patrolSpeed
        a.vz = (dz / d) * patrolSpeed
        a.wanderTimer = 4 + Math.random() * 6
      }
    }
  }

  if (a.behavior === 'HUNTING_DEER') {
    // Find nearest live deer
    let nearestDeer: AnimalEntity | null = null
    let nearestDeerDist = Infinity
    for (const deer of allDeer) {
      if (deer.behavior === 'DEAD') continue
      const dx = deer.x - a.x, dy = deer.y - a.y, dz = deer.z - a.z
      const d  = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < nearestDeerDist) { nearestDeerDist = d; nearestDeer = deer }
    }
    if (nearestDeer) {
      // Tier 2+ wolves: stalk (slow approach) when far, rush when close
      const useStalk = behaviorTier >= 2 && nearestDeerDist > WOLF_DEER_ATTACK_RADIUS * 2
      const chaseSpd = useStalk ? huntSpeed * 0.4 : huntSpeed
      const dx = nearestDeer.x - a.x
      const dz = nearestDeer.z - a.z
      const d  = Math.sqrt(dx * dx + dz * dz) + 0.001
      a.vx = (dx / d) * chaseSpd
      a.vz = (dz / d) * chaseSpd

      // Attack deer at close range — genome damage affects kill speed
      if (nearestDeerDist < WOLF_DEER_ATTACK_RADIUS) {
        const deerArmorReduction = nearestDeer.phenotype?.armorReduction ?? 0
        const effectiveDamage = 25 * (1 - deerArmorReduction)
        nearestDeer.health -= effectiveDamage * dt  // kills deer in ~1.6s sustained (base)
        if (nearestDeer.health <= 0) {
          nearestDeer.behavior = 'DEAD'
          nearestDeer.deadTimer = 0
          // Wolf kill: deer drops loot
          pendingLoot.push(
            { x: nearestDeer.x, y: nearestDeer.y, z: nearestDeer.z, materialId: MAT_RAW_MEAT, quantity: 2, label: 'Raw Meat (wolf kill)' },
          )
          a.behavior = 'PATROLLING'
        }
      }
    }
  }

  if (a.behavior === 'ATTACKING_PLAYER') {
    if (playerDist > 0.1) {
      const invD = 1 / playerDist
      a.vx = dpx * invD * huntSpeed
      a.vz = dpz * invD * huntSpeed
    }
    // Deal damage at melee range — genome-derived attackDamage
    if (playerDist < WOLF_ATTACK_RADIUS) {
      const cooldown = wolfAttackCooldowns.get(a.id) ?? 0
      if (cooldown <= 0) {
        // armorReduction reduces incoming damage to player (player has no genome here; use wolf attack)
        onPlayerDamaged(attackDamage)
        wolfAttackCooldowns.set(a.id, WOLF_ATTACK_COOLDOWN)
      }
    }
  }

  // M24: AGGRO behavior — chase at 1.5x speed, attack at melee range
  if (a.behavior === 'AGGRO') {
    const aggroSpeed = huntSpeed * 1.5
    if (playerDist > 0.1) {
      const invD = 1 / playerDist
      a.vx = dpx * invD * aggroSpeed
      a.vz = dpz * invD * aggroSpeed
    }
    if (playerDist < WOLF_ATTACK_RADIUS) {
      const cooldown = wolfAttackCooldowns.get(a.id) ?? 0
      if (cooldown <= 0) {
        onPlayerDamaged(Math.round(attackDamage * 1.2))  // aggro bonus damage
        wolfAttackCooldowns.set(a.id, WOLF_ATTACK_COOLDOWN)
      }
    }
    // Tick aggro timer
    const t = aggroTimers.get(a.id) ?? 0
    aggroTimers.set(a.id, t - dt)
  }

  // armorReduction: wolf's own armor reduces incoming damage (applied in attackNearestAnimal).
  // Log wolf phenotype once per state entry for developer verification.
  if (a.stateTimer < 0.05) {
    console.log(
      `[GenomeDebug] Wolf #${a.id} phenotype: speedMult=${speedMult.toFixed(2)} ` +
      `huntRadius=${huntRadius.toFixed(1)}m attackDamage=${attackDamage} ` +
      `armorReduction=${(armorReduction * 100).toFixed(0)}% behaviorTier=${behaviorTier} ` +
      `state=${a.behavior}`
    )
  }

  // Tick attack cooldown
  const cd = wolfAttackCooldowns.get(a.id) ?? 0
  if (cd > 0) wolfAttackCooldowns.set(a.id, cd - dt)

  // Apply velocity
  a.x += a.vx * dt
  a.z += a.vz * dt
}

// ── Boar AI ───────────────────────────────────────────────────────────────────

const boarAttackCooldowns = new Map<number, number>()

function tickBoar(
  a: AnimalEntity,
  ctx: AnimalTickContext,
  onPlayerDamaged: (hp: number) => void,
): void {
  const { dt, playerX, playerY, playerZ } = ctx

  const dpx = playerX - a.x
  const dpy = playerY - a.y
  const dpz = playerZ - a.z
  const playerDist = Math.sqrt(dpx * dpx + dpy * dpy + dpz * dpz)

  // Genome-derived stats
  const speedMult      = a.phenotype?.speedMult      ?? 1.0
  const detectionRange = a.phenotype?.detectionRange ?? BOAR_TRIGGER_RADIUS
  const attackDamage   = a.phenotype?.attackDamage   ?? BOAR_DAMAGE
  const armorReduction = a.phenotype?.armorReduction ?? 0
  const behaviorTier   = a.phenotype?.behaviorTier   ?? 1
  const triggerRadius  = Math.max(4, Math.min(16, detectionRange * 0.4))

  // [GenomeDebug] Boar phenotype — log once per new state entry
  if (a.stateTimer < 0.05) {
    console.log(
      `[GenomeDebug] Boar #${a.id} phenotype: speedMult=${speedMult.toFixed(2)} ` +
      `detectionRange=${detectionRange.toFixed(1)}m attackDamage=${attackDamage} ` +
      `armorReduction=${(armorReduction * 100).toFixed(0)}% behaviorTier=${behaviorTier} ` +
      `state=${a.behavior}`
    )
  }

  // ── State transitions ─────────────────────────────────────────────────────
  if (a.behavior === 'ROAMING' && playerDist < triggerRadius) {
    a.behavior = 'CHARGING'
    a.chargeTimer = BOAR_CHARGE_DURATION
    a.stateTimer = 0
  } else if (a.behavior === 'CHARGING') {
    a.chargeTimer -= dt
    if (a.chargeTimer <= 0) {
      a.behavior = 'ROAMING'
      a.stateTimer = 0
      a.vx = 0; a.vz = 0
    }
  } else if (a.behavior === 'AGGRO') {
    // M24: Aggro retaliation — disengage conditions
    const aggroTimeLeft = aggroTimers.get(a.id) ?? 0
    if (aggroTimeLeft <= 0 || playerDist > AGGRO_DISENGAGE_DIST) {
      a.behavior = 'ROAMING'
      a.stateTimer = 0
      aggroTimers.delete(a.id)
    }
  }

  // ── Roaming ───────────────────────────────────────────────────────────────
  if (a.behavior === 'ROAMING') {
    a.wanderTimer -= dt
    if (a.wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2
      const roamSpeed = BOAR_ROAM_SPEED * speedMult
      a.vx = Math.cos(angle) * roamSpeed
      a.vz = Math.sin(angle) * roamSpeed
      // Tier 0 boars (reflex-only) change direction more frequently — simpler cognition
      a.wanderTimer = behaviorTier === 0 ? 1 + Math.random() * 2 : 3 + Math.random() * 6
    }
  }

  // ── Charging: lock onto player direction, rush forward ───────────────────
  if (a.behavior === 'CHARGING') {
    const chargeSpeed = BOAR_CHARGE_SPEED * speedMult
    if (playerDist > 0.1) {
      const invD = 1 / playerDist
      a.vx = dpx * invD * chargeSpeed
      a.vz = dpz * invD * chargeSpeed
    }
    // Deal impact damage when within contact range — genome-derived damage
    // armorReduction on the boar's own genome does NOT reduce player damage (boar is attacker);
    // it instead reduces damage the boar receives. Stored here for use in attackNearestAnimal().
    if (playerDist < 2.5) {
      const cd = boarAttackCooldowns.get(a.id) ?? 0
      if (cd <= 0) {
        onPlayerDamaged(attackDamage)
        boarAttackCooldowns.set(a.id, 1.5)
      }
    }
  }

  // M24: AGGRO behavior — charge at 2x speed, deal damage on contact
  if (a.behavior === 'AGGRO') {
    const aggroChargeSpeed = BOAR_CHARGE_SPEED * speedMult * 1.2
    if (playerDist > 0.1) {
      const invD = 1 / playerDist
      a.vx = dpx * invD * aggroChargeSpeed
      a.vz = dpz * invD * aggroChargeSpeed
    }
    if (playerDist < 2.5) {
      const cd2 = boarAttackCooldowns.get(a.id) ?? 0
      if (cd2 <= 0) {
        onPlayerDamaged(Math.round(attackDamage * 1.3))  // aggro bonus damage
        boarAttackCooldowns.set(a.id, 1.5)
      }
    }
    const t = aggroTimers.get(a.id) ?? 0
    aggroTimers.set(a.id, t - dt)
  }

  // Suppress unused variable warning (armorReduction is applied in attackNearestAnimal)
  void armorReduction

  // Tick attack cooldown
  const cd = boarAttackCooldowns.get(a.id) ?? 0
  if (cd > 0) boarAttackCooldowns.set(a.id, cd - dt)

  // Apply velocity
  a.x += a.vx * dt
  a.z += a.vz * dt
}

// ── Attack animal (called from SceneRoot weapon hit detection) ────────────────

export interface AnimalKillLoot {
  materialId: number
  quantity: number
  label: string
}

const ANIMAL_LOOT: Record<AnimalSpecies, AnimalKillLoot[]> = {
  deer: [
    { materialId: MAT_RAW_MEAT, quantity: 4, label: 'Raw Meat' },
    { materialId: MAT_LEATHER,  quantity: 2, label: 'Leather' },
    { materialId: MAT_BONE,     quantity: 1, label: 'Bone' },
  ],
  wolf: [
    { materialId: MAT_RAW_MEAT,  quantity: 1, label: 'Raw Meat' },
    { materialId: MAT_WOLF_PELT, quantity: 2, label: 'Wolf Pelt' },
  ],
  boar: [
    { materialId: MAT_RAW_MEAT,  quantity: 3, label: 'Raw Meat' },
    { materialId: MAT_BOAR_TUSK, quantity: 1, label: 'Boar Tusk' },
  ],
  // Birds are not directly attackable in normal gameplay; empty loot table
  bird: [],
}

/**
 * Deal damage to the nearest animal within range.
 * Returns { killed, loot } if an animal was in range and hit.
 * `killed` is the animal entity if it died, null if it survived.
 * Returns null only if no animal was in range.
 */
export function attackNearestAnimal(
  px: number, py: number, pz: number,
  damage: number,
  range: number,
): { killed: AnimalEntity | null; hit: AnimalEntity | null; loot: AnimalKillLoot[]; effectiveDamage: number } | null {
  let nearest: AnimalEntity | null = null
  let nearestDist = range

  for (const a of animalRegistry.values()) {
    if (a.behavior === 'DEAD') continue
    const dx = a.x - px, dy = a.y - py, dz = a.z - pz
    const d  = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < nearestDist) { nearestDist = d; nearest = a }
  }

  if (!nearest) return null

  // Apply genome armor reduction: armored animals (boars in particular) absorb some damage
  const armorReduction = nearest.phenotype?.armorReduction ?? 0
  const effectiveDamage = damage * (1 - armorReduction)
  console.log(
    `[GenomeDebug] attackNearestAnimal: ${nearest.species} #${nearest.id} ` +
    `rawDamage=${damage.toFixed(1)} armorReduction=${(armorReduction * 100).toFixed(0)}% ` +
    `effectiveDamage=${effectiveDamage.toFixed(1)} hp=${nearest.health.toFixed(1)}/${nearest.maxHealth}`
  )
  nearest.health -= effectiveDamage

  // M24: Trigger aggro on hit (wolves and boars retaliate, deer flee)
  if (nearest.health > 0) {
    if (nearest.species === 'wolf' || nearest.species === 'boar') {
      // Enter AGGRO state — chase and attack the player who hit them
      if (nearest.behavior !== 'AGGRO' && nearest.behavior !== 'ATTACKING_PLAYER') {
        nearest.behavior = 'AGGRO'
        nearest.stateTimer = 0
        aggroTimers.set(nearest.id, AGGRO_TIMEOUT)
      }
    } else if (nearest.species === 'deer') {
      // Deer flee when hit
      if (nearest.behavior !== 'FLEEING') {
        nearest.behavior = 'FLEEING'
        nearest.stateTimer = 0
      }
    }
    return { killed: null, hit: nearest, loot: [], effectiveDamage }
  }

  // Animal died — queue respawn
  nearest.behavior = 'DEAD'
  nearest.deadTimer = 0
  respawnQueue.push({
    species: nearest.species,
    x: nearest.x, y: nearest.y, z: nearest.z,
    timer: RESPAWN_DELAY,
    packId: nearest.packId,
    patrolCx: nearest.patrolCx,
    patrolCy: nearest.patrolCy,
    patrolCz: nearest.patrolCz,
  })
  const loot = ANIMAL_LOOT[nearest.species]
  return { killed: nearest, hit: nearest, loot, effectiveDamage }
}

// ── Ecosystem respawn (call periodically from GameLoop) ───────────────────────

/**
 * Check population levels and respawn animals if below 50% of cap.
 * Should be called every ~30 seconds from the GameLoop.
 *
 * Reproduction mechanic: when a new animal is born, we find an existing
 * conspecific (parent A) and optionally a second (parent B for crossover),
 * then run MutationEngine on the offspring genome. This means population
 * pressure drives evolution — genomes drift and speciate over time.
 */
export function tickEcosystemBalance(
  spawnX: number, spawnY: number, spawnZ: number,
): void {
  const rand = seededRand(Date.now() % 99999)
  const spawnDir = new THREE.Vector3(spawnX, spawnY, spawnZ).normalize()
  const perpBase = Math.abs(spawnDir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()

  function randPos(minDist: number, maxDist: number): [number, number, number] | null {
    for (let i = 0; i < 20; i++) {
      const angle   = rand() * Math.PI * 2
      const arcDist = (minDist + rand() * (maxDist - minDist)) / PLANET_RADIUS
      const axis    = tangent.clone().applyAxisAngle(spawnDir, angle)
      const dir     = spawnDir.clone().applyAxisAngle(axis, arcDist)
      const h       = terrainHeightAt(dir)
      if (h < 1) continue
      const r = PLANET_RADIUS + h + 1
      return [dir.x * r, dir.y * r, dir.z * r]
    }
    return null
  }

  /**
   * Find live parents of a given species to use for reproduction.
   * Returns [parentA, parentB?] — parentB may be null for asexual reproduction.
   */
  function findParents(species: AnimalSpecies): [AnimalEntity | null, AnimalEntity | null] {
    const candidates: AnimalEntity[] = []
    for (const a of animalRegistry.values()) {
      if (a.species === species && a.behavior !== 'DEAD' && a.phenotype) {
        candidates.push(a)
      }
    }
    if (candidates.length === 0) return [null, null]
    const pa = candidates[Math.floor(rand() * candidates.length)]
    const others = candidates.filter(c => c.id !== pa.id)
    const pb = others.length > 0 ? others[Math.floor(rand() * others.length)] : null
    return [pa, pb]
  }

  /**
   * Create offspring genome via crossover (if two parents available)
   * then apply MutationEngine. Discards lethal genomes and uses parent genome instead.
   */
  function reproduceGenome(species: AnimalSpecies): Genome {
    const [pa, pb] = findParents(species)

    let offspringGenome: Genome
    if (pa?.phenotype && pb?.phenotype) {
      // Sexual reproduction: crossover between two parents
      offspringGenome = _encoder.crossover(pa.phenotype.genome, pb.phenotype.genome, rand)
    } else if (pa?.phenotype) {
      // Asexual: clone parent genome
      offspringGenome = new Uint8Array(pa.phenotype.genome)
    } else {
      // No parents found (first generation): generate a fresh species genome
      return generateSpeciesGenome(species, rand)
    }

    // Apply mutations (mutagenLevel=0 = clean environment, 1 generation)
    _mutationEngine.mutate(offspringGenome, 0, 1, rand, Date.now())

    // If genome is lethal, fall back to parent A's genome
    if (_mutationEngine.isLethal(offspringGenome) && pa?.phenotype) {
      offspringGenome = new Uint8Array(pa.phenotype.genome)
    }

    return offspringGenome
  }

  const deerCount = countSpecies('deer')
  const wolfCount = countSpecies('wolf')
  const boarCount = countSpecies('boar')
  const birdCount = countSpecies('bird')

  if (deerCount < CAP_DEER * 0.5) {
    const pos = randPos(200, 600)
    if (pos) {
      const genome = reproduceGenome('deer')
      spawnAnimal('deer', pos[0], pos[1], pos[2], 0, pos[0], pos[1], pos[2], genome)
    }
  }
  if (wolfCount < CAP_WOLF * 0.5) {
    const pos = randPos(300, 700)
    if (pos) {
      const genome = reproduceGenome('wolf')
      spawnAnimal('wolf', pos[0], pos[1], pos[2], 0, pos[0], pos[1], pos[2], genome)
    }
  }
  if (boarCount < CAP_BOAR * 0.5) {
    const pos = randPos(150, 500)
    if (pos) {
      const genome = reproduceGenome('boar')
      spawnAnimal('boar', pos[0], pos[1], pos[2], 0, pos[0], pos[1], pos[2], genome)
    }
  }
  // M25: Birds respawn into existing flock — no genome (birds don't evolve)
  if (birdCount < CAP_BIRD * 0.5) {
    const pos = randPos(150, 500)
    if (pos) {
      const len = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2])
      const nx = pos[0] / len, ny = pos[1] / len, nz = pos[2] / len
      const birdR = PLANET_RADIUS + BIRD_ALTITUDE
      spawnAnimal('bird', nx * birdR, ny * birdR, nz * birdR, 100, pos[0], pos[1], pos[2])
    }
  }
}

// ── M24: Tick respawn queue (call from GameLoop each frame) ─────────────────

export function tickRespawnQueue(dt: number): void {
  for (let i = respawnQueue.length - 1; i >= 0; i--) {
    respawnQueue[i].timer -= dt
    if (respawnQueue[i].timer <= 0) {
      const entry = respawnQueue[i]
      // Only respawn if below population cap
      const count = countSpecies(entry.species)
      const cap = entry.species === 'deer' ? CAP_DEER
                : entry.species === 'wolf' ? CAP_WOLF
                : entry.species === 'bird' ? CAP_BIRD
                : CAP_BOAR
      if (count < cap) {
        spawnAnimal(
          entry.species,
          entry.x, entry.y, entry.z,
          entry.packId,
          entry.patrolCx, entry.patrolCy, entry.patrolCz,
        )
      }
      respawnQueue.splice(i, 1)
    }
  }
}
