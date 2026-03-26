// ── SiegeHUD.tsx ───────────────────────────────────────────────────────────────
// M46 Track B: Settlement Siege Events HUD overlay.
// Full-width amber banner at the top of the screen showing the active siege,
// a progress bar, and a DEFEND button.

import { useState, useEffect, useRef } from 'react'
import { activeSiege, contributeToCiege, getSiegeProgress } from '../../game/SiegeSystem'
import { FACTIONS } from '../../game/FactionSystem'
import { useSettlementStore } from '../../store/settlementStore'

interface SiegeDisplay {
  settlementName: string
  attackerName: string
  attackerIcon: string
  intensity: 1 | 2 | 3
}

export function SiegeHUD() {
  const [visible, setVisible] = useState(false)
  const [display, setDisplay] = useState<SiegeDisplay | null>(null)
  const [progress, setProgress] = useState(0)
  const [contributed, setContributed] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function onSiegeStarted(e: Event) {
      const detail = (e as CustomEvent).detail as {
        settlementId: number
        attackingFactionId: string
        intensity: 1 | 2 | 3
      }

      const settlements = useSettlementStore.getState().settlements
      const settlement = settlements.get(detail.settlementId)
      const attackerFaction = FACTIONS[detail.attackingFactionId as keyof typeof FACTIONS]

      setDisplay({
        settlementName: settlement?.name ?? `Settlement #${detail.settlementId}`,
        attackerName: attackerFaction?.name ?? detail.attackingFactionId,
        attackerIcon: attackerFaction?.icon ?? '⚔',
        intensity: detail.intensity,
      })
      setContributed(false)
      setProgress(0)
      setVisible(true)
    }

    function onSiegeResolved() {
      setVisible(false)
      setDisplay(null)
      setProgress(0)
      setContributed(false)
    }

    window.addEventListener('siege-started', onSiegeStarted)
    window.addEventListener('siege-resolved', onSiegeResolved)
    return () => {
      window.removeEventListener('siege-started', onSiegeStarted)
      window.removeEventListener('siege-resolved', onSiegeResolved)
    }
  }, [])

  // Poll progress every 500ms while visible
  useEffect(() => {
    if (visible) {
      pollRef.current = setInterval(() => {
        const p = getSiegeProgress()
        if (p !== null) {
          setProgress(p)
        } else {
          // Siege ended without event — hide
          setVisible(false)
        }
      }, 500)
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [visible])

  if (!visible || !display) return null

  const intensityLabel = display.intensity === 1
    ? 'Minor Siege'
    : display.intensity === 2
      ? 'Heavy Siege'
      : 'OVERWHELMING SIEGE'

  const barColor = contributed ? '#44cc88' : '#f59e0b'
  const timeRemaining = activeSiege
    ? Math.max(0, Math.ceil(activeSiege.remainingMs / 1000))
    : 0
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`

  function handleDefend() {
    if (contributed) return
    contributeToCiege()
    setContributed(true)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 500,
      background: 'linear-gradient(90deg, rgba(180, 83, 9, 0.97) 0%, rgba(217, 119, 6, 0.97) 50%, rgba(180, 83, 9, 0.97) 100%)',
      borderBottom: '2px solid #f59e0b',
      padding: '6px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: '0 2px 12px rgba(245, 158, 11, 0.4)',
      fontFamily: 'monospace',
    }}>
      {/* Icon + text */}
      <div style={{ fontSize: 18, flexShrink: 0 }}>⚔</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}>
          <span style={{
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}>
            SIEGE — {display.settlementName} under attack by {display.attackerIcon} {display.attackerName}!
          </span>
          <span style={{
            fontSize: 10,
            color: '#fde68a',
            letterSpacing: 1,
            opacity: 0.85,
          }}>
            [{intensityLabel}]
          </span>
          <span style={{
            fontSize: 11,
            color: '#fef3c7',
            marginLeft: 'auto',
            flexShrink: 0,
          }}>
            {timeStr}
          </span>
        </div>

        {/* Progress bar — shows time elapsed (fills as siege progresses) */}
        <div style={{
          width: '100%',
          height: 6,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid rgba(245,158,11,0.3)',
        }}>
          <div style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: barColor,
            borderRadius: 3,
            transition: 'width 0.5s linear, background 0.3s',
          }} />
        </div>

        {contributed && (
          <div style={{
            fontSize: 10,
            color: '#6ee7b7',
            marginTop: 3,
            letterSpacing: 0.5,
          }}>
            Defending — siege will be repelled!
          </div>
        )}
      </div>

      {/* DEFEND button */}
      {!contributed ? (
        <button
          onClick={handleDefend}
          style={{
            flexShrink: 0,
            padding: '5px 14px',
            background: '#fff',
            color: '#92400e',
            border: 'none',
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 1,
            cursor: 'pointer',
            textTransform: 'uppercase',
            boxShadow: '0 0 8px rgba(255,255,255,0.4)',
            transition: 'transform 0.1s',
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          DEFEND
        </button>
      ) : (
        <div style={{
          flexShrink: 0,
          padding: '5px 14px',
          background: 'rgba(52,211,153,0.2)',
          border: '1px solid #34d399',
          borderRadius: 4,
          color: '#6ee7b7',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          DEFENDING
        </div>
      )}
    </div>
  )
}
