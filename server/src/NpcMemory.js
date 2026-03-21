// ── NpcMemory ───────────────────────────────────────────────────────────────────
// Server-authoritative player trust/threat model, persisted in Neon DB.
// Each (settlementId, playerId) pair has:
//   trustScore   — float -10..+10, starts at 0
//   threatLevel  — integer 0..10, increments on hostile acts
//
// Gates close when threatLevel > THREAT_GATE_THRESHOLD.
// Trust decays slowly toward 0 over real time (forgiveness).

import { neon } from '@neondatabase/serverless'

const THREAT_GATE_THRESHOLD = 3   // close gates when threatLevel exceeds this
const TRUST_DECAY_RATE_PER_S = 0.0001  // 0.0001 / s  → full decay in ~28 hours real time
const THREAT_DECAY_RATE_PER_S = 0.0005 // one level per ~33 min real time

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

export class NpcMemory {
  constructor() {
    /** @type {Map<string, { trustScore: number; threatLevel: number; lastSeen: number }>} */
    this._memory = new Map()  // key: `${settlementId}:${playerId}`
  }

  // ── Schema migration ─────────────────────────────────────────────────────────

  async migrateSchema() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        CREATE TABLE IF NOT EXISTS npc_player_memory (
          settlement_id  INT NOT NULL,
          player_id      TEXT NOT NULL,
          trust_score    REAL NOT NULL DEFAULT 0,
          threat_level   INT NOT NULL DEFAULT 0,
          last_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (settlement_id, player_id)
        )
      `
    } catch (err) {
      console.warn('[NpcMemory] migrateSchema:', err.message)
    }
  }

  // ── Load persisted state on boot ─────────────────────────────────────────────

  async load() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      const rows = await db`SELECT settlement_id, player_id, trust_score, threat_level, last_seen FROM npc_player_memory`
      for (const row of rows) {
        const key = `${row.settlement_id}:${row.player_id}`
        this._memory.set(key, {
          trustScore:   row.trust_score,
          threatLevel:  row.threat_level,
          lastSeen:     new Date(row.last_seen).getTime(),
        })
      }
      console.log(`[NpcMemory] Loaded ${this._memory.size} player-settlement memory records`)
    } catch (err) {
      console.error('[NpcMemory] load error:', err.message)
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Record a player entering a settlement. Initialises record if needed. */
  recordVisit(settlementId, playerId) {
    const entry = this._getOrCreate(settlementId, playerId)
    entry.lastSeen = Date.now()
    this._persist(settlementId, playerId, entry).catch(() => {})
  }

  /** Increase threat level (hostile act: attacking NPC, stealing). Capped at 10. */
  addThreat(settlementId, playerId, amount = 1) {
    const entry = this._getOrCreate(settlementId, playerId)
    entry.threatLevel = Math.min(10, entry.threatLevel + amount)
    entry.trustScore  = Math.max(-10, entry.trustScore - amount * 0.5)
    entry.lastSeen    = Date.now()
    this._persist(settlementId, playerId, entry).catch(() => {})
    return entry.threatLevel > THREAT_GATE_THRESHOLD
  }

  /** Increase trust (completing a trade, gifting resources). Capped at 10. */
  addTrust(settlementId, playerId, amount = 1) {
    const entry = this._getOrCreate(settlementId, playerId)
    entry.trustScore = Math.min(10, entry.trustScore + amount)
    entry.lastSeen   = Date.now()
    this._persist(settlementId, playerId, entry).catch(() => {})
  }

  /** Returns { trustScore, threatLevel } or null if never seen. */
  getMemory(settlementId, playerId) {
    const entry = this._memory.get(`${settlementId}:${playerId}`)
    return entry ? { trustScore: entry.trustScore, threatLevel: entry.threatLevel } : null
  }

  /** Returns true if this settlement has closed its gates to the player. */
  gatesClosed(settlementId, playerId) {
    const entry = this._memory.get(`${settlementId}:${playerId}`)
    return (entry?.threatLevel ?? 0) > THREAT_GATE_THRESHOLD
  }

  /**
   * Tick decay — call every N seconds of real time.
   * Both trust and threat gradually drift toward 0 (NPCs forgive and forget slowly).
   */
  tick(dtRealSec) {
    for (const entry of this._memory.values()) {
      if (entry.trustScore > 0)   entry.trustScore   = Math.max(0,  entry.trustScore   - TRUST_DECAY_RATE_PER_S  * dtRealSec)
      if (entry.trustScore < 0)   entry.trustScore   = Math.min(0,  entry.trustScore   + TRUST_DECAY_RATE_PER_S  * dtRealSec)
      if (entry.threatLevel > 0)  entry.threatLevel  = Math.max(0,  entry.threatLevel  - THREAT_DECAY_RATE_PER_S * dtRealSec)
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _getOrCreate(settlementId, playerId) {
    const key = `${settlementId}:${playerId}`
    if (!this._memory.has(key)) {
      this._memory.set(key, { trustScore: 0, threatLevel: 0, lastSeen: Date.now() })
    }
    return this._memory.get(key)
  }

  async _persist(settlementId, playerId, entry) {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        INSERT INTO npc_player_memory (settlement_id, player_id, trust_score, threat_level, last_seen)
        VALUES (${settlementId}, ${playerId}, ${entry.trustScore}, ${Math.round(entry.threatLevel)}, NOW())
        ON CONFLICT (settlement_id, player_id) DO UPDATE SET
          trust_score  = EXCLUDED.trust_score,
          threat_level = EXCLUDED.threat_level,
          last_seen    = EXCLUDED.last_seen
      `
    } catch (err) {
      console.error('[NpcMemory] persist error:', err.message)
    }
  }
}
