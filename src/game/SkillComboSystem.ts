// ── SkillComboSystem.ts ────────────────────────────────────────────────────────
// M61 Track A: Skill Combo System
//
// Players chain spells/actions in specific sequences within a time window
// to trigger powerful combo effects. Listens for game events to populate
// an action buffer, then checks all combo definitions on each new action.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComboDefinition {
  id: string
  name: string
  icon: string
  description: string
  sequence: string[]      // e.g. ['fire', 'ice', 'fire'] — action IDs
  windowSeconds: number   // time window to complete combo
  effect: { type: string; value: number }
  cooldownSeconds: number
  unlocked: boolean
}

export interface BufferEntry {
  action: string
  ts: number
}

// ── Combo Definitions ─────────────────────────────────────────────────────────

const COMBO_DEFINITIONS: ComboDefinition[] = [
  {
    id: 'fire_ice_blast',
    name: 'Thermal Shock',
    icon: '🌡',
    description: 'Stun target and deal 3x damage',
    sequence: ['fire', 'ice'],
    windowSeconds: 4,
    effect: { type: 'stun_damage_3x', value: 3 },
    cooldownSeconds: 12,
    unlocked: true,
  },
  {
    id: 'triple_strike',
    name: 'Triple Strike',
    icon: '⚡',
    description: '+300% damage on next hit',
    sequence: ['combat', 'combat', 'combat'],
    windowSeconds: 3,
    effect: { type: 'damage_bonus', value: 3.0 },
    cooldownSeconds: 10,
    unlocked: true,
  },
  {
    id: 'elemental_storm',
    name: 'Elemental Storm',
    icon: '🌪',
    description: 'AoE burst dealing 50 damage to all nearby enemies',
    sequence: ['fire', 'lightning', 'ice'],
    windowSeconds: 6,
    effect: { type: 'aoe_damage', value: 50 },
    cooldownSeconds: 20,
    unlocked: true,
  },
  {
    id: 'shadow_blink',
    name: 'Shadow Blink',
    icon: '👤',
    description: 'Teleport behind target and strike',
    sequence: ['dodge', 'sprint', 'attack'],
    windowSeconds: 4,
    effect: { type: 'teleport_strike', value: 1 },
    cooldownSeconds: 15,
    unlocked: true,
  },
  {
    id: 'mana_surge',
    name: 'Mana Surge',
    icon: '✨',
    description: 'All spells are free to cast for 10 seconds',
    sequence: ['spell', 'spell', 'spell'],
    windowSeconds: 5,
    effect: { type: 'free_spells', value: 10 },
    cooldownSeconds: 30,
    unlocked: true,
  },
  {
    id: 'life_steal',
    name: 'Life Steal',
    icon: '💉',
    description: 'Convert all damage dealt into health for next attack',
    sequence: ['attack', 'heal'],
    windowSeconds: 3,
    effect: { type: 'lifesteal', value: 1 },
    cooldownSeconds: 8,
    unlocked: true,
  },
  {
    id: 'berserker_rage',
    name: 'Berserker Rage',
    icon: '🔥',
    description: '+200% speed and damage for 8 seconds',
    sequence: ['attack', 'attack', 'dodge'],
    windowSeconds: 4,
    effect: { type: 'berserk', value: 8 },
    cooldownSeconds: 25,
    unlocked: true,
  },
  {
    id: 'nature_bond',
    name: 'Nature Bond',
    icon: '🌿',
    description: 'Double the yield of your next gather action',
    sequence: ['gather', 'gather'],
    windowSeconds: 3,
    effect: { type: 'double_gather', value: 2 },
    cooldownSeconds: 15,
    unlocked: true,
  },
]

// ── Module State ───────────────────────────────────────────────────────────────

let _initialized = false
let _inputBuffer: BufferEntry[] = []           // last 10 actions
const _cooldowns: Map<string, number> = new Map() // comboId -> expiry timestamp ms

// Max buffer size
const MAX_BUFFER = 10

// ── Internal Helpers ──────────────────────────────────────────────────────────

/** Trim buffer entries older than the largest window across all combos. */
function _trimBuffer(): void {
  const maxWindow = Math.max(...COMBO_DEFINITIONS.map(c => c.windowSeconds)) * 1000
  const cutoff = Date.now() - maxWindow
  _inputBuffer = _inputBuffer.filter(e => e.ts >= cutoff)
  if (_inputBuffer.length > MAX_BUFFER) {
    _inputBuffer = _inputBuffer.slice(_inputBuffer.length - MAX_BUFFER)
  }
}

/** Check if a combo's sequence is a suffix of the recent buffer within its time window. */
function _matchesCombo(combo: ComboDefinition): boolean {
  const seq = combo.sequence
  const windowMs = combo.windowSeconds * 1000
  const now = Date.now()

  // We need at least seq.length entries in buffer
  if (_inputBuffer.length < seq.length) return false

  // Take the last seq.length entries
  const tail = _inputBuffer.slice(_inputBuffer.length - seq.length)

  // Check all entries are within the combo's time window
  if (now - tail[0].ts > windowMs) return false

  // Check sequence matches
  for (let i = 0; i < seq.length; i++) {
    if (tail[i].action !== seq[i]) return false
  }

  return true
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Record an action into the buffer and check all combos. */
export function recordAction(action: string): void {
  const entry: BufferEntry = { action, ts: Date.now() }
  _inputBuffer.push(entry)
  _trimBuffer()
  checkCombos()
}

/** Check all combos and fire any that match the current buffer. */
export function checkCombos(): void {
  const now = Date.now()
  for (const combo of COMBO_DEFINITIONS) {
    // Skip if on cooldown
    const cooldownExpiry = _cooldowns.get(combo.id) ?? 0
    if (now < cooldownExpiry) continue

    if (_matchesCombo(combo)) {
      // Set cooldown
      _cooldowns.set(combo.id, now + combo.cooldownSeconds * 1000)

      // Clear buffer after a successful match
      _inputBuffer = []

      // Dispatch event for game systems and UI
      window.dispatchEvent(new CustomEvent('combo-triggered', {
        detail: { comboId: combo.id, combo },
      }))

      // Only trigger one combo at a time
      break
    }
  }
}

/** Returns all combo definitions (with live cooldown info). */
export function getComboDefinitions(): ComboDefinition[] {
  return COMBO_DEFINITIONS
}

/** Returns the current action buffer (last 10 entries). */
export function getRecentActions(): BufferEntry[] {
  return [..._inputBuffer]
}

/** Returns remaining cooldown seconds for a combo (0 if ready). */
export function getComboCooldownRemaining(comboId: string): number {
  const expiry = _cooldowns.get(comboId) ?? 0
  return Math.max(0, (expiry - Date.now()) / 1000)
}

// ── Initialization ────────────────────────────────────────────────────────────

export function initSkillComboSystem(): void {
  if (_initialized) return
  _initialized = true

  // Map spell-cast events → action IDs based on spellId
  window.addEventListener('spell-cast', (e: Event) => {
    const detail = (e as CustomEvent).detail as { spellId: string }
    if (!detail?.spellId) return
    const spellId = detail.spellId.toLowerCase()
    // Map spell IDs to combo action tokens
    if (spellId.includes('fire') || spellId === 'fireball') {
      recordAction('fire')
    } else if (spellId.includes('ice') || spellId.includes('ice_shard')) {
      recordAction('ice')
    } else if (spellId.includes('lightning')) {
      recordAction('lightning')
    } else if (spellId.includes('heal')) {
      recordAction('heal')
    } else {
      recordAction('spell')
    }
  })

  // Combat attacks
  window.addEventListener('player-attacked', () => {
    recordAction('attack')
    recordAction('combat')
  })

  // Gathering
  window.addEventListener('player-gathered', () => {
    recordAction('gather')
  })

  // Dodge / sprint actions
  window.addEventListener('player-dodge', () => {
    recordAction('dodge')
  })

  window.addEventListener('player-sprint', () => {
    recordAction('sprint')
  })
}
