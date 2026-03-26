// src/ui/panels/WorldThreatPanel.tsx
// M55 Track C: Displays active world threats aggregated from multiple systems.

import { useState, useEffect } from 'react'
import {
  getThreats,
  clearExpiredThreats,
  THREAT_LEVEL_COLOR,
  type WorldThreat,
} from '../../game/WorldThreatSystem'

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  if (elapsed < 60) return `${elapsed}s ago`
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`
  return `${Math.floor(elapsed / 3600)}h ago`
}

// ── ThreatCard ─────────────────────────────────────────────────────────────────

interface ThreatCardProps {
  threat: WorldThreat
}

function ThreatCard({ threat }: ThreatCardProps) {
  const borderColor = THREAT_LEVEL_COLOR[threat.level]
  return (
    <div style={{
      background: 'rgba(20,20,20,0.85)',
      border: '1px solid #2a2a2a',
      borderLeft: `2px solid ${borderColor}`,
      borderRadius: 5,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      {/* Row 1: icon + title + level badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{threat.icon}</span>
        <span style={{
          flex: 1,
          color: '#ddd',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
        }}>
          {threat.title}
        </span>
        <span style={{
          background: `${borderColor}22`,
          border: `1px solid ${borderColor}66`,
          borderRadius: 3,
          color: borderColor,
          fontFamily: 'monospace',
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 5px',
          letterSpacing: 0.5,
        }}>
          {threat.level.toUpperCase()}
        </span>
      </div>

      {/* Row 2: detail + time ago */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        {threat.detail ? (
          <span style={{
            color: '#666',
            fontFamily: 'monospace',
            fontSize: 10,
            flex: 1,
            lineHeight: '1.4',
          }}>
            {threat.detail}
          </span>
        ) : <span />}
        <span style={{
          color: '#444',
          fontFamily: 'monospace',
          fontSize: 10,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {timeAgo(threat.startedAt)}
        </span>
      </div>
    </div>
  )
}

// ── WorldThreatPanel ───────────────────────────────────────────────────────────

const THREAT_EVENTS = [
  'siege-started',
  'siege-resolved',
  'faction-war-started',
  'faction-war-resolved',
  'weather-changed',
  'seasonal-event',
] as const

export function WorldThreatPanel() {
  const [, setTick] = useState(0)

  useEffect(() => {
    function refresh() {
      clearExpiredThreats()
      setTick(t => t + 1)
    }

    THREAT_EVENTS.forEach(evt => window.addEventListener(evt, refresh))
    const intervalId = setInterval(refresh, 5_000)

    return () => {
      THREAT_EVENTS.forEach(evt => window.removeEventListener(evt, refresh))
      clearInterval(intervalId)
    }
  }, [])

  const threats = getThreats()

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 1.5,
          marginBottom: 3,
        }}>
          WORLD THREATS
        </div>
        <div style={{ color: '#555', fontSize: 10, letterSpacing: 0.5 }}>
          Active dangers in the world
        </div>
      </div>

      {/* Threat list or empty state */}
      {threats.length === 0 ? (
        <div style={{
          color: '#444',
          fontSize: 12,
          fontStyle: 'italic',
          textAlign: 'center',
          padding: '32px 0',
        }}>
          No active threats detected.
        </div>
      ) : (
        threats.map(threat => (
          <ThreatCard key={threat.id} threat={threat} />
        ))
      )}
    </div>
  )
}
