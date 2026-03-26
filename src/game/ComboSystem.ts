// ── ComboSystem.ts ────────────────────────────────────────────────────────────
// M53 Track C: Combat Combo System
//
// Tracks consecutive hits within a time window, builds up a damage multiplier,
// dispatches milestone events, and provides a tick function for the game loop.

export interface ComboState {
  count: number         // current hit streak
  multiplier: number    // damage multiplier: 1.0 at 0, up to 2.5 at 20+
  timeRemaining: number // ms until combo resets (window = 3000ms per hit)
  lastHitAt: number     // Date.now()
  maxCombo: number      // session record
  active: boolean       // true when count >= 2
}

const COMBO_WINDOW_MS = 3000  // reset if no hit within 3 seconds

const MULTIPLIER_TABLE: Record<number, number> = {
  0: 1.0,
  2: 1.1,
  4: 1.2,
  6: 1.35,
  8: 1.5,
  10: 1.7,
  14: 2.0,
  20: 2.5,
}

function getMultiplier(count: number): number {
  const thresholds = Object.keys(MULTIPLIER_TABLE)
    .map(Number)
    .sort((a, b) => a - b)

  let best = 1.0
  for (const threshold of thresholds) {
    if (count >= threshold) {
      best = MULTIPLIER_TABLE[threshold]
    } else {
      break
    }
  }
  return best
}

let comboState: ComboState = {
  count: 0,
  multiplier: 1.0,
  timeRemaining: 0,
  lastHitAt: 0,
  maxCombo: 0,
  active: false,
}

export function getComboState(): ComboState {
  return comboState
}

// Call on every successful hit
export function onHit(): void {
  const now = Date.now()

  // Reset if outside the combo window
  if (comboState.count > 0 && now - comboState.lastHitAt > COMBO_WINDOW_MS) {
    comboState.count = 0
    comboState.active = false
  }

  comboState.count++
  comboState.multiplier = getMultiplier(comboState.count)
  comboState.lastHitAt = now
  comboState.timeRemaining = COMBO_WINDOW_MS
  comboState.active = comboState.count >= 2

  if (comboState.count > comboState.maxCombo) {
    comboState.maxCombo = comboState.count
  }

  // Dispatch milestone events at 5, 10, 20 hits
  if (comboState.count === 5 || comboState.count === 10 || comboState.count === 20) {
    window.dispatchEvent(new CustomEvent('combo-milestone', { detail: { count: comboState.count } }))
  }
}

// Call from GameLoop each frame with dt in ms
export function tickCombo(dtMs: number): void {
  if (!comboState.active) return

  comboState.timeRemaining -= dtMs
  if (comboState.timeRemaining <= 0) {
    comboState.count = 0
    comboState.multiplier = 1.0
    comboState.timeRemaining = 0
    comboState.active = false
  }
}

// Returns current damage multiplier (for GameLoop to apply)
export function getDamageMultiplier(): number {
  return comboState.multiplier
}
