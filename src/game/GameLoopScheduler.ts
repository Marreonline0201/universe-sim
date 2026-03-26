/**
 * GameLoopScheduler — declarative periodic-tick system extracted from GameLoop.
 *
 * Instead of 30+ useRef timers all following the same pattern:
 *   timerRef.current += dt; if (timerRef >= interval) { timerRef = 0; tick() }
 *
 * We register named tasks with intervals and tick functions, then call
 * scheduler.update(dt) once per frame.
 *
 * This reduces GameLoop by ~200 lines and makes periodic systems
 * independently testable and easy to add/remove.
 */

export interface ScheduledTask {
  /** Unique identifier for debugging and removal */
  id: string
  /** Interval in seconds between ticks */
  intervalSec: number
  /** The function to call each tick. Receives cumulative sim-seconds if available. */
  tick: (simSeconds: number) => void
  /** Accumulated time since last tick (internal) */
  _elapsed: number
  /** M70: Consecutive error count for this task */
  _errorCount: number
  /** M70: Whether this task is enabled (auto-disabled after too many errors) */
  _enabled: boolean
  /** M70: Last error message for diagnostics */
  _lastError: string | null
}

export class GameLoopScheduler {
  private tasks: ScheduledTask[] = []

  /** Register a periodic task. Replaces any existing task with the same id. */
  register(id: string, intervalSec: number, tick: (simSeconds: number) => void): void {
    // Remove existing task with same id to allow re-registration
    this.tasks = this.tasks.filter(t => t.id !== id)
    this.tasks.push({ id, intervalSec, tick, _elapsed: 0, _errorCount: 0, _enabled: true, _lastError: null })
  }

  /** Remove a task by id. */
  remove(id: string): void {
    this.tasks = this.tasks.filter(t => t.id !== id)
  }

  /** Called every frame with delta time (seconds) and current simSeconds. */
  update(dt: number, simSeconds: number): void {
    const MAX_ERRORS = 5
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i]
      if (!task._enabled) continue
      task._elapsed += dt
      if (task._elapsed >= task.intervalSec) {
        task._elapsed = 0
        try {
          task.tick(simSeconds)
          // Reset error count on success
          if (task._errorCount > 0) task._errorCount = 0
        } catch (err: any) {
          task._errorCount++
          task._lastError = err?.message?.slice(0, 120) || 'unknown'
          if (task._errorCount <= MAX_ERRORS) {
            console.error(`[Scheduler] Task "${task.id}" error (${task._errorCount}/${MAX_ERRORS}):`, err)
          }
          if (task._errorCount >= MAX_ERRORS) {
            task._enabled = false
            console.warn(`[Scheduler] Disabling task "${task.id}" after ${MAX_ERRORS} consecutive errors.`)
          }
        }
      }
    }
  }

  /** M70: Re-enable a task that was auto-disabled due to errors. */
  reenable(id: string): void {
    const task = this.tasks.find(t => t.id === id)
    if (task) {
      task._enabled = true
      task._errorCount = 0
      task._lastError = null
      task._elapsed = 0
    }
  }

  /** Reset all timers (useful on game restart). */
  resetAll(): void {
    for (const task of this.tasks) {
      task._elapsed = 0
      task._errorCount = 0
      task._enabled = true
      task._lastError = null
    }
  }

  /** Get all registered task ids (for debugging). */
  getTaskIds(): string[] {
    return this.tasks.map(t => t.id)
  }

  /** M70: Diagnostic — return status of all tasks including error state. */
  getStatus(): Array<{ id: string; interval: number; enabled: boolean; errorCount: number; lastError: string | null }> {
    return this.tasks.map(t => ({
      id: t.id,
      interval: t.intervalSec,
      enabled: t._enabled,
      errorCount: t._errorCount,
      lastError: t._lastError,
    }))
  }
}

/** Singleton scheduler instance used by GameLoop. */
export const gameLoopScheduler = new GameLoopScheduler()
