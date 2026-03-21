// ── BroadcastScheduler ─────────────────────────────────────────────────────────
// Sends a WorldSnapshot to all connected clients at 10 Hz.
//
// M9 T3: BATCH_UPDATE support.
// Non-critical high-frequency messages (NPC position, weather updates) are
// accumulated in a queue and flushed as a single BATCH_UPDATE message at 10 Hz
// alongside the WORLD_SNAPSHOT. This eliminates the overhead of many individual
// JSON.stringify + ws.send calls for messages that arrive in bursts (e.g. the 8
// WEATHER_UPDATE messages that fire simultaneously on each transition tick).
//
// Critical messages (NODE_DESTROYED, PLAYER_JOINED, etc.) are NOT batched —
// they continue to broadcast immediately via broadcastAll() / broadcast().

import { WebSocket } from 'ws'

const BROADCAST_HZ = 10
const BROADCAST_MS = 1000 / BROADCAST_HZ

export class BroadcastScheduler {
  /**
   * @param {import('./WorldClock.js').WorldClock} clock
   * @param {import('./PlayerRegistry.js').PlayerRegistry} players
   * @param {import('./NpcManager.js').NpcManager} npcs
   */
  constructor(clock, players, npcs) {
    this._clock = clock
    this._players = players
    this._npcs = npcs
    this._interval = null
    // Pending batch queue — filled by enqueueBatch(), drained each tick
    this._batchQueue = []
  }

  /**
   * Enqueue a non-critical message for batched delivery on the next tick.
   * Messages enqueued here are NOT sent immediately — they are bundled into
   * a single BATCH_UPDATE payload at the next 100ms broadcast interval.
   *
   * Use for: WEATHER_UPDATE, NPC_POSITION, ANIMAL_POSITION
   * Do NOT use for: NODE_DESTROYED, PLAYER_JOINED, PLAYER_LEFT, BOUNTY_POSTED
   *
   * @param {object} msg - The message object to batch
   */
  enqueueBatch(msg) {
    this._batchQueue.push(msg)
  }

  start() {
    if (this._interval) return
    this._interval = setInterval(() => this._broadcast(), BROADCAST_MS)
    console.log('[BroadcastScheduler] started at', BROADCAST_HZ, 'Hz')
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  _broadcast() {
    if (this._players.count === 0) {
      // Still drain the queue even if no players to prevent unbounded growth
      this._batchQueue.length = 0
      return
    }

    const snapshot = JSON.stringify({
      type: 'WORLD_SNAPSHOT',
      simTime: this._clock.simTimeSec,
      epoch: this._clock.epoch,
      timeScale: this._clock.timeScale,
      paused: this._clock.paused,
      bootstrapPhase: this._clock.bootstrapPhase,
      bootstrapProgress: this._clock.bootstrapProgress,
      players: this._players.getAll(),
      npcs: this._npcs.getAll(),
    })

    this._players.forEachSocket((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(snapshot)
      }
    })

    // M9 T3: Flush batch queue as a single BATCH_UPDATE message
    if (this._batchQueue.length > 0) {
      const batch = JSON.stringify({
        type: 'BATCH_UPDATE',
        messages: this._batchQueue,
      })
      this._batchQueue = []

      this._players.forEachSocket((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(batch)
        }
      })
    }
  }
}
