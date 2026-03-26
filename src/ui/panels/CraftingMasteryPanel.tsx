// ── CraftingMasteryPanel.tsx ───────────────────────────────────────────────────
// M60 Track A: Crafting Mastery — per-category XP levels with yield and
// material-save bonuses displayed in an 8-card 2-column grid.

import React, { useState, useEffect, useCallback } from 'react'
import {
  getMasteries,
  getMasteryBonus,
  type CraftingMastery,
} from '../../game/CraftingMasterySystem'

// ── Level-up flash badge ───────────────────────────────────────────────────────

function LevelBadge({ level }: { level: number }) {
  const isMax = level >= 10
  return (
    <span style={{
      fontSize: 9,
      fontFamily: 'monospace',
      fontWeight: 700,
      color: isMax ? '#facc15' : '#cd4420',
      border: `1px solid ${isMax ? 'rgba(250,204,21,0.5)' : 'rgba(205,68,32,0.5)'}`,
      borderRadius: 3,
      padding: '1px 5px',
      letterSpacing: 0.5,
      flexShrink: 0,
    }}>
      {isMax ? 'MAX' : `Lv ${level}`}
    </span>
  )
}

// ── XP progress bar ───────────────────────────────────────────────────────────

function XpBar({ xp, xpToNext, level }: { xp: number; xpToNext: number; level: number }) {
  const isMax = level >= 10
  const pct = isMax ? 100 : (xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0)

  return (
    <div>
      <div style={{
        width: '100%', height: 4,
        background: 'rgba(255,255,255,0.07)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: isMax ? '#facc15' : '#cd4420',
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 8, color: '#555', fontFamily: 'monospace', marginTop: 2,
      }}>
        <span>{isMax ? 'Mastered' : `${xp} / ${xpToNext} XP`}</span>
        <span>{isMax ? '100%' : `${Math.round(pct)}%`}</span>
      </div>
    </div>
  )
}

// ── Bonus row ─────────────────────────────────────────────────────────────────

function BonusRow({ category, level }: { category: string; level: number }) {
  const { yieldBonus, materialSaveChance } = getMasteryBonus(category)
  const hasBonus = yieldBonus > 0 || materialSaveChance > 0

  if (!hasBonus) {
    return (
      <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', marginTop: 4 }}>
        Lv 2 unlocks bonuses
      </div>
    )
  }

  return (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {yieldBonus > 0 && (
        <div style={{ fontSize: 9, color: '#4ade80', fontFamily: 'monospace' }}>
          +{(yieldBonus * 100).toFixed(0)}% yield chance
        </div>
      )}
      {materialSaveChance > 0 && (
        <div style={{ fontSize: 9, color: '#60a5fa', fontFamily: 'monospace' }}>
          {(materialSaveChance * 100).toFixed(0)}% material save
        </div>
      )}
    </div>
  )
}

// ── Mastery card ──────────────────────────────────────────────────────────────

function MasteryCard({ mastery }: { mastery: CraftingMastery }) {
  const isMax = mastery.level >= 10

  return (
    <div style={{
      background: isMax ? 'rgba(250,204,21,0.05)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isMax ? 'rgba(250,204,21,0.3)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 6,
      padding: '10px 11px',
      transition: 'border-color 0.15s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{mastery.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: isMax ? '#facc15' : '#ddd',
            fontFamily: 'monospace', letterSpacing: 0.4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {mastery.name}
          </div>
        </div>
        <LevelBadge level={mastery.level} />
      </div>

      {/* XP bar */}
      <XpBar xp={mastery.xp} xpToNext={mastery.xpToNext} level={mastery.level} />

      {/* Crafted count */}
      <div style={{
        fontSize: 9, color: '#555', fontFamily: 'monospace', marginTop: 4,
      }}>
        {mastery.totalCrafted.toLocaleString()} crafted
      </div>

      {/* Bonuses */}
      <BonusRow category={mastery.category} level={mastery.level} />
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function CraftingMasteryPanel() {
  const [masteries, setMasteries] = useState<CraftingMastery[]>(() => getMasteries())

  const refresh = useCallback(() => {
    setMasteries(getMasteries())
  }, [])

  useEffect(() => {
    const iv = setInterval(refresh, 5_000)
    window.addEventListener('crafting-mastery-levelup', refresh)
    return () => {
      clearInterval(iv)
      window.removeEventListener('crafting-mastery-levelup', refresh)
    }
  }, [refresh])

  const totalCrafted = masteries.reduce((sum, m) => sum + m.totalCrafted, 0)
  const maxedCount   = masteries.filter(m => m.level >= 10).length

  return (
    <div style={{ padding: 12, color: '#ccc', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#eee', letterSpacing: 1, marginBottom: 2 }}>
          CRAFTING MASTERY
        </div>
        <div style={{ fontSize: 10, color: '#666' }}>
          Craft items to earn XP and unlock passive bonuses per category
        </div>
      </div>

      {/* Summary bar */}
      <div style={{
        background: 'rgba(205,68,32,0.07)',
        border: '1px solid rgba(205,68,32,0.2)',
        borderRadius: 5,
        padding: '6px 10px',
        marginBottom: 12,
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#cd4420', fontFamily: 'monospace' }}>
          {totalCrafted.toLocaleString()} total crafted
        </span>
        <span style={{ fontSize: 11, color: maxedCount > 0 ? '#facc15' : '#555', fontFamily: 'monospace' }}>
          {maxedCount} / {masteries.length} maxed
        </span>
      </div>

      {/* Bonus legend */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 5,
        padding: '6px 10px',
        marginBottom: 12,
        fontSize: 9,
        color: '#666',
        fontFamily: 'monospace',
        lineHeight: 1.6,
      }}>
        <span style={{ color: '#4ade80' }}>+5% yield</span> every 2 levels (Lv 2, 4, 6, 8, 10)
        {' · '}
        <span style={{ color: '#60a5fa' }}>5% material save</span> every 3 levels (Lv 3, 6, 9)
      </div>

      {/* 2-column card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}>
        {masteries.map(m => (
          <MasteryCard key={m.category} mastery={m} />
        ))}
      </div>
    </div>
  )
}
