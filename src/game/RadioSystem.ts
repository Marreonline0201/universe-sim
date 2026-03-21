// ── RadioSystem ───────────────────────────────────────────────────────────────
// Settlement radio broadcast system for M12 Space Age.
//
// Radio towers (placed building 'radio_tower') broadcast settlement announcements
// to all players within 300m. Messages are relayed via WebSocket as RADIO_BROADCAST.
//
// Client-side: RadioSystem maintains a queue of received broadcasts (last 20).
// Broadcasts are displayed via RadioHUD (a scrolling log panel in the HUD).
//
// Server-side: The server relays RADIO_BROADCAST to all connected clients
// within RADIO_RANGE of the tower position.
//
// VFX: RadioTowerVFXRenderer reads _activeTowers to render EM pulse rings.

import { getWorldSocket } from '../net/useWorldSocket'

const RADIO_RANGE = 300  // metres

export interface RadioBroadcast {
  id:           number
  settlementId: number
  settlementName: string
  message:      string
  towerPos:     [number, number, number]
  receivedAt:   number   // Date.now()
}

// ── Module state ───────────────────────────────────────────────────────────────

const _broadcasts: RadioBroadcast[] = []
let   _nextId = 1

/** Positions of known active radio towers (populated from WORLD_SNAPSHOT). */
const _activeTowers: Array<{ pos: [number, number, number]; settlementId: number }> = []

// ── Public API ─────────────────────────────────────────────────────────────────

/** Called from WorldSocket when RADIO_BROADCAST message arrives. */
export function receiveRadioBroadcast(
  settlementId:   number,
  settlementName: string,
  message:        string,
  towerPos:       [number, number, number],
): void {
  const bc: RadioBroadcast = {
    id:           _nextId++,
    settlementId,
    settlementName,
    message,
    towerPos,
    receivedAt:   Date.now(),
  }
  _broadcasts.unshift(bc)
  if (_broadcasts.length > 20) _broadcasts.pop()
  console.log(`[RadioSystem] Broadcast from ${settlementName}: "${message}"`)
}

/** Returns last N broadcasts (default 8) for HUD display. */
export function getRecentBroadcasts(n = 8): RadioBroadcast[] {
  return _broadcasts.slice(0, n)
}

/** Register a radio tower position (from WORLD_SNAPSHOT settlement data). */
export function registerTower(pos: [number, number, number], settlementId: number): void {
  // Avoid duplicates
  const existing = _activeTowers.findIndex(t => t.settlementId === settlementId)
  if (existing >= 0) {
    _activeTowers[existing].pos = pos
  } else {
    _activeTowers.push({ pos: [...pos] as [number, number, number], settlementId })
  }
}

/** Returns all active tower positions for VFX rendering. */
export function getActiveTowers(): ReadonlyArray<{ pos: [number, number, number]; settlementId: number }> {
  return _activeTowers
}

/** Broadcast a message from the player's nearest settlement (used when player clicks "broadcast" in HUD). */
export function sendBroadcast(settlementId: number, message: string): void {
  try {
    const ws = getWorldSocket()
    if (ws) {
      ws.send({
        type:         'PLAYER_RADIO_BROADCAST',
        settlementId,
        message:      message.slice(0, 120),   // cap length
      })
    }
  } catch {}
}

/** Clear all broadcasts (e.g. on disconnect/reconnect). */
export function clearBroadcasts(): void {
  _broadcasts.length  = 0
  _activeTowers.length = 0
}
