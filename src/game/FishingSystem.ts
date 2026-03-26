// ── FishingSystem ──────────────────────────────────────────────────────────────
// Full fishing state machine: idle → casting → waiting → biting → reeling → landed/escaped
// M25 Track C

export type FishingState =
  | 'idle'
  | 'casting'
  | 'waiting'
  | 'biting'
  | 'reeling'
  | 'landed'
  | 'escaped'

export interface FishResult {
  name: string
  rarity: 'Common' | 'Uncommon' | 'Rare'
  rarityColor: string
}

// ── Fish loot table ────────────────────────────────────────────────────────────
const FISH_NAMES  = ['Small Fish', 'Bass', 'Salmon', 'Golden Carp', 'Ancient Eel'] as const
const FISH_WEIGHTS = [40, 25, 20, 10, 5] // must sum to 100

function rollFish(): string {
  let r = Math.random() * 100
  for (let i = 0; i < FISH_WEIGHTS.length; i++) {
    r -= FISH_WEIGHTS[i]
    if (r <= 0) return FISH_NAMES[i]
  }
  return FISH_NAMES[0]
}

// Fish rarity weighted by time waited (longer = better)
function rollFishRarity(waitedSeconds: number): FishResult['rarity'] {
  const bonus = Math.min(waitedSeconds / 15, 1) // 0-1 based on wait (up to 15s)
  const r = Math.random() * 100
  if (r < 5 + bonus * 10) return 'Rare'
  if (r < 25 + bonus * 20) return 'Uncommon'
  return 'Common'
}

const RARITY_COLORS: Record<FishResult['rarity'], string> = {
  Common:   '#9d9d9d',
  Uncommon: '#1eff00',
  Rare:     '#0070dd',
}

// ── State machine ──────────────────────────────────────────────────────────────
export interface FishingSystemState {
  phase: FishingState
  /** 0-1 progress within the current phase */
  progress: number
  /** Duration of current wait before bite (seconds) */
  waitTarget: number
  /** Time waited so far in waiting phase */
  waitElapsed: number
  /** Time remaining in biting window */
  biteTimer: number
  /** Reeling progress 0-1 */
  reelProgress: number
  /** Current fish resistance (random 0-1, varies per tick) */
  resistance: number
  /** Latest landed fish result */
  lastCatch: FishResult | null
}

const CASTING_DURATION = 1.5   // seconds
const BITING_WINDOW    = 2.0   // seconds player has to press F
const REEL_DRAIN_RATE  = 0.18  // progress per second when holding F
const REEL_FIGHT_RATE  = 0.12  // resistance drain per second (fish fights back)

function freshState(): FishingSystemState {
  return {
    phase: 'idle',
    progress: 0,
    waitTarget: 3 + Math.random() * 12, // 3-15s
    waitElapsed: 0,
    biteTimer: BITING_WINDOW,
    reelProgress: 0,
    resistance: Math.random(),
    lastCatch: null,
  }
}

class FishingSystem {
  private _state: FishingSystemState = freshState()
  private _listeners: Array<(s: FishingSystemState) => void> = []

  get state(): Readonly<FishingSystemState> {
    return this._state
  }

  subscribe(fn: (s: FishingSystemState) => void): () => void {
    this._listeners.push(fn)
    return () => { this._listeners = this._listeners.filter(l => l !== fn) }
  }

  private _emit() {
    const snap = { ...this._state }
    for (const l of this._listeners) l(snap)
  }

  /** Call when player presses F near water (idle phase). */
  cast(): boolean {
    if (this._state.phase !== 'idle') return false
    this._state = { ...freshState(), phase: 'casting', progress: 0 }
    this._emit()
    return true
  }

  /** Call when player presses F during biting phase. */
  startReel(): boolean {
    if (this._state.phase !== 'biting') return false
    this._state = { ...this._state, phase: 'reeling', reelProgress: 0, resistance: Math.random() }
    this._emit()
    return true
  }

  /** Cancel/reset to idle (Escape). */
  cancel(): void {
    this._state = freshState()
    this._emit()
  }

  /**
   * Called every game frame.
   * @param dt          Delta time in seconds
   * @param reelHeld    Whether player is holding F (reeling phase only)
   * @returns 'landed' or 'escaped' when a terminal state is reached; otherwise undefined
   */
  tick(dt: number, reelHeld: boolean): 'landed' | 'escaped' | undefined {
    const s = this._state

    switch (s.phase) {
      case 'idle':
      case 'landed':
      case 'escaped':
        return undefined

      case 'casting': {
        const newProgress = s.progress + dt / CASTING_DURATION
        if (newProgress >= 1) {
          this._state = {
            ...s,
            phase: 'waiting',
            progress: 0,
            waitTarget: 3 + Math.random() * 12,
            waitElapsed: 0,
          }
        } else {
          this._state = { ...s, progress: newProgress }
        }
        this._emit()
        return undefined
      }

      case 'waiting': {
        const elapsed = s.waitElapsed + dt
        const progress = Math.min(elapsed / s.waitTarget, 1)
        if (elapsed >= s.waitTarget) {
          this._state = {
            ...s,
            phase: 'biting',
            waitElapsed: elapsed,
            progress: 1,
            biteTimer: BITING_WINDOW,
          }
        } else {
          this._state = { ...s, waitElapsed: elapsed, progress }
        }
        this._emit()
        return undefined
      }

      case 'biting': {
        const biteTimer = s.biteTimer - dt
        if (biteTimer <= 0) {
          this._state = { ...freshState(), phase: 'escaped' }
          this._emit()
          return 'escaped'
        }
        this._state = { ...s, biteTimer }
        this._emit()
        return undefined
      }

      case 'reeling': {
        // Vary resistance over time
        const newResistance = Math.max(0, Math.min(1,
          s.resistance + (Math.random() - 0.5) * 0.4 * dt
        ))

        let reel = s.reelProgress
        if (reelHeld) {
          reel += REEL_DRAIN_RATE * dt
        }
        // Fish fights back proportionally to resistance
        reel -= REEL_FIGHT_RATE * newResistance * dt
        reel = Math.max(0, Math.min(1, reel))

        if (reel >= 1) {
          const waitedSeconds = s.waitElapsed
          const rarity = rollFishRarity(waitedSeconds)
          const result: FishResult = {
            name: rollFish(),
            rarity,
            rarityColor: RARITY_COLORS[rarity],
          }
          this._state = { ...freshState(), phase: 'landed', lastCatch: result }
          this._emit()
          return 'landed'
        }

        this._state = { ...s, reelProgress: reel, resistance: newResistance }
        this._emit()
        return undefined
      }

      default:
        return undefined
    }
  }

  /** Reset to idle after showing landed/escaped result. */
  reset(): void {
    this._state = freshState()
    this._emit()
  }
}

export const fishingSystem = new FishingSystem()
