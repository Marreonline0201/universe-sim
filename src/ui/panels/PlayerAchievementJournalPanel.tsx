// ── PlayerAchievementJournalPanel ─────────────────────────────────────────────
// M67 Track B: Adventure Log panel — personal story moments and milestones.

import React, { useState, useCallback } from 'react'
import {
  getJournalEntries,
  getJournalEntriesByType,
  formatDay,
  type JournalEntryType,
} from '../../game/PlayerAchievementJournalSystem'

// ── Type color map ─────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<JournalEntryType, string> = {
  first_time:    '#4fc3f7',
  personal_best: '#f06292',
  milestone:     '#ffb74d',
  story:         '#ce93d8',
  social:        '#81c784',
}

const TYPE_LABEL: Record<JournalEntryType, string> = {
  first_time:    'FIRST TIME',
  personal_best: 'RECORD',
  milestone:     'MILESTONE',
  story:         'STORY',
  social:        'SOCIAL',
}

type FilterType = 'all' | JournalEntryType

const FILTER_TABS: Array<{ id: FilterType; label: string }> = [
  { id: 'all',          label: 'ALL' },
  { id: 'first_time',   label: 'FIRST TIMES' },
  { id: 'personal_best',label: 'RECORDS' },
  { id: 'milestone',    label: 'MILESTONES' },
  { id: 'story',        label: 'STORY' },
  { id: 'social',       label: 'SOCIAL' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function PlayerAchievementJournalPanel() {
  const [filter, setFilter] = useState<FilterType>('all')
  const [, forceUpdate] = useState(0)

  const refresh = useCallback(() => forceUpdate(n => n + 1), [])

  const allEntries = getJournalEntries()
  const entries = filter === 'all'
    ? allEntries
    : getJournalEntriesByType(filter as JournalEntryType)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0d0d0f',
      fontFamily: 'monospace',
      color: '#ccc',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid #1e1e1e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#e8c88a' }}>
            ADVENTURE LOG
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
            {allEntries.length} {allEntries.length === 1 ? 'entry' : 'entries'} recorded
          </div>
        </div>
        <button
          onClick={refresh}
          title="Refresh"
          style={{
            background: 'transparent',
            border: '1px solid #2a2a2a',
            color: '#555',
            fontSize: 10,
            padding: '3px 7px',
            cursor: 'pointer',
            borderRadius: 3,
            fontFamily: 'monospace',
          }}
        >
          ↻
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        padding: '8px 10px',
        borderBottom: '1px solid #1a1a1a',
      }}>
        {FILTER_TABS.map(tab => {
          const active = filter === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                background: active ? 'rgba(232,200,138,0.12)' : 'transparent',
                border: `1px solid ${active ? '#e8c88a' : '#2a2a2a'}`,
                color: active ? '#e8c88a' : '#555',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.8,
                padding: '3px 7px',
                cursor: 'pointer',
                borderRadius: 3,
                fontFamily: 'monospace',
                transition: 'all 0.12s',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Entry list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '6px 10px',
      }}>
        {entries.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#333',
            fontSize: 11,
            marginTop: 40,
            letterSpacing: 1,
          }}>
            No entries yet.
          </div>
        ) : (
          entries.map(entry => {
            const typeColor = TYPE_COLOR[entry.type]
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '8px 10px',
                  marginBottom: 4,
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 4,
                  borderLeft: entry.highlight
                    ? '3px solid rgba(218,165,32,0.55)'
                    : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.045)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'
                }}
              >
                {/* Icon */}
                <div style={{
                  fontSize: 18,
                  lineHeight: '1',
                  marginTop: 2,
                  flexShrink: 0,
                  width: 22,
                  textAlign: 'center',
                }}>
                  {entry.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: typeColor,
                      letterSpacing: 0.5,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {entry.title}
                    </span>
                    {entry.highlight && (
                      <span style={{
                        fontSize: 8,
                        color: 'rgba(218,165,32,0.8)',
                        border: '1px solid rgba(218,165,32,0.35)',
                        borderRadius: 2,
                        padding: '0 4px',
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}>
                        NOTABLE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4 }}>
                    {entry.description}
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 4,
                    alignItems: 'center',
                  }}>
                    <span style={{
                      fontSize: 8,
                      color: typeColor,
                      opacity: 0.7,
                      border: `1px solid ${typeColor}33`,
                      borderRadius: 2,
                      padding: '0 4px',
                      letterSpacing: 0.8,
                    }}>
                      {TYPE_LABEL[entry.type]}
                    </span>
                    <span style={{ fontSize: 8, color: '#3a3a3a' }}>
                      {formatDay(entry.timestamp)}
                    </span>
                    {entry.value !== undefined && (
                      <span style={{ fontSize: 8, color: '#555' }}>
                        {entry.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
