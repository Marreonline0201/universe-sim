import React, { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { inventory } from '../game/GameSingletons'

// ── ContextualHints ───────────────────────────────────────────────────────────
// Shows up to 2 contextual keybind hints at a time, bottom-center above hotbar.
// Each hint fades in/out smoothly based on game conditions.
//
// Rules:
//  • "F — Gather"  : visible when gatherPrompt contains "[F] Gather"
//  • "G — Dig"     : visible when player is in-game (pointer locked / game active)
//                    and NOT near a gather node (avoid crowding)
//  • "E — Craft"   : visible when inventory has at least 1 material
//  • "Space — Jump": visible for the first 30 seconds of the session only
//
// Never shows more than 2 hints at once (priority order: Gather > Jump > Craft > Dig).

interface Hint {
  key: string
  label: string
  visible: boolean
}

const HINT_FADE_MS = 400

interface HintRowProps {
  hint: Hint
}

function HintRow({ hint }: HintRowProps) {
  const [opacity, setOpacity] = useState(0)
  const [displayed, setDisplayed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (hint.visible) {
      setDisplayed(true)
      // Tiny defer so the element mounts before we animate opacity
      timerRef.current = setTimeout(() => setOpacity(1), 16)
    } else {
      setOpacity(0)
      timerRef.current = setTimeout(() => setDisplayed(false), HINT_FADE_MS + 50)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [hint.visible])

  if (!displayed) return null

  return (
    <div
      style={{
        opacity,
        transition: `opacity ${HINT_FADE_MS}ms ease`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        fontFamily: 'monospace',
        color: '#e0e0e0',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 4,
          padding: '1px 6px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: '#fff',
        }}
      >
        {hint.key}
      </span>
      <span style={{ color: '#bbb' }}>{hint.label}</span>
    </div>
  )
}

export function ContextualHints() {
  const gatherPrompt = useGameStore(s => s.gatherPrompt)

  // Track session start so Space hint only shows for first 30s
  const sessionStartRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // Poll inventory so we can react when materials appear
  const [hasMaterials, setHasMaterials] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => {
      // Update elapsed seconds since session start
      setElapsed((Date.now() - sessionStartRef.current) / 1000)

      // Check inventory for any material slot
      let found = false
      for (let i = 0; i < inventory.slotCount; i++) {
        const slot = inventory.getSlot(i)
        if (slot && slot.quantity > 0) { found = true; break }
      }
      setHasMaterials(found)
    }, 500)
    return () => clearInterval(iv)
  }, [])

  // Derive hint visibilities
  const nearGatherNode = typeof gatherPrompt === 'string' && gatherPrompt.includes('[F] Gather')
  const showJump   = elapsed < 30
  const showGather = nearGatherNode
  const showCraft  = hasMaterials && !nearGatherNode // suppress when gather hint is showing to stay under 2
  const showDig    = !nearGatherNode && !showJump && !hasMaterials // lowest priority, only when nothing else

  // Build ordered hint list, cap at 2 visible
  const allHints: Hint[] = [
    { key: 'F',     label: 'Gather',         visible: showGather },
    { key: 'Space', label: 'Jump',            visible: showJump   },
    { key: 'E',     label: 'Craft',           visible: showCraft  },
    { key: 'G',     label: 'Dig',             visible: showDig    },
  ]

  // Enforce max-2 visible cap: keep first 2 that are visible, hide the rest
  let visibleCount = 0
  const hints = allHints.map(h => {
    if (h.visible && visibleCount < 2) {
      visibleCount++
      return h
    }
    return { ...h, visible: false }
  })

  // If no hints would ever be shown (or will be shown), render nothing to avoid
  // an empty absolutely-positioned box being clickable.
  const anyDisplayed = hints.some(h => h.visible)
  if (!anyDisplayed && elapsed >= 30 && !hasMaterials && !nearGatherNode) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 88, // above the hotbar (~72px tall) with a small gap
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {hints.map(h => (
        <HintRow key={h.key} hint={h} />
      ))}
    </div>
  )
}
