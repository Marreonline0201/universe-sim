// src/ui/panels/WorldEventSchedulerPanel.tsx
// M66 Track A: World Event Calendar — upcoming scheduled events with countdowns.

import { useState, useEffect, useCallback } from 'react'
import { useGameStore } from '../../store/gameStore'
import {
  getScheduledEvents,
  getActiveScheduledEvents,
  type ScheduledWorldEvent,
  type ScheduledEventCategory,
} from '../../game/WorldEventSchedulerSystem'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<ScheduledEventCategory, string> = {
  invasion:     '#ef4444',
  festival:     '#f0c040',
  eclipse:      '#a78bfa',
  migration:    '#34d399',
  storm:        '#60a5fa',
  trade_convoy: '#fb923c',
}

const CATEGORY_LABEL: Record<ScheduledEventCategory, string> = {
  invasion:     'INVASION',
  festival:     'FESTIVAL',
  eclipse:      'ECLIPSE',
  migration:    'MIGRATION',
  storm:        'STORM',
  trade_convoy: 'CONVOY',
}

const PAST_LIMIT = 5
const POLL_MS    = 3_000

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(secsRemaining: number): string {
  if (secsRemaining <= 0) return 'NOW'
  const m = Math.floor(secsRemaining / 60)
  const s = Math.floor(secsRemaining % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  if (m < 1) return `${secs}s`
  return `${m}m`
}

// ── EventRow ──────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: ScheduledWorldEvent
  simSeconds: number
  isActive?: boolean
  isPast?: boolean
}

function EventRow({ event, simSeconds, isActive = false, isPast = false }: EventRowProps) {
  const color = CATEGORY_COLOR[event.category]
  const catLabel = CATEGORY_LABEL[event.category]

  const secsUntil = event.scheduledAt - simSeconds
  const secsLeft  = event.active ? (event.scheduledAt + event.duration) - simSeconds : 0

  const rowBg = isActive
    ? 'rgba(245,158,11,0.07)'
    : isPast
      ? 'transparent'
      : 'rgba(20,20,20,0.4)'

  const rowBorder = isActive
    ? '1px solid rgba(245,158,11,0.25)'
    : isPast
      ? '1px solid #1a1a1a'
      : '1px solid #222'

  return (
    <div style={{
      background: rowBg,
      border: rowBorder,
      borderLeft: isActive ? '3px solid #f59e0b' : `3px solid ${color}`,
      borderRadius: 5,
      padding: '10px 12px',
      marginBottom: 8,
      opacity: isPast ? 0.45 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Top row: icon + name + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{event.icon}</span>
        <span style={{
          color: isPast ? '#666' : '#ddd',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {event.name}
        </span>

        {/* Category badge */}
        <span style={{
          background: `${color}18`,
          border: `1px solid ${color}44`,
          borderRadius: 3,
          color,
          fontFamily: 'monospace',
          fontSize: 8,
          fontWeight: 700,
          padding: '2px 5px',
          letterSpacing: 0.5,
          flexShrink: 0,
        }}>
          {catLabel}
        </span>

        {/* Duration badge */}
        <span style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid #333',
          borderRadius: 3,
          color: '#666',
          fontFamily: 'monospace',
          fontSize: 8,
          padding: '2px 5px',
          flexShrink: 0,
        }}>
          {formatDuration(event.duration)}
        </span>
      </div>

      {/* Description */}
      <div style={{
        color: isPast ? '#444' : '#666',
        fontFamily: 'monospace',
        fontSize: 10,
        lineHeight: '1.45',
        marginBottom: 6,
      }}>
        {event.description}
      </div>

      {/* Bottom row: countdown / status + prep bonus */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        {/* Countdown / status */}
        <div>
          {isActive ? (
            <span style={{
              color: '#f59e0b',
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: 700,
            }}>
              ACTIVE — ends in {formatCountdown(secsLeft)}
            </span>
          ) : isPast ? (
            <span style={{ color: '#444', fontFamily: 'monospace', fontSize: 10 }}>
              ENDED
            </span>
          ) : (
            <span style={{
              color: secsUntil < 120 ? '#f59e0b' : '#4ade80',
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: 700,
            }}>
              in {formatCountdown(secsUntil)}
            </span>
          )}
        </div>

        {/* Prep bonus tip */}
        {!isPast && (
          <div style={{
            color: '#555',
            fontFamily: 'monospace',
            fontSize: 9,
            lineHeight: '1.4',
            textAlign: 'right',
            maxWidth: 220,
          }}>
            <span style={{ color: '#3b82f6' }}>PREP: </span>
            {event.prepBonus}
          </div>
        )}
      </div>
    </div>
  )
}

// ── WorldEventSchedulerPanel ──────────────────────────────────────────────────

export function WorldEventSchedulerPanel() {
  const simSeconds = useGameStore(s => s.simSeconds)
  const [events, setEvents] = useState<ScheduledWorldEvent[]>(() => getScheduledEvents())

  const refresh = useCallback(() => {
    setEvents([...getScheduledEvents()])
  }, [])

  // React to triggered events
  useEffect(() => {
    function onTriggered() { refresh() }
    window.addEventListener('scheduled-event-triggered', onTriggered)
    return () => window.removeEventListener('scheduled-event-triggered', onTriggered)
  }, [refresh])

  // Periodic poll to update countdown display
  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  // Derive sections
  const activeEvents   = events.filter(e => e.active)
  const upcomingEvents = events
    .filter(e => !e.triggered && !e.active)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
  const pastEvents = events
    .filter(e => e.triggered && !e.active)
    .sort((a, b) => b.scheduledAt - a.scheduledAt)
    .slice(0, PAST_LIMIT)

  const totalUpcoming = upcomingEvents.length

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      {/* Header */}
      <div style={{
        color: '#cd4420',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        marginBottom: 14,
        textTransform: 'uppercase',
      }}>
        World Event Calendar — {totalUpcoming} upcoming
      </div>

      {/* ── Active Events ── */}
      {activeEvents.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <div style={{
            color: '#f59e0b',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1.5,
            marginBottom: 8,
            textTransform: 'uppercase',
          }}>
            ⚡ Active Now ({activeEvents.length})
          </div>
          {activeEvents.map(ev => (
            <EventRow
              key={ev.id}
              event={ev}
              simSeconds={simSeconds}
              isActive
            />
          ))}
        </section>
      )}

      {/* ── Upcoming Events ── */}
      <section style={{ marginBottom: 20 }}>
        <div style={{
          color: '#4ade80',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.5,
          marginBottom: 8,
          textTransform: 'uppercase',
        }}>
          Upcoming Events
        </div>
        {upcomingEvents.length === 0 ? (
          <div style={{
            background: 'rgba(20,20,20,0.6)',
            border: '1px solid #2a2a2a',
            borderRadius: 5,
            padding: '20px 16px',
            textAlign: 'center',
            color: '#444',
            fontSize: 12,
          }}>
            No upcoming events scheduled.
          </div>
        ) : (
          upcomingEvents.map(ev => (
            <EventRow
              key={ev.id}
              event={ev}
              simSeconds={simSeconds}
            />
          ))
        )}
      </section>

      {/* ── Past Events ── */}
      {pastEvents.length > 0 && (
        <section>
          <div style={{
            color: '#444',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1.5,
            marginBottom: 8,
            textTransform: 'uppercase',
          }}>
            Recent History (last {PAST_LIMIT})
          </div>
          {pastEvents.map(ev => (
            <EventRow
              key={ev.id}
              event={ev}
              simSeconds={simSeconds}
              isPast
            />
          ))}
        </section>
      )}
    </div>
  )
}
