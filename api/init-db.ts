import { neon } from '@neondatabase/serverless'

export default async function handler(_req: Request) {
  const sql = neon(process.env.DATABASE_URL!)

  await sql`
    CREATE TABLE IF NOT EXISTS player_saves (
      user_id        TEXT PRIMARY KEY,
      username       TEXT,
      pos_x          REAL DEFAULT 0,
      pos_y          REAL DEFAULT 0.9,
      pos_z          REAL DEFAULT 0,
      health         REAL DEFAULT 1,
      hunger         REAL DEFAULT 0,
      thirst         REAL DEFAULT 0,
      energy         REAL DEFAULT 1,
      fatigue        REAL DEFAULT 0,
      ev_points      INTEGER DEFAULT 0,
      civ_tier       INTEGER DEFAULT 0,
      discoveries    TEXT DEFAULT '[]',
      current_goal   TEXT DEFAULT 'survive',
      sim_seconds    REAL DEFAULT 0,
      inventory              TEXT DEFAULT '[]',
      tech_tree              TEXT DEFAULT '[]',
      tech_tree_in_progress  TEXT DEFAULT '[]',
      evolution_tree         TEXT DEFAULT '[]',
      known_recipes          TEXT DEFAULT '[]',
      journal_entries        TEXT DEFAULT '[]',
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    )
  `
  // Add new columns to existing tables that predate this schema version
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS inventory              TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS tech_tree              TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS evolution_tree         TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS known_recipes          TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS tech_tree_in_progress  TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS journal_entries        TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS buildings              TEXT DEFAULT '[]'`

  return Response.json({ ok: true })
}
