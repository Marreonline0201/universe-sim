// TutorialOverlay — minimal tutorial prompt that auto-dismisses
import React, { useState, useEffect } from 'react'

export function TutorialOverlay() {
  const [dismissed, setDismissed] = useState(false)

  // Auto-dismiss after 20 seconds
  useEffect(() => {
    const timer = setTimeout(() => setDismissed(true), 20_000)
    return () => clearTimeout(timer)
  }, [])

  // Dismiss on first WASD movement
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        setDismissed(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (dismissed) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 6, padding: '10px 20px', pointerEvents: 'none', zIndex: 100,
    }}>
      <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 12 }}>
        WASD to move · Click to lock cursor · M for map · Esc for settings
      </span>
    </div>
  )
}
