// ── spellStore.ts ──────────────────────────────────────────────────────────────
// M40 Track B: Zustand store for reactive spell UI state.
// No persistence — synced from spellSystem singleton each frame.

import { create } from 'zustand'
import type { SpellId } from '../game/SpellSystem'
import { spellSystem } from '../game/SpellSystem'

interface SpellState {
  mana: number
  maxMana: number
  equippedSpells: (SpellId | null)[]
  learnedSpells: SpellId[]
  cooldowns: Partial<Record<SpellId, number>>  // expiry timestamps (ms)
  shieldHp: number
  syncFromSystem(): void
}

export const useSpellStore = create<SpellState>((set) => ({
  mana: 50,
  maxMana: 100,
  equippedSpells: [null, null, null, null],
  learnedSpells: [],
  cooldowns: {},
  shieldHp: 0,

  syncFromSystem() {
    const cooldowns: Partial<Record<SpellId, number>> = {}
    spellSystem.cooldowns.forEach((expiry, id) => {
      cooldowns[id] = expiry
    })
    set({
      mana: spellSystem.mana,
      maxMana: spellSystem.maxMana,
      equippedSpells: [...spellSystem.equippedSpells],
      learnedSpells: [...spellSystem.learnedSpells],
      cooldowns,
      shieldHp: spellSystem.shieldHp,
    })
  },
}))
