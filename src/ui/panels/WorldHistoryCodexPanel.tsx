// src/ui/panels/WorldHistoryCodexPanel.tsx
// M67 Track A: World History Codex — categorized lore encyclopedia panel.

import React, { useState, useEffect, useCallback } from 'react'
import {
  getCodexEntries,
  getCodexStats,
  type CodexCategory,
  type CodexEntry,
  type CodexRarity,
} from '../../game/WorldHistoryCodexSystem'

// ── Types ─────────────────────────────────────────────────────────────────────

const CATEGORIES: { id: CodexCategory; label: string; icon: string }[] = [
  { id: 'geography', label: 'Geography', icon: '🗺️' },
  { id: 'bestiary',  label: 'Bestiary',  icon: '🦅' },
  { id: 'history',   label: 'History',   icon: '📜' },
  { id: 'factions',  label: 'Factions',  icon: '⚔️' },
  { id: 'legends',   label: 'Legends',   icon: '⭐' },
]

const RARITY_COLORS: Record<CodexRarity, string> = {
  common:    '#aaa',
  uncommon:  '#4fc3f7',
  rare:      '#ce93d8',
  legendary: '#ffd700',
}

const RARITY_LABEL: Record<CodexRarity, string> = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  legendary: 'Legendary',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeAgo(simSeconds: number, currentSimSeconds: number): string {
  const diff = currentSimSeconds - simSeconds
  if (diff < 60) return 'just now'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getCurrentSimSeconds(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../../store/gameStore')
    return useGameStore.getState().simSeconds ?? 0
  } catch {
    return 0
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: CodexEntry
  simSeconds: number
}

function EntryCard({ entry, simSeconds }: EntryCardProps) {
  const isLegendary = entry.rarity === 'legendary'
  const rarityColor = RARITY_COLORS[entry.rarity]

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 6,
        background: isLegendary
          ? 'rgba(255,215,0,0.06)'
          : 'rgba(255,255,255,0.03)',
        border: isLegendary
          ? '1px solid rgba(255,215,0,0.35)'
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: isLegendary
          ? '0 0 12px rgba(255,215,0,0.12), inset 0 0 12px rgba(255,215,0,0.04)'
          : 'none',
        marginBottom: 8,
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
        {entry.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <span
            style={{
              color: rarityColor,
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 0.5,
            }}
          >
            {entry.title}
          </span>
          <span
            style={{
              fontSize: 9,
              color: rarityColor,
              opacity: 0.7,
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: 1,
              border: `1px solid ${rarityColor}44`,
              borderRadius: 3,
              padding: '1px 4px',
            }}
          >
            {RARITY_LABEL[entry.rarity]}
          </span>
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 11,
            color: '#999',
            lineHeight: 1.5,
            marginBottom: 4,
          }}
        >
          {entry.description}
        </div>

        {/* Timestamp */}
        <div style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>
          Discovered {formatTimeAgo(entry.discoveredAt, simSeconds)}
        </div>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function WorldHistoryCodexPanel() {
  const [activeCategory, setActiveCategory] = useState<CodexCategory>('geography')
  const [entries, setEntries] = useState<CodexEntry[]>([])
  const [stats, setStats] = useState(() => getCodexStats())
  const [simSeconds, setSimSeconds] = useState(0)

  const refresh = useCallback(() => {
    setEntries(getCodexEntries())
    setStats(getCodexStats())
    setSimSeconds(getCurrentSimSeconds())
  }, [])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Listen for new codex entries
  useEffect(() => {
    function onEntry() { refresh() }
    window.addEventListener('codex-entry-added', onEntry)
    return () => window.removeEventListener('codex-entry-added', onEntry)
  }, [refresh])

  // Refresh sim time every 10s so timestamps stay fresh
  useEffect(() => {
    const id = setInterval(() => {
      setSimSeconds(getCurrentSimSeconds())
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  const categoryEntries = entries.filter(e => e.category === activeCategory)
    // Most recent first
    .sort((a, b) => b.discoveredAt - a.discoveredAt)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0a0a',
        color: '#ccc',
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px 10px',
          borderBottom: '1px solid #1e1e1e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2,
              color: '#ddd',
              textTransform: 'uppercase',
            }}
          >
            World History Codex
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#555',
              marginLeft: 'auto',
            }}
          >
            {stats.total} {stats.total === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
          A permanent record of discovered lore, history, and legends.
        </div>
      </div>

      {/* Category tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #1a1a1a',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id
          const count = stats.byCategory[cat.id]
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 4px',
                background: isActive ? 'rgba(205,68,32,0.15)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #cd4420' : '2px solid transparent',
                color: isActive ? '#cd4420' : '#555',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#999'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#555'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span style={{ fontSize: 14 }}>{cat.icon}</span>
              <span>{cat.label}</span>
              {count > 0 && (
                <span
                  style={{
                    background: isActive ? '#cd4420' : '#333',
                    color: isActive ? '#fff' : '#888',
                    borderRadius: 8,
                    padding: '0 5px',
                    fontSize: 8,
                    lineHeight: '14px',
                    minWidth: 14,
                    textAlign: 'center',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Entry list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 12px',
        }}
      >
        {categoryEntries.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#333',
              padding: '40px 20px',
              fontSize: 12,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>
              {CATEGORIES.find(c => c.id === activeCategory)?.icon}
            </div>
            <div>No entries discovered yet.</div>
            <div style={{ fontSize: 10, marginTop: 4, color: '#2a2a2a' }}>
              Explore the world to unlock entries in this category.
            </div>
          </div>
        ) : (
          categoryEntries.map(entry => (
            <EntryCard key={entry.id} entry={entry} simSeconds={simSeconds} />
          ))
        )}
      </div>
    </div>
  )
}
