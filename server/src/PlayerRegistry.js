// ── PlayerRegistry ─────────────────────────────────────────────────────────────
// Tracks all currently-connected players and their last-known state.

import { neon } from '@neondatabase/serverless'

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

const PLANET_RADIUS = 4000

/** Mulberry32 seeded PRNG — deterministic random from a uint32 seed. */
function mulberry32(seed) {
  let s = seed >>> 0
  return () => {
    s += 0x6D2B79F5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0xFFFFFFFF
  }
}

/** Hash a string to a uint32 — used to spread player shelters deterministically. */
function hashStr(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (Math.imul(h, 0x01000193)) >>> 0
  }
  return h
}

/**
 * Place a new shelter at a random equatorial point on the sphere surface.
 * Combines worldSeed + userId hash so each player gets a distinct position.
 */
function defaultShelterPos(worldSeed, userId) {
  const seed = (worldSeed ^ hashStr(userId)) >>> 0
  const r = mulberry32(seed)
  const theta = r() * Math.PI * 2
  // Bias toward equatorial band (phi between 0.25π and 0.75π → away from poles)
  const phi = (r() * 0.5 + 0.25) * Math.PI
  const y  = Math.cos(phi) * PLANET_RADIUS * 0.8
  const xz = Math.sin(phi) * PLANET_RADIUS
  return { x: Math.cos(theta) * xz, y, z: Math.sin(theta) * xz }
}

/**
 * Migrate the players table to add the shelter_x/y/z columns if they don't exist.
 * Called from server main() alongside other schema migrations.
 */
export async function migrateShelterSchema() {
  if (!process.env.DATABASE_URL) return
  try {
    const db = sql()
    await db`ALTER TABLE players ADD COLUMN IF NOT EXISTS shelter_x REAL`
    await db`ALTER TABLE players ADD COLUMN IF NOT EXISTS shelter_y REAL`
    await db`ALTER TABLE players ADD COLUMN IF NOT EXISTS shelter_z REAL`
    console.log('[PlayerRegistry] shelter schema migrated')
  } catch (err) {
    console.warn('[PlayerRegistry] migrateShelterSchema:', err.message)
  }
}

/**
 * Load a player's persisted shelter position from Neon.
 * Returns { x, y, z } or null if the player has no row yet.
 */
export async function loadShelterPos(userId) {
  if (!process.env.DATABASE_URL) return null
  try {
    const db = sql()
    const rows = await db`
      SELECT shelter_x, shelter_y, shelter_z
      FROM players
      WHERE user_id = ${userId}
    `
    if (rows.length === 0) return null
    const { shelter_x, shelter_y, shelter_z } = rows[0]
    if (shelter_x == null) return null
    return { x: shelter_x, y: shelter_y, z: shelter_z }
  } catch (err) {
    console.warn('[PlayerRegistry] loadShelterPos:', err.message)
    return null
  }
}

/**
 * Upsert a player row and write their shelter position to Neon.
 */
export async function persistShelterPos(userId, x, y, z) {
  if (!process.env.DATABASE_URL) return
  try {
    const db = sql()
    await db`
      INSERT INTO players (user_id, shelter_x, shelter_y, shelter_z)
      VALUES (${userId}, ${x}, ${y}, ${z})
      ON CONFLICT (user_id)
      DO UPDATE SET shelter_x = ${x}, shelter_y = ${y}, shelter_z = ${z}
    `
  } catch (err) {
    console.warn('[PlayerRegistry] persistShelterPos:', err.message)
  }
}

export class PlayerRegistry {
  constructor(worldSeed = 42) {
    /** @type {Map<string, { userId: string; username: string; x: number; y: number; z: number; health: number; murderCount: number; shelterPos: {x:number,y:number,z:number}|null; ws: import('ws').WebSocket }>} */
    this._players = new Map()
    this._worldSeed = worldSeed
  }

  add(userId, username, ws) {
    this._players.set(userId, {
      userId,
      username,
      x: 0, y: 0.9, z: 0,
      health: 1,
      murderCount: 0,
      shelterPos: null,
      ws,
    })
  }

  remove(userId) {
    this._players.delete(userId)
  }

  update(userId, patch) {
    const p = this._players.get(userId)
    if (!p) return
    if (patch.x !== undefined) p.x = patch.x
    if (patch.y !== undefined) p.y = patch.y
    if (patch.z !== undefined) p.z = patch.z
    if (patch.health !== undefined) p.health = patch.health
    if (patch.murderCount !== undefined) p.murderCount = patch.murderCount
  }

  get(userId) {
    return this._players.get(userId) ?? null
  }

  /**
   * Set shelter position in-memory and persist to Neon.
   * Called when player sends REGISTER_SHELTER or on first join (default pos).
   */
  setShelterPos(userId, x, y, z) {
    const p = this._players.get(userId)
    if (!p) return
    p.shelterPos = { x, y, z }
    persistShelterPos(userId, x, y, z).catch(() => {})
  }

  /** Returns the player's shelter position, or null if not set. */
  getShelterPos(userId) {
    return this._players.get(userId)?.shelterPos ?? null
  }

  /**
   * Called after add() on join — loads shelter from DB or assigns a default.
   * Must be awaited before sending the WORLD_SNAPSHOT to the joining player.
   */
  async initShelterPos(userId) {
    const p = this._players.get(userId)
    if (!p) return
    const stored = await loadShelterPos(userId)
    if (stored) {
      p.shelterPos = stored
    } else {
      // First-ever login — assign a deterministic default position
      const pos = defaultShelterPos(this._worldSeed, userId)
      p.shelterPos = pos
      persistShelterPos(userId, pos.x, pos.y, pos.z).catch(() => {})
    }
  }

  /** Returns serialisable player list (no ws socket). */
  getAll() {
    const result = []
    for (const p of this._players.values()) {
      result.push({
        userId:      p.userId,
        username:    p.username,
        x:           p.x,
        y:           p.y,
        z:           p.z,
        health:      p.health,
        murderCount: p.murderCount,
        shelterPos:  p.shelterPos,
      })
    }
    return result
  }

  /** Iterate over all connected WebSockets. */
  forEachSocket(cb) {
    for (const p of this._players.values()) cb(p.ws, p.userId)
  }

  get count() {
    return this._players.size
  }
}
