// ── WorldEventsPanel ─────────────────────────────────────────────────────────
// M48 Track C: Scrollable feed of notable world events with category filtering.

import { useState } from 'react'
import { useWorldEventStore, type WorldEventCategory } from '../../store/worldEventStore'

type FilterTab = 'all' | WorldEventCategory

const TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all',         label: 'All' },
  { id: 'combat',      label: 'Combat' },
  { id: 'weather',     label: 'Weather' },
  { id: 'settlement',  label: 'Settlement' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'crafting',    label: 'Crafting' },
  { id: 'social',      label: 'Social' },
]

const CATEGORY_COLOR: Record<WorldEventCategory, string> = {
  combat:      '#ef4444',
  weather:     '#38bdf8',
  settlement:  '#f97316',
  exploration: '#4ade80',
  crafting:    '#facc15',
  social:      '#a78bfa',
}

function relativeTime(ts: number): string {
  const elapsed = Math.floor((Date.now() - ts) / 1000)
  if (elapsed < 5)  return 'just now'
  if (elapsed < 60) return `${elapsed}s ago`
  const mins = Math.floor(elapsed / 60)
  if (mins < 60)    return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

export function WorldEventsPanel() {
  const events = useWorldEventStore(s => s.events)
  const clearEvents = useWorldEventStore(s => s.clearEvents)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const filtered = activeTab === 'all' ? events : events.filter(e => e.category === activeTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Category filter tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 12,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const color = tab.id === 'all' ? '#cd4420' : CATEGORY_COLOR[tab.id as WorldEventCategory]
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

      {/* Event count */}
      <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', marginBottom: 8 }}>
        {filtered.length} event{filtered.length !== 1 ? 's' : ''} {activeTab !== 'all' ? `· filtered by ${activeTab}` : ''}
      </div>

      {/* Scrollable event list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 ? (
          <div style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 11,
            textAlign: 'center',
            padding: '40px 16px',
          }}>
            No events recorded yet.
          </div>
        ) : (
          filtered.map(ev => {
            const catColor = CATEGORY_COLOR[ev.category] ?? '#888'
            return (
              <div
                key={ev.id}
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
                  {ev.icon}
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
                      {ev.title}
                    </span>
                    <span style={{
                      fontSize: 8,
                      color: '#444',
                      fontFamily: 'monospace',
                      flexShrink: 0,
                    }}>
                      {relativeTime(ev.timestamp)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: '#666',
                    lineHeight: 1.3,
                  }}>
                    {ev.detail}
                  </div>
                  {/* Category badge */}
                  <div style={{
                    marginTop: 3,
                    fontSize: 7,
                    color: catColor,
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    opacity: 0.7,
                  }}>
                    {ev.category}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Clear Log button */}
      <div style={{ paddingTop: 12, borderTop: '1px solid #1a1a1a', marginTop: 8, flexShrink: 0 }}>
        <button
          onClick={clearEvents}
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
          Clear Log
        </button>
      </div>
    </div>
  )
}
