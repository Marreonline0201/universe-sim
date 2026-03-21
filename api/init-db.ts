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
      buildings              TEXT DEFAULT '[]',
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
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS bedroll_x             FLOAT DEFAULT NULL`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS bedroll_y             FLOAT DEFAULT NULL`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS bedroll_z             FLOAT DEFAULT NULL`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS murder_count          INT DEFAULT 0`

  // M6: NPC settlement persistence
  await sql`
    CREATE TABLE IF NOT EXISTS npc_settlements (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      center_x         REAL NOT NULL DEFAULT 0,
      center_y         REAL NOT NULL DEFAULT 0,
      center_z         REAL NOT NULL DEFAULT 0,
      civ_level        INT NOT NULL DEFAULT 0,
      resource_inv     TEXT NOT NULL DEFAULT '{}',
      npc_count        INT NOT NULL DEFAULT 10,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  // M6: NPC memory — player trust/threat per settlement
  await sql`
    CREATE TABLE IF NOT EXISTS npc_player_memory (
      settlement_id    INT NOT NULL,
      player_id        TEXT NOT NULL,
      trust_score      REAL NOT NULL DEFAULT 0,
      threat_level     INT NOT NULL DEFAULT 0,
      last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (settlement_id, player_id)
    )
  `

  return Response.json({ ok: true })
}
