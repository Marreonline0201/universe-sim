// ── OutlawSystem ────────────────────────────────────────────────────────────────
// Server-authoritative criminal record system.
//
// murder_count persists in player_saves (Neon DB).
// In-memory cache keyed by userId avoids a DB round-trip per kill.
// Bounty reward formula: 200 + murderCount * 150 copper ingots.
// Redemption quests: escort / resource_delivery / settlement_defense.
//   Each quest, when completed, calls decrementMurderCount once.
//
// Quest state is in-memory only (resets on server restart) — short-lived tasks
// don't need permanent storage. The resulting murder_count decrement IS persisted.

import { neon } from '@neondatabase/serverless'

const BOUNTY_BASE    = 200
const BOUNTY_PER_MUL = 150
export const WANTED_THRESHOLD = 5   // murder_count >= 5 triggers active bounty

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

export class OutlawSystem {
  constructor() {
    /** @type {Map<string, number>} userId → murderCount (in-memory cache) */
    this._murderCounts = new Map()

    /**
     * Active redemption quests.
     * @type {Map<string, { playerId: string; questType: string; settlementId: number; progress: number; required: number; expiresAt: number }>}
     * key: questId
     */
    this._activeQuests = new Map()

    /** Next quest ID counter */
    this._questIdCounter = 1
  }

  // ── Schema ───────────────────────────────────────────────────────────────────

  async migrateSchema() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      // Ensure murder_count column exists (it already should from previous migrations,
      // but we run ADD COLUMN IF NOT EXISTS defensively)
      await db`ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS murder_count INT DEFAULT 0`
    } catch (err) {
      console.warn('[OutlawSystem] migrateSchema:', err.message)
    }
  }

  // ── Load from DB on boot ─────────────────────────────────────────────────────

  async load() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      const rows = await db`SELECT user_id, murder_count FROM player_saves WHERE murder_count > 0`
      for (const row of rows) {
        this._murderCounts.set(row.user_id, row.murder_count)
      }
      console.log(`[OutlawSystem] Loaded ${this._murderCounts.size} criminal records`)
    } catch (err) {
      console.error('[OutlawSystem] load error:', err.message)
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  getMurderCount(userId) {
    return this._murderCounts.get(userId) ?? 0
  }

  /** Increment murder count. Returns { newCount, bountyReward } */
  async incrementMurderCount(userId) {
    const prev = this._murderCounts.get(userId) ?? 0
    const newCount = prev + 1
    this._murderCounts.set(userId, newCount)
    await this._persist(userId, newCount)
    const bountyReward = this.getBountyReward(newCount)
    return { newCount, bountyReward }
  }

  /** Decrement murder count (redemption). Floor at 0. Returns new count. */
  async decrementMurderCount(userId) {
    const prev = this._murderCounts.get(userId) ?? 0
    const newCount = Math.max(0, prev - 1)
    this._murderCounts.set(userId, newCount)
    await this._persist(userId, newCount)
    return newCount
  }

  /** Copper ingot reward for killing a wanted player. */
  getBountyReward(murderCount) {
    if (murderCount < WANTED_THRESHOLD) return 0
    return BOUNTY_BASE + murderCount * BOUNTY_PER_MUL
  }

  /** Returns the BOUNTY_POSTED broadcast payload if count >= threshold, else null. */
  getBountyPayload(userId, username, murderCount) {
    if (murderCount < WANTED_THRESHOLD) return null
    return {
      type:        'BOUNTY_POSTED',
      playerId:    userId,
      username,
      murderCount,
      reward:      this.getBountyReward(murderCount),
    }
  }

  // ── Redemption quests ────────────────────────────────────────────────────────

  /**
   * Issue a redemption quest to a player.
   * questType: 'escort' | 'resource_delivery' | 'settlement_defense'
   * Returns the quest object sent back to the client.
   */
  issueQuest(playerId, settlementId, questType) {
    // Only one active quest per player
    const existing = this._findActiveQuestForPlayer(playerId)
    if (existing) return { ...existing, alreadyActive: true }

    const questId = `q-${this._questIdCounter++}`
    const required = questType === 'resource_delivery' ? 10 : 1  // 10 items or 1 objective
    const quest = {
      questId,
      playerId,
      settlementId,
      questType,
      progress:  0,
      required,
      expiresAt: Date.now() + 10 * 60 * 1000,  // 10 min window
    }
    this._activeQuests.set(questId, quest)

    console.log(`[OutlawSystem] Issued ${questType} quest ${questId} to ${playerId}`)
    return { questId, questType, settlementId, required, expiresAt: quest.expiresAt }
  }

  /**
   * Report progress on a quest (resource_delivery increments, others complete in one step).
   * Returns { completed: bool, quest } or null if quest not found / expired.
   */
  advanceQuest(questId, playerId, amount = 1) {
    const quest = this._activeQuests.get(questId)
    if (!quest) return null
    if (quest.playerId !== playerId) return null
    if (Date.now() > quest.expiresAt) {
      this._activeQuests.delete(questId)
      return { expired: true }
    }

    quest.progress = Math.min(quest.required, quest.progress + amount)
    const completed = quest.progress >= quest.required
    if (completed) {
      this._activeQuests.delete(questId)
    }
    return { completed, progress: quest.progress, required: quest.required, quest }
  }

  getActiveQuest(playerId) {
    return this._findActiveQuestForPlayer(playerId) ?? null
  }

  // ── Cleanup expired quests ───────────────────────────────────────────────────

  tickCleanup() {
    const now = Date.now()
    for (const [id, q] of this._activeQuests) {
      if (now > q.expiresAt) {
        this._activeQuests.delete(id)
        console.log(`[OutlawSystem] Quest ${id} for ${q.playerId} expired`)
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _findActiveQuestForPlayer(playerId) {
    for (const q of this._activeQuests.values()) {
      if (q.playerId === playerId && Date.now() <= q.expiresAt) return q
    }
    return null
  }

  async _persist(userId, murderCount) {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        UPDATE player_saves SET murder_count = ${murderCount}, updated_at = NOW()
        WHERE user_id = ${userId}
      `
    } catch (err) {
      console.error('[OutlawSystem] persist error:', err.message)
    }
  }
}
