import { neon } from '@neondatabase/serverless'
import { verifyToken } from '@clerk/backend'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return }

  // Verify Clerk JWT — req.headers is a plain object in Node.js runtime
  const auth: string | undefined = req.headers['authorization']
  const token = auth?.replace('Bearer ', '')
  if (!token) { res.status(401).send('Unauthorized'); return }

  let userId: string
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
    userId = payload.sub
  } catch {
    res.status(401).send('Unauthorized'); return
  }

  // req.body is auto-parsed JSON by Vercel Node.js runtime
  const body = req.body ?? {}
  const sql = neon(process.env.DATABASE_URL!)

  // Self-healing schema migration — ADD COLUMN IF NOT EXISTS is idempotent and
  // becomes a no-op (metadata-only) once each column exists. Runs inline so the
  // live table stays in sync with the schema without a manual init-db call.
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS inventory              TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS tech_tree              TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS tech_tree_in_progress  TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS evolution_tree         TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS known_recipes          TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS journal_entries        TEXT DEFAULT '[]'`
  await sql`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS buildings              TEXT DEFAULT '[]'`

  await sql`
    INSERT INTO player_saves (
      user_id, username, pos_x, pos_y, pos_z,
      health, hunger, thirst, energy, fatigue,
      ev_points, civ_tier, discoveries, current_goal, sim_seconds,
      inventory, tech_tree, tech_tree_in_progress, evolution_tree, known_recipes,
      journal_entries, buildings,
      updated_at
    ) VALUES (
      ${userId}, ${body.username ?? ''}, ${body.x ?? 0}, ${body.y ?? 0}, ${body.z ?? 0},
      ${body.health ?? 1}, ${body.hunger ?? 0}, ${body.thirst ?? 0},
      ${body.energy ?? 1}, ${body.fatigue ?? 0},
      ${body.evolutionPoints ?? 0}, ${body.civTier ?? 0},
      ${JSON.stringify(body.discoveries ?? [])}, ${body.currentGoal ?? 'survive'},
      ${body.simSeconds ?? 0},
      ${JSON.stringify(body.inventory ?? [])},
      ${JSON.stringify(body.techTree ?? [])},
      ${JSON.stringify(body.techTreeInProgress ?? [])},
      ${JSON.stringify(body.evolutionTree ?? [])},
      ${JSON.stringify(body.knownRecipes ?? [])},
      ${JSON.stringify(body.journalEntries ?? [])},
      ${JSON.stringify(body.buildings ?? [])},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      username                = EXCLUDED.username,
      pos_x                   = EXCLUDED.pos_x,
      pos_y                   = EXCLUDED.pos_y,
      pos_z                   = EXCLUDED.pos_z,
      health                  = EXCLUDED.health,
      hunger                  = EXCLUDED.hunger,
      thirst                  = EXCLUDED.thirst,
      energy                  = EXCLUDED.energy,
      fatigue                 = EXCLUDED.fatigue,
      ev_points               = EXCLUDED.ev_points,
      civ_tier                = EXCLUDED.civ_tier,
      discoveries             = EXCLUDED.discoveries,
      current_goal            = EXCLUDED.current_goal,
      sim_seconds             = EXCLUDED.sim_seconds,
      inventory               = EXCLUDED.inventory,
      tech_tree               = EXCLUDED.tech_tree,
      tech_tree_in_progress   = EXCLUDED.tech_tree_in_progress,
      evolution_tree          = EXCLUDED.evolution_tree,
      known_recipes           = EXCLUDED.known_recipes,
      journal_entries         = EXCLUDED.journal_entries,
      buildings               = EXCLUDED.buildings,
      updated_at              = NOW()
  `

  res.json({ ok: true })
}
