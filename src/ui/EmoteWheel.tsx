/**
 * EmoteWheel — M26 Track B
 *
 * Radial emote picker shown while the player holds T.
 * 8 segments arranged in a circle, hover to preview, release T to trigger.
 * Keyboard shortcuts 1–8 also work while the wheel is open.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { EMOTES, triggerLocalEmote } from '../game/EmoteSystem'

// ── Layout constants ──────────────────────────────────────────────────────────
const WHEEL_RADIUS   = 110   // px from centre to segment midpoint
const INNER_RADIUS   = 44    // dead-zone radius — no selection inside this
const OUTER_RADIUS   = 175   // outer boundary of wheel
const SEGMENT_EMOJI_SIZE = 32
const CENTER_SIZE    = 88    // px — central circle diameter

interface Props {
  /** Whether T is currently held down */
  open: boolean
  onClose: () => void
}

function angleForIndex(i: number, total: number): number {
  // Start at top (-90°), go clockwise
  return (i / total) * Math.PI * 2 - Math.PI / 2
}

export function EmoteWheel({ open, onClose }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Track mouse position relative to wheel centre for hover detection
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top  + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < INNER_RADIUS || dist > OUTER_RADIUS) {
      setHovered(null)
      return
    }

    // Angle from centre: atan2, adjusted to match angleForIndex convention
    let angle = Math.atan2(dy, dx) + Math.PI / 2  // shift so 0 = top
    if (angle < 0) angle += Math.PI * 2

    const segAngle = (Math.PI * 2) / EMOTES.length
    const idx = Math.round(angle / segAngle) % EMOTES.length
    setHovered(idx)
  }, [])

  // Trigger emote on T release (parent sets open=false and calls onClose)
  useEffect(() => {
    if (!open && hovered !== null) {
      triggerLocalEmote(hovered)
      setHovered(null)
      onClose()
    }
    if (!open) {
      setHovered(null)
    }
  }, [open])

  // Keyboard shortcuts 1–8 while wheel is open
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      const n = parseInt(e.key)
      if (n >= 1 && n <= 8) {
        triggerLocalEmote(n - 1)
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Global mouse-move while wheel is open
  useEffect(() => {
    if (!open) return
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [open, handleMouseMove])

  if (!open) return null

  const total = EMOTES.length

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 900,
      }}
    >
      {/* Outer dark backdrop disc */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width:  OUTER_RADIUS * 2,
          height: OUTER_RADIUS * 2,
          pointerEvents: 'auto',
        }}
      >
        {/* Background circle */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.72)',
          border: '2px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(6px)',
        }} />

        {/* Emote segments */}
        {EMOTES.map((emote, i) => {
          const angle = angleForIndex(i, total)
          const mx = Math.cos(angle) * WHEEL_RADIUS
          const my = Math.sin(angle) * WHEEL_RADIUS
          const isActive = hovered === i

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left:  '50%',
                top:   '50%',
                transform: `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px))`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                transition: 'transform 0.08s ease',
              }}
            >
              {/* Highlight disc behind emoji */}
              <div style={{
                width:  isActive ? 62 : 52,
                height: isActive ? 62 : 52,
                borderRadius: '50%',
                background: isActive
                  ? 'rgba(255,255,255,0.22)'
                  : 'rgba(255,255,255,0.07)',
                border: isActive
                  ? '2px solid rgba(255,255,255,0.6)'
                  : '1px solid rgba(255,255,255,0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.08s ease',
                boxShadow: isActive ? '0 0 16px rgba(255,255,255,0.3)' : 'none',
                gap: 1,
              }}>
                <span style={{ fontSize: isActive ? SEGMENT_EMOJI_SIZE + 4 : SEGMENT_EMOJI_SIZE, lineHeight: 1 }}>
                  {emote.emoji}
                </span>
                {/* Keyboard shortcut label */}
                <span style={{
                  fontSize: 9,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  lineHeight: 1,
                }}>
                  {emote.key}
                </span>
              </div>

              {/* Label below segment */}
              {isActive && (
                <span style={{
                  fontSize: 11,
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                  whiteSpace: 'nowrap',
                  marginTop: 2,
                }}>
                  {emote.label}
                </span>
              )}
            </div>
          )
        })}

        {/* Centre circle — instruction */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top:  '50%',
          transform: 'translate(-50%, -50%)',
          width:  CENTER_SIZE,
          height: CENTER_SIZE,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 22 }}>
            {hovered !== null ? EMOTES[hovered].emoji : '😊'}
          </span>
          <span style={{
            fontSize: 9,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'monospace',
            textAlign: 'center',
            lineHeight: 1.3,
          }}>
            {hovered !== null ? EMOTES[hovered].label : 'Hold T\nto emote'}
          </span>
        </div>
      </div>

      {/* Hint label at bottom */}
      <div style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      }}>
        Release T to emote · 1–8 for quick select
      </div>
    </div>
  )
}
