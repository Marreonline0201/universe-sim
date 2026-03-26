// src/ui/panels/PlayerJournalPanel.tsx
// M62 Track B: Player Journal — filterable event log with animated entries.

import { useState, useEffect, useCallback } from 'react'
import {
  getJournalEntries,
  type JournalCategory,
  type JournalEntry,
} from '../../game/PlayerJournalSystem'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{ id: JournalCategory | 'all'; label: string }> = [
  { id: 'all',         label: 'ALL' },
  { id: 'combat',      label: 'COMBAT' },
  { id: 'discovery',   label: 'DISCOVERY' },
  { id: 'crafting',    label: 'CRAFTING' },
  { id: 'weather',     label: 'WEATHER' },
  { id: 'social',      label: 'SOCIAL' },
  { id: 'economy',     label: 'ECONOMY' },
  { id: 'achievement', label: 'ACHIEVEMENT' },
]

const CATEGORY_COLOR: Record<JournalCategory | 'all', string> = {
  all:         '#cd4420',
  combat:      '#e74c3c',
  discovery:   '#3498db',
  crafting:    '#e0a030',
  weather:     '#5bc8af',
  social:      '#9b59b6',
  economy:     '#2ecc71',
  achievement: '#f39c12',
}

const MAX_DISPLAY = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffSec = Math.floor(diffMs / 1_000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  return `${diffHr}h ago`
}

// ── EntryRow ──────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: JournalEntry
  isNew: boolean
}

function EntryRow({ entry, isNew }: EntryRowProps) {
  const [opacity, setOpacity] = useState(isNew ? 0 : 1)

  useEffect(() => {
    if (isNew) {
      // Trigger fade-in on next frame
      const raf = requestAnimationFrame(() => setOpacity(1))
      return () => cancelAnimationFrame(raf)
    }
  }, [isNew])

  const catColor = CATEGORY_COLOR[entry.category] ?? '#888'

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid #1a1a1a',
        opacity,
        transition: 'opacity 0.35s ease',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
        {entry.icon}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{
            color: '#ddd',
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {entry.title}
          </span>
          <span style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 9,
            flexShrink: 0,
          }}>
            {formatRelativeTime(entry.timestamp)}
          </span>
        </div>
        <div style={{
          color: '#666',
          fontFamily: 'monospace',
          fontSize: 10,
          marginTop: 2,
          lineHeight: '1.4',
        }}>
          {entry.body}
        </div>
        <span style={{
          display: 'inline-block',
          marginTop: 3,
          background: `${catColor}22`,
          border: `1px solid ${catColor}44`,
          borderRadius: 3,
          color: catColor,
          fontFamily: 'monospace',
          fontSize: 8,
          fontWeight: 700,
          padding: '1px 5px',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          {entry.category}
        </span>
      </div>
    </div>
  )
}

// ── PlayerJournalPanel ────────────────────────────────────────────────────────

export function PlayerJournalPanel() {
  const [activeFilter, setActiveFilter] = useState<JournalCategory | 'all'>('all')
  const [entries, setEntries] = useState<JournalEntry[]>(() =>
    getJournalEntries()
  )
  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set())

  const refresh = useCallback((newestId?: string) => {
    const all = getJournalEntries()
    setEntries(all)
    if (newestId) {
      setNewEntryIds(prev => {
        const next = new Set(prev)
        next.add(newestId)
        // Clear the "new" flag after animation completes
        setTimeout(() => {
          setNewEntryIds(s => {
            const cleaned = new Set(s)
            cleaned.delete(newestId)
            return cleaned
          })
        }, 600)
        return next
      })
    }
  }, [])

  useEffect(() => {
    function onEntryAdded(e: Event) {
      const detail = (e as CustomEvent).detail as { entry?: JournalEntry }
      refresh(detail?.entry?.id)
    }
    window.addEventListener('journal-entry-added', onEntryAdded)
    return () => window.removeEventListener('journal-entry-added', onEntryAdded)
  }, [refresh])

  const filtered = (
    activeFilter === 'all'
      ? entries
      : entries.filter(e => e.category === activeFilter)
  ).slice(0, MAX_DISPLAY)

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      {/* Section label */}
      <div style={{
        color: '#cd4420',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        marginBottom: 12,
        textTransform: 'uppercase',
      }}>
        Event Log — {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 14,
      }}>
        {CATEGORIES.map(({ id, label }) => {
          const active = activeFilter === id
          const color  = CATEGORY_COLOR[id]
          return (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              style={{
                padding: '3px 8px',
                background: active ? `${color}22` : 'transparent',
                border: `1px solid ${active ? color : '#2a2a2a'}`,
                borderRadius: 3,
                color: active ? color : '#555',
                fontFamily: 'monospace',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.color = '#aaa'
                  e.currentTarget.style.borderColor = '#444'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.color = '#555'
                  e.currentTarget.style.borderColor = '#2a2a2a'
                }
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Entry list */}
      {filtered.length === 0 ? (
        <div style={{
          background: 'rgba(20,20,20,0.6)',
          border: '1px solid #2a2a2a',
          borderRadius: 5,
          padding: '24px 16px',
          textAlign: 'center',
          color: '#444',
          fontSize: 12,
        }}>
          No journal entries yet
        </div>
      ) : (
        <div>
          {filtered.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              isNew={newEntryIds.has(entry.id)}
            />
          ))}
          {filtered.length >= MAX_DISPLAY && (
            <div style={{
              color: '#444',
              fontSize: 9,
              textAlign: 'center',
              paddingTop: 8,
              letterSpacing: 1,
            }}>
              SHOWING {MAX_DISPLAY} MOST RECENT
            </div>
          )}
        </div>
      )}
    </div>
  )
}
