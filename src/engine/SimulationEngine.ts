import { Grid3D } from './Grid'
import { SimClock } from './SimClock'
import { SIMULATION } from './constants'
import { useGameStore } from '../store/gameStore'

export interface SimulationConfig {
  gridX: number
  gridY: number
  gridZ: number
  seed: number
}

export class SimulationEngine {
  readonly grid: Grid3D
  readonly clock: SimClock
  private workers: Map<string, Worker> = new Map()
  private initialized = false

  constructor(config: SimulationConfig) {
    this.grid = new Grid3D(config.gridX, config.gridY, config.gridZ)
    this.clock = new SimClock()
  }

  async init(): Promise<void> {
    if (this.initialized) return

    // Step 1: spawn all workers (don't wait for 'ready' yet)
    const entries: Array<{ name: string; worker: Worker; ready: Promise<void> }> = []
    const workerDefs: Array<[string, URL]> = [
      ['physics', new URL('./workers/physics.worker.ts', import.meta.url)],
      ['fluid',   new URL('./workers/fluid.worker.ts',   import.meta.url)],
      ['thermal', new URL('./workers/thermal.worker.ts', import.meta.url)],
      ['chem',    new URL('./workers/chem.worker.ts',    import.meta.url)],
    ]
    for (const [name, url] of workerDefs) {
      const w = new Worker(url, { type: 'module' })
      const ready = new Promise<void>((resolve, reject) => {
        w.onmessage = (e) => { if (e.data?.type === 'ready') resolve() }
        w.onerror   = reject
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
    await Promise.all(entries.map(e => e.ready))

    this.clock.onTick((dtSim, dtPhysics, dtWall) => this._tick(dtSim, dtPhysics, dtWall))
    this.initialized = true
  }

  start(): void {
    if (!this.initialized) throw new Error('Call init() first')
    this.clock.start()
  }

  stop(): void { this.clock.stop() }

  private _tick(dtSim: number, dtPhysics: number, dtWall: number): void {
    // Advance HUD clock with full uncapped sim time
    useGameStore.getState().addSimSeconds(dtSim)
    // Workers get the physics-safe capped dt (prevents instability at high time scales)
    for (const [, w] of this.workers) {
      w.postMessage({ type: 'tick', dtSim: dtPhysics, dtWall })
    }
  }

  dispose(): void {
    this.clock.stop()
    for (const [, w] of this.workers) w.terminate()
    this.workers.clear()
  }
}
