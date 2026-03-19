import { neon } from '@neondatabase/serverless'
import { verifyToken } from '@clerk/backend'

export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // Verify Clerk JWT
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  let userId: string
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
    userId = payload.sub
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json()
  const sql = neon(process.env.DATABASE_URL!)

  await sql`
    INSERT INTO player_saves (
      user_id, username, pos_x, pos_y, pos_z,
      health, hunger, thirst, energy, fatigue,
      ev_points, civ_tier, discoveries, current_goal, sim_seconds, updated_at
    ) VALUES (
      ${userId}, ${body.username ?? ''}, ${body.x ?? 0}, ${body.y ?? 0.9}, ${body.z ?? 0},
      ${body.health ?? 1}, ${body.hunger ?? 0}, ${body.thirst ?? 0},
      ${body.energy ?? 1}, ${body.fatigue ?? 0},
      ${body.evolutionPoints ?? 0}, ${body.civTier ?? 0},
      ${JSON.stringify(body.discoveries ?? [])}, ${body.currentGoal ?? 'survive'},
      ${body.simSeconds ?? 0}, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      username     = EXCLUDED.username,
      pos_x        = EXCLUDED.pos_x,
      pos_y        = EXCLUDED.pos_y,
      pos_z        = EXCLUDED.pos_z,
      health       = EXCLUDED.health,
      hunger       = EXCLUDED.hunger,
      thirst       = EXCLUDED.thirst,
      energy       = EXCLUDED.energy,
      fatigue      = EXCLUDED.fatigue,
      ev_points    = EXCLUDED.ev_points,
      civ_tier     = EXCLUDED.civ_tier,
      discoveries  = EXCLUDED.discoveries,
      current_goal = EXCLUDED.current_goal,
      sim_seconds  = EXCLUDED.sim_seconds,
      updated_at   = NOW()
  `

  return Response.json({ ok: true })
}
