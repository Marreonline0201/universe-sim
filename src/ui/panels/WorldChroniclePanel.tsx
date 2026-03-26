// src/ui/panels/WorldChroniclePanel.tsx
// M63 Track C: World Chronicle — severity-ranked world history timeline panel.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getChronicleEntries,
  type ChronicleCategory,
  type ChronicleSeverity,
  type ChronicleEntry,
} from '../../game/WorldChronicleSystem'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{ id: ChronicleCategory | 'all'; label: string }> = [
  { id: 'all',        label: 'ALL' },
  { id: 'boss',       label: 'BOSS' },
  { id: 'weather',    label: 'WEATHER' },
  { id: 'faction',    label: 'FACTION' },
  { id: 'settlement', label: 'SETTLEMENT' },
  { id: 'disaster',   label: 'DISASTER' },
  { id: 'milestone',  label: 'MILESTONE' },
]

const SEVERITY_FILTERS: Array<{ id: ChronicleSeverity | 'all'; label: string }> = [
  { id: 'all',      label: 'ALL' },
  { id: 'notable',  label: 'NOTABLE+' },
  { id: 'major',    label: 'MAJOR+' },
  { id: 'legendary', label: 'LEGENDARY' },
]

const SEVERITY_COLOR: Record<ChronicleSeverity, string> = {
  minor:    '#888',
  notable:  '#4ade80',
  major:    '#f0c040',
  legendary: '#a78bfa',
}

const SEVERITY_ORDER: ChronicleSeverity[] = ['minor', 'notable', 'major', 'legendary']

const MAX_DISPLAY = 30
const POLL_INTERVAL = 10_000

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSimTime(simSeconds: number): string {
  const day  = Math.floor(simSeconds / 86400) + 1
  const rem  = simSeconds % 86400
  const h    = Math.floor(rem / 3600)
  const m    = Math.floor((rem % 3600) / 60)
  return `Day ${day}, T+${h}:${String(m).padStart(2, '0')}`
}

function meetsMinSeverity(entry: ChronicleEntry, minSeverity: ChronicleSeverity | 'all'): boolean {
  if (minSeverity === 'all') return true
  return SEVERITY_ORDER.indexOf(entry.severity) >= SEVERITY_ORDER.indexOf(minSeverity)
}

// ── ChronicleRow ──────────────────────────────────────────────────────────────

interface ChronicleRowProps {
  entry: ChronicleEntry
  isNew: boolean
}

function ChronicleRow({ entry, isNew }: ChronicleRowProps) {
  const [opacity, setOpacity] = useState(isNew ? 0 : 1)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (isNew) {
      rafRef.current = requestAnimationFrame(() => setOpacity(1))
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      }
    }
  }, [isNew])

  const color    = SEVERITY_COLOR[entry.severity]
  const isLegend = entry.severity === 'legendary'

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '9px 8px',
        borderBottom: '1px solid #1a1a1a',
        borderLeft: isLegend ? `2px solid ${color}` : '2px solid transparent',
        borderRadius: isLegend ? 3 : 0,
        background: isLegend ? 'rgba(167,139,250,0.05)' : 'transparent',
        boxShadow: isLegend ? `0 0 8px rgba(167,139,250,0.15)` : 'none',
        opacity,
        transition: 'opacity 0.35s ease',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
        {entry.icon}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 6,
          marginBottom: 2,
        }}>
          {/* Headline */}
          <span style={{
            color,
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {entry.headline}
          </span>
          {/* Sim time */}
          <span style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 9,
            flexShrink: 0,
          }}>
            {formatSimTime(entry.simSeconds)}
          </span>
        </div>

        {/* Detail */}
        <div style={{
          color: '#666',
          fontFamily: 'monospace',
          fontSize: 10,
          lineHeight: '1.4',
        }}>
          {entry.detail}
        </div>

        {/* Severity badge */}
        <span style={{
          display: 'inline-block',
          marginTop: 4,
          background: `${color}18`,
          border: `1px solid ${color}33`,
          borderRadius: 3,
          color,
          fontFamily: 'monospace',
          fontSize: 8,
          fontWeight: 700,
          padding: '1px 5px',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          {entry.severity}
        </span>
      </div>
    </div>
  )
}

// ── WorldChroniclePanel ───────────────────────────────────────────────────────

export function WorldChroniclePanel() {
  const [catFilter,  setCatFilter]  = useState<ChronicleCategory | 'all'>('all')
  const [sevFilter,  setSevFilter]  = useState<ChronicleSeverity | 'all'>('all')
  const [entries,    setEntries]    = useState<ChronicleEntry[]>(() => getChronicleEntries())
  const [newIds,     setNewIds]     = useState<Set<string>>(new Set())

  const refresh = useCallback((newestId?: string) => {
    setEntries(getChronicleEntries())
    if (newestId) {
      setNewIds(prev => {
        const next = new Set(prev)
        next.add(newestId)
        setTimeout(() => {
          setNewIds(s => {
            const cleaned = new Set(s)
            cleaned.delete(newestId)
            return cleaned
          })
        }, 600)
        return next
      })
    }
  }, [])

  // Live updates on chronicle-entry-added
  useEffect(() => {
    function onEntryAdded(e: Event) {
      const detail = (e as CustomEvent).detail as { entry?: ChronicleEntry }
      refresh(detail?.entry?.id)
    }
    window.addEventListener('chronicle-entry-added', onEntryAdded)
    return () => window.removeEventListener('chronicle-entry-added', onEntryAdded)
  }, [refresh])

  // Fallback poll every 10s
  useEffect(() => {
    const timer = setInterval(() => refresh(), POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [refresh])

  // Apply filters
  const filtered = entries
    .filter(e => catFilter === 'all' || e.category === catFilter)
    .filter(e => meetsMinSeverity(e, sevFilter))
    .slice(0, MAX_DISPLAY)

  const totalCount = entries.length

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      {/* Header */}
      <div style={{
        color: '#cd4420',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        marginBottom: 12,
        textTransform: 'uppercase',
      }}>
        World Chronicle — {totalCount} {totalCount === 1 ? 'event' : 'events'}
      </div>

      {/* Category filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {CATEGORIES.map(({ id, label }) => {
          const active = catFilter === id
          return (
            <button
              key={id}
              onClick={() => setCatFilter(id as ChronicleCategory | 'all')}
              style={{
                padding: '3px 8px',
                background: active ? 'rgba(205,68,32,0.18)' : 'transparent',
                border: `1px solid ${active ? '#cd4420' : '#2a2a2a'}`,
                borderRadius: 3,
                color: active ? '#cd4420' : '#555',
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

      {/* Severity filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
        {SEVERITY_FILTERS.map(({ id, label }) => {
          const active = sevFilter === id
          const color  = id === 'all' ? '#555' : SEVERITY_COLOR[id as ChronicleSeverity]
          return (
            <button
              key={id}
              onClick={() => setSevFilter(id as ChronicleSeverity | 'all')}
              style={{
                padding: '2px 7px',
                background: active ? `${color}22` : 'transparent',
                border: `1px solid ${active ? color : '#2a2a2a'}`,
                borderRadius: 3,
                color: active ? color : '#444',
                fontFamily: 'monospace',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.color = '#888'
                  e.currentTarget.style.borderColor = '#444'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.color = '#444'
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
          padding: '28px 16px',
          textAlign: 'center',
          color: '#444',
          fontSize: 12,
          letterSpacing: 0.5,
        }}>
          The world awaits its first great event...
        </div>
      ) : (
        <div>
          {filtered.map(entry => (
            <ChronicleRow
              key={entry.id}
              entry={entry}
              isNew={newIds.has(entry.id)}
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
