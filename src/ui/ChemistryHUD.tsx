/**
 * ChemistryHUD.tsx
 * M18 Track C — Displays active chemistry events near the player.
 * Shows fermentation, acid rain, photosynthesis, and combustion heat
 * as small notification badges in the bottom-left corner.
 */

import { useState, useEffect } from 'react'
import { getRecentChemistryEvents, type ChemistryEvent } from '../game/ChemistryGameplay'

const EVENT_LABELS: Record<ChemistryEvent['type'], { label: string; color: string; icon: string }> = {
  fermentation:    { label: 'Fermentation',    color: '#d4a017', icon: 'F' },
  acid_rain:       { label: 'Acid Rain',       color: '#e74c3c', icon: 'A' },
  photosynthesis:  { label: 'Photosynthesis',  color: '#2ecc71', icon: 'P' },
  combustion_heat: { label: 'Heat Warning',    color: '#e67e22', icon: 'H' },
}

export function ChemistryHUD() {
  const [events, setEvents] = useState<readonly ChemistryEvent[]>([])

  useEffect(() => {
    const id = setInterval(() => {
      const current = getRecentChemistryEvents()
      if (current.length > 0 || events.length > 0) {
        setEvents([...current])
      }
    }, 600)
    return () => clearInterval(id)
  }, [events.length])

  if (events.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: 12,
      zIndex: 40,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      pointerEvents: 'none',
    }}>
      {events.map((evt, i) => {
        const info = EVENT_LABELS[evt.type]
        const barWidth = Math.round(evt.intensity * 100)
        return (
          <div key={`${evt.type}-${i}`} style={{
            background: 'rgba(0,0,0,0.7)',
            border: `1px solid ${info.color}40`,
            borderRadius: 4,
            padding: '3px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#ddd',
            minWidth: 140,
          }}>
            <span style={{
              display: 'inline-block',
              width: 16,
              height: 16,
              lineHeight: '16px',
              textAlign: 'center',
              borderRadius: 3,
              background: info.color,
              color: '#fff',
              fontWeight: 700,
              fontSize: 10,
            }}>
              {info.icon}
            </span>
            <span style={{ flex: 1 }}>{info.label}</span>
            <div style={{
              width: 40,
              height: 4,
              background: '#333',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${barWidth}%`,
                height: '100%',
                background: info.color,
                borderRadius: 2,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
