// ── WorldSettingsSync ──────────────────────────────────────────────────────────
// Reads and writes timeScale / simTime to the Neon world_settings table.
// The same table is read by the Vercel `/api/world-settings` endpoint.

import { neon } from '@neondatabase/serverless'

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

/** Load persisted world settings. Returns { timeScale, simTime }. */
export async function loadSettings() {
  try {
    const db = sql()
    const rows = await db`
      SELECT time_scale, sim_time
      FROM world_settings
      WHERE id = 1
    `
    if (rows.length === 0) return { timeScale: 1, simTime: 0 }
    return {
      timeScale: rows[0].time_scale ?? 1,
      simTime: rows[0].sim_time ?? 0,
    }
  } catch (err) {
    console.error('[WorldSettingsSync] loadSettings error:', err.message)
    return { timeScale: 1, simTime: 0 }
  }
}

/** Persist current timeScale and simTime to Neon. */
export async function saveSettings(timeScale, simTime) {
  try {
    const db = sql()
    await db`
      UPDATE world_settings
      SET time_scale = ${timeScale}, sim_time = ${simTime}, updated_at = NOW()
      WHERE id = 1
    `
  } catch (err) {
    console.error('[WorldSettingsSync] saveSettings error:', err.message)
  }
}

/** Ensure the sim_time column exists (migration). */
export async function migrateSchema() {
  try {
    const db = sql()
    // Add sim_time column if it doesn't exist yet
    await db`
      ALTER TABLE world_settings
      ADD COLUMN IF NOT EXISTS sim_time REAL DEFAULT 0
    `
  } catch (err) {
    // Column may already exist — non-fatal
    console.warn('[WorldSettingsSync] migrateSchema:', err.message)
  }
}
