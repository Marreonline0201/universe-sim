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

export type AnimalSpecies = 'deer' | 'wolf' | 'boar'

export type AnimalBehavior =
  | 'GRAZING'
  | 'FLEEING'
  | 'PATROLLING'
  | 'HUNTING_DEER'
  | 'ATTACKING_PLAYER'
  | 'ROAMING'
  | 'CHARGING'
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
  packId: number       // wolves only — shared patrol center index
  chargeTimer: number  // boar: seconds remaining in current charge
  stateTimer: number   // general purpose state duration timer
  wanderTimer: number  // seconds until direction change
  deadTimer: number    // seconds since death (despawn at 120)

  // For wolf pack patrol: shared patrol center
  patrolCx: number
  patrolCy: number
  patrolCz: number

  /** Genome-derived phenotype stats. Optional — absent means use hardcoded species defaults. */
  phenotype?: AnimalGenomePhenotype
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

// Population caps
const CAP_DEER  = 20
const CAP_WOLF  = 8
const CAP_BOAR  = 10

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
              : 60  // boar

  const animal: AnimalEntity = {
    id, species,
    behavior: species === 'deer' ? 'GRAZING'
            : species === 'wolf' ? 'PATROLLING'
            : 'ROAMING',
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    health: maxHp, maxHealth: maxHp,
    packId, chargeTimer: 0, stateTimer: 0,
    wanderTimer: 1 + Math.random() * 4,
    deadTimer: 0,
    patrolCx, patrolCy, patrolCz,
    phenotype,
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

  // ── Deer: 10 initial (cap 20) ─────────────────────────────────────────────
  for (let i = 0; i < 10; i++) {
    const pos = randomSurfacePos(80, 400)
    if (!pos) continue
    const genome = generateSpeciesGenome('deer', rand)
    spawnAnimal('deer', pos[0], pos[1], pos[2], 0, pos[0], pos[1], pos[2], genome)
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
}

const _v3 = new THREE.Vector3()

export function tickAnimalAI(ctx: AnimalTickContext): void {
  const {
    dt, playerX, playerY, playerZ,
    playerMurderCount, playerCrouching,
    onPlayerDamaged, onAnimalKilled,
  } = ctx

  const toDelete: number[] = []
  const deerPositions: AnimalEntity[] = []

  // Collect live deer for flocking
  for (const a of animalRegistry.values()) {
    if (a.species === 'deer' && a.behavior !== 'DEAD') deerPositions.push(a)
  }

  for (const animal of animalRegistry.values()) {
    if (animal.behavior === 'DEAD') {
      animal.deadTimer += dt
      if (animal.deadTimer >= 120) toDelete.push(animal.id)
      continue
    }

    const { species } = animal
    animal.stateTimer += dt

    switch (species) {
      case 'deer': tickDeer(animal, ctx, deerPositions); break
      case 'wolf': tickWolf(animal, ctx, deerPositions, onPlayerDamaged); break
      case 'boar': tickBoar(animal, ctx, onPlayerDamaged); break
    }

    // Clamp position to surface after movement (animal is live — DEAD path continues early above)
    {
      const size = species === 'deer' ? 1.0 : species === 'wolf' ? 0.7 : 1.2
      const [sx, sy, sz] = projectOntoSurface(animal.x, animal.y, animal.z, size)
      if (sy > 0) {
        animal.x = sx; animal.y = sy; animal.z = sz
      }
    }
  }

  for (const id of toDelete) animalRegistry.delete(id)
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

  // ── State transitions ─────────────────────────────────────────────────────
  if (a.behavior === 'GRAZING' && playerDist < fleeRadius) {
    a.behavior = 'FLEEING'
    a.stateTimer = 0
  } else if (a.behavior === 'FLEEING' && playerDist > DEER_STOP_FLEE_RADIUS) {
    a.behavior = 'GRAZING'
    a.stateTimer = 0
  }

  // ── Grazing movement ──────────────────────────────────────────────────────
  // Behavior tier 0 (reflex): pure wander only, no flocking, no flee awareness
  const behaviorTier = a.phenotype?.behaviorTier ?? 1
  if (a.behavior === 'GRAZING') {
    a.wanderTimer -= dt
    if (a.wanderTimer <= 0) {
      // Pick random tangent-plane direction
      const angle = Math.random() * Math.PI * 2
      const grazeSpeed = DEER_SPEED_GRAZE * speedMult
      a.vx = Math.cos(angle) * grazeSpeed
      a.vz = Math.sin(angle) * grazeSpeed
      a.vy = 0
      a.wanderTimer = 3 + Math.random() * 5
    }

    // ── Reynolds flocking: cohesion toward 3 nearest deer ────────────────
    // Tier 0 creatures (reflex only) don't flock — they just wander
    if (behaviorTier < 1) {
      // Simple wander: just clamp speed
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
    let cx = 0, cy = 0, cz = 0, count = 0
    for (const other of allDeer) {
      if (other.id === a.id) continue
      const dx = other.x - a.x, dy = other.y - a.y, dz = other.z - a.z
      const d  = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < DEER_FLOCK_RADIUS && d > 0.1) {
        cx += dx / d; cy += dy / d; cz += dz / d
        count++
        if (count >= 3) break
      }
    }
    if (count > 0) {
      // Gently steer toward centroid
      a.vx += (cx / count) * 0.3 * dt
      a.vz += (cz / count) * 0.3 * dt
    }

    // Separation: avoid getting too close to other deer
    for (const other of allDeer) {
      if (other.id === a.id) continue
      const dx = a.x - other.x, dy = a.y - other.y, dz = a.z - other.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < 16) {  // 4m personal space
        const d = Math.sqrt(d2) + 0.001
        a.vx += (dx / d) * 0.8
        a.vz += (dz / d) * 0.8
      }
    }

    // Clamp to walk speed (genome-scaled)
    const grazeSpeedMax = DEER_SPEED_GRAZE * speedMult
    const spd = Math.sqrt(a.vx * a.vx + a.vz * a.vz)
    if (spd > grazeSpeedMax) {
      a.vx = (a.vx / spd) * grazeSpeedMax
      a.vz = (a.vz / spd) * grazeSpeedMax
    }
  }

  // ── Fleeing movement: run directly away from player ───────────────────────
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
): { killed: AnimalEntity | null; loot: AnimalKillLoot[] } | null {
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
  if (nearest.health > 0) return { killed: null, loot: [] }  // hit but survived

  // Animal died
  nearest.behavior = 'DEAD'
  nearest.deadTimer = 0
  const loot = ANIMAL_LOOT[nearest.species]
  return { killed: nearest, loot }
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
}
