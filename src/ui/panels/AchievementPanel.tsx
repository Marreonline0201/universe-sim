// ── AchievementPanel.tsx ─────────────────────────────────────────────────────
// M24 Track B: Achievement gallery panel — shows all 25 achievements with
// progress bars, unlock status, and category filter tabs.

import React, { useState, useEffect } from 'react'
import { achievementSystem } from '../../game/GameSingletons'
import type { Achievement } from '../../game/AchievementSystem'

const CATEGORY_COLORS: Record<string, string> = {
  exploration:  '#38bdf8',
  combat:       '#ef4444',
  crafting:     '#facc15',
  survival:     '#4ade80',
  civilization: '#a78bfa',
  secret:       '#f97316',
}

const CATEGORIES = ['all', 'exploration', 'combat', 'crafting', 'survival', 'civilization'] as const

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const { title, description, icon, category, unlocked, unlockedAt, progress, target } = achievement
  const pct = target > 0 ? Math.min(1, progress / target) : 0
  const catColor = CATEGORY_COLORS[category] ?? '#888'

  return (
    <div style={{
      background: unlocked ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${unlocked ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 6,
      padding: '8px 10px',
      opacity: unlocked ? 1 : 0.6,
    }}>
      {/* Header: icon + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          fontSize: 14,
          fontWeight: 700,
          color: unlocked ? catColor : '#555',
          fontFamily: 'monospace',
          width: 24,
          textAlign: 'center',
        }}>
          {unlocked ? icon : '?'}
        </span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: unlocked ? '#eee' : '#777',
          flex: 1,
        }}>
          {unlocked ? title : '???'}
        </span>
        {/* Category badge */}
        <span style={{
          fontSize: 8,
          color: catColor,
          textTransform: 'uppercase',
          fontFamily: 'monospace',
          opacity: 0.7,
        }}>
          {category}
        </span>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 9,
        color: unlocked ? '#aaa' : '#555',
        marginBottom: 6,
        lineHeight: 1.3,
      }}>
        {unlocked ? description : 'Keep playing to discover this achievement...'}
      </div>

      {/* Progress bar */}
      {!unlocked && (
        <div style={{
          width: '100%',
          height: 3,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 2,
        }}>
          <div style={{
            width: `${pct * 100}%`,
            height: '100%',
            background: catColor,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {/* Progress text / unlock date */}
      <div style={{
        fontSize: 8,
        color: '#666',
        fontFamily: 'monospace',
        textAlign: 'right',
      }}>
        {unlocked
          ? `Unlocked ${unlockedAt ? new Date(unlockedAt).toLocaleDateString() : ''}`
          : `${progress}/${target}`
        }
      </div>
    </div>
  )
}

export function AchievementPanel() {
  const [filter, setFilter] = useState<string>('all')
  const [, setTick] = useState(0)

  // Refresh every 2 seconds to pick up progress changes
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 2000)
    return () => clearInterval(iv)
  }, [])

  const all = achievementSystem.getAll()
  const filtered = filter === 'all' ? all : all.filter(a => a.category === filter)
  const unlockedCount = all.filter(a => a.unlocked).length

  return (
    <div style={{ padding: 12, color: '#ccc', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#eee' }}>Achievements</span>
        <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
          {unlockedCount}/{all.length} Unlocked
        </span>
      </div>

      {/* Category filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: '2px 8px',
              fontSize: 9,
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              background: filter === cat ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${filter === cat ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 3,
              color: cat === 'all' ? '#ccc' : (CATEGORY_COLORS[cat] ?? '#ccc'),
              cursor: 'pointer',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Achievement grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 6,
        maxHeight: 500,
        overflowY: 'auto',
      }}>
        {filtered.map(a => (
          <AchievementCard key={a.id} achievement={a} />
        ))}
      </div>
    </div>
  )
}
