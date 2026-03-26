// ── MobileControls ────────────────────────────────────────────────────────────
// Virtual joystick (bottom-left) + action buttons (bottom-right) for mobile/tablet.
//
// Joystick outputs a normalized {x, y} direction vector written to a zustand store
// slice so PlayerController can blend it into movement input.
//
// Action buttons dispatch synthetic KeyboardEvents so existing systems (attack,
// interact, dodge) require no changes.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

// ── Joystick store ────────────────────────────────────────────────────────────

interface JoystickState {
  /** Normalized direction vector from the virtual joystick. Zero = idle. */
  dx: number
  dy: number
  active: boolean
  setVector: (dx: number, dy: number, active: boolean) => void
}

export const useJoystickStore = create<JoystickState>((set) => ({
  dx: 0,
  dy: 0,
  active: false,
  setVector: (dx, dy, active) => set({ dx, dy, active }),
}))

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTER_RADIUS = 60   // px — fixed outer ring
const INNER_RADIUS = 26   // px — draggable knob

// ── Virtual joystick ─────────────────────────────────────────────────────────

function VirtualJoystick() {
  const outerRef  = useRef<HTMLDivElement>(null)
  const touchIdRef = useRef<number | null>(null)
  const setVector = useJoystickStore((s) => s.setVector)

  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 })
  const [touching, setTouching] = useState(false)

  const getOffsetFromCenter = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const el = outerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width  / 2
    const cy = rect.top  + rect.height / 2
    return { x: clientX - cx, y: clientY - cy }
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return
    const touch = e.changedTouches[0]
    touchIdRef.current = touch.identifier
    setTouching(true)
    const { x, y } = getOffsetFromCenter(touch.clientX, touch.clientY)
    const dist  = Math.sqrt(x * x + y * y)
    const clamp = Math.min(dist, OUTER_RADIUS)
    const norm  = dist < 0.01 ? 0 : clamp / dist
    const kx = x * norm
    const ky = y * norm
    setKnobPos({ x: kx, y: ky })
    setVector(kx / OUTER_RADIUS, ky / OUTER_RADIUS, true)
    e.stopPropagation()
  }, [getOffsetFromCenter, setVector])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchIdRef.current === null) return
    let touch: Touch | null = null
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touch = e.changedTouches[i]
        break
      }
    }
    if (!touch) return
    const { x, y } = getOffsetFromCenter(touch.clientX, touch.clientY)
    const dist  = Math.sqrt(x * x + y * y)
    const clamp = Math.min(dist, OUTER_RADIUS)
    const norm  = dist < 0.01 ? 0 : clamp / dist
    const kx = x * norm
    const ky = y * norm
    setKnobPos({ x: kx, y: ky })
    setVector(kx / OUTER_RADIUS, ky / OUTER_RADIUS, true)
    e.preventDefault()
  }, [getOffsetFromCenter, setVector])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    let found = false
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        found = true; break
      }
    }
    if (!found) return
    touchIdRef.current = null
    setTouching(false)
    setKnobPos({ x: 0, y: 0 })
    setVector(0, 0, false)
  }, [setVector])

  // Attach document-level listeners so drag works outside the element
  useEffect(() => {
    document.addEventListener('touchmove',   handleTouchMove,  { passive: false })
    document.addEventListener('touchend',    handleTouchEnd,   { passive: true  })
    document.addEventListener('touchcancel', handleTouchEnd,   { passive: true  })
    return () => {
      document.removeEventListener('touchmove',   handleTouchMove)
      document.removeEventListener('touchend',    handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [handleTouchMove, handleTouchEnd])

  return (
    <div
      ref={outerRef}
      onTouchStart={handleTouchStart}
      style={{
        position:        'relative',
        width:           OUTER_RADIUS * 2,
        height:          OUTER_RADIUS * 2,
        borderRadius:    '50%',
        background:      touching
          ? 'rgba(255,255,255,0.18)'
          : 'rgba(255,255,255,0.10)',
        border:          '2px solid rgba(255,255,255,0.25)',
        boxSizing:       'border-box',
        touchAction:     'none',
        userSelect:      'none',
        WebkitUserSelect:'none',
        flexShrink:      0,
      }}
    >
      {/* Inner knob */}
      <div
        style={{
          position:     'absolute',
          width:        INNER_RADIUS * 2,
          height:       INNER_RADIUS * 2,
          borderRadius: '50%',
          background:   touching
            ? 'rgba(255,255,255,0.55)'
            : 'rgba(255,255,255,0.30)',
          border:       '1.5px solid rgba(255,255,255,0.50)',
          top:  OUTER_RADIUS - INNER_RADIUS + knobPos.y,
          left: OUTER_RADIUS - INNER_RADIUS + knobPos.x,
          transition:   touching ? 'none' : 'top 0.15s ease, left 0.15s ease',
          pointerEvents:'none',
        }}
      />
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────

interface ActionBtnProps {
  label:   string
  keyCode: string
  key_:    string
}

function ActionButton({ label, keyCode, key_ }: ActionBtnProps) {
  const [pressed, setPressed] = useState(false)

  const fire = useCallback((down: boolean) => {
    const type = down ? 'keydown' : 'keyup'
    const ev = new KeyboardEvent(type, {
      bubbles:    true,
      cancelable: true,
      code:       keyCode,
      key:        key_,
    })
    document.dispatchEvent(ev)
    setPressed(down)
  }, [keyCode, key_])

  return (
    <div
      onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); fire(true)  }}
      onTouchEnd={(e)   => { e.preventDefault(); e.stopPropagation(); fire(false) }}
      onTouchCancel={(e)=> { e.preventDefault(); e.stopPropagation(); fire(false) }}
      style={{
        width:           52,
        height:          52,
        borderRadius:    '50%',
        background:      pressed
          ? 'rgba(255,255,255,0.35)'
          : 'rgba(255,255,255,0.12)',
        border:          `2px solid ${pressed ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)'}`,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        fontSize:        22,
        userSelect:      'none',
        WebkitUserSelect:'none',
        touchAction:     'none',
        cursor:          'pointer',
        transition:      'background 0.08s, border-color 0.08s',
        boxSizing:       'border-box',
      }}
    >
      {label}
    </div>
  )
}

// ── MobileControls root ───────────────────────────────────────────────────────

export function MobileControls() {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    // Detect touch capability once on mount (stable — no need to re-run)
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  if (!isTouch) return null

  return (
    <>
      {/* Bottom-left: virtual joystick */}
      <div
        style={{
          position:     'fixed',
          bottom:       24,
          left:         24,
          zIndex:       9000,
          pointerEvents:'all',
        }}
      >
        <VirtualJoystick />
      </div>

      {/* Bottom-right: action buttons — Attack, Interact, Dodge */}
      <div
        style={{
          position:       'fixed',
          bottom:         24,
          right:          24,
          zIndex:         9000,
          display:        'flex',
          flexDirection:  'column',
          gap:            10,
          alignItems:     'center',
          pointerEvents:  'all',
        }}
      >
        {/* Attack — fires MouseLeft equivalent via KeyQ (attack = MouseLeft || KeyQ) */}
        <ActionButton label="⚔" keyCode="KeyQ" key_="q" />
        {/* Interact — KeyF (interact = KeyE || KeyF in PlayerController) */}
        <ActionButton label="E"  keyCode="KeyF" key_="f" />
        {/* Dodge (sprint burst) — ShiftLeft */}
        <ActionButton label="⇐" keyCode="ShiftLeft" key_="Shift" />
      </div>
    </>
  )
}
