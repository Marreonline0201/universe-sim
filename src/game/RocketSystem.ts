// ── RocketSystem ───────────────────────────────────────────────────────────────
// Manages rocket launch sequences for the Space Age (M12).
//
// State machine:
//   idle → countdown (T-10) → ignition (T-0, exhaust begins) → ascending (plume VFX)
//   → orbit_achieved (ROCKET_LAUNCHED WS broadcast) → idle
//
// The server receives ROCKET_LAUNCHED and after 30s broadcasts ANOMALY_SIGNAL.
// RocketVFXRenderer reads the exported state to render exhaust + heat shimmer.

import { getWorldSocket } from '../net/useWorldSocket'

// ── Rocket launch state ────────────────────────────────────────────────────────

export type RocketState = 'idle' | 'countdown' | 'ignition' | 'ascending' | 'orbit_achieved'

interface RocketLaunchState {
  state:         RocketState
  countdownSec:  number    // remaining countdown seconds (10 → 0)
  ascentSec:     number    // seconds since ignition
  launchPos:     [number, number, number] | null
  exhaustScale:  number    // 0-1 exhaust cone scale driven by ascentSec
  heatShimmer:   number    // 0-1 heat distortion intensity
}

const _state: RocketLaunchState = {
  state:        'idle',
  countdownSec: 10,
  ascentSec:    0,
  launchPos:    null,
  exhaustScale: 0,
  heatShimmer:  0,
}

const COUNTDOWN_DURATION = 10      // seconds
const ASCENT_DURATION    = 12      // seconds before orbit_achieved
const EXHAUST_RAMP       = 3       // seconds for exhaust to reach full scale

// ── Screen shake for launch ────────────────────────────────────────────────────

interface ShakeState { intensity: number; decay: number }
const _shake: ShakeState = { intensity: 0, decay: 0 }

export function getLaunchShake(): ShakeState { return _shake }

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns a read-only snapshot of current launch state for VFX rendering. */
export function getRocketState(): Readonly<RocketLaunchState> { return _state }

/** Begin launch sequence from given world position. Called when player uses Rocket item near launch_pad. */
export function beginLaunch(pos: [number, number, number]): void {
  if (_state.state !== 'idle') return
  _state.state        = 'countdown'
  _state.countdownSec = COUNTDOWN_DURATION
  _state.launchPos    = [...pos] as [number, number, number]
  _state.ascentSec    = 0
  _state.exhaustScale = 0
  _state.heatShimmer  = 0
  console.log('[RocketSystem] Launch sequence initiated — T-10')
}

/** Cancel a pending launch. Only valid during countdown phase. */
export function abortLaunch(): void {
  if (_state.state !== 'countdown') return
  _state.state        = 'idle'
  _state.launchPos    = null
  _state.countdownSec = COUNTDOWN_DURATION
  console.log('[RocketSystem] Launch aborted')
}

/** Tick called every frame from GameLoop useFrame. dt in seconds. */
export function tickRocket(dt: number): void {
  switch (_state.state) {
    case 'idle': return

    case 'countdown': {
      _state.countdownSec -= dt
      if (_state.countdownSec <= 0) {
        _state.state       = 'ignition'
        _state.ascentSec   = 0
        _state.exhaustScale = 0.05   // initial flicker
        _state.heatShimmer = 0.2
        // Initial ground shake
        _shake.intensity = 0.8
        _shake.decay     = 2.0
        console.log('[RocketSystem] IGNITION — exhaust VFX active')
      }
      return
    }

    case 'ignition': {
      // Ignition phase: 0.5s flash then transition to ascending
      _state.ascentSec += dt
      _state.exhaustScale = Math.min(1, _state.ascentSec / 0.5)
      _state.heatShimmer  = Math.min(1, _state.ascentSec / 0.5)
      if (_state.ascentSec >= 0.5) {
        _state.state = 'ascending'
        _shake.intensity = 1.2
        _shake.decay     = 4.0
      }
      return
    }

    case 'ascending': {
      _state.ascentSec += dt
      // Exhaust ramps to full in EXHAUST_RAMP seconds, then maintains
      _state.exhaustScale = Math.min(1, _state.ascentSec / EXHAUST_RAMP)
      // Heat shimmer peaks at 0.8 then fades as rocket climbs away
      _state.heatShimmer = Math.max(0,
        0.8 * (1 - Math.max(0, _state.ascentSec - EXHAUST_RAMP) / (ASCENT_DURATION - EXHAUST_RAMP))
      )
      // Shake decays naturally
      _shake.intensity = Math.max(0, _shake.intensity - dt * _shake.decay)

      if (_state.ascentSec >= ASCENT_DURATION) {
        _state.state       = 'orbit_achieved'
        _state.exhaustScale = 0
        _state.heatShimmer  = 0
        _broadcast_orbit()
      }
      return
    }

    case 'orbit_achieved': {
      // Hold for 3s then return to idle
      _state.ascentSec += dt
      if (_state.ascentSec >= ASCENT_DURATION + 3) {
        _state.state     = 'idle'
        _state.launchPos = null
        _shake.intensity = 0
      }
      return
    }
  }
}

/** Broadcast ROCKET_LAUNCHED to the server. */
function _broadcast_orbit(): void {
  try {
    const ws = getWorldSocket()
    if (ws) {
      ws.send({
        type: 'ROCKET_LAUNCHED',
        pos:  _state.launchPos,
      })
      console.log('[RocketSystem] ORBIT ACHIEVED — ROCKET_LAUNCHED broadcast')
    }
  } catch {}
}

/** True if currently in a launch sequence (any non-idle state). */
export function isLaunching(): boolean { return _state.state !== 'idle' }
