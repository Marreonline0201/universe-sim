// ── NotificationSystem ─────────────────────────────────────────────────────────
// Bottom-right toast stack. Auto-dismisses after 4 s (set in uiStore).
// Also renders a cinematic WANTED banner when a bounty is posted (M7 T2).

import { useEffect, useState } from 'react'
import { useUiStore, type Notification } from '../store/uiStore'
import { useOutlawStore } from '../store/outlawStore'

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

// ── Bounty Banner — cinematic WANTED overlay ──────────────────────────────────

function BountyBanner() {
  const pendingNotif         = useOutlawStore(s => s.pendingBountyNotif)
  const setPendingBountyNotif = useOutlawStore(s => s.setPendingBountyNotif)
  const [visible, setVisible]  = useState(false)
  const [entry, setEntry]      = useState(pendingNotif)

  useEffect(() => {
    if (!pendingNotif) return
    setEntry(pendingNotif)
    setVisible(true)
    // Clear after 5 seconds
    const t = setTimeout(() => {
      setVisible(false)
      setPendingBountyNotif(null)
    }, 5000)
    return () => clearTimeout(t)
  }, [pendingNotif, setPendingBountyNotif])

  if (!visible || !entry) return null

  return (
    <div
      style={{
        position:    'fixed',
        top:         '18%',
        left:        '50%',
        transform:   'translateX(-50%)',
        zIndex:      8000,
        pointerEvents: 'none',
        textAlign:   'center',
        fontFamily:  'monospace',
        animation:   'bountySlideIn 0.4s ease-out',
      }}
    >
      <div style={{
        background:   'rgba(120, 10, 10, 0.94)',
        border:       '2px solid rgba(255, 60, 60, 0.8)',
        borderRadius: 4,
        padding:      '14px 40px',
        boxShadow:    '0 0 60px rgba(200, 20, 20, 0.7)',
      }}>
        <div style={{ fontSize: 11, color: '#ff9999', letterSpacing: 5, marginBottom: 4 }}>
          OUTLAW ALERT
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#ffd700', letterSpacing: 4 }}>
          WANTED: {entry.username}
        </div>
        <div style={{ fontSize: 13, color: '#ffaaaa', letterSpacing: 2, marginTop: 6 }}>
          {entry.murderCount} KILLS &nbsp;|&nbsp; {entry.reward} COPPER BOUNTY
        </div>
        <div style={{ fontSize: 10, color: '#cc8888', letterSpacing: 1, marginTop: 4 }}>
          NPC guards attack on sight. Other players may claim the reward.
        </div>
      </div>
    </div>
  )
}

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
      <BountyBanner />
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
