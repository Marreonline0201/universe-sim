// ── DeathScreen.tsx ────────────────────────────────────────────────────────────
// M5: Death + Bedroll Respawn System
//
// Shown when playerStore.isDead === true. Blocks all input with a full-screen
// black fade. Shows cause of death and a RESPAWN button. On click, calls the
// onRespawn callback (wired in App.tsx / SceneRoot) which:
//   1. Teleports player to bedrollPos (or world spawn)
//   2. Resets vitals to groggy state (health 50%, hunger 40%, thirst 40%)
//   3. Clears isDead flag

import React, { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../store/playerStore'

// Verify: death does NOT clear murder_count — the Neon DB record persists
// across death/respawn. This component only reads it to show the reminder.

const CAUSE_LABELS: Record<string, { headline: string; detail: string }> = {
  starvation: {
    headline: 'STARVED TO DEATH',
    detail:   'Your body gave out from hunger and thirst. Find food and water first.',
  },
  infection: {
    headline: 'SUCCUMBED TO INFECTION',
    detail:   'Bacteria overwhelmed your immune system. Treat wounds early with herbs.',
  },
  combat: {
    headline: 'KILLED IN COMBAT',
    detail:   'A predator or player ended your run. Stay alert in the wild.',
  },
  drowning: {
    headline: 'DROWNED',
    detail:   'The depths claimed you. Avoid deep water without preparation.',
  },
  hypothermia: {
    headline: 'FROZEN TO DEATH',
    detail:   'Extreme cold drained your body heat. Seek shelter, light a fire, or find warmer ground.',
  },
}

interface DeathScreenProps {
  onRespawn: () => void
}

export function DeathScreen({ onRespawn }: DeathScreenProps) {
  const { isDead, deathCause, bedrollPos, shelterPos } = usePlayerStore()

  // Fade-in animation state
  const [opacity, setOpacity] = useState(0)
  const [btnVisible, setBtnVisible] = useState(false)
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isDead) {
      setOpacity(0)
      setBtnVisible(false)
      return
    }
    // Fade the overlay in over 1.5s, then reveal button after 2s
    const start = performance.now()
    const FADE_MS = 1500
    let raf: number
    function animate() {
      const elapsed = performance.now() - start
      setOpacity(Math.min(1, elapsed / FADE_MS))
      if (elapsed < FADE_MS) {
        raf = requestAnimationFrame(animate)
      }
    }
    raf = requestAnimationFrame(animate)
    animRef.current = setTimeout(() => setBtnVisible(true), 2000)
    return () => {
      cancelAnimationFrame(raf)
      if (animRef.current) clearTimeout(animRef.current)
    }
  }, [isDead])

  if (!isDead) return null

  const cause = deathCause ?? 'starvation'
  const labels = CAUSE_LABELS[cause] ?? CAUSE_LABELS.starvation
  const hasShelter = shelterPos != null
  const hasBedroll = bedrollPos != null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `rgba(0, 0, 0, ${opacity})`,
        fontFamily: 'monospace',
        pointerEvents: 'all',
        transition: 'none',
      }}
    >
      {/* YOU DIED heading — appears with fade */}
      <div
        style={{
          fontSize: 52,
          fontWeight: 900,
          color: `rgba(180, 30, 30, ${opacity})`,
          letterSpacing: 12,
          textTransform: 'uppercase',
          textShadow: `0 0 40px rgba(200, 20, 20, ${opacity * 0.8})`,
          marginBottom: 16,
          userSelect: 'none',
        }}
      >
        YOU DIED
      </div>

      {/* Cause of death */}
      <div
        style={{
          fontSize: 16,
          color: `rgba(200, 200, 200, ${opacity})`,
          letterSpacing: 4,
          textTransform: 'uppercase',
          marginBottom: 8,
          userSelect: 'none',
        }}
      >
        {labels.headline}
      </div>

      <div
        style={{
          fontSize: 11,
          color: `rgba(140, 140, 140, ${opacity})`,
          letterSpacing: 1,
          maxWidth: 380,
          textAlign: 'center',
          lineHeight: 1.6,
          marginBottom: 48,
          userSelect: 'none',
        }}
      >
        {labels.detail}
      </div>

      {/* Respawn info */}
      {btnVisible && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 10, color: '#666', letterSpacing: 2, marginBottom: 4 }}>
            {hasShelter
              ? 'RESPAWNING AT YOUR SHELTER'
              : hasBedroll
              ? 'RESPAWNING AT YOUR BEDROLL'
              : 'RESPAWNING AT WORLD SPAWN'}
          </div>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, marginBottom: 8 }}>
            HEALTH 50% &nbsp;·&nbsp; HUNGER 40% &nbsp;·&nbsp; THIRST 40%
          </div>
          <button
            onClick={onRespawn}
            style={{
              background: 'rgba(180, 30, 30, 0.85)',
              border: '1px solid rgba(255, 80, 80, 0.6)',
              borderRadius: 3,
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 5,
              padding: '12px 48px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              boxShadow: '0 0 24px rgba(180, 30, 30, 0.6)',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(220, 50, 50, 0.95)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 36px rgba(220, 50, 50, 0.8)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(180, 30, 30, 0.85)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(180, 30, 30, 0.6)'
            }}
          >
            RESPAWN
          </button>
        </div>
      )}
    </div>
  )
}
