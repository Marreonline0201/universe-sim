// ── SpellBar.tsx ───────────────────────────────────────────────────────────────
// M40 Track B: Spell hotbar HUD — 4 slots + mana bar.
// Positioned bottom-center, above the main hotbar.

import React from 'react'
import { useSpellStore } from '../store/spellStore'
import { SPELLS, SPELL_ICON } from '../game/SpellSystem'
import type { SpellId } from '../game/SpellSystem'

const SLOT_SIZE = 60
const SLOT_GAP = 6
const KEY_LABELS = ['1', '2', '3', '4']

function CooldownOverlay({ spellId }: { spellId: SpellId }) {
  const expiry = useSpellStore(s => s.cooldowns[spellId])
  const now = Date.now()
  if (!expiry || now >= expiry) return null

  const spell = SPELLS[spellId]
  const remaining = Math.max(0, expiry - now)
  const fraction = remaining / spell.cooldown  // 0–1 darkened fraction

  const secs = (remaining / 1000).toFixed(1)

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: `rgba(0,0,0,${0.55 + fraction * 0.25})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 4,
      pointerEvents: 'none',
    }}>
      <span style={{ color: '#ccc', fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>
        {secs}
      </span>
    </div>
  )
}

function SpellSlot({ slotIndex }: { slotIndex: number }) {
  const equippedSpells = useSpellStore(s => s.equippedSpells)
  const mana = useSpellStore(s => s.mana)
  const cooldowns = useSpellStore(s => s.cooldowns)

  const spellId = equippedSpells[slotIndex] ?? null
  const spell = spellId ? SPELLS[spellId] : null
  const icon = spellId ? SPELL_ICON[spellId] : null

  const now = Date.now()
  const onCooldown = spellId ? !!(cooldowns[spellId] && now < (cooldowns[spellId] ?? 0)) : false
  const noMana = spell ? mana < spell.manaCost : false
  const unavailable = onCooldown || noMana

  return (
    <div
      title={spell ? `${spell.name} — ${spell.effect}\nMana: ${spell.manaCost}  CD: ${spell.cooldown / 1000}s` : `Slot ${slotIndex + 1} (empty)`}
      style={{
        position: 'relative',
        width: SLOT_SIZE,
        height: SLOT_SIZE,
        background: spellId ? 'rgba(30,20,50,0.92)' : 'rgba(20,20,20,0.7)',
        border: `1px solid ${spellId ? '#5533aa' : '#333'}`,
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        opacity: unavailable ? 0.6 : 1,
        transition: 'opacity 0.2s',
        flexShrink: 0,
      }}
    >
      {/* Key hint — top-left corner */}
      <div style={{
        position: 'absolute',
        top: 3,
        left: 4,
        color: '#666',
        fontSize: 9,
        fontFamily: 'monospace',
        lineHeight: 1,
        pointerEvents: 'none',
      }}>
        {KEY_LABELS[slotIndex]}
      </div>

      {/* Spell icon letter */}
      {icon && (
        <span style={{
          fontSize: 22,
          fontFamily: 'monospace',
          fontWeight: 900,
          color: unavailable ? '#554488' : '#bb88ff',
          lineHeight: 1,
        }}>
          {icon}
        </span>
      )}

      {/* Mana cost — bottom */}
      {spell && (
        <span style={{
          fontSize: 9,
          fontFamily: 'monospace',
          color: noMana ? '#ff4444' : '#8866cc',
          lineHeight: 1,
        }}>
          {spell.manaCost}mp
        </span>
      )}

      {/* Cooldown overlay */}
      {spellId && <CooldownOverlay spellId={spellId} />}
    </div>
  )
}

export function SpellBar() {
  const mana = useSpellStore(s => s.mana)
  const maxMana = useSpellStore(s => s.maxMana)
  const equippedSpells = useSpellStore(s => s.equippedSpells)
  const shieldHp = useSpellStore(s => s.shieldHp)

  const hasAnySpell = equippedSpells.some(s => s !== null)
  if (!hasAnySpell) return null

  const manaFraction = Math.max(0, Math.min(1, mana / maxMana))

  const totalWidth = SLOT_SIZE * 4 + SLOT_GAP * 3

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 190,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
        fontFamily: 'monospace',
      }}
    >
      {/* Spell slots row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: SLOT_GAP,
        background: 'rgba(8,4,16,0.85)',
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px solid #2a1a44',
      }}>
        {[0, 1, 2, 3].map(i => (
          <SpellSlot key={i} slotIndex={i} />
        ))}
      </div>

      {/* Mana bar */}
      <div style={{
        width: totalWidth + 16,
        background: 'rgba(8,4,16,0.85)',
        borderRadius: 4,
        border: '1px solid #2a1a44',
        padding: '3px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#6644aa', fontSize: 9 }}>MANA</span>
          <span style={{ color: '#aa88ff', fontSize: 9 }}>{Math.floor(mana)}/{maxMana}</span>
        </div>
        <div style={{ width: '100%', height: 5, background: '#1a0a2a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${manaFraction * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #4433aa, #8866ff)',
            borderRadius: 3,
            transition: 'width 0.15s ease',
          }} />
        </div>
        {shieldHp > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
            <span style={{ color: '#4488aa', fontSize: 9 }}>SHIELD</span>
            <span style={{ color: '#88ccff', fontSize: 9 }}>{Math.floor(shieldHp)}/60</span>
          </div>
        )}
      </div>
    </div>
  )
}
