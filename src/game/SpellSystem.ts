// ── SpellSystem.ts ─────────────────────────────────────────────────────────────
// M40 Track B: Magic Spell System
// Singleton managing mana, spell slots, cooldowns, and casting effects.

import { usePlayerStore } from '../store/playerStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpellId = 'fireball' | 'ice_shard' | 'lightning' | 'heal' | 'wind_blast' | 'stone_shield'

export interface Spell {
  id: SpellId
  name: string
  manaCost: number
  cooldown: number   // ms
  damage?: number
  healAmount?: number
  effect: string     // description text
}

// ── Spell Definitions ─────────────────────────────────────────────────────────

export const SPELLS: Record<SpellId, Spell> = {
  fireball:     { id: 'fireball',     name: 'Fireball',     manaCost: 25, cooldown: 3000, damage: 45,  effect: 'AoE fire burst, 5m radius' },
  ice_shard:    { id: 'ice_shard',    name: 'Ice Shard',    manaCost: 15, cooldown: 1500, damage: 20,  effect: 'Single target, slows enemy 50%' },
  lightning:    { id: 'lightning',    name: 'Lightning',    manaCost: 35, cooldown: 4000, damage: 65,  effect: 'Chain lightning, hits 3 targets' },
  heal:         { id: 'heal',         name: 'Heal',         manaCost: 20, cooldown: 5000, healAmount: 40, effect: 'Restore 40 HP instantly' },
  wind_blast:   { id: 'wind_blast',   name: 'Wind Blast',   manaCost: 10, cooldown: 2000, damage: 15,  effect: 'Knockback + minor damage' },
  stone_shield: { id: 'stone_shield', name: 'Stone Shield', manaCost: 30, cooldown: 8000,              effect: 'Absorb 60 damage for 10s' },
}

// ── Spell icon letters for HUD display ────────────────────────────────────────

export const SPELL_ICON: Record<SpellId, string> = {
  fireball:     'F',
  ice_shard:    'I',
  lightning:    'L',
  heal:         'H',
  wind_blast:   'W',
  stone_shield: 'S',
}

// ── SpellSystem Singleton ─────────────────────────────────────────────────────

class SpellSystemClass {
  learnedSpells: SpellId[] = []
  equippedSpells: (SpellId | null)[] = [null, null, null, null]
  mana: number = 50
  maxMana: number = 100
  manaRegenRate: number = 2   // per second
  cooldowns: Map<SpellId, number> = new Map()  // expiry timestamp (ms)
  shieldHp: number = 0

  learnSpell(id: SpellId): void {
    if (!this.learnedSpells.includes(id)) {
      this.learnedSpells.push(id)
    }
  }

  equipSpell(id: SpellId, slot: 0 | 1 | 2 | 3): void {
    this.equippedSpells[slot] = id
  }

  canCast(id: SpellId): boolean {
    const spell = SPELLS[id]
    if (this.mana < spell.manaCost) return false
    const expiry = this.cooldowns.get(id)
    if (expiry && Date.now() < expiry) return false
    return true
  }

  castSpell(id: SpellId, entityId: number): void {
    if (!this.canCast(id)) return
    const spell = SPELLS[id]

    // Deduct mana
    this.mana = Math.max(0, this.mana - spell.manaCost)

    // Set cooldown
    this.cooldowns.set(id, Date.now() + spell.cooldown)

    // Apply immediate effects (stone_shield handled locally)
    if (id === 'stone_shield') {
      this.shieldHp = 60
    }

    // Dispatch event for GameLoop to handle damage / heal
    window.dispatchEvent(new CustomEvent('spell-cast', {
      detail: { spellId: id, entityId },
    }))
  }

  /** Cast the spell equipped in hotbar slot (reads entityId from playerStore) */
  castEquippedSpell(slot: number): void {
    const spellId = this.equippedSpells[slot] ?? null
    if (!spellId) return
    const ps = usePlayerStore.getState()
    const eid = ps.entityId
    if (eid === null) return
    this.castSpell(spellId, eid)
  }

  /** Absorb incoming damage with active shield. Returns remaining damage. */
  absorbWithShield(damage: number): number {
    if (this.shieldHp <= 0) return damage
    const absorbed = Math.min(this.shieldHp, damage)
    this.shieldHp -= absorbed
    return damage - absorbed
  }

  /** Call each frame from GameLoop — regenerates mana */
  tick(dt: number): void {
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegenRate * dt)
  }
}

export const spellSystem = new SpellSystemClass()
