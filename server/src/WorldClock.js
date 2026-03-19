// ── WorldClock ─────────────────────────────────────────────────────────────────
// setInterval-based simulation clock. Owns authoritative simTime.
// Runs 24/7 on Railway regardless of connected clients.

const TICK_MS = 100 // 10 Hz

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
    this.simTimeSec = 0
    this.timeScale = 1_000_000  // 1 real second = 1M sim-seconds by default
    this.paused = false
    this.epoch = 'stellar'
    this._lastWall = Date.now()
    this._interval = null
    this._tickCallbacks = []
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
    this.timeScale = ts
  }

  setSimTime(secs) {
    this.simTimeSec = secs
    this.epoch = epochFromSeconds(secs)
  }

  onTick(cb) {
    this._tickCallbacks.push(cb)
  }

  _tick() {
    const now = Date.now()
    const dtWall = (now - this._lastWall) / 1000 // seconds
    this._lastWall = now

    if (!this.paused) {
      const dtSim = dtWall * this.timeScale
      this.simTimeSec += dtSim
      this.epoch = epochFromSeconds(this.simTimeSec)
    }

    for (const cb of this._tickCallbacks) cb()
  }
}
