import { Grid3D } from './Grid'
import { SimClock } from './SimClock'
import { SIMULATION } from './constants'
import { useGameStore } from '../store/gameStore'

// Vite ?worker imports → emitted as real files served from same origin
// (avoids data: URI workers being blocked by Cross-Origin-Embedder-Policy)
import PhysicsWorker from './workers/physics.worker.ts?worker'
import FluidWorker from './workers/fluid.worker.ts?worker'
import ThermalWorker from './workers/thermal.worker.ts?worker'
import ChemWorker from './workers/chem.worker.ts?worker'

export interface SimulationConfig {
  gridX: number
  gridY: number
  gridZ: number
  seed: number
}

// ── M9 T3: Worker tick-rate throttling ───────────────────────────────────────
// Physics: 60 Hz — collision-critical, must stay frame-rate.
// Fluid:   20 Hz — water flow is observable but not frame-critical.
// Chem:    20 Hz — reaction precision doesn't need per-frame updates.
// Thermal: 10 Hz — heat diffusion is slow; imperceptible above 10 Hz.
//
// Each throttled worker accumulates wall-clock time and only fires when its
// interval budget is exceeded. The dt passed carries the accumulated time so
// energy is conserved across skipped frames.
const WORKER_INTERVAL_MS: Record<string, number> = {
  physics: 0, // every frame (no throttle)
  fluid: 50, // 20 Hz
  chem: 50, // 20 Hz
  thermal: 100, // 10 Hz
}

export class SimulationEngine {
  readonly grid: Grid3D
  readonly clock: SimClock
  gridOrigin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
  private workers: Map<string, Worker> = new Map()
  private initialized = false
  // Accumulated wall-time (ms) per throttled worker
  private workerAccumMs: Map<string, number> = new Map()

  constructor(config: SimulationConfig) {
    this.grid = new Grid3D(config.gridX, config.gridY, config.gridZ)
    this.clock = new SimClock()
  }

  async init(): Promise<void> {
    if (this.initialized) return

    // Step 1: spawn all workers (don't wait for 'ready' yet)
    const workerDefs: Array<[string, Worker]> = [
      ['physics', new PhysicsWorker()],
      ['fluid', new FluidWorker()],
      ['thermal', new ThermalWorker()],
      ['chem', new ChemWorker()],
    ]

    const entries: Array<{ name: string; worker: Worker; ready: Promise<void> }> = []
    for (const [name, w] of workerDefs) {
      const ready = new Promise<void>((resolve, reject) => {
        w.onmessage = (e) => {
          if (e.data?.type === 'ready') resolve()
        }
        w.onerror = reject
      })
      this.workers.set(name, w)
      entries.push({ name, worker: w, ready })
    }

    // Step 2: send 'init' (with SharedArrayBuffer) to all workers
    const descriptor = this.grid.toTransferDescriptor()
    for (const { worker } of entries) {
      worker.postMessage({ type: 'init', descriptor })
    }

    // Step 3: wait for all workers to confirm 'ready'
    await Promise.all(entries.map((e) => e.ready))

    this.clock.onTick((dtSim, dtPhysics, dtWall) => this._tick(dtSim, dtPhysics, dtWall))
    this.initialized = true
  }

  start(): void {
    if (!this.initialized) throw new Error('Call init() first')
    this.clock.start()
  }

  stop(): void {
    this.clock.stop()
  }

  private _tick(dtSim: number, dtPhysics: number, dtWall: number): void {
    // Advance HUD clock with full uncapped sim time
    useGameStore.getState().addSimSeconds(dtSim)

    const dtWallMs = dtWall * 1000

    // M9 T3: Throttled worker dispatch.
    // Physics fires every frame. Fluid/Chem at 20 Hz. Thermal at 10 Hz.
    // Throttled workers accumulate wall time and fire when interval elapses,
    // passing the accumulated dt so the simulation remains energy-conserving.
    for (const [name, w] of this.workers) {
      const intervalMs = WORKER_INTERVAL_MS[name] ?? 0

      if (intervalMs === 0) {
        // Physics — unthrottled, every frame
        w.postMessage({ type: 'tick', dtSim: dtPhysics, dtWall })
      } else {
        const prev = this.workerAccumMs.get(name) ?? 0
        const next = prev + dtWallMs
        if (next >= intervalMs) {
          // Fire with accumulated dt so energy is conserved over skipped frames
          const accDtSim = dtWall > 0 ? (next / 1000) * (dtPhysics / dtWall) : 0
          w.postMessage({ type: 'tick', dtSim: accDtSim, dtWall: next / 1000 })
          this.workerAccumMs.set(name, next - intervalMs)
        } else {
          this.workerAccumMs.set(name, next)
        }
      }
    }
  }

  /** Send a message directly to the chemistry worker. */
  sendToChem(msg: Record<string, unknown>): void {
    this.workers.get('chem')?.postMessage(msg)
  }

  dispose(): void {
    this.clock.stop()
    for (const [, w] of this.workers) w.terminate()
    this.workers.clear()
  }
}
