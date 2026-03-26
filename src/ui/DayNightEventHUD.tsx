// ── DayNightEventHUD.tsx ──────────────────────────────────────────────────────
// M52 Track C: Displays active day/night events as floating badges in the
// top-right of the screen. Max 3 shown (most recent first). Fades out on expiry.

import { useEffect, useState, useCallback } from 'react'
import { getActiveEvents, type DayNightEvent } from '../game/DayNightEventSystem'

const MAX_VISIBLE = 3

export function DayNightEventHUD() {
  const [events, setEvents] = useState<DayNightEvent[]>([])

  const refresh = useCallback(() => {
    const active = getActiveEvents()
    // Most recent first, cap at MAX_VISIBLE
    setEvents([...active].reverse().slice(0, MAX_VISIBLE))
  }, [])

  useEffect(() => {
    window.addEventListener('daynight-event', refresh)
    window.addEventListener('daynight-event-expired', refresh)
    return () => {
      window.removeEventListener('daynight-event', refresh)
      window.removeEventListener('daynight-event-expired', refresh)
    }
  }, [refresh])

  if (events.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        right: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: 900,
        pointerEvents: 'none',
      }}
    >
      {events.map(ev => (
        <EventBadge key={ev.id} event={ev} />
      ))}
    </div>
  )
}

interface EventBadgeProps {
  event: DayNightEvent
}

function EventBadge({ event }: EventBadgeProps) {
  return (
    <div
      title={`${event.description}\nEffect: ${event.effect}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        padding: '5px 10px',
        backdropFilter: 'blur(6px)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: 0.2,
        maxWidth: 200,
        animation: 'daynight-fadein 0.35s ease',
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{event.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.title}
      </span>
    </div>
  )
}
