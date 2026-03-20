// ── WorldSocket ────────────────────────────────────────────────────────────────
// WebSocket wrapper with auto-reconnect (exponential backoff).
// Dispatches incoming server messages to multiplayerStore and gameStore.

import { useMultiplayerStore } from '../store/multiplayerStore'
import { useGameStore } from '../store/gameStore'

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

export class WorldSocket {
  private ws: WebSocket | null = null
  private _backoff = MIN_BACKOFF_MS
  private _destroyed = false
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly url: string,
    private readonly userId: string,
    private readonly username: string,
  ) {}

  connect(): void {
    if (this._destroyed) return
    const mp = useMultiplayerStore.getState()
    mp.setConnectionStatus('connecting')

    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this._backoff = MIN_BACKOFF_MS
      useMultiplayerStore.getState().setConnectionStatus('connected')
      this._send({ type: 'JOIN', userId: this.userId, username: this.username })
    }

    this.ws.onmessage = (evt) => {
      let msg: unknown
      try { msg = JSON.parse(evt.data as string) } catch { return }
      this._dispatch(msg as Record<string, unknown>)
    }

    this.ws.onclose = () => {
      useMultiplayerStore.getState().setConnectionStatus('disconnected')
      if (!this._destroyed) this._scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose fires after onerror — reconnect logic lives there
    }
  }

  /** Send a typed message to the server. */
  send(msg: Record<string, unknown>): void {
    this._send(msg)
  }

  destroy(): void {
    this._destroyed = true
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer)
    this.ws?.close()
    this.ws = null
    useMultiplayerStore.getState().setConnectionStatus('disconnected')
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return
    this._reconnectTimer = setTimeout(() => {
      this._backoff = Math.min(this._backoff * 2, MAX_BACKOFF_MS)
      this.connect()
    }, this._backoff)
  }

  private _dispatch(msg: Record<string, unknown>): void {
    const mp = useMultiplayerStore.getState()
    const game = useGameStore.getState()

    switch (msg.type) {
      case 'WORLD_SNAPSHOT': {
        mp.setRemotePlayers((msg.players as RemotePlayer[]) ?? [])
        mp.setRemoteNpcs((msg.npcs as RemoteNpc[]) ?? [])
        mp.setServerWorld(
          msg.simTime as number,
          msg.timeScale as number,
          msg.paused as boolean,
        )
        mp.setBootstrapState(
          !!(msg.bootstrapPhase),
          (msg.bootstrapProgress as number) ?? 0,
        )
        // Sync game store time/scale/simTime with server authority
        game.setTimeScale(msg.timeScale as number)
        // Only snap simTime if server is significantly ahead (e.g. first connect, long disconnect).
        // Never snap backwards — local RAF clock runs slightly faster than server 10Hz clock,
        // so the client is typically ~20 sim-seconds ahead each tick at 1,000,000× — that is fine.
        // Only snap backwards if client is outrageously ahead (admin time-reset scenario).
        const serverSim = msg.simTime as number
        const diff = serverSim - game.simSeconds          // positive = server ahead
        const ts   = Math.max(1, game.timeScale)
        const snapFwd = diff > ts * 5                     // server >5 real-sec ahead → snap up
        const snapBwd = diff < -ts * 60                   // client >60 real-sec ahead → snap down
        if (snapFwd || snapBwd) {
          game.setSimSeconds(serverSim)
        }
        if (msg.paused !== undefined) {
          const paused = msg.paused as boolean
          if (paused !== game.paused) game.togglePause()
        }
        break
      }
      case 'PLAYER_JOINED': {
        const p = msg.player as RemotePlayer
        if (p) mp.upsertRemotePlayer(p)
        break
      }
      case 'PLAYER_LEFT': {
        mp.removeRemotePlayer(msg.userId as string)
        break
      }
      default:
        break
    }
  }
}

// Re-export types so callers don't need to import from multiplayerStore
import type { RemotePlayer, RemoteNpc } from '../store/multiplayerStore'
export type { RemotePlayer, RemoteNpc }
