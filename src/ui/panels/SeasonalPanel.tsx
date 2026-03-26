// SeasonalPanel.tsx -- M64 Track A (upgraded from M53)
// Shows current season card, active event, season history, upcoming seasons.

import React, { useState, useEffect } from 'react'
import {
  getCurrentSeason,
  getSeasonProgress,
  getActiveSeasonalEvent,
  getEventProgress,
  getSeasonHistory,
  getUpcomingSeasons,
  getCurrentSeasonalBonus,
  getActiveSeasonalEvents,
  SEASON_DURATION,
} from '../../game/SeasonalEventSystem'

const SEASON_COLOR: Record<string, string> = {
  spring: '#4ade80',
  summer: '#fbbf24',
  autumn: '#f97316',
  winter: '#93c5fd',
}

function seasonColor(season: string): string {
  return SEASON_COLOR[season.toLowerCase()] ?? '#888'
}

function formatSecs(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  if (m > 0) return m + 'm ' + r + 's'
  return r + 's'
}

export function SeasonalPanel() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 5_000)
    const h1 = () => setTick(n => n + 1)
    window.addEventListener('season-changed', h1)
    window.addEventListener('seasonal-event-started', h1)
    window.addEventListener('seasonal-event-ended', h1)
    window.addEventListener('seasonal-change', h1)
    return () => {
      clearInterval(id)
      window.removeEventListener('season-changed', h1)
      window.removeEventListener('seasonal-event-started', h1)
      window.removeEventListener('seasonal-event-ended', h1)
      window.removeEventListener('seasonal-change', h1)
    }
  }, [])

  void tick // used for reactivity

  const season = getCurrentSeason()
  const progress = getSeasonProgress()
  const activeEvent = getActiveSeasonalEvent()
  const eventProgress = getEventProgress()
  const history = getSeasonHistory().slice(0, 5)
  const upcoming = getUpcomingSeasons()
  const bonus = getCurrentSeasonalBonus()
  const legacyEvents = getActiveSeasonalEvents()
  const accentColor = seasonColor(season)
  const timeUntilNext = Math.max(0, SEASON_DURATION - progress)

  const SEASON_ICONS: Record<string, string> = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Current season card */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid ' + accentColor + '44', gap: 8 }}>
        <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase' }}>Current Season</span>
        <span style={{ fontSize: 48, lineHeight: 1 }}>{SEASON_ICONS[season] ?? bonus.icon}</span>
        <span style={{ fontSize: 20, color: accentColor, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1 }}>{bonus.name}</span>
        <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', textAlign: 'center' }}>{bonus.description}</span>
        <div style={{ width: "100%", marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>Season Progress</span>
            <span style={{ fontSize: 9, color: accentColor, fontFamily: 'monospace' }}>{formatSecs(timeUntilNext)} until next season</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: (progress / SEASON_DURATION * 100) + "%", background: accentColor, borderRadius: 3, transition: "width 1s linear" }} />
          </div>
        </div>
      </div>

      {/* Active event card */}
      {activeEvent !== null && (
        <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid ' + accentColor + '55' }}>
          <div style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Active Event</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32, flexShrink: 0 }}>{activeEvent.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: '#ddd', fontFamily: 'monospace', fontWeight: 700 }}>{activeEvent.name}</div>
              <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', marginTop: 2 }}>{activeEvent.description}</div>
              <div style={{ fontSize: 10, color: accentColor, fontFamily: 'monospace', marginTop: 4 }}>{activeEvent.effect}</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>Time Remaining</span>
              <span style={{ fontSize: 9, color: accentColor, fontFamily: 'monospace' }}>{formatSecs(Math.max(0, activeEvent.duration - eventProgress))}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: (Math.max(0, 1 - eventProgress / activeEvent.duration) * 100) + "%", background: accentColor, borderRadius: 2, transition: "width 1s linear" }} />
            </div>
          </div>
        </div>
      )}

      {/* Legacy events fallback */}
      {activeEvent === null && legacyEvents.length > 0 && (
        <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid #2a2a2a' }}>
          <div style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Active Events</div>
          {legacyEvents.map(ev => (
            <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <span style={{ fontSize: 20 }}>{ev.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#ddd", fontFamily: "monospace", fontWeight: 700 }}>{ev.name}</div>
                <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>{ev.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Season history */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Season History</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid " + seasonColor(h.season) + "33" }}>
                <span style={{ fontSize: 12 }}>{SEASON_ICONS[h.season] ?? h.season}</span>
                <span style={{ fontSize: 9, color: seasonColor(h.season), fontFamily: "monospace", textTransform: "capitalize" }}>{h.season}</span>
                {h.event && <span style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>• event</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming seasons */}
      <div>
        <div style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Upcoming Seasons</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {upcoming.map((s, i) => (
            <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid " + seasonColor(s) + "22", opacity: 1 - i * 0.2 }}>
              <span style={{ fontSize: 18 }}>{SEASON_ICONS[s]}</span>
              <span style={{ fontSize: 9, color: seasonColor(s), fontFamily: "monospace", textTransform: "capitalize" }}>{s}</span>
              <span style={{ fontSize: 8, color: "#444", fontFamily: "monospace" }}>in {formatSecs((i + 1) * SEASON_DURATION - progress)}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}