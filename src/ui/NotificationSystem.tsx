// ── NotificationSystem ─────────────────────────────────────────────────────────
// Bottom-right toast stack. Auto-dismisses after 4 s (set in uiStore).
// Also renders a cinematic WANTED banner when a bounty is posted (M7 T2).

import { useEffect, useState } from 'react'
import { useUiStore, type Notification } from '../store/uiStore'
// outlawStore removed

const TYPE_COLORS: Record<Notification['type'], string> = {
  info:      '#3498db',
  discovery: '#1abc9c',
  warning:   '#f39c12',
  error:     '#e74c3c',
}

const TYPE_ICONS: Record<Notification['type'], string> = {
  info:      'ℹ',
  discovery: '✦',
  warning:   '⚠',
  error:     '✕',
}

function Toast({ notif }: { notif: Notification }) {
  const dismiss = useUiStore(s => s.dismissNotification)
  const color = TYPE_COLORS[notif.type]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 14px',
        background: 'rgba(14,14,14,0.95)',
        border: `1px solid #2a2a2a`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 2,
        animation: 'slideInRight 0.2s ease-out',
        cursor: 'pointer',
        maxWidth: 320,
      }}
      onClick={() => dismiss(notif.id)}
    >
      <span style={{ color, fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>
        {TYPE_ICONS[notif.type]}
      </span>
      <span style={{ fontSize: 12, color: '#ddd', fontFamily: 'monospace', lineHeight: 1.4 }}>
        {notif.message}
      </span>
    </div>
  )
}

// BountyBanner removed (OutlawSystem deleted)

export function NotificationSystem() {
  const notifications = useUiStore(s => s.notifications)

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes bountySlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 16,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 6,
        zIndex: 300,
        pointerEvents: 'auto',
        alignItems: 'flex-end',
      }}>
        {notifications.map(n => <Toast key={n.id} notif={n} />)}
      </div>
    </>
  )
}
