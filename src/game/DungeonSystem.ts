// ── DungeonSystem.ts ──────────────────────────────────────────────────────────
// M36 Track B: Procedural Dungeon Rooms
//
// Generates 1-2 dungeon rooms per cave, seeded deterministically.
// Room types:
//   guardian  — 2-4 elite cave stalker enemies guard a legendary chest
//   puzzle    — pressure plates must be stepped on in correct order → chest
//   shrine    — ancient altar: offer 5 Iron Ore → random skill +200 XP
//   boss_lair — one named cave boss (Stone Golem, 300 HP), unique loot
//
// Interaction is handled in GameLoop.ts (proximity checks + E/F key input).

import * as THREE from 'three'
import { CAVE_SEED, getCaveEntrancePositions } from '../rendering/CaveEntrances'

// ── Seeded PRNG (same mulberry32 as rest of cave system) ─────────────────────
function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoomType = 'guardian' | 'puzzle' | 'shrine' | 'boss_lair'

export interface PressurePlate {
  /** Local offset from room centre */
  offsetX: number
  offsetZ: number
  /** 1-based index in the correct sequence */
  correctOrder: number
  /** Whether the player has stepped on it this attempt */
  activated: boolean
}

export interface DungeonRoom {
  id: string
  caveIndex: number
  type: RoomType
  position: [number, number, number]
  /** Effective trigger / render radius (m) */
  radius: number
  /** Room is cleared (all guardians dead / puzzle solved / shrine used / boss dead) */
  cleared: boolean
  clearedAt: number
  /** ms before room resets (guardians respawn, puzzle resets, shrine refreshes) */
  respawnMs: number

  // ── guardian room ──
  /** Number of cave stalker guardians (2-4) */
  guardianCount: number
  /** IDs of live guardian animal entities (populated at runtime) */
  guardianIds: number[]
  /** Has the guardian-chamber warning been shown this session */
  warned: boolean

  // ── puzzle room ──
  /** Ordered list of pressure plates */
  plates: PressurePlate[]
  /** Index into plates of the NEXT plate the player must step on (0-based) */
  puzzleProgress: number
  /** Timestamp when wrong-order was triggered (0 = not resetting) */
  puzzleResetAt: number

  // ── shrine room ──
  shrineUsed: boolean
  shrineUsedAt: number

  // ── boss lair ──
  bossAlive: boolean
  bossHp: number
  bossMaxHp: number
  /** Animal entity ID of the boss (populated at runtime) */
  bossEntityId: number
}

// ── Chamber-center mirroring (same logic as ChestSystem / CaveTunnelRenderer) ─

function getChamberCenter(entrance: THREE.Vector3, rng: () => number): THREE.Vector3 {
  const inward = entrance.clone().normalize().negate()
  const depth = 15 + rng() * 15
  rng(); rng(); rng() // lateral1 (consumed in buildTunnel)
  rng(); rng(); rng() // lateral2
  return entrance.clone().addScaledVector(inward, depth)
}

// ── Room generation ───────────────────────────────────────────────────────────

/** Generate 1-2 dungeon rooms for a single cave, offset from the chamber centre. */
export function generateDungeonRooms(caveIndex: number): DungeonRoom[] {
  const entrances = getCaveEntrancePositions()
  if (caveIndex >= entrances.length) return []

  const entrance = entrances[caveIndex]

  // Mirror the tunnel RNG consumption so chamber centre is correct
  const tunnelRng = seededRandom(CAVE_SEED + caveIndex * 0x1000)
  const chamberCenter = getChamberCenter(entrance, tunnelRng)

  // Dedicated dungeon seed so adding chest/ore counts doesn't shift us
  const rng = seededRandom(CAVE_SEED + caveIndex * 0x1000 + 0xD0057)

  // Build an orthonormal basis from chamber centre → planet core direction
  const coreDir = chamberCenter.clone().normalize().negate()
  const up = new THREE.Vector3(0, 1, 0)
  if (Math.abs(coreDir.dot(up)) > 0.9) up.set(1, 0, 0)
  const right = new THREE.Vector3().crossVectors(coreDir, up).normalize()
  const fwd   = new THREE.Vector3().crossVectors(right, coreDir).normalize()

  const roomCount = 1 + Math.floor(rng() * 2) // 1-2 rooms per cave

  // Room types cycle per cave: 4 types over 6 caves → each cave gets a
  // subset.  First room: type determined by cave+0, second by cave+1.
  const ALL_TYPES: RoomType[] = ['guardian', 'puzzle', 'shrine', 'boss_lair']
  const rooms: DungeonRoom[] = []

  for (let r = 0; r < roomCount; r++) {
    const typeIdx = (caveIndex + r) % ALL_TYPES.length
    const type = ALL_TYPES[typeIdx]

    // Scatter rooms 15-25m from chamber centre, on the "floor" plane
    const angle  = rng() * Math.PI * 2
    const spread = 15 + rng() * 10
    const offset = right.clone().multiplyScalar(Math.cos(angle) * spread)
      .addScaledVector(fwd, Math.sin(angle) * spread)
      .addScaledVector(coreDir, -(4 + rng() * 3))

    const pos = chamberCenter.clone().add(offset)
    const radius = type === 'boss_lair' ? 18 : type === 'guardian' ? 12 : 8

    // ── Puzzle plates ──────────────────────────────────────────────────────
    const plateCount = type === 'puzzle' ? 3 + Math.floor(rng() * 2) : 0 // 3-4 plates
    const plates: PressurePlate[] = []
    if (type === 'puzzle') {
      // Generate plate positions in a grid-ish pattern around room centre
      for (let p = 0; p < plateCount; p++) {
        const pa = (p / plateCount) * Math.PI * 2 + rng() * 0.5
        const pr = 2 + rng() * 3
        plates.push({
          offsetX: Math.cos(pa) * pr,
          offsetZ: Math.sin(pa) * pr,
          correctOrder: p + 1,
          activated: false,
        })
      }
      // Shuffle correct order (Fisher-Yates on the correctOrder values)
      const orders = plates.map((_, i) => i + 1)
      for (let i = orders.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [orders[i], orders[j]] = [orders[j], orders[i]]
      }
      orders.forEach((o, i) => { plates[i].correctOrder = o })
    }

    // ── Guardian count ─────────────────────────────────────────────────────
    const guardianCount = type === 'guardian' ? 2 + Math.floor(rng() * 3) : 0 // 2-4

    rooms.push({
      id: `cave${caveIndex}_room${r}`,
      caveIndex,
      type,
      position: [pos.x, pos.y, pos.z],
      radius,
      cleared: false,
      clearedAt: 0,
      respawnMs: 20 * 60 * 1000, // 20 minutes

      guardianCount,
      guardianIds: [],
      warned: false,

      plates,
      puzzleProgress: 0,
      puzzleResetAt: 0,

      shrineUsed: false,
      shrineUsedAt: 0,

      bossAlive: true,
      bossHp: 300,
      bossMaxHp: 300,
      bossEntityId: -1,
    })
  }

  return rooms
}

// ── All-caves cache ────────────────────────────────────────────────────────────

let _cachedRooms: DungeonRoom[] | null = null

export function generateAllDungeonRooms(): DungeonRoom[] {
  if (_cachedRooms) return _cachedRooms
  const entrances = getCaveEntrancePositions()
  const rooms: DungeonRoom[] = []
  for (let i = 0; i < entrances.length; i++) {
    rooms.push(...generateDungeonRooms(i))
  }
  _cachedRooms = rooms
  return rooms
}

/** Call this after opening a chest or killing a boss to bust the render cache. */
export function invalidateDungeonCache(): void {
  _cachedRooms = null
}

// ── Room state helpers ────────────────────────────────────────────────────────

/** True if room is ready to be interacted with (not currently cleared / on cooldown). */
export function isDungeonRoomActive(room: DungeonRoom): boolean {
  if (!room.cleared) return true
  return Date.now() - room.clearedAt > room.respawnMs
}

/** Mark room cleared and reset runtime state. */
export function clearDungeonRoom(room: DungeonRoom): void {
  room.cleared = true
  room.clearedAt = Date.now()
  room.guardianIds = []
  room.warned = false
  // Reset puzzle
  room.puzzleProgress = 0
  room.puzzleResetAt = 0
  room.plates.forEach(p => { p.activated = false })
  // Reset boss
  room.bossAlive = false
  room.bossEntityId = -1
}

/** Reset an expired room so it can be encountered again. */
export function resetDungeonRoom(room: DungeonRoom): void {
  room.cleared = false
  room.clearedAt = 0
  room.guardianIds = []
  room.warned = false
  room.puzzleProgress = 0
  room.puzzleResetAt = 0
  room.plates.forEach(p => { p.activated = false })
  room.shrineUsed = false
  room.shrineUsedAt = 0
  room.bossAlive = true
  room.bossHp = room.bossMaxHp
  room.bossEntityId = -1
}

// ── Puzzle helpers ────────────────────────────────────────────────────────────

/** Returns which plate (1-based correct order) the player should step on next. */
export function nextPlateInSequence(room: DungeonRoom): number {
  return room.puzzleProgress + 1
}

/**
 * Called when the player steps on a plate.
 * Returns 'correct' | 'wrong' | 'solved'.
 */
export function activatePlate(
  room: DungeonRoom,
  plateIndex: number,
): 'correct' | 'wrong' | 'solved' {
  const plate = room.plates[plateIndex]
  if (!plate || plate.activated) return 'correct'

  const expectedOrder = room.puzzleProgress + 1

  if (plate.correctOrder !== expectedOrder) {
    // Wrong plate — reset all after 3s delay
    room.puzzleResetAt = Date.now() + 3000
    room.plates.forEach(p => { p.activated = false })
    room.puzzleProgress = 0
    return 'wrong'
  }

  plate.activated = true
  room.puzzleProgress++

  if (room.puzzleProgress >= room.plates.length) {
    return 'solved'
  }
  return 'correct'
}

// ── Guardian stalker spec (used by GameLoop to spawn) ─────────────────────────

export interface CaveStalkerSpec {
  name: string
  hp: number
  maxHp: number
  /** Wolf × 1.5 stats */
  speedMult: number
  attackDamage: number
  colorHex: string
}

export const CAVE_STALKER: CaveStalkerSpec = {
  name: 'Cave Stalker',
  hp: 80,
  maxHp: 80,
  speedMult: 1.5,
  attackDamage: 18,
  colorHex: '#333344',
}

// ── Boss spec ─────────────────────────────────────────────────────────────────

export interface CaveBossSpec {
  name: string
  maxHp: number
  attackDamage: number
  dropTable: Array<{ label: string; matId?: number; itemId?: number; qty: number }>
}

// Import deferred to avoid circular: matId values are hard-coded numerically
// MAT.IRON_ORE = 14, MAT.VELAR_CRYSTAL = (checked below), MAT.COAL = 5
export const CAVE_BOSS: CaveBossSpec = {
  name: 'Stone Golem',
  maxHp: 300,
  attackDamage: 30,
  dropTable: [
    { label: '5x Iron Ore',      matId: 14, qty: 5 },
    { label: '3x Velar Crystal', matId: 40, qty: 3 },
    { label: '8x Coal',          matId: 5,  qty: 8 },
    { label: '150 gold',                    qty: 150 },
  ],
}
