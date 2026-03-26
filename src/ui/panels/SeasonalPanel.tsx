// ── SeasonalPanel.tsx ─────────────────────────────────────────────────────────
// M53 Track A: Seasonal Events Panel
// Shows current season bonus, active seasonal events, and recent history.

import React, { useState, useEffect } from 'react'
import { useSeasonStore } from '../../store/seasonStore'
import {
  getCurrentSeasonalBonus,
  getActiveSeasonalEvents,
  getSeasonalEventHistory,
  type SeasonalEvent,
} from '../../game/SeasonalEventSystem'
import { useGameStore } from '../../store/gameStore'

// ── Season colour accents ─────────────────────────────────────────────────────

const SEASON_COLOR: Record<string, string> = {
  SPRING: '#5ec96e',
  SUMMER: '#e6b93a',
  AUTUMN: '#d4703a',
  WINTER: '#5ea8cd',
}

function seasonColor(season: string): string {
  return SEASON_COLOR[season.toUpperCase()] ?? '#888'
}

// ── Time remaining formatter ──────────────────────────────────────────────────

function formatTimeRemaining(event: SeasonalEvent, simSeconds: number): string {
  const remaining = Math.max(0, event.startedAt + event.duration - simSeconds)
  if (remaining <= 0) return 'Expired'
  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SeasonalPanel() {
  const season       = useSeasonStore(s => s.season)
  const simSeconds   = useGameStore(s => s.simSeconds)
  const [, refresh]  = useState(0)

  // Re-render every second so time-remaining countdown updates
  useEffect(() => {
    const id = setInterval(() => refresh(n => n + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  const bonus        = getCurrentSeasonalBonus()
  const activeEvents = getActiveSeasonalEvents()
  const history      = getSeasonalEventHistory().slice(0, 5)
  const accentColor  = seasonColor(season)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Current season card ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 16px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        border: `1px solid ${accentColor}44`,
        gap: 8,
      }}>
        <span style={{
          fontSize: 9,
          color: '#555',
          fontFamily: 'monospace',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}>
          Current Season
        </span>
        <span style={{ fontSize: 42, lineHeight: 1.2 }}>{bonus.icon}</span>
        <span style={{
          fontSize: 18,
          color: accentColor,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          {bonus.name}
        </span>
        <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', textAlign: 'center' }}>
          {bonus.description}
        </span>
      </div>

      {/* ── Season bonuses ──────────────────────────────────────────────────── */}
      <div>
        <div style={{
          fontSize: 9,
          color: '#555',
          fontFamily: 'monospace',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Active Bonuses
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bonus.effects.map((effect, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                border: '1px solid #1e1e1e',
              }}
            >
              <span style={{ color: accentColor, fontSize: 10 }}>▸</span>
              <span style={{ fontSize: 11, color: '#ccc', fontFamily: 'monospace' }}>
                {effect}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Active seasonal events ──────────────────────────────────────────── */}
      <div>
        <div style={{
          fontSize: 9,
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
            padding: '16px 12px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px dashed #2a2a2a',
            textAlign: 'center',
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 11,
          }}>
            No seasonal events active
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeEvents.map(ev => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  border: `1px solid ${accentColor}33`,
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{ev.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#ddd', fontFamily: 'monospace', fontWeight: 700 }}>
                    {ev.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#666', fontFamily: 'monospace', marginTop: 2 }}>
                    {ev.description}
                  </div>
                </div>
                <div style={{
                  fontSize: 10,
                  color: accentColor,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}>
                  {formatTimeRemaining(ev, simSeconds)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent event history ────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div>
          <div style={{
            fontSize: 9,
            color: '#555',
            fontFamily: 'monospace',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Recent Events
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map(ev => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 6,
                  border: '1px solid #1a1a1a',
                  opacity: 0.7,
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{ev.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
                    {ev.name}
                  </span>
                </div>
                <span style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', flexShrink: 0 }}>
                  {ev.season}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
