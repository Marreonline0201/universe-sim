// ── JournalPanel ───────────────────────────────────────────────────────────────
// M51 Track A: Player journal — browse auto-recorded diary entries.

import { useState, useEffect } from 'react'
import {
  getJournalEntries,
  getEntriesByCategory,
  clearJournal,
  type JournalEntry,
} from '../../game/JournalSystem'

type FilterTab = 'all' | JournalEntry['category']

const TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all',         label: 'All' },
  { id: 'combat',      label: 'Combat' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'crafting',    label: 'Crafting' },
  { id: 'social',      label: 'Social' },
  { id: 'milestone',   label: 'Milestone' },
  { id: 'survival',    label: 'Survival' },
]

const CATEGORY_COLOR: Record<JournalEntry['category'], string> = {
  combat:      '#ef4444',
  exploration: '#4ade80',
  crafting:    '#facc15',
  social:      '#a78bfa',
  milestone:   '#f59e0b',
  survival:    '#e91e63',
}

function relativeTime(ts: number): string {
  const elapsed = Math.floor((Date.now() - ts) / 1000)
  if (elapsed < 5)  return 'just now'
  if (elapsed < 60) return `${elapsed}s ago`
  const mins = Math.floor(elapsed / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function JournalPanel() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [, setTick] = useState(0)

  // Refresh timestamps every 15 seconds
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  const allEntries = getJournalEntries()
  const filtered: JournalEntry[] = activeTab === 'all'
    ? allEntries
    : getEntriesByCategory(activeTab as JournalEntry['category'])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Entry count subheader */}
      <div style={{
        fontSize: 9,
        color: '#444',
        fontFamily: 'monospace',
        marginBottom: 10,
      }}>
        {allEntries.length} {allEntries.length === 1 ? 'entry' : 'entries'} recorded
      </div>

      {/* Category filter tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 12,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const color = tab.id === 'all' ? '#cd4420' : CATEGORY_COLOR[tab.id as JournalEntry['category']]
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '3px 8px',
                fontSize: 9,
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 3,
                background: isActive ? `${color}22` : 'transparent',
                color: isActive ? color : '#666',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#aaa'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#666'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Scrollable entry list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 ? (
          <div style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 11,
            textAlign: 'center',
            padding: '40px 16px',
          }}>
            No journal entries yet. Go explore!
          </div>
        ) : (
          filtered.map(entry => {
            const catColor = CATEGORY_COLOR[entry.category] ?? '#888'
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '7px 10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: `3px solid ${catColor}44`,
                  borderRadius: 4,
                }}
              >
                {/* Icon */}
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                  {entry.icon}
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 2,
                  }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: 11,
                      color: '#ddd',
                    }}>
                      {entry.title}
                    </span>
                    <span style={{
                      fontSize: 8,
                      color: '#444',
                      fontFamily: 'monospace',
                      flexShrink: 0,
                    }}>
                      {relativeTime(entry.timestamp)}
                    </span>
                  </div>

                  {/* Body text */}
                  <div style={{
                    fontSize: 10,
                    color: '#666',
                    lineHeight: 1.4,
                    marginBottom: 3,
                  }}>
                    {entry.body}
                  </div>

                  {/* Category badge */}
                  <div style={{
                    fontSize: 7,
                    color: catColor,
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    opacity: 0.7,
                  }}>
                    {entry.category}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Clear Journal button */}
      <div style={{ paddingTop: 12, borderTop: '1px solid #1a1a1a', marginTop: 8, flexShrink: 0 }}>
        <button
          onClick={() => { clearJournal(); setTick(t => t + 1) }}
          style={{
            width: '100%',
            padding: '6px 0',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
            color: '#666',
            fontSize: 10,
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#ef4444'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
            e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = '#666'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
        >
          Clear Journal
        </button>
      </div>
    </div>
  )
}
