import { neon } from '@neondatabase/serverless'
import { verifyToken } from '@clerk/backend'

export default async function handler(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  let userId: string
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
    userId = payload.sub
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  if (userId !== process.env.ADMIN_USER_ID) {
    return new Response('Forbidden', { status: 403 })
  }

  const sql = neon(process.env.DATABASE_URL!)
  const rows = await sql`
    SELECT user_id, username, pos_x, pos_y, pos_z,
           health, hunger, thirst, energy, fatigue,
           ev_points, civ_tier, current_goal, sim_seconds, updated_at
    FROM player_saves
    ORDER BY updated_at DESC
  `

  return Response.json({ players: rows })
}
