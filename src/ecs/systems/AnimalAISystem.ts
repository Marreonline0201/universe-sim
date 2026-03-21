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
): AnimalEntity {
  const id = _nextId++
  const maxHp = species === 'deer' ? 40
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
  }
  animalRegistry.set(id, animal)
  return animal
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
    spawnAnimal('deer', pos[0], pos[1], pos[2])
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
      spawnAnimal('wolf', projected[0], projected[1], projected[2], pack, cx, cy, cz)
    }
  }

  // ── Boars: 5 initial ─────────────────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const pos = randomSurfacePos(100, 500)
    if (!pos) continue
    spawnAnimal('boar', pos[0], pos[1], pos[2])
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

  const fleeRadius = playerCrouching ? DEER_FLEE_RADIUS_CROUCH : DEER_FLEE_RADIUS

  // ── State transitions ─────────────────────────────────────────────────────
  if (a.behavior === 'GRAZING' && playerDist < fleeRadius) {
    a.behavior = 'FLEEING'
    a.stateTimer = 0
  } else if (a.behavior === 'FLEEING' && playerDist > DEER_STOP_FLEE_RADIUS) {
    a.behavior = 'GRAZING'
    a.stateTimer = 0
  }

  // ── Grazing movement ──────────────────────────────────────────────────────
  if (a.behavior === 'GRAZING') {
    a.wanderTimer -= dt
    if (a.wanderTimer <= 0) {
      // Pick random tangent-plane direction
      const angle = Math.random() * Math.PI * 2
      a.vx = Math.cos(angle) * DEER_SPEED_GRAZE
      a.vz = Math.sin(angle) * DEER_SPEED_GRAZE
      a.vy = 0
      a.wanderTimer = 3 + Math.random() * 5
    }

    // ── Reynolds flocking: cohesion toward 3 nearest deer ────────────────
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

    // Clamp to walk speed
    const spd = Math.sqrt(a.vx * a.vx + a.vz * a.vz)
    if (spd > DEER_SPEED_GRAZE) {
      a.vx = (a.vx / spd) * DEER_SPEED_GRAZE
      a.vz = (a.vz / spd) * DEER_SPEED_GRAZE
    }
  }

  // ── Fleeing movement: run directly away from player ───────────────────────
  if (a.behavior === 'FLEEING') {
    if (playerDist > 0.1) {
      const invD = 1 / playerDist
      a.vx = -(dpx * invD) * DEER_SPEED_FLEE
      a.vz = -(dpz * invD) * DEER_SPEED_FLEE
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

  // ── State transitions ─────────────────────────────────────────────────────
  if (a.behavior === 'PATROLLING') {
    // Check for player threat (bloodthirsty: murder_count >= 3)
    if (playerMurderCount >= 3 && playerDist < WOLF_PLAYER_RADIUS) {
      a.behavior = 'ATTACKING_PLAYER'
      a.stateTimer = 0
    } else {
      // Check for nearby deer to hunt
      let nearestDeer: AnimalEntity | null = null
      let nearestDeerDist = WOLF_HUNT_RADIUS
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
    // Re-evaluate: if no deer within 60m, return to patrol
    let hasDeer = false
    for (const deer of allDeer) {
      if (deer.behavior === 'DEAD') continue
      const dx = deer.x - a.x, dy = deer.y - a.y, dz = deer.z - a.z
      const d  = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < 60) { hasDeer = true; break }
    }
    if (!hasDeer) a.behavior = 'PATROLLING'
    // Wolves always prioritize a murderous player
    if (playerMurderCount >= 3 && playerDist < WOLF_PLAYER_RADIUS) {
      a.behavior = 'ATTACKING_PLAYER'
    }
  } else if (a.behavior === 'ATTACKING_PLAYER') {
    // Disengage if player flees beyond 50m
    if (playerDist > 50) a.behavior = 'PATROLLING'
  }

  // ── Behavior execution ────────────────────────────────────────────────────
  if (a.behavior === 'PATROLLING') {
    a.wanderTimer -= dt
    if (a.wanderTimer <= 0) {
      // Patrol around pack center
      const angle   = Math.random() * Math.PI * 2
      const radius  = 20 + Math.random() * 40
      const tx = a.patrolCx + Math.cos(angle) * radius
      const tz = a.patrolCz + Math.sin(angle) * radius
      const dx = tx - a.x, dz = tz - a.z
      const d  = Math.sqrt(dx * dx + dz * dz) + 0.001
      a.vx = (dx / d) * WOLF_SPEED_PATROL
      a.vz = (dz / d) * WOLF_SPEED_PATROL
      a.wanderTimer = 4 + Math.random() * 6
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
      const dx = nearestDeer.x - a.x
      const dz = nearestDeer.z - a.z
      const d  = Math.sqrt(dx * dx + dz * dz) + 0.001
      a.vx = (dx / d) * WOLF_SPEED_HUNT
      a.vz = (dz / d) * WOLF_SPEED_HUNT

      // Attack deer at close range
      if (nearestDeerDist < WOLF_DEER_ATTACK_RADIUS) {
        nearestDeer.health -= 25 * dt  // kills deer in ~1.6s of sustained contact
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
      a.vx = dpx * invD * WOLF_SPEED_HUNT
      a.vz = dpz * invD * WOLF_SPEED_HUNT
    }
    // Deal damage at melee range
    if (playerDist < WOLF_ATTACK_RADIUS) {
      const cooldown = wolfAttackCooldowns.get(a.id) ?? 0
      if (cooldown <= 0) {
        onPlayerDamaged(WOLF_DAMAGE)
        wolfAttackCooldowns.set(a.id, WOLF_ATTACK_COOLDOWN)
      }
    }
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

  // ── State transitions ─────────────────────────────────────────────────────
  if (a.behavior === 'ROAMING' && playerDist < BOAR_TRIGGER_RADIUS) {
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
      a.vx = Math.cos(angle) * BOAR_ROAM_SPEED
      a.vz = Math.sin(angle) * BOAR_ROAM_SPEED
      a.wanderTimer = 3 + Math.random() * 6
    }
  }

  // ── Charging: lock onto player direction, rush forward ───────────────────
  if (a.behavior === 'CHARGING') {
    if (playerDist > 0.1) {
      const invD = 1 / playerDist
      a.vx = dpx * invD * BOAR_CHARGE_SPEED
      a.vz = dpz * invD * BOAR_CHARGE_SPEED
    }
    // Deal impact damage when within contact range
    if (playerDist < 2.5) {
      const cd = boarAttackCooldowns.get(a.id) ?? 0
      if (cd <= 0) {
        onPlayerDamaged(BOAR_DAMAGE)
        boarAttackCooldowns.set(a.id, 1.5)
      }
    }
  }

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
 * Returns the killed animal's loot if the animal died, or null.
 */
export function attackNearestAnimal(
  px: number, py: number, pz: number,
  damage: number,
  range: number,
): { killed: AnimalEntity; loot: AnimalKillLoot[] } | null {
  let nearest: AnimalEntity | null = null
  let nearestDist = range

  for (const a of animalRegistry.values()) {
    if (a.behavior === 'DEAD') continue
    const dx = a.x - px, dy = a.y - py, dz = a.z - pz
    const d  = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < nearestDist) { nearestDist = d; nearest = a }
  }

  if (!nearest) return null

  nearest.health -= damage
  if (nearest.health > 0) return null

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

  const deerCount = countSpecies('deer')
  const wolfCount = countSpecies('wolf')
  const boarCount = countSpecies('boar')

  if (deerCount < CAP_DEER * 0.5) {
    const pos = randPos(200, 600)
    if (pos) spawnAnimal('deer', pos[0], pos[1], pos[2])
  }
  if (wolfCount < CAP_WOLF * 0.5) {
    const pos = randPos(300, 700)
    if (pos) spawnAnimal('wolf', pos[0], pos[1], pos[2])
  }
  if (boarCount < CAP_BOAR * 0.5) {
    const pos = randPos(150, 500)
    if (pos) spawnAnimal('boar', pos[0], pos[1], pos[2])
  }
}
