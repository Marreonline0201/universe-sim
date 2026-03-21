// ── DiscoveryDb.js ──────────────────────────────────────────────────────────────
// M13: Persists first-contact events and planet probe data to Neon.
// Follows the same neon-singleton pattern as WorldSettingsSync.js.

import { neon } from '@neondatabase/serverless'

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

/** Ensure discoveries and planets tables exist. */
export async function migrateSchema() {
  if (!process.env.DATABASE_URL) return
  try {
    const db = sql()
    await db`
      CREATE TABLE IF NOT EXISTS discoveries (
        id          SERIAL PRIMARY KEY,
        type        TEXT NOT NULL,
        decoded_by  TEXT NOT NULL,
        player_name TEXT,
        timestamp   TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await db`
      CREATE TABLE IF NOT EXISTS planets (
        id           SERIAL PRIMARY KEY,
        name         TEXT UNIQUE NOT NULL,
        surface_temp INTEGER,
        atmosphere   TEXT,
        resources    TEXT,
        discovered_by   TEXT,
        discovered_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `
    console.log('[DiscoveryDb] Schema OK')
  } catch (err) {
    console.warn('[DiscoveryDb] migrateSchema:', err.message)
  }
}

/** Persist a VELAR_DECODED event. */
export async function recordDecode(userId, playerName) {
  if (!process.env.DATABASE_URL) return
  try {
    const db = sql()
    await db`
      INSERT INTO discoveries (type, decoded_by, player_name)
      VALUES ('VELAR_DECODED', ${userId}, ${playerName})
    `
  } catch (err) {
    console.error('[DiscoveryDb] recordDecode error:', err.message)
  }
}

/** Persist a planet probe result (upsert on planet name). */
export async function recordProbe(name, surfaceTemp, atmosphere, resources, userId) {
  if (!process.env.DATABASE_URL) return
  try {
    const db = sql()
    await db`
      INSERT INTO planets (name, surface_temp, atmosphere, resources, discovered_by)
      VALUES (${name}, ${surfaceTemp}, ${atmosphere}, ${resources}, ${userId})
      ON CONFLICT (name) DO UPDATE
        SET surface_temp  = EXCLUDED.surface_temp,
            atmosphere    = EXCLUDED.atmosphere,
            resources     = EXCLUDED.resources,
            discovered_by = EXCLUDED.discovered_by,
            discovered_at = NOW()
    `
  } catch (err) {
    console.error('[DiscoveryDb] recordProbe error:', err.message)
  }
}
