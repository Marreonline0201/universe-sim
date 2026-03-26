// ── BuildingAnnouncementHUD.tsx ──────────────────────────────────────────────
// M36 Track C: Shows "Settlement built a new [Building]!" announcements
// when a building reaches 100% completion. Auto-dismisses after 6 seconds.

import { useEffect } from 'react'
import { useBuildingStore } from '../store/buildingStore'

export function BuildingAnnouncementHUD() {
  const announcements = useBuildingStore(s => s.announcements)
  const dismiss       = useBuildingStore(s => s.dismissAnnouncement)

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (announcements.length === 0) return
    const oldest = announcements[0]
    const age = Date.now() - oldest.timestamp
    const remaining = Math.max(0, 6000 - age)
    const timer = setTimeout(() => dismiss(oldest.id), remaining)
    return () => clearTimeout(timer)
  }, [announcements, dismiss])

  if (announcements.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 900,
      pointerEvents: 'none',
    }}>
      {announcements.map(a => (
        <div
          key={a.id}
          style={{
            padding: '10px 20px',
            background: 'rgba(0,0,0,0.88)',
            border: '1px solid rgba(205,136,32,0.6)',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 13,
            color: '#cd8820',
            textAlign: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
            animation: 'fadeInDown 0.3s ease',
          }}
        >
          🏗 <strong>{a.settlementName}</strong> built a new <strong>{a.buildingName}</strong>!
        </div>
      ))}
    </div>
  )
}
