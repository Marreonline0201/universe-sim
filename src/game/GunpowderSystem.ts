// ── GunpowderSystem.ts ──────────────────────────────────────────────────────
// M11 Track A: Gunpowder discovery and musket firing mechanics.
//
// GUNPOWDER CHEMISTRY (Tier B — Approximate):
//   KNO₃ + C + S → rapid oxidation reaction
//   Historical black powder: 75% KNO₃ + 15% C + 10% S (by mass)
//   Deflagration (not detonation): burns at ~600 m/s, produces ~3000°C gas
//   Gas pressure propels a ball: F = P × A (pressure × barrel cross-section area)
//   For a ~1.2 cm bore musket: ~4000 Pa·m² ≈ 40 N peak force on ~10g ball
//   Kinetic energy ≈ 2000 J at muzzle (historical Brown Bess ~1800 J)
//   Damage model: exponential falloff with range, no penetration through cover
//
// MUSKET MECHANICS:
//   - Reload time: 8 real seconds (historical: 15–30s, compressed for gameplay)
//   - Effective range: 60m (historical smooth-bore: ~50–100m accurate range)
//   - Damage: 80 HP (one-shot non-armored NPCs, two-shot steel-armored targets)
//   - Noise: emits MUSKET_FIRED WS message with position → server broadcasts to
//     all players within 200m (sound propagation radius)
//   - Smoke cloud: 2s particle effect at muzzle (grey-white, rises and dissipates)
//   - Recoil: 0.3 unit knockback on player camera (screenshake via playerStore)
//
// DISCOVERY EVENT:
//   When the player first crafts gunpowder (recipe 88), a discovery notification fires:
//   "Gunpowder discovered — the age of firearms begins."
//   This unlocks the musket recipe (89) in the crafting panel.

import { getWorldSocket } from '../net/useWorldSocket'

export interface MusketState {
  reloadProgress: number  // 0 = fully loaded, 1 = needs reload
  isReloading: boolean
  reloadStartTime: number
  lastFiredAt: number
  shotsUntilClean: number  // fouling: accuracy degrades after 3 shots without cleaning
}

const RELOAD_TIME_S   = 8.0
const EFFECTIVE_RANGE = 60.0      // metres
const MUSKET_DAMAGE   = 80
const SMOKE_DURATION  = 2.0       // seconds

// Module-level musket state (one musket per player)
const _musket: MusketState = {
  reloadProgress: 0,
  isReloading: false,
  reloadStartTime: 0,
  lastFiredAt: 0,
  shotsUntilClean: 3,
}

// Pending smoke cloud effects: { position, startTime, duration }
export interface SmokeCloud {
  x: number; y: number; z: number
  startTime: number
  duration: number
}
export const pendingSmokeClouds: SmokeCloud[] = []

// Pending screen shake events
export interface ScreenShake {
  intensity: number
  startTime: number
  duration: number
}
let _pendingShake: ScreenShake | null = null

export function getPendingShake(): ScreenShake | null {
  return _pendingShake
}
export function clearPendingShake(): void {
  _pendingShake = null
}

/** Call every frame from GameLoop. Advances reload timer. */
export function tickMusket(dt: number): void {
  if (!_musket.isReloading) return
  const elapsed = (Date.now() - _musket.reloadStartTime) / 1000
  _musket.reloadProgress = Math.min(1, elapsed / RELOAD_TIME_S)
  if (_musket.reloadProgress >= 1) {
    _musket.isReloading = false
    _musket.reloadProgress = 1
  }
}

/** Returns current musket state (read-only copy). */
export function getMusketState(): Readonly<MusketState> {
  return { ..._musket }
}

/** Returns true if musket is fully loaded and ready to fire. */
export function isMusketReady(): boolean {
  return !_musket.isReloading && _musket.reloadProgress >= 1
}

/**
 * Fire the musket.
 * Returns an object describing the shot result, or null if musket is not ready.
 * Caller is responsible for:
 *   - Consuming 1x MUSKET_BALL from inventory
 *   - Applying MUSKET_DAMAGE to the target
 *   - Sending MUSKET_FIRED over the WebSocket
 */
export function fireMusket(
  px: number, py: number, pz: number,   // player world position
  targetEntityId: number | null,         // hit entity (null = missed)
): { damage: number; effectiveHit: boolean; range: number } | null {
  if (!isMusketReady()) return null

  // Accuracy degradation from fouling (after 3+ shots without cleaning)
  const foulingPenalty = _musket.shotsUntilClean <= 0 ? 0.3 : 0.0
  const effectiveHit = targetEntityId !== null && Math.random() > foulingPenalty

  // Start reload
  _musket.isReloading = true
  _musket.reloadProgress = 0
  _musket.reloadStartTime = Date.now()
  _musket.lastFiredAt = Date.now()
  _musket.shotsUntilClean = Math.max(0, _musket.shotsUntilClean - 1)

  // Spawn smoke cloud at muzzle position
  pendingSmokeClouds.push({
    x: px,
    y: py + 1.2,   // muzzle height
    z: pz,
    startTime: Date.now(),
    duration: SMOKE_DURATION * 1000,
  })

  // Screen shake — recoil
  _pendingShake = { intensity: 0.3, startTime: Date.now(), duration: 250 }

  // Broadcast to server
  const socket = getWorldSocket()
  if (socket) {
    socket.send({
      type: 'MUSKET_FIRED',
      x: px, y: py, z: pz,
      targetEntityId: targetEntityId ?? null,
      hit: effectiveHit,
    })
  }

  return {
    damage: effectiveHit ? MUSKET_DAMAGE : 0,
    effectiveHit,
    range: EFFECTIVE_RANGE,
  }
}

/** Clean the musket barrel (restores accuracy). Simulates running a ramrod patch. */
export function cleanMusket(): void {
  _musket.shotsUntilClean = 3
}

/** Returns true if the player is in effective range for a musket shot. */
export function isInMusketRange(
  px: number, pz: number,
  tx: number, tz: number,
): boolean {
  const dx = tx - px
  const dz = tz - pz
  return Math.sqrt(dx * dx + dz * dz) <= EFFECTIVE_RANGE
}

/** Tick smoke clouds — remove expired ones. */
export function tickSmokeClouds(): void {
  const now = Date.now()
  for (let i = pendingSmokeClouds.length - 1; i >= 0; i--) {
    const cloud = pendingSmokeClouds[i]
    if (now - cloud.startTime > cloud.duration) {
      pendingSmokeClouds.splice(i, 1)
    }
  }
}
