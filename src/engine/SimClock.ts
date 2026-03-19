/**
 * SimClock — manages the simulation's sense of time.
 *
 * Time scale can range from 0.01× (slow-mo) to 1,000,000× (geological epoch).
 * Tracks absolute simulation time in seconds, which can represent billions of years.
 */

export type Epoch =
  | 'planck'        // t < 10^-43 s — Planck era (quantum gravity)
  | 'inflation'     // t < 10^-32 s — cosmic inflation
  | 'quark'         // t < 10^-6 s  — quark-gluon plasma
  | 'hadron'        // t < 1 s      — hadron formation
  | 'nucleosynthesis' // t < 200s   — H/He formed
  | 'recombination' // t < 380,000 yr — atoms form
  | 'dark_ages'     // t < 200 Myr  — before first stars
  | 'stellar'       // t < current  — stars and galaxies
  | 'planetary'     // planet has formed
  | 'prebiotic'     // chemistry, no life yet
  | 'microbial'     // single-celled life
  | 'multicellular' // complex life
  | 'cambrian'      // explosion of forms
  | 'terrestrial'   // land creatures
  | 'sapient'       // intelligent beings
  | 'civilization'  // tech-using species
  | 'space'         // interplanetary
  | 'simulation'    // tier 10 — can create sub-universes

export class SimClock {
  /** Wall-clock time of last tick (ms) */
  private lastWallMs = 0
  /** Total simulated time (seconds) */
  simTimeSec = 0
  /** Current time scale multiplier */
  timeScale = 1.0
  /** Whether simulation is running */
  running = false
  /** Current epoch */
  epoch: Epoch = 'stellar'
  /** Callbacks registered for tick */
  private tickCallbacks: Array<(dtSim: number, dtWall: number) => void> = []

  private static readonly EPOCH_THRESHOLDS: Array<[number, Epoch]> = [
    [1e-43, 'planck'],
    [1e-32, 'inflation'],
    [1e-6,  'quark'],
    [1,     'hadron'],
    [200,   'nucleosynthesis'],
    [380_000 * 365.25 * 86400, 'recombination'],
    [200e6  * 365.25 * 86400, 'dark_ages'],
    [13.8e9 * 365.25 * 86400, 'stellar'],
  ]

  start(): void {
    this.running = true
    this.lastWallMs = performance.now()
    this._loop()
  }

  stop(): void { this.running = false }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.01, Math.min(1e6, scale))
  }

  onTick(cb: (dtSim: number, dtWall: number) => void): void {
    this.tickCallbacks.push(cb)
  }

  private _loop = (): void => {
    if (!this.running) return
    const now = performance.now()
    const dtWall = (now - this.lastWallMs) / 1000 // wall-clock seconds
    this.lastWallMs = now
    const dtSim = Math.min(dtWall * this.timeScale, 10) // cap at 10 simulated seconds/tick
    this.simTimeSec += dtSim
    this._updateEpoch()
    for (const cb of this.tickCallbacks) cb(dtSim, dtWall)
    requestAnimationFrame(this._loop)
  }

  private _updateEpoch(): void {
    // Planetary/biotic epochs are set externally by the simulation when conditions are met
  }

  /** Format simulation time as human-readable string */
  formatTime(): string {
    const s = this.simTimeSec
    if (s < 1e-6)  return `${(s * 1e9).toFixed(2)} ns`
    if (s < 1e-3)  return `${(s * 1e6).toFixed(2)} µs`
    if (s < 1)     return `${(s * 1e3).toFixed(2)} ms`
    if (s < 60)    return `${s.toFixed(2)} s`
    if (s < 3600)  return `${(s/60).toFixed(1)} min`
    if (s < 86400) return `${(s/3600).toFixed(1)} h`
    const days = s / 86400
    if (days < 365.25) return `${days.toFixed(1)} days`
    const years = days / 365.25
    if (years < 1e3)   return `${years.toFixed(0)} yr`
    if (years < 1e6)   return `${(years/1e3).toFixed(1)} kyr`
    if (years < 1e9)   return `${(years/1e6).toFixed(1)} Myr`
    return `${(years/1e9).toFixed(2)} Gyr`
  }
}
