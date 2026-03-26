// src/ui/panels/CodexPanel.tsx
// M57 Track B: Codex — unlocked lore entries grouped by category

import React, { useState, useEffect } from 'react'
import {
  getLoreEntries,
  LORE_CATEGORY_ICONS,
  type LoreCategory,
  type LoreEntry,
} from '../../game/LoreSystem'

const TOTAL_ENTRIES = 18

const ALL_CATEGORIES: LoreCategory[] = ['history', 'bestiary', 'alchemy', 'geography', 'factions', 'artifacts']

const CATEGORY_LABELS: Record<LoreCategory, string> = {
  history:   'History',
  bestiary:  'Bestiary',
  alchemy:   'Alchemy',
  geography: 'Geography',
  factions:  'Factions',
  artifacts: 'Artifacts',
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({
  label,
  icon,
  active,
  count,
  onClick,
}: {
  label: string
  icon?: string
  active: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(205,68,32,0.18)' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #cd4420' : '2px solid transparent',
        color: active ? '#cd4420' : '#666',
        fontFamily: 'monospace',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        padding: '6px 8px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.12s',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#aaa' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#666' }}
    >
      {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
      {label}
      <span style={{
        background: active ? 'rgba(205,68,32,0.3)' : 'rgba(255,255,255,0.07)',
        color: active ? '#cd4420' : '#555',
        borderRadius: 8,
        padding: '1px 5px',
        fontSize: 8,
        fontWeight: 700,
        marginLeft: 1,
      }}>
        {count}
      </span>
    </button>
  )
}

// ── Lore entry card ────────────────────────────────────────────────────────────

function LoreCard({ entry, expanded, onToggle }: {
  entry: LoreEntry
  expanded: boolean
  onToggle: () => void
}) {
  if (!entry.unlocked) {
    return (
      <div style={{
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid #1e1e1e',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: 0.45,
      }}>
        <span style={{ fontSize: 16 }}>🔒</span>
        <div>
          <div style={{ color: '#444', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>???</div>
          <div style={{ color: '#333', fontFamily: 'monospace', fontSize: 9, marginTop: 2 }}>
            {LORE_CATEGORY_ICONS[entry.category]} {CATEGORY_LABELS[entry.category]}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onToggle}
      style={{
        padding: '10px 12px',
        background: expanded ? 'rgba(205,68,32,0.07)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${expanded ? '#cd4420' : '#252525'}`,
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        if (!expanded) (e.currentTarget as HTMLDivElement).style.borderColor = '#3a3a3a'
      }}
      onMouseLeave={e => {
        if (!expanded) (e.currentTarget as HTMLDivElement).style.borderColor = '#252525'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{entry.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#e8e8e8', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
            {entry.title}
          </div>
          <div style={{ color: '#777', fontFamily: 'monospace', fontSize: 9, marginTop: 2 }}>
            {LORE_CATEGORY_ICONS[entry.category]} {CATEGORY_LABELS[entry.category]}
          </div>
        </div>
        <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {!expanded && (
        <div style={{
          color: '#666',
          fontFamily: 'monospace',
          fontSize: 9,
          marginTop: 8,
          lineHeight: 1.6,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {entry.summary}
        </div>
      )}

      {expanded && (
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid #2a2a2a',
          borderRadius: 3,
          color: '#aaa',
          fontFamily: 'monospace',
          fontSize: 10,
          lineHeight: 1.75,
        }}>
          {entry.fullText}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CodexPanel() {
  const [entries, setEntries] = useState<LoreEntry[]>(() => getLoreEntries())
  const [selectedCategory, setSelectedCategory] = useState<LoreCategory | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Refresh on lore-unlocked event and on a 10s interval
  useEffect(() => {
    function refresh() {
      setEntries(getLoreEntries())
    }
    window.addEventListener('lore-unlocked', refresh)
    const interval = setInterval(refresh, 10_000)
    return () => {
      window.removeEventListener('lore-unlocked', refresh)
      clearInterval(interval)
    }
  }, [])

  const unlockedCount = entries.filter(e => e.unlocked).length

  // Category counts (unlocked)
  const countByCategory = (cat: LoreCategory) =>
    entries.filter(e => e.category === cat && e.unlocked).length

  const filteredEntries = selectedCategory === 'all'
    ? entries
    : entries.filter(e => e.category === selectedCategory)

  function handleToggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8e8', letterSpacing: 2 }}>
          WORLD CODEX
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 4, letterSpacing: 1 }}>
          Lore discovered through your adventures
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 9, color: '#555', letterSpacing: 1 }}>ENTRIES UNLOCKED</span>
          <span style={{ fontSize: 9, color: unlockedCount > 0 ? '#cd4420' : '#444', fontWeight: 700 }}>
            {unlockedCount} / {TOTAL_ENTRIES}
          </span>
        </div>
        <div style={{
          height: 3,
          background: '#1a1a1a',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${(unlockedCount / TOTAL_ENTRIES) * 100}%`,
            background: '#cd4420',
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Category filter tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        marginBottom: 14,
        borderBottom: '1px solid #1e1e1e',
        paddingBottom: 2,
      }}>
        <TabButton
          label="All"
          active={selectedCategory === 'all'}
          count={unlockedCount}
          onClick={() => setSelectedCategory('all')}
        />
        {ALL_CATEGORIES.map(cat => (
          <TabButton
            key={cat}
            label={CATEGORY_LABELS[cat]}
            icon={LORE_CATEGORY_ICONS[cat]}
            active={selectedCategory === cat}
            count={countByCategory(cat)}
            onClick={() => setSelectedCategory(cat)}
          />
        ))}
      </div>

      {/* Entry list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredEntries.length === 0 && (
          <div style={{ color: '#444', fontSize: 11, textAlign: 'center', padding: 24 }}>
            No entries in this category.
          </div>
        )}
        {filteredEntries.map(entry => (
          <LoreCard
            key={entry.id}
            entry={entry}
            expanded={expandedId === entry.id}
            onToggle={() => handleToggle(entry.id)}
          />
        ))}
      </div>

      {unlockedCount === 0 && (
        <div style={{
          marginTop: 16,
          padding: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid #1e1e1e',
          borderRadius: 4,
          color: '#444',
          fontSize: 10,
          textAlign: 'center',
          lineHeight: 1.7,
        }}>
          Explore the world to discover lore entries.
          <br />
          Complete bounties, find locations, and engage with factions.
        </div>
      )}
    </div>
  )
}
