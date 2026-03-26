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

  if (userId !== process.env.ADMIN_USER_ID) {
    res.status(403).send('Forbidden'); return
  }

  try {
    const sql = neon(process.env.DATABASE_URL!)
    const rows = await sql`
      SELECT user_id, username, pos_x, pos_y, pos_z,
             health, hunger, thirst, energy, fatigue,
             ev_points, civ_tier, current_goal, sim_seconds, updated_at
      FROM player_saves
      ORDER BY updated_at DESC
    `
    res.json({ players: rows })
  } catch (err: any) {
    console.error('[admin] DB query failed:', err?.message ?? err)
    res.status(500).json({ error: 'Database query failed', detail: err?.message ?? 'unknown' })
  }
}
