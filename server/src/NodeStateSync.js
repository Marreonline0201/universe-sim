// ── NodeStateSync ───────────────────────────────────────────────────────────────
// Server-authoritative resource node state.
// Tracks which nodes are depleted, persists them in Neon DB, manages respawn timers,
// and fires a callback when a node respawns (so index.js can broadcast NODE_RESPAWNED).

import { neon } from '@neondatabase/serverless'

const NODE_RESPAWN_MS = 60_000  // 60 seconds

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

export class NodeStateSync {
  constructor() {
    /** @type {Map<number, { nodeId: number; type: string; depletedAt: number; x: number; y: number; z: number }>} */
    this._depleted = new Map()

    /** Callback: (nodeId, x, y, z, type) => void  — fired when a node respawns */
    this.onRespawn = null

    this._timers = new Map()
  }

  // ── Schema migration ─────────────────────────────────────────────────────────

  async migrateSchema() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        CREATE TABLE IF NOT EXISTS depleted_nodes (
          node_id    INTEGER PRIMARY KEY,
          node_type  TEXT    NOT NULL,
          x          REAL    NOT NULL DEFAULT 0,
          y          REAL    NOT NULL DEFAULT 0,
          z          REAL    NOT NULL DEFAULT 0,
          depleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    } catch (err) {
      console.warn('[NodeStateSync] migrateSchema:', err.message)
    }
  }

  // ── Load persisted state on startup ─────────────────────────────────────────

  async load() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      const rows = await db`SELECT node_id, node_type, x, y, z, depleted_at FROM depleted_nodes`
      const now = Date.now()
      for (const row of rows) {
        const depletedAt = new Date(row.depleted_at).getTime()
        const elapsed = now - depletedAt
        if (elapsed >= NODE_RESPAWN_MS) {
          // Already expired — remove from DB and skip
          await this._dbRemove(row.node_id)
          continue
        }
        this._depleted.set(row.node_id, {
          nodeId: row.node_id,
          type: row.node_type,
          depletedAt,
          x: row.x,
          y: row.y,
          z: row.z,
        })
        // Schedule respawn for remaining time
        const remaining = NODE_RESPAWN_MS - elapsed
        this._scheduleRespawn(row.node_id, remaining)
      }
      console.log(`[NodeStateSync] Loaded ${this._depleted.size} depleted nodes from DB`)
    } catch (err) {
      console.error('[NodeStateSync] load error:', err.message)
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Mark a node as depleted. Persists to DB and schedules respawn timer.
   * Idempotent — safe to call if node is already depleted.
   * @param {number} nodeId
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  markDepleted(nodeId, type, x = 0, y = 0, z = 0) {
    if (this._depleted.has(nodeId)) return  // already depleted
    const depletedAt = Date.now()
    this._depleted.set(nodeId, { nodeId, type, depletedAt, x, y, z })
    this._dbInsert(nodeId, type, x, y, z).catch(() => {})
    this._scheduleRespawn(nodeId, NODE_RESPAWN_MS)
    console.log(`[NodeStateSync] Node ${nodeId} (${type}) depleted — respawn in 60s`)
  }

  /** Returns true if the node is currently depleted. */
  isDepleted(nodeId) {
    return this._depleted.has(nodeId)
  }

  /** Returns serialisable snapshot of all depleted node IDs (for WORLD_SNAPSHOT). */
  getDepletedSnapshot() {
    return Array.from(this._depleted.keys())
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _scheduleRespawn(nodeId, delayMs) {
    if (this._timers.has(nodeId)) return
    const timer = setTimeout(() => {
      const entry = this._depleted.get(nodeId)
      this._depleted.delete(nodeId)
      this._timers.delete(nodeId)
      this._dbRemove(nodeId).catch(() => {})
      console.log(`[NodeStateSync] Node ${nodeId} respawned`)
      if (this.onRespawn && entry) {
        this.onRespawn(entry.nodeId, entry.x, entry.y, entry.z, entry.type)
      }
    }, delayMs)
    this._timers.set(nodeId, timer)
  }

  async _dbInsert(nodeId, type, x, y, z) {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        INSERT INTO depleted_nodes (node_id, node_type, x, y, z, depleted_at)
        VALUES (${nodeId}, ${type}, ${x}, ${y}, ${z}, NOW())
        ON CONFLICT (node_id) DO NOTHING
      `
    } catch (err) {
      console.error('[NodeStateSync] _dbInsert error:', err.message)
    }
  }

  async _dbRemove(nodeId) {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`DELETE FROM depleted_nodes WHERE node_id = ${nodeId}`
    } catch (err) {
      console.error('[NodeStateSync] _dbRemove error:', err.message)
    }
  }
}
