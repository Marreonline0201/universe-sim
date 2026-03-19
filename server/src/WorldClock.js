// ── WorldClock ─────────────────────────────────────────────────────────────────
// setInterval-based simulation clock. Owns authoritative simTime.
// Runs 24/7 on Railway regardless of connected clients.
//
// Bootstrap mode: if simTime has not yet reached BOOTSTRAP_TARGET_SECS,
// the clock runs at 1e14× speed (~47 min real time to reach 9 billion years).
// Players are shown a timelapse screen until bootstrap completes.

const TICK_MS = 100 // 10 Hz

// ── Bootstrap constants ────────────────────────────────────────────────────────
// Target: solar system forming (~9 billion years into universe history)
const BOOTSTRAP_TARGET_YEARS = 9e9
const BOOTSTRAP_TARGET_SECS  = BOOTSTRAP_TARGET_YEARS * 31_557_600  // ~2.84e17 s
const BOOTSTRAP_TIMESCALE    = 1e14   // at 10Hz ticks: reaches target in ~47 min
const NORMAL_TIMESCALE       = 1_000_000  // 1 real second = 1M sim-seconds (normal play)

// Real cosmological epoch thresholds (in sim-seconds → years)
function epochFromSeconds(secs) {
  const years = secs / 31_557_600
  if (years < 1e-10)   return 'planck'
  if (years < 1e-6)    return 'grand_unification'
  if (years < 1e-4)    return 'electroweak'
  if (years < 1e-2)    return 'quark_epoch'
  if (years < 1)       return 'nucleosynthesis'
  if (years < 380_000) return 'photon_epoch'
  if (years < 1e8)     return 'dark_ages'
  if (years < 1e9)     return 'reionization'
  if (years < 4e9)     return 'stellar'
  if (years < 10e9)    return 'galactic'
  if (years < 14e9)    return 'contemporary'
  if (years < 1e14)    return 'stellar_late'
  if (years < 1e40)    return 'degenerate'
  return 'dark_era'
}

export class WorldClock {
  constructor() {
    this.simTimeSec   = 0
    this.timeScale    = NORMAL_TIMESCALE
    this.paused       = false
    this.epoch        = 'stellar'
    this.bootstrapPhase    = false
    this.bootstrapProgress = 0
    this._bootstrapCompleteCallbacks = []
    this._lastWall  = Date.now()
    this._interval  = null
    this._tickCallbacks = []
  }

  /**
   * Enter bootstrap mode — run at extreme speed until the solar system forms.
   * Only call this when simTimeSec < BOOTSTRAP_TARGET_SECS.
   */
  startBootstrap() {
    this.bootstrapPhase    = true
    this.bootstrapProgress = Math.min(this.simTimeSec / BOOTSTRAP_TARGET_SECS, 0.999)
    this.timeScale         = BOOTSTRAP_TIMESCALE
    console.log(`[WorldClock] Bootstrap mode — timeScale=1e14, target=${(BOOTSTRAP_TARGET_YEARS/1e9).toFixed(1)}B years (~47 min)`)
  }

  /** Register a callback to run when bootstrap completes. */
  onBootstrapComplete(cb) {
    this._bootstrapCompleteCallbacks.push(cb)
  }

  start() {
    if (this._interval) return
    this._lastWall = Date.now()
    this._interval = setInterval(() => this._tick(), TICK_MS)
    console.log('[WorldClock] started')
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  setPaused(paused) {
    this.paused = paused
  }

  setTimeScale(ts) {
    // Don't override bootstrap timescale from outside during bootstrap
    if (!this.bootstrapPhase) this.timeScale = ts
  }

  setSimTime(secs) {
    this.simTimeSec = secs
    this.epoch = epochFromSeconds(secs)
  }

  onTick(cb) {
    this._tickCallbacks.push(cb)
  }

  _tick() {
    const now    = Date.now()
    const dtWall = (now - this._lastWall) / 1000 // real seconds
    this._lastWall = now

    if (!this.paused) {
      const dtSim = dtWall * this.timeScale
      this.simTimeSec += dtSim
      this.epoch = epochFromSeconds(this.simTimeSec)

      // Bootstrap completion check
      if (this.bootstrapPhase) {
        if (this.simTimeSec >= BOOTSTRAP_TARGET_SECS) {
          this.bootstrapPhase    = false
          this.bootstrapProgress = 1
          this.timeScale         = NORMAL_TIMESCALE
          console.log('[WorldClock] Bootstrap complete — world formed! Players can now join.')
          for (const cb of this._bootstrapCompleteCallbacks) cb()
        } else {
          this.bootstrapProgress = this.simTimeSec / BOOTSTRAP_TARGET_SECS
        }
      }
    }

    for (const cb of this._tickCallbacks) cb()
  }
}

export { BOOTSTRAP_TARGET_SECS, NORMAL_TIMESCALE }
