// ── FishingSystem ──────────────────────────────────────────────────────────────
// Full fishing state machine: idle → casting → waiting → biting → reeling → landed/escaped
// M25 Track C — base fishing state machine
// M34 Track C — fish species, tension minigame, rod durability, catch history, golden fish event

import { MAT } from '../player/Inventory'

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
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Legendary'
  rarityColor: string
  materialId: number  // M34: actual MAT id for inventory add
  isGolden?: boolean  // M34: triggers legendary notification
}

// ── Fish species table ─────────────────────────────────────────────────────────
export interface FishSpecies {
  name: string
  materialId: number
  rarity: FishResult['rarity']
  rarityColor: string
  weight: number          // out of 100 for normal water (Cave Fish only appears underground)
  caveOnly?: boolean
}

export const FISH_SPECIES: FishSpecies[] = [
  { name: 'Sardine',     materialId: MAT.SARDINE,      rarity: 'Common',    rarityColor: '#9d9d9d', weight: 40 },
  { name: 'Bass',        materialId: MAT.BASS,         rarity: 'Common',    rarityColor: '#9d9d9d', weight: 30 },
  { name: 'Salmon',      materialId: MAT.SALMON,       rarity: 'Uncommon',  rarityColor: '#1eff00', weight: 15 },
  { name: 'Tuna',        materialId: MAT.TUNA,         rarity: 'Rare',      rarityColor: '#0070dd', weight: 10 },
  { name: 'Golden Fish', materialId: MAT.GOLDEN_FISH,  rarity: 'Legendary', rarityColor: '#ff8000', weight: 0.5 },
  { name: 'Cave Fish',   materialId: MAT.CAVE_FISH,    rarity: 'Uncommon',  rarityColor: '#1eff00', weight: 4.5, caveOnly: true },
]

/** Roll a fish species based on location. */
function rollSpecies(isUnderground: boolean): FishSpecies {
  // Build pool: surface water excludes cave fish; underground water includes only cave fish + common
  const pool = isUnderground
    ? FISH_SPECIES   // all species available underground
    : FISH_SPECIES.filter(f => !f.caveOnly)

  const total = pool.reduce((s, f) => s + f.weight, 0)
  let r = Math.random() * total
  for (const f of pool) {
    r -= f.weight
    if (r <= 0) return f
  }
  return pool[0]
}

const RARITY_COLORS = {
  Common:    '#9d9d9d',
  Uncommon:  '#1eff00',
  Rare:      '#0070dd',
  Legendary: '#ff8000',
} as const

// ── Rod durability ─────────────────────────────────────────────────────────────
const ROD_MAX_DURABILITY = 50

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
  // ── M34 additions ────────────────────────────────────────────────────────
  /** Tension meter 0-100 — increases while waiting, player should press F in sweet spot */
  tension: number
  /** Sweet spot lower bound (60-70%) */
  sweetSpotMin: number
  /** Sweet spot upper bound (75-85%) */
  sweetSpotMax: number
  /** Whether last cast was a critical success (tension > 90%) */
  criticalSuccess: boolean
  /** Rod durability (0-50). 0 = rod broken */
  rodDurability: number
  /** Catch history — last 5 catches */
  catchHistory: FishResult[]
  /** Best catch ever (highest rarity) */
  bestCatch: FishResult | null
  /** Whether fishing near good spot (ripple) */
  nearGoodSpot: boolean
  /** Whether player is underground (affects fish species) */
  isUnderground: boolean
}

const CASTING_DURATION = 1.5   // seconds
const BITING_WINDOW    = 2.0   // seconds player has to press F
const REEL_DRAIN_RATE  = 0.18  // progress per second when holding F
const REEL_FIGHT_RATE  = 0.12  // resistance drain per second (fish fights back)
const TENSION_RISE_RATE = 12   // tension % per second increase (random)

function freshState(existing?: Partial<FishingSystemState>): FishingSystemState {
  return {
    phase: 'idle',
    progress: 0,
    waitTarget: 3 + Math.random() * 12, // 3-15s
    waitElapsed: 0,
    biteTimer: BITING_WINDOW,
    reelProgress: 0,
    resistance: Math.random(),
    lastCatch: null,
    // M34 fields
    tension: 0,
    sweetSpotMin: 60 + Math.random() * 10,   // 60-70
    sweetSpotMax: 75 + Math.random() * 10,   // 75-85
    criticalSuccess: false,
    rodDurability: existing?.rodDurability ?? ROD_MAX_DURABILITY,
    catchHistory: existing?.catchHistory ?? [],
    bestCatch: existing?.bestCatch ?? null,
    nearGoodSpot: existing?.nearGoodSpot ?? false,
    isUnderground: existing?.isUnderground ?? false,
  }
}

const RARITY_RANK: Record<FishResult['rarity'], number> = {
  Common: 0, Uncommon: 1, Rare: 2, Legendary: 3,
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

  /** Update environmental context each frame before fishing logic. */
  setContext(nearGoodSpot: boolean, isUnderground: boolean): void {
    if (this._state.nearGoodSpot !== nearGoodSpot || this._state.isUnderground !== isUnderground) {
      this._state = { ...this._state, nearGoodSpot, isUnderground }
    }
  }

  /** Call when player presses F near water (idle phase). */
  cast(): boolean {
    if (this._state.phase !== 'idle') return false
    if (this._state.rodDurability <= 0) return false  // rod broken
    const newDurability = Math.max(0, this._state.rodDurability - 1)
    const sweetMin = 60 + Math.random() * 10
    const sweetMax = 75 + Math.random() * 10
    this._state = {
      ...freshState(this._state),
      phase: 'casting',
      progress: 0,
      rodDurability: newDurability,
      sweetSpotMin: sweetMin,
      sweetSpotMax: sweetMax,
      tension: 0,
      catchHistory: this._state.catchHistory,
      bestCatch: this._state.bestCatch,
    }
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
    this._state = freshState(this._state)
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
            tension: 0,
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

        // Tension rises randomly while waiting — player should press F in sweet spot
        const tensionDelta = (Math.random() * TENSION_RISE_RATE * dt) + (TENSION_RISE_RATE * 0.3 * dt)
        const newTension = Math.min(100, s.tension + tensionDelta)

        if (elapsed >= s.waitTarget) {
          this._state = {
            ...s,
            phase: 'biting',
            waitElapsed: elapsed,
            progress: 1,
            biteTimer: BITING_WINDOW,
            tension: newTension,
          }
        } else {
          this._state = { ...s, waitElapsed: elapsed, progress, tension: newTension }
        }
        this._emit()
        return undefined
      }

      case 'biting': {
        const biteTimer = s.biteTimer - dt
        // Tension continues rising during bite window too
        const tensionDelta = TENSION_RISE_RATE * 0.5 * dt
        const newTension = Math.min(100, s.tension + tensionDelta)

        if (biteTimer <= 0) {
          // Fish escaped — 5s cooldown handled by GameLoop
          this._state = {
            ...freshState(this._state),
            phase: 'escaped',
            catchHistory: s.catchHistory,
            bestCatch: s.bestCatch,
          }
          this._emit()
          return 'escaped'
        }
        this._state = { ...s, biteTimer, tension: newTension }
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
          const species = rollSpecies(s.isUnderground)
          // Critical success doubles rare fish chance: if not rare/legendary, re-roll once
          let finalSpecies = species
          if (s.criticalSuccess && species.rarity === 'Common') {
            const reroll = rollSpecies(s.isUnderground)
            if (RARITY_RANK[reroll.rarity] > RARITY_RANK[species.rarity]) {
              finalSpecies = reroll
            }
          }
          // Good spot bonus: +20% catch rate (already baked as slightly better tension window)
          // Additional: re-roll sardine → bass if near good spot
          if (s.nearGoodSpot && finalSpecies.name === 'Sardine') {
            const sr = rollSpecies(s.isUnderground)
            if (sr.name !== 'Sardine') finalSpecies = sr
          }

          const result: FishResult = {
            name: finalSpecies.name,
            rarity: finalSpecies.rarity,
            rarityColor: RARITY_COLORS[finalSpecies.rarity],
            materialId: finalSpecies.materialId,
            isGolden: finalSpecies.name === 'Golden Fish',
          }

          const newHistory = [result, ...s.catchHistory].slice(0, 5)
          const newBest = !s.bestCatch || RARITY_RANK[result.rarity] > RARITY_RANK[s.bestCatch.rarity]
            ? result
            : s.bestCatch

          this._state = {
            ...freshState(this._state),
            phase: 'landed',
            lastCatch: result,
            catchHistory: newHistory,
            bestCatch: newBest,
          }
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

  /**
   * Called when player presses F during the WAITING phase (tension minigame).
   * If tension is in sweet spot → enter biting. Too low/high → miss.
   * Returns 'sweet' | 'miss' | 'critical'
   */
  tensionPress(): 'sweet' | 'miss' | 'critical' | 'not_waiting' {
    const s = this._state
    if (s.phase !== 'waiting') return 'not_waiting'

    const t = s.tension
    if (t >= 90) {
      // Critical success — rare fish chance doubled
      this._state = { ...s, phase: 'biting', biteTimer: BITING_WINDOW, criticalSuccess: true }
      this._emit()
      return 'critical'
    } else if (t >= s.sweetSpotMin && t <= s.sweetSpotMax) {
      this._state = { ...s, phase: 'biting', biteTimer: BITING_WINDOW, criticalSuccess: false }
      this._emit()
      return 'sweet'
    } else {
      // Miss: fish escapes immediately
      this._state = {
        ...freshState(this._state),
        phase: 'escaped',
        catchHistory: s.catchHistory,
        bestCatch: s.bestCatch,
      }
      this._emit()
      return 'miss'
    }
  }

  /** Repair the fishing rod (called by a workbench recipe or item). */
  repairRod(): void {
    this._state = { ...this._state, rodDurability: ROD_MAX_DURABILITY }
    this._emit()
  }

  /** Reset to idle after showing landed/escaped result. */
  reset(): void {
    this._state = {
      ...freshState(this._state),
      catchHistory: this._state.catchHistory,
      bestCatch: this._state.bestCatch,
    }
    this._emit()
  }
}

export const fishingSystem = new FishingSystem()
export { ROD_MAX_DURABILITY }
