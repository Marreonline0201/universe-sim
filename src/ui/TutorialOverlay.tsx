// ── TutorialOverlay.tsx ─────────────────────────────────────────────────────────
// M24 Track C: HUD overlay for tutorial -- instruction text + skip button.
// Reads from tutorialSystem singleton. Renders at bottom-center.

import React, { useState, useEffect } from 'react'
import { tutorialSystem } from '../game/GameSingletons'

export function TutorialOverlay() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 200)
    return () => clearInterval(iv)
  }, [])

  if (!tutorialSystem || tutorialSystem.isComplete) return null

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
