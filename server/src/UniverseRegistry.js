// ── UniverseRegistry.js ───────────────────────────────────────────────────────
// M14 Track C: Multiverse infrastructure.
// Each universe instance is identified by a worldSeed (uint32).
// The home universe always has seed 42 (matching SimulationEngine default).
// New universes are spawned when a player activates the Velar Gateway.
//
// DB table: universes
//   seed         INTEGER UNIQUE NOT NULL  — primary identifier
//   name         TEXT NOT NULL            — human-readable name
//   origin       TEXT                     — how it was created
//   created_at   TIMESTAMPTZ DEFAULT NOW()
//   player_count INTEGER DEFAULT 0
//   tech_level   INTEGER DEFAULT 0        — highest civLevel reached
//   discovery_count INTEGER DEFAULT 0
//
// In-process: an in-memory map of seed → universe room state.
// The Railway WS server handles multiple universe rooms by routing JOINs
// that include a targetSeed to the appropriate PlayerRegistry.
// For M14: only two universe rooms — home (seed 42) and Velar World.

import { neon } from '@neondatabase/serverless'

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

const HOME_SEED  = 42
const VELAR_SEED = 0x7e1a4000  // deterministic Velar World seed

// In-process universe room registry
// key: seed (number), value: { seed, name, playerCount, techLevel }
const _rooms = new Map()

export class UniverseRegistry {
  async migrateSchema() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        CREATE TABLE IF NOT EXISTS universes (
          id              SERIAL PRIMARY KEY,
          seed            INTEGER UNIQUE NOT NULL,
          name            TEXT NOT NULL,
          origin          TEXT DEFAULT 'spawned',
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          player_count    INTEGER DEFAULT 0,
          tech_level      INTEGER DEFAULT 0,
          discovery_count INTEGER DEFAULT 0
        )
      `
      // Ensure home universe row exists
      await db`
        INSERT INTO universes (seed, name, origin)
        VALUES (${HOME_SEED}, 'Home Universe', 'genesis')
        ON CONFLICT (seed) DO NOTHING
      `
      console.log('[UniverseRegistry] Schema OK')
    } catch (err) {
      console.warn('[UniverseRegistry] migrateSchema:', err.message)
    }
  }

  async load() {
    if (!process.env.DATABASE_URL) {
      _rooms.set(HOME_SEED, { seed: HOME_SEED, name: 'Home Universe', playerCount: 0, techLevel: 0 })
      return
    }
    try {
      const db    = sql()
      const rows  = await db`SELECT seed, name, tech_level FROM universes ORDER BY id`
      _rooms.clear()
      for (const row of rows) {
        _rooms.set(row.seed, { seed: row.seed, name: row.name, playerCount: 0, techLevel: row.tech_level ?? 0 })
      }
      // Always ensure home seed exists in memory
      if (!_rooms.has(HOME_SEED)) {
        _rooms.set(HOME_SEED, { seed: HOME_SEED, name: 'Home Universe', playerCount: 0, techLevel: 0 })
      }
      console.log(`[UniverseRegistry] Loaded ${_rooms.size} universe(s)`)
    } catch (err) {
      console.warn('[UniverseRegistry] load:', err.message)
      _rooms.set(HOME_SEED, { seed: HOME_SEED, name: 'Home Universe', playerCount: 0, techLevel: 0 })
    }
  }

  /**
   * Spawn a new universe — called when a player activates the Velar Gateway.
   * Creates the DB row and in-memory room.
   * Returns the new universe seed.
   */
  async spawnVelarWorld(activatorUserId, activatorName) {
    const seed   = VELAR_SEED
    const name   = 'Velar World'
    const origin = `Activated by ${activatorName} via Velar Gateway`

    if (_rooms.has(seed)) {
      console.log('[UniverseRegistry] Velar World already exists — skipping spawn')
      return seed
    }

    if (process.env.DATABASE_URL) {
      try {
        const db = sql()
        await db`
          INSERT INTO universes (seed, name, origin)
          VALUES (${seed}, ${name}, ${origin})
          ON CONFLICT (seed) DO NOTHING
        `
      } catch (err) {
        console.warn('[UniverseRegistry] spawnVelarWorld DB error:', err.message)
      }
    }

    _rooms.set(seed, { seed, name, playerCount: 0, techLevel: 5 })
    console.log(`[UniverseRegistry] Velar World spawned (seed=${seed.toString(16)})`)
    return seed
  }

  getAll() {
    return Array.from(_rooms.values())
  }

  getRoom(seed) {
    return _rooms.get(seed) ?? null
  }

  incrementPlayerCount(seed, delta = 1) {
    const room = _rooms.get(seed)
    if (room) room.playerCount = Math.max(0, room.playerCount + delta)
  }

  async updateTechLevel(seed, techLevel) {
    const room = _rooms.get(seed)
    if (room) room.techLevel = Math.max(room.techLevel, techLevel)
    if (process.env.DATABASE_URL) {
      try {
        const db = sql()
        await db`
          UPDATE universes SET tech_level = ${techLevel}
          WHERE seed = ${seed} AND tech_level < ${techLevel}
        `
      } catch {}
    }
  }

  get homeSeed()  { return HOME_SEED  }
  get velarSeed() { return VELAR_SEED }
}
