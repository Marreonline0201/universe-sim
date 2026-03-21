import { neon } from '@neondatabase/serverless'
import { verifyToken } from '@clerk/backend'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') { res.status(405).send('Method Not Allowed'); return }

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

  const sql = neon(process.env.DATABASE_URL!)
  const rows = await sql`SELECT * FROM player_saves WHERE user_id = ${userId}`

  if (rows.length === 0) { res.json({ exists: false }); return }

  const row = rows[0]
  res.json({
    exists: true,
    x: row.pos_x, y: row.pos_y, z: row.pos_z,
    health: row.health, hunger: row.hunger, thirst: row.thirst,
    energy: row.energy, fatigue: row.fatigue,
    evolutionPoints: row.ev_points,
    civTier: row.civ_tier,
    discoveries: JSON.parse(row.discoveries ?? '[]'),
    currentGoal: row.current_goal,
    simSeconds: row.sim_seconds,
    inventory: JSON.parse(row.inventory ?? '[]'),
    techTree: JSON.parse(row.tech_tree ?? '[]'),
    techTreeInProgress: JSON.parse(row.tech_tree_in_progress ?? '[]'),
    evolutionTree: JSON.parse(row.evolution_tree ?? '[]'),
    knownRecipes: JSON.parse(row.known_recipes ?? '[]'),
    journalEntries: JSON.parse(row.journal_entries ?? '[]'),
    buildings: JSON.parse(row.buildings ?? '[]'),
  })
}
