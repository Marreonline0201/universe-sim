// ── PlayerRegistry ─────────────────────────────────────────────────────────────
// Tracks all currently-connected players and their last-known state.

export class PlayerRegistry {
  constructor() {
    /** @type {Map<string, { userId: string; username: string; x: number; y: number; z: number; health: number; murderCount: number; ws: import('ws').WebSocket }>} */
    this._players = new Map()
  }

  add(userId, username, ws) {
    this._players.set(userId, {
      userId,
      username,
      x: 0, y: 0.9, z: 0,
      health: 1,
      murderCount: 0,
      ws,
    })
  }

  remove(userId) {
    this._players.delete(userId)
  }

  update(userId, patch) {
    const p = this._players.get(userId)
    if (!p) return
    if (patch.x !== undefined) p.x = patch.x
    if (patch.y !== undefined) p.y = patch.y
    if (patch.z !== undefined) p.z = patch.z
    if (patch.health !== undefined) p.health = patch.health
    if (patch.murderCount !== undefined) p.murderCount = patch.murderCount
  }

  get(userId) {
    return this._players.get(userId) ?? null
  }

  /** Returns serialisable player list (no ws socket). */
  getAll() {
    const result = []
    for (const p of this._players.values()) {
      result.push({
        userId:      p.userId,
        username:    p.username,
        x:           p.x,
        y:           p.y,
        z:           p.z,
        health:      p.health,
        murderCount: p.murderCount,
      })
    }
    return result
  }

  /** Iterate over all connected WebSockets. */
  forEachSocket(cb) {
    for (const p of this._players.values()) cb(p.ws, p.userId)
  }

  get count() {
    return this._players.size
  }
}
