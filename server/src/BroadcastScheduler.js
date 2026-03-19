// ── BroadcastScheduler ─────────────────────────────────────────────────────────
// Sends a WorldSnapshot to all connected clients at 10 Hz.

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
    if (this._players.count === 0) return

    const snapshot = JSON.stringify({
      type: 'WORLD_SNAPSHOT',
      simTime: this._clock.simTimeSec,
      epoch: this._clock.epoch,
      timeScale: this._clock.timeScale,
      paused: this._clock.paused,
      players: this._players.getAll(),
      npcs: this._npcs.getAll(),
    })

    this._players.forEachSocket((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(snapshot)
      }
    })
  }
}
