// ── WorldSocket ────────────────────────────────────────────────────────────────
// WebSocket wrapper with auto-reconnect (exponential backoff).
// Dispatches incoming server messages to multiplayerStore and gameStore.

import { useMultiplayerStore } from '../store/multiplayerStore'
import { useGameStore } from '../store/gameStore'
import { useSettlementStore } from '../store/settlementStore'
import { useUiStore } from '../store/uiStore'
import { inventory } from '../game/GameSingletons'
import type { LocalSimManager } from '../engine/LocalSimManager'

// Module-level reference to the active LocalSimManager.
// Set by SceneRoot after the sim grid initialises.
let _simManager: LocalSimManager | null = null
export function setSimManagerForSocket(mgr: LocalSimManager | null): void {
  _simManager = mgr
}

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
        // Filter out own player — the server echoes our own entry back.
        // Clerk returns null in DEV_BYPASS mode so we compare against this.userId
        // (the actual ID sent to the server, e.g. 'dev-local').
        const allPlayers = (msg.players as RemotePlayer[]) ?? []
        const remotePlayers = allPlayers.filter(p => p.userId !== this.userId)
        mp.setRemotePlayers(remotePlayers)
        mp.setRemoteNpcs((msg.npcs as RemoteNpc[]) ?? [])
        // Seed depleted node state for newly joining player
        if (Array.isArray(msg.depletedNodes)) {
          mp.setDepletedNodes(msg.depletedNodes as number[])
        }
        // M6: Seed settlement state for newly joining player
        if (Array.isArray(msg.settlements)) {
          useSettlementStore.getState().setSettlements(msg.settlements as any[])
        }
        mp.setServerWorld(
          msg.simTime as number,
          msg.timeScale as number,
          msg.paused as boolean,
        )
        mp.setBootstrapState(
          !!(msg.bootstrapPhase),
          (msg.bootstrapProgress as number) ?? 0,
        )
        // Sync game store time/scale/simTime with server authority.
        game.setTimeScale(msg.timeScale as number)
        game.setEpoch(msg.epoch as string ?? 'stellar')
        // Snap simSeconds to server if significantly out of sync.
        const serverSim = msg.simTime as number
        const diff = serverSim - game.simSeconds
        const ts   = Math.max(1, game.timeScale)
        const snapFwd = diff > ts * 5    // server >5 real-sec ahead → snap up
        const snapBwd = diff < -ts * 60  // client >60 real-sec ahead → snap down
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
      case 'NODE_DESTROYED': {
        // Server confirmed a node was depleted — hide it on this client.
        mp.addDepletedNode(msg.nodeId as number)
        break
      }
      case 'NODE_RESPAWNED': {
        // Server timer fired — make the node visible again on this client.
        mp.removeDepletedNode(msg.nodeId as number)
        break
      }
      case 'FIRE_STARTED': {
        // Another player ignited a fire — replicate ignition in local sim grid.
        const fx = msg.x as number
        const fy = msg.y as number
        const fz = msg.z as number
        if (_simManager) {
          _simManager.ignite(fx, fy, fz)
        }
        break
      }

      // ── M6: NPC Civilization ─────────────────────────────────────────────────

      case 'SETTLEMENT_UPDATE': {
        // A settlement changed its civ level or inventory
        const ss = useSettlementStore.getState()
        const existing = ss.settlements.get(msg.settlementId as number)
        if (existing) {
          ss.upsertSettlement({
            ...existing,
            civLevel:    msg.civLevel    as number,
            resourceInv: (msg.resourceInv as Record<string, number>) ?? existing.resourceInv,
          })
        }
        break
      }

      case 'TRADE_OFFER': {
        useSettlementStore.getState().setPendingOffer({
          settlementId:   msg.settlementId   as number,
          settlementName: msg.settlementName as string,
          civLevel:       msg.civLevel       as number,
          offerMats:      (msg.offerMats     as Record<string, number>) ?? {},
          wantMats:       (msg.wantMats      as Record<string, number>) ?? {},
          trustScore:     (msg.trustScore    as number) ?? 0,
        })
        break
      }

      case 'TRADE_RESULT': {
        // Server confirms trade outcome — clear the pending offer regardless
        useSettlementStore.getState().setPendingOffer(null)
        if (msg.result === 'ok') {
          // Deduct what the player gave
          const gives = (msg.playerGives as Record<string, number>) ?? {}
          for (const [matIdStr, qty] of Object.entries(gives)) {
            const matId = parseInt(matIdStr)
            let remaining = qty
            for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
              const slot = inventory.getSlot(i)
              if (slot && slot.itemId === 0 && slot.materialId === matId) {
                const take = Math.min(slot.quantity, remaining)
                inventory.removeItem(i, take)
                remaining -= take
              }
            }
          }
          // Add what the player received
          const receives = (msg.playerReceives as Record<string, number>) ?? {}
          for (const [matIdStr, qty] of Object.entries(receives)) {
            inventory.addItem({ itemId: 0, materialId: parseInt(matIdStr), quantity: qty, quality: 0.8 })
          }
          useUiStore.getState().addNotification('Trade complete!', 'info')
        } else if (msg.result) {
          useUiStore.getState().addNotification(`Trade failed: ${msg.result}`, 'warning')
        }
        break
      }

      case 'GATES_CLOSED': {
        useSettlementStore.getState().setGatesClosed(msg.settlementId as number)
        break
      }

      // ── M7: Iron Age discovery ──────────────────────────────────────────────

      case 'SETTLEMENT_UNLOCKED_IRON': {
        // A settlement reached civLevel 2 — iron smelting knowledge spreads world-wide.
        // Show a prominent discovery notification to all connected players.
        // The actual recipe unlock happens when the player smelts iron in
        // tickBlastFurnaceSmelting (calls inv.discoverRecipe 68/69/70).
        const name = msg.settlementName as string
        useUiStore.getState().addNotification(
          `Iron Age dawns! ${name} has mastered iron smelting. Build a Blast Furnace (8x Stone + 4x Iron Ore + 2x Clay) to smelt.`,
          'discovery'
        )
        // Pre-discover blast furnace recipe so it appears in CraftingPanel
        inventory.discoverRecipe(67)
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
