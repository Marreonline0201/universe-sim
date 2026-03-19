import { neon } from '@neondatabase/serverless'
import { verifyToken } from '@clerk/backend'

export default async function handler(req: Request) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  let userId: string
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
    userId = payload.sub
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const sql = neon(process.env.DATABASE_URL!)
  const rows = await sql`SELECT * FROM player_saves WHERE user_id = ${userId}`

  if (rows.length === 0) return Response.json({ exists: false })

  const row = rows[0]
  return Response.json({
    exists: true,
    x: row.pos_x, y: row.pos_y, z: row.pos_z,
    health: row.health, hunger: row.hunger, thirst: row.thirst,
    energy: row.energy, fatigue: row.fatigue,
    evolutionPoints: row.ev_points,
    civTier: row.civ_tier,
    discoveries: JSON.parse(row.discoveries ?? '[]'),
    currentGoal: row.current_goal,
    simSeconds: row.sim_seconds,
  })
}
