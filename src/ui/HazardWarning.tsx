/**
 * HazardWarning — M47 Track B: Environmental Hazard HUD overlay
 *
 * Shows a coloured pulsing bar at the bottom of the screen when the player
 * enters a hazard zone.  Listens for 'hazard-enter' and 'hazard-exit' window
 * events dispatched by GameLoop.
 *
 * Event payloads:
 *   hazard-enter: CustomEvent<{ type: HazardType }>
 *   hazard-exit:  Event (no payload)
 */
import { useState, useEffect, useRef } from 'react'
import { HAZARD_DEFS, type HazardType } from '../game/HazardSystem'

export function HazardWarning() {
  const [activeType, setActiveType] = useState<HazardType | null>(null)
  const [visible, setVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onEnter(e: Event) {
      const detail = (e as CustomEvent<{ type: HazardType }>).detail
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setActiveType(detail.type)
      setVisible(true)
    }

    function onExit() {
      hideTimerRef.current = setTimeout(() => {
        setVisible(false)
        hideTimerRef.current = null
      }, 2000)
    }

    window.addEventListener('hazard-enter', onEnter)
    window.addEventListener('hazard-exit', onExit)
    return () => {
      window.removeEventListener('hazard-enter', onEnter)
      window.removeEventListener('hazard-exit', onExit)
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    }
  }, [])

  if (!visible || activeType === null) return null

  const def = HAZARD_DEFS[activeType]

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 90,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        background: `${def.color}33`,
        border: `2px solid ${def.color}`,
        borderRadius: 8,
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'hazard-pulse 1s ease-in-out infinite',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 20 }}>{def.icon}</span>
      <span style={{
        color: def.color,
        fontFamily: 'monospace',
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: 1,
        textShadow: `0 0 8px ${def.color}`,
        textTransform: 'uppercase',
      }}>
        {def.name}
        {def.dps > 0 && (
          <span style={{ opacity: 0.85, fontWeight: 400 }}>
            {' '}— {def.dps} DPS
          </span>
        )}
        {def.speedMult !== undefined && def.dps === 0 && (
          <span style={{ opacity: 0.85, fontWeight: 400 }}>
            {' '}— movement slowed
          </span>
        )}
      </span>
      <span style={{ fontSize: 20 }}>{def.icon}</span>
      <style>{`
        @keyframes hazard-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  )
}
