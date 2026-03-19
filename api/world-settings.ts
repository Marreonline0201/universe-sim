import { neon } from '@neondatabase/serverless'
import { verifyToken } from '@clerk/backend'

export default async function handler(req: Request) {
  const sql = neon(process.env.DATABASE_URL!)

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS world_settings (
      id          INT PRIMARY KEY DEFAULT 1,
      time_scale  REAL DEFAULT 1,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      CHECK (id = 1)
    )
  `
  await sql`INSERT INTO world_settings (id, time_scale) VALUES (1, 1) ON CONFLICT DO NOTHING`

  // GET — public, any client polls this
  if (req.method === 'GET') {
    const rows = await sql`SELECT time_scale FROM world_settings WHERE id = 1`
    return Response.json({ timeScale: rows[0]?.time_scale ?? 1 })
  }

  // POST — admin only
  if (req.method === 'POST') {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return new Response('Unauthorized', { status: 401 })

    try {
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
      if (payload.sub !== process.env.ADMIN_USER_ID) return new Response('Forbidden', { status: 403 })
    } catch {
      return new Response('Unauthorized', { status: 401 })
    }

    const { timeScale } = await req.json()
    if (typeof timeScale !== 'number' || timeScale <= 0) {
      return new Response('Invalid timeScale', { status: 400 })
    }

    await sql`UPDATE world_settings SET time_scale = ${timeScale}, updated_at = NOW() WHERE id = 1`
    return Response.json({ ok: true, timeScale })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
