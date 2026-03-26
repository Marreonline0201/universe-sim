// ── WorldEventHUD.tsx ─────────────────────────────────────────────────────────
// M37 Track A: World event announcement banner + persistent indicator + history.
//
// • WorldEventBanner — full-width banner at top for 5s on event start
// • WorldEventIndicator — compact top-right panel with countdown + participants
// • WorldEventHistoryLog — last 3 completed events in a corner log
// • WorldEventCompleteToast — "Event Complete! +XP +gold" personal toast
// • WorldEventHUD — mounts all four components

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  currentWorldEvent,
  subscribeWorldEvent,
  completedEventHistory,
  type WorldEvent,
  type WorldEventType,
  type CompletedEventRecord,
} from '../game/WorldEventSystem'
import { usePlayerStore } from '../store/playerStore'

// ── Colour palette ────────────────────────────────────────────────────────────

const EVENT_COLOR: Record<WorldEventType, string> = {
  treasure_hunt: '#ffcc00',
  meteor_impact: '#ff8800',
  faction_war:   '#ff3333',
  migration:     '#44cc88',
  ancient_ruins: '#cc66ff',
}

const EVENT_ICON: Record<WorldEventType, string> = {
  treasure_hunt: '★',
  meteor_impact: '☄',
  faction_war:   '⚔',
  migration:     '🐾',
  ancient_ruins: '⛩',
}

const EVENT_LABEL: Record<WorldEventType, string> = {
  treasure_hunt: 'Treasure Hunt',
  meteor_impact: 'Meteor Impact',
  faction_war:   'Faction War',
  migration:     'Animal Migration',
  ancient_ruins: 'Ancient Ruins',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useActiveEvent() {
  const [event, setEvent] = useState<WorldEvent | null>(currentWorldEvent)
  useEffect(() => subscribeWorldEvent(setEvent), [])
  return event
}

function formatCountdown(msRemaining: number): string {
  const totalSecs = Math.max(0, Math.ceil(msRemaining / 1000))
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Get compass direction from player to event. */
function getDirection(
  px: number, pz: number,
  ex: number, ez: number,
): string {
  const dx = ex - px
  const dz = ez - pz
  const angle = Math.atan2(dx, dz) * (180 / Math.PI)
  const a = ((angle % 360) + 360) % 360
  if (a < 22.5  || a >= 337.5) return 'N'
  if (a < 67.5)  return 'NE'
  if (a < 112.5) return 'E'
  if (a < 157.5) return 'SE'
  if (a < 202.5) return 'S'
  if (a < 247.5) return 'SW'
  if (a < 292.5) return 'W'
  return 'NW'
}

function getDistance(
  px: number, py: number, pz: number,
  ex: number, ey: number, ez: number,
): number {
  return Math.round(Math.sqrt((ex - px) ** 2 + (ey - py) ** 2 + (ez - pz) ** 2))
}

// ── Announcement banner (5s full-width) ──────────────────────────────────────

function WorldEventBanner() {
  const [visible, setVisible] = useState(false)
  const [event, setEvent] = useState<WorldEvent | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { x: px, y: py, z: pz } = usePlayerStore.getState()

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = (e as CustomEvent<WorldEvent>).detail
      setEvent(ev)
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 5000)
    }
    window.addEventListener('world-event-start', handler)
    return () => {
      window.removeEventListener('world-event-start', handler)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!visible || !event) return null

  const color = EVENT_COLOR[event.type]
  const icon  = EVENT_ICON[event.type]
  const label = EVENT_LABEL[event.type]

  const { x: playerX, y: playerY, z: playerZ } = usePlayerStore.getState()
  const [ex, ey, ez] = event.position
  const dist = getDistance(playerX, playerY, playerZ, ex, ey, ez)
  const dir  = getDirection(playerX, playerZ, ex, ez)

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 950,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '10px 20px',
      background: `linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.96) 50%, rgba(0,0,0,0.92) 100%)`,
      borderBottom: `2px solid ${color}`,
      boxShadow: `0 2px 24px ${color}55`,
      fontFamily: 'monospace',
      pointerEvents: 'none',
      animation: 'worldEventBannerIn 0.35s ease-out forwards',
    }}>
      <span style={{ fontSize: 18, marginRight: 10, filter: `drop-shadow(0 0 8px ${color})` }}>
        {icon}
      </span>
      <span style={{ fontSize: 13, color, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }}>
        WORLD EVENT
      </span>
      <span style={{ fontSize: 13, color: '#e8e8e8', margin: '0 8px' }}>—</span>
      <span style={{ fontSize: 13, color: '#e8e8e8' }}>
        {label} Discovered — {dist}m {dir}!
      </span>
      <style>{`
        @keyframes worldEventBannerIn {
          0%   { opacity: 0; transform: translateY(-100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ── Persistent compact indicator (top-right) ──────────────────────────────────

function WorldEventIndicator() {
  const event = useActiveEvent()
  const [tick, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!event) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [event?.id])

  if (!event) return null

  const color = EVENT_COLOR[event.type]
  const icon  = EVENT_ICON[event.type]
  const label = EVENT_LABEL[event.type]
  const remaining = event.endTime - Date.now()
  const countdown = formatCountdown(remaining)

  const { x: px, y: py, z: pz } = usePlayerStore.getState()
  const [ex, ey, ez] = event.position
  const dist = getDistance(px, py, pz, ex, ey, ez)
  const dir  = getDirection(px, pz, ex, ez)

  // Urgency pulse when under 2 minutes
  const urgent = remaining < 2 * 60 * 1000

  return (
    <div style={{
      position: 'fixed',
      top: 14,
      right: 14,
      zIndex: 920,
      background: 'rgba(8,6,14,0.9)',
      border: `1px solid ${color}88`,
      borderRadius: 6,
      padding: '8px 12px',
      fontFamily: 'monospace',
      pointerEvents: 'none',
      minWidth: 180,
      boxShadow: urgent ? `0 0 16px ${color}88` : 'none',
      animation: urgent ? 'worldEventUrgent 0.8s ease-in-out infinite' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 14, filter: `drop-shadow(0 0 6px ${color})` }}>{icon}</span>
        <span style={{ fontSize: 10, color, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>

      {/* Countdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: '#888', letterSpacing: 0.5 }}>EXPIRES IN</span>
        <span style={{ fontSize: 11, color: urgent ? '#ff6666' : '#e8e8e8', fontWeight: 'bold', letterSpacing: 1 }}>
          {countdown}
        </span>
      </div>

      {/* Countdown bar */}
      <div style={{
        width: '100%', height: 2,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 1,
        marginBottom: 5,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, (remaining / (10 * 60 * 1000)) * 100))}%`,
          height: '100%',
          background: urgent ? '#ff4444' : color,
          transition: 'width 1s linear, background 0.5s',
        }} />
      </div>

      {/* Participants + distance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888' }}>
        <span>
          {event.participantCount > 0 ? `${event.participantCount} player${event.participantCount !== 1 ? 's' : ''}` : 'Be first!'}
        </span>
        <span style={{ color: '#aaa' }}>{dist}m {dir} →</span>
      </div>

      <style>{`
        @keyframes worldEventUrgent {
          0%   { box-shadow: 0 0 16px ${color}88; }
          50%  { box-shadow: 0 0 28px ${color}cc; }
          100% { box-shadow: 0 0 16px ${color}88; }
        }
      `}</style>
    </div>
  )
}

// ── Completion toast ───────────────────────────────────────────────────────────

interface CompleteDetail {
  eventId: string
  type: WorldEventType
  rewards: { xp: number; gold: number }
}

function WorldEventCompleteToast() {
  const [toast, setToast] = useState<{ type: WorldEventType; xp: number; gold: number; key: number } | null>(null)
  const keyRef = useRef(0)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<CompleteDetail>).detail
      const key = ++keyRef.current
      setToast({ type: d.type, xp: d.rewards.xp, gold: d.rewards.gold, key })
      setTimeout(() => setToast(t => t?.key === key ? null : t), 4000)
    }
    window.addEventListener('world-event-complete', handler)
    return () => window.removeEventListener('world-event-complete', handler)
  }, [])

  if (!toast) return null

  const color = EVENT_COLOR[toast.type]

  return (
    <div
      key={toast.key}
      style={{
        position: 'fixed',
        bottom: 220,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(8,6,14,0.94)',
        border: `1px solid ${color}88`,
        borderTop: `2px solid ${color}`,
        borderRadius: 6,
        padding: '10px 24px',
        fontFamily: 'monospace',
        zIndex: 960,
        pointerEvents: 'none',
        textAlign: 'center',
        animation: 'worldEventToastIn 0.3s ease-out forwards',
      }}
    >
      <div style={{ fontSize: 12, color, fontWeight: 'bold', letterSpacing: 2, marginBottom: 4 }}>
        EVENT COMPLETE
      </div>
      <div style={{ fontSize: 13, color: '#e8e8e8' }}>
        +{toast.xp} XP &nbsp; +{toast.gold} gold
      </div>
      <style>{`
        @keyframes worldEventToastIn {
          0%   { opacity: 0; transform: translateX(-50%) translateY(12px); }
          20%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          75%  { opacity: 1; }
          100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        }
      `}</style>
    </div>
  )
}

// ── Event history log (bottom-right) ─────────────────────────────────────────

function WorldEventHistoryLog() {
  // Re-render whenever an event completes
  const [history, setHistory] = useState<CompletedEventRecord[]>([])

  useEffect(() => {
    const handler = () => {
      setHistory([...completedEventHistory])
    }
    window.addEventListener('world-event-complete', handler)
    window.addEventListener('world-event-end', handler)
    return () => {
      window.removeEventListener('world-event-complete', handler)
      window.removeEventListener('world-event-end', handler)
    }
  }, [])

  if (history.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 14,
      right: 14,
      zIndex: 910,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 8, color: '#555', letterSpacing: 1.5, textAlign: 'right', marginBottom: 2, fontFamily: 'monospace' }}>
        RECENT EVENTS
      </div>
      {history.map((rec) => {
        const color = EVENT_COLOR[rec.type]
        const icon  = EVENT_ICON[rec.type]
        const label = EVENT_LABEL[rec.type]
        const agoMs = Date.now() - rec.completedAt
        const agoMins = Math.round(agoMs / 60000)
        const agoStr = agoMins < 1 ? 'just now' : `${agoMins}m ago`
        return (
          <div key={rec.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(8,6,14,0.82)',
            border: `1px solid ${rec.participated ? color + '66' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 4,
            padding: '3px 8px',
            fontFamily: 'monospace',
            opacity: rec.participated ? 1 : 0.6,
          }}>
            <span style={{ fontSize: 11, filter: rec.participated ? `drop-shadow(0 0 4px ${color})` : 'none' }}>
              {icon}
            </span>
            <span style={{ fontSize: 9, color: rec.participated ? '#cccccc' : '#666' }}>
              {label}
            </span>
            <span style={{ fontSize: 8, color: '#555', marginLeft: 'auto' }}>{agoStr}</span>
            {rec.participated && (
              <span style={{ fontSize: 8, color, fontWeight: 'bold' }}>✓</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────

export function WorldEventHUD() {
  return (
    <>
      <WorldEventBanner />
      <WorldEventIndicator />
      <WorldEventCompleteToast />
      <WorldEventHistoryLog />
    </>
  )
}
