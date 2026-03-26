// src/ui/panels/WeatherEventsPanel.tsx
// M59 Track A: Live weather events panel.
// Shows active events with time-remaining progress bars and a recent-events log.

import React, { useState, useEffect } from 'react'
import {
  getActiveWeatherEvents,
  weatherEventLog,
  type ActiveWeatherEvent,
} from '../../game/WeatherEventSystem'
import { useGameStore } from '../../store/gameStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s <= 0) return '0s'
  if (s < 60) return `${Math.ceil(s)}s`
  return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ActiveCardProps {
  ae: ActiveWeatherEvent
  simNow: number
}

function ActiveCard({ ae, simNow }: ActiveCardProps) {
  const remaining  = Math.max(0, ae.endsAt - simNow)
  const total      = ae.endsAt - ae.startedAt
  const pct        = total > 0 ? Math.min(100, (remaining / total) * 100) : 0
  const urgent     = pct < 25

  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 8,
      border: `1px solid ${urgent ? 'rgba(205,68,32,0.5)' : '#2a2a2a'}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{ae.event.icon}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#ddd' }}>
            {ae.event.name}
          </span>
        </div>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: urgent ? '#cd4420' : '#888',
          fontWeight: 700,
        }}>
          {fmtSeconds(remaining)}
        </span>
      </div>

      {/* Description */}
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#666', lineHeight: 1.5 }}>
        {ae.event.description}
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: 4,
        background: '#1a1a1a',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: urgent ? '#cd4420' : '#2ecc71',
          borderRadius: 2,
          transition: 'width 1s linear',
        }} />
      </div>
    </div>
  )
}

// ── Event log entry ───────────────────────────────────────────────────────────

interface LogEntryProps {
  icon: string
  name: string
  endedAt: number
}

function LogEntry({ icon, name, endedAt }: LogEntryProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 6,
      border: '1px solid #1e1e1e',
      opacity: 0.6,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, filter: 'grayscale(1)' }}>{icon}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666', flex: 1 }}>{name}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#444' }}>
        @{Math.floor(endedAt)}s
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function WeatherEventsPanel() {
  const simSeconds = useGameStore(s => s.simSeconds)
  const [, forceUpdate] = useState(0)
  const [activeEvents, setActiveEvents] = useState<ActiveWeatherEvent[]>([])

  // Real-time update on custom events + 5s interval fallback
  useEffect(() => {
    function refresh() {
      setActiveEvents([...getActiveWeatherEvents()])
      forceUpdate(n => n + 1)
    }

    window.addEventListener('weather-event-started', refresh)
    window.addEventListener('weather-event-ended', refresh)

    const interval = setInterval(refresh, 5_000)

    // Initial sync
    refresh()

    return () => {
      window.removeEventListener('weather-event-started', refresh)
      window.removeEventListener('weather-event-ended', refresh)
      clearInterval(interval)
    }
  }, [])

  const recentLog = weatherEventLog.slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Active Events ── */}
      <section>
        <div style={{
          fontSize: 10,
          color: '#555',
          fontFamily: 'monospace',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Active Events
        </div>

        {activeEvents.length === 0 ? (
          <div style={{
            padding: '20px 12px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px dashed #2a2a2a',
            textAlign: 'center',
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 12,
          }}>
            No active weather events
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeEvents.map(ae => (
              <ActiveCard key={ae.id} ae={ae} simNow={simSeconds} />
            ))}
          </div>
        )}
      </section>

      {/* ── Recent Events ── */}
      <section>
        <div style={{
          fontSize: 10,
          color: '#555',
          fontFamily: 'monospace',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Recent Events
        </div>

        {recentLog.length === 0 ? (
          <div style={{
            padding: '12px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px dashed #1e1e1e',
            textAlign: 'center',
            color: '#333',
            fontFamily: 'monospace',
            fontSize: 11,
          }}>
            None yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentLog.map((entry, i) => (
              <LogEntry
                key={`${entry.eventId}-${i}`}
                icon={entry.icon}
                name={entry.name}
                endedAt={entry.endedAt}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
