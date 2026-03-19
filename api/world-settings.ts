import { neon } from '@neondatabase/serverless'
import { verifyToken } from '@clerk/backend'

export default async function handler(req: any, res: any) {
  const sql = neon(process.env.DATABASE_URL!)

  // GET — public, any client polls this
  if (req.method === 'GET') {
    const rows = await sql`SELECT time_scale FROM world_settings WHERE id = 1`
    res.json({ timeScale: rows[0]?.time_scale ?? 1 }); return
  }

  // POST — admin only
  if (req.method === 'POST') {
    const auth: string | undefined = req.headers['authorization']
    const token = auth?.replace('Bearer ', '')
    if (!token) { res.status(401).send('Unauthorized'); return }

    try {
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
      if (payload.sub !== process.env.ADMIN_USER_ID) { res.status(403).send('Forbidden'); return }
    } catch {
      res.status(401).send('Unauthorized'); return
    }

    const body = req.body ?? {}
    const { timeScale } = body
    if (typeof timeScale !== 'number' || timeScale <= 0) {
      res.status(400).send('Invalid timeScale'); return
    }

    await sql`UPDATE world_settings SET time_scale = ${timeScale}, updated_at = NOW() WHERE id = 1`
    res.json({ ok: true, timeScale }); return
  }

  res.status(405).send('Method Not Allowed')
}
