// ── DiplomacyHUD.tsx ──────────────────────────────────────────────────────
// M11 Track C: Diplomacy notification banner.
//
// Shows recent diplomatic events (war declarations, peace treaties, mayor
// appointments, envoy arrivals) as slide-in banners at the top of the screen.
//
// War events briefly tint the border red (affected settlements at war).
// Peace events show a green tint.
// Mayor appointments show the settlement name + mayor NPC name.

import React, { useEffect } from 'react'
import { useDiplomacyStore } from '../store/diplomacyStore'
import type { DiplomacyNotification } from '../store/diplomacyStore'

const TYPE_CONFIG: Record<DiplomacyNotification['type'], { color: string; icon: string; border: string }> = {
  war:   { color: '#e74c3c', icon: 'x', border: 'rgba(231,76,60,0.4)' },
  peace: { color: '#2ecc71', icon: 'o', border: 'rgba(46,204,113,0.4)' },
  envoy: { color: '#3498db', icon: '~', border: 'rgba(52,152,219,0.3)' },
  mayor: { color: '#f39c12', icon: '*', border: 'rgba(243,156,18,0.3)' },
}

function NotificationBanner({ notification }: { notification: DiplomacyNotification }) {
  const { type, message, timestamp } = notification
  const cfg = TYPE_CONFIG[type]
  const age = Math.floor((Date.now() - timestamp) / 1000)
  const markRead = useDiplomacyStore((s) => s.markRead)

  return (
    <div
      onClick={() => markRead(notification.id)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 14px',
        background: 'rgba(8,12,20,0.92)',
        border: `1px solid ${cfg.border}`,
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: 4,
        marginBottom: 6,
        cursor: 'pointer',
        maxWidth: 380,
        backdropFilter: 'blur(4px)',
        fontFamily: 'monospace',
      }}
    >
      <span style={{ color: cfg.color, fontSize: 14, flexShrink: 0, marginTop: 1 }}>
        [{cfg.icon}]
      </span>
      <div>
        <div style={{ fontSize: 12, color: '#c0ccd8', lineHeight: 1.4 }}>{message}</div>
        <div style={{ fontSize: 10, color: '#3a5a7a', marginTop: 3 }}>
          {age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`}
        </div>
      </div>
    </div>
  )
}

export function DiplomacyHUD() {
  const notifications = useDiplomacyStore((s) => s.notifications)
  const clearOld = useDiplomacyStore((s) => s.clearOld)
  const unread = notifications.filter((n) => !n.read)

  // Auto-clear old notifications every 30s
  useEffect(() => {
    const id = setInterval(clearOld, 30_000)
    return () => clearInterval(id)
  }, [clearOld])

  if (unread.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 16,
      zIndex: 190,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      pointerEvents: 'all',
    }}>
      {/* Header */}
      <div style={{
        fontSize: 9,
        color: '#3a5a7a',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 6,
        fontFamily: 'monospace',
      }}>
        Diplomatic Events
      </div>

      {/* Show last 4 unread */}
      {unread.slice(0, 4).map((n) => (
        <NotificationBanner key={n.id} notification={n} />
      ))}

      {unread.length > 4 && (
        <div style={{ fontSize: 10, color: '#2a4a6a', fontFamily: 'monospace' }}>
          +{unread.length - 4} more — click to dismiss
        </div>
      )}
    </div>
  )
}
