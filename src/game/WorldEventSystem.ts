// ── WorldEventSystem.ts ───────────────────────────────────────────────────────
// M37 Track A: Recurring timed world events that all players can participate in.
// Events fire every 15–20 minutes (real-time). Each event lasts 10 minutes.
// Completion grants XP + gold rewards. Server broadcasts via WebSocket;
// single-player / dev mode triggers locally via a setInterval timer.

// ── Event types ──────────────────────────────────────────────────────────────

export type WorldEventType =
  | 'treasure_hunt'   // Beacon at random location — first to reach gets loot
  | 'meteor_impact'   // Meteor crashes — crater + rare resources
  | 'faction_war'     // Two factions battle — players join either side
  | 'migration'       // Rare animal herd passes through — tame for rewards
  | 'ancient_ruins'   // Ruins emerge from ground — excavate for artifacts

export interface WorldEvent {
  id: string
  type: WorldEventType
  startTime: number
  endTime: number        // expires after 10 minutes (600 000 ms)
  position: [number, number, number]
  active: boolean
  participantCount: number
  rewards: { xp: number; gold: number; item?: number }
}

// ── Event history ─────────────────────────────────────────────────────────────

export interface CompletedEventRecord {
  id: string
  type: WorldEventType
  completedAt: number
  participated: boolean
}

// Last 3 completed events — read by HUD
export const completedEventHistory: CompletedEventRecord[] = []

// ── Module state ──────────────────────────────────────────────────────────────

export let currentWorldEvent: WorldEvent | null = null

// Listeners notified when the active event changes
type EventListener = (event: WorldEvent | null) => void
const listeners = new Set<EventListener>()

export function subscribeWorldEvent(fn: EventListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  for (const fn of listeners) fn(currentWorldEvent)
}

// ── Reward tables per event type ─────────────────────────────────────────────

const REWARD_TABLE: Record<WorldEventType, WorldEvent['rewards']> = {
  treasure_hunt: { xp: 200, gold: 100 },
  meteor_impact: { xp: 150, gold:  75 },
  faction_war:   { xp: 300, gold: 150 },
  migration:     { xp: 120, gold:  60 },
  ancient_ruins: { xp: 250, gold: 125 },
}

// ── Position helpers ──────────────────────────────────────────────────────────

/** Pick a random point on the planet surface within ~300–600m of the player. */
function randomEventPosition(): [number, number, number] {
  // Import lazily to avoid circular deps — we just read state
  try {
    const { usePlayerStore } = require('../store/playerStore') as typeof import('../store/playerStore')
    const { x, y, z } = usePlayerStore.getState()
    const angle = Math.random() * Math.PI * 2
    const dist  = 300 + Math.random() * 300
    return [x + Math.cos(angle) * dist, y, z + Math.sin(angle) * dist]
  } catch {
    return [0, 0, 300]
  }
}

let _eventIdCounter = 0

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Trigger a world event of the given type (random if omitted).
 * Called by the local timer in dev/single-player, or by the WebSocket handler
 * when a WORLD_EVENT_START message arrives from the server.
 */
export function triggerWorldEvent(type?: WorldEventType): WorldEvent {
  const types: WorldEventType[] = [
    'treasure_hunt', 'meteor_impact', 'faction_war', 'migration', 'ancient_ruins',
  ]
  const resolvedType = type ?? types[Math.floor(Math.random() * types.length)]
  const now = Date.now()
  const event: WorldEvent = {
    id: `wev_${++_eventIdCounter}_${now}`,
    type: resolvedType,
    startTime: now,
    endTime: now + 10 * 60 * 1000,  // 10 minutes
    position: randomEventPosition(),
    active: true,
    participantCount: 0,
    rewards: { ...REWARD_TABLE[resolvedType] },
  }
  currentWorldEvent = event
  notify()
  // Dispatch DOM event for HUD banner
  window.dispatchEvent(new CustomEvent('world-event-start', { detail: event }))
  console.info(`[WorldEvents] Event started: ${resolvedType} @ [${event.position.map(n => n.toFixed(0)).join(', ')}]`)
  return event
}

/**
 * Mark the current event as completed by the given player.
 * Grants rewards, records history, dispatches DOM events.
 */
export function completeWorldEvent(eventId: string, _playerId: string): void {
  if (!currentWorldEvent || currentWorldEvent.id !== eventId) return

  const event = currentWorldEvent

  // Grant rewards
  try {
    const { usePlayerStore } = require('../store/playerStore') as typeof import('../store/playerStore')
    const store = usePlayerStore.getState()
    store.addGold?.(event.rewards.gold)
    // XP is dispatched via custom event; skill-system hooks listen for 'world-event-xp'
  } catch {/* ignore in server context */}

  // Dispatch personal completion toast
  window.dispatchEvent(new CustomEvent('world-event-complete', {
    detail: { eventId, type: event.type, rewards: event.rewards },
  }))

  // Record in history
  completedEventHistory.unshift({ id: eventId, type: event.type, completedAt: Date.now(), participated: true })
  if (completedEventHistory.length > 3) completedEventHistory.length = 3

  currentWorldEvent = null
  notify()
}

/**
 * Expire the current event (no reward — ran out of time).
 * Called by the auto-expiry timer or when a WORLD_EVENT_END WS message arrives.
 */
export function expireWorldEvent(eventId?: string): void {
  if (!currentWorldEvent) return
  if (eventId && currentWorldEvent.id !== eventId) return
  const event = currentWorldEvent
  // Record as not participated
  completedEventHistory.unshift({ id: event.id, type: event.type, completedAt: Date.now(), participated: false })
  if (completedEventHistory.length > 3) completedEventHistory.length = 3
  currentWorldEvent = null
  notify()
  window.dispatchEvent(new CustomEvent('world-event-end', { detail: { eventId: event.id } }))
}

/**
 * Update participant count (called when WORLD_EVENT_PROGRESS received from server).
 */
export function updateEventParticipants(eventId: string, count: number): void {
  if (currentWorldEvent?.id === eventId) {
    currentWorldEvent = { ...currentWorldEvent, participantCount: count }
    notify()
  }
}

// ── Local auto-fire timer (single-player / dev) ───────────────────────────────
// Fires a random event every 15–20 minutes when no multiplayer connection.
// Also exposed as `window.__triggerWorldEvent` for quick console testing.

let _localTimerId: ReturnType<typeof setTimeout> | null = null
let _expiryTimerId: ReturnType<typeof setTimeout> | null = null

function scheduleNextLocalEvent() {
  if (_localTimerId) clearTimeout(_localTimerId)
  const delayMs = (15 + Math.random() * 5) * 60 * 1000  // 15–20 min
  _localTimerId = setTimeout(() => {
    triggerWorldEvent()
    // Auto-expire after 10 minutes if not completed
    if (_expiryTimerId) clearTimeout(_expiryTimerId)
    _expiryTimerId = setTimeout(() => {
      if (currentWorldEvent) expireWorldEvent()
      scheduleNextLocalEvent()
    }, 10 * 60 * 1000)
    scheduleNextLocalEvent()
  }, delayMs)
}

/** Kick off the local event timer. Called once on startup. */
export function startLocalEventTimer(): void {
  scheduleNextLocalEvent()
}

/** Stop the local event timer (called on WS connect to hand off to server). */
export function stopLocalEventTimer(): void {
  if (_localTimerId)  clearTimeout(_localTimerId)
  if (_expiryTimerId) clearTimeout(_expiryTimerId)
  _localTimerId  = null
  _expiryTimerId = null
}

// Expose console trigger for rapid testing
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__triggerWorldEvent = (type?: WorldEventType) => {
    const ev = triggerWorldEvent(type)
    console.info('[WorldEvents] Console-triggered:', ev)
  }
}
