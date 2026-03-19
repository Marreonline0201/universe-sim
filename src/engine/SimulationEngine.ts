import { Grid3D } from './Grid'
import { SimClock } from './SimClock'
import { SIMULATION } from './constants'

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
    // Spawn workers and send them the SharedArrayBuffer
    await this._spawnWorker('physics', new URL('./workers/physics.worker.ts', import.meta.url))
    await this._spawnWorker('fluid',   new URL('./workers/fluid.worker.ts',   import.meta.url))
    await this._spawnWorker('thermal', new URL('./workers/thermal.worker.ts', import.meta.url))
    await this._spawnWorker('chem',    new URL('./workers/chem.worker.ts',    import.meta.url))

    const descriptor = this.grid.toTransferDescriptor()
    for (const [, w] of this.workers) {
      w.postMessage({ type: 'init', descriptor })
    }

    this.clock.onTick((dtSim, dtWall) => this._tick(dtSim, dtWall))
    this.initialized = true
  }

  start(): void {
    if (!this.initialized) throw new Error('Call init() first')
    this.clock.start()
  }

  stop(): void { this.clock.stop() }

  private async _spawnWorker(name: string, url: URL): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = new Worker(url, { type: 'module' })
      w.onmessage = (e) => {
        if (e.data?.type === 'ready') {
          this.workers.set(name, w)
          resolve()
        }
      }
      w.onerror = reject
    })
  }

  private _tick(dtSim: number, dtWall: number): void {
    // Send tick to each worker in order (physics → fluid → thermal → chem)
    // Workers process their slice of the grid and write results back to SharedArrayBuffer
    for (const [name, w] of this.workers) {
      w.postMessage({ type: 'tick', dtSim, dtWall })
    }
  }

  dispose(): void {
    this.clock.stop()
    for (const [, w] of this.workers) w.terminate()
    this.workers.clear()
  }
}
