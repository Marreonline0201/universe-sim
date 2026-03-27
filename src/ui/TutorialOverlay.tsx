// ── TutorialOverlay.tsx ─────────────────────────────────────────────────────────
// M24 Track C: HUD overlay for tutorial -- instruction text + skip button.
// Reads from tutorialSystem singleton. Renders at bottom-center.

import React, { useState, useEffect } from 'react'
import { tutorialSystem } from '../game/GameSingletons'
import { RPG_ENABLED } from '../game/gameConfig'

export function TutorialOverlay() {
  const [, setTick] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 200)
    return () => clearInterval(iv)
  }, [])

  // Auto-dismiss after 45 seconds
  useEffect(() => {
    const timer = setTimeout(() => setDismissed(true), 45_000)
    return () => clearTimeout(timer)
  }, [])

  // Also dismiss on first WASD movement
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        setDismissed(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!RPG_ENABLED) {
    // Simulation mode tutorial — shown briefly on first load
    if (dismissed) return null
    return (
      <div style={{
        position: 'fixed',
        bottom: 140,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 150,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.75)',
          border: '1px solid rgba(205, 68, 32, 0.4)',
          borderRadius: 8,
          padding: '10px 20px',
          maxWidth: 380,
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: 13,
          color: '#e0e0e0',
          lineHeight: 1.6,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            fontSize: 9,
            color: '#cd4420',
            letterSpacing: 2,
            marginBottom: 6,
            fontWeight: 700,
          }}>
            SIMULATION MODE
          </div>
          <div>Press <span style={{ color: '#facc15' }}>[G]</span> to enter spectator mode and fly around the planet.</div>
          <div>Press <span style={{ color: '#facc15' }}>[B]</span> to view the Ecosystem Dashboard.</div>
          <div>Press <span style={{ color: '#facc15' }}>[O]</span> in spectator mode to seed a new organism.</div>
          <div style={{ marginTop: 6, color: '#aaa', fontSize: 11 }}>Watch life evolve on the surface.</div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            padding: '3px 12px',
            color: '#666',
            fontFamily: 'monospace',
            fontSize: 10,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
        >
          Got it
        </button>
      </div>
    )
  }

  if (!tutorialSystem || tutorialSystem.isComplete || dismissed) return null

  const step = tutorialSystem.step
  const message = tutorialSystem.message

  // Highlight hint for which key to press
  const keyHint = step === 'CRAFT' ? 'C' : step === 'EQUIP' ? 'I' : step === 'BUILD' ? 'B' : null

  return (
    <div style={{
      position: 'fixed',
      bottom: 140,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 150,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
    }}>
      {/* Instruction box */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.75)',
        border: '1px solid rgba(205, 68, 32, 0.4)',
        borderRadius: 8,
        padding: '10px 20px',
        maxWidth: 340,
        textAlign: 'center',
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#e0e0e0',
        lineHeight: 1.5,
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{
          fontSize: 9,
          color: '#cd4420',
          letterSpacing: 2,
          marginBottom: 4,
          fontWeight: 700,
        }}>
          TUTORIAL
        </div>
        {message}
        {keyHint && (
          <div style={{
            marginTop: 6,
            fontSize: 11,
            color: '#facc15',
          }}>
            Press [{keyHint}]
          </div>
        )}
      </div>

      {/* Skip button */}
      <button
        onClick={() => tutorialSystem.skip()}
        style={{
          pointerEvents: 'auto',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 4,
          padding: '3px 12px',
          color: '#666',
          fontFamily: 'monospace',
          fontSize: 10,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
      >
        Skip Tutorial
      </button>
    </div>
  )
}
