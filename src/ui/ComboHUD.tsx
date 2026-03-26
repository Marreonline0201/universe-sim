// ── ComboHUD.tsx ──────────────────────────────────────────────────────────────
// M53 Track C: Combat Combo HUD
//
// Displays the current combo streak, damage multiplier, and a decay bar.
// Only visible when comboState.active === true.
// Subscribes to updates via setInterval (100ms).

import React, { useState, useEffect, useRef } from 'react'
import { getComboState, type ComboState } from '../game/ComboSystem'

const COMBO_WINDOW_MS = 3000

export function ComboHUD() {
  const [combo, setCombo] = useState<ComboState>(getComboState())
  const [visible, setVisible] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      const state = getComboState()
      setCombo({ ...state })

      if (state.active) {
        setVisible(true)
        setFadingOut(false)
        if (fadeTimerRef.current) {
          clearTimeout(fadeTimerRef.current)
          fadeTimerRef.current = null
        }
      } else {
        setVisible(prev => {
          if (prev && !fadeTimerRef.current) {
            // Trigger fade-out
            setFadingOut(true)
            fadeTimerRef.current = setTimeout(() => {
              setVisible(false)
              setFadingOut(false)
              fadeTimerRef.current = null
            }, 600)
          }
          return prev
        })
      }
    }, 100)

    return () => {
      clearInterval(id)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  if (!visible) return null

  const { count, multiplier, timeRemaining } = combo
  const decayFraction = Math.max(0, Math.min(1, timeRemaining / COMBO_WINDOW_MS))
  const isLowDecay = decayFraction < 0.30
  const isLegendary = count >= 20
  const isGlowing = count >= 10

  const comboColor = isLegendary
    ? '#FFD700'
    : isGlowing
    ? '#FF6B35'
    : '#00E5FF'

  // Inline keyframe styles injected once
  const styleId = 'combo-hud-keyframes'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes comboPulse {
        0%   { box-shadow: 0 0 8px 2px rgba(255,107,53,0.6); }
        50%  { box-shadow: 0 0 20px 6px rgba(255,107,53,0.9); }
        100% { box-shadow: 0 0 8px 2px rgba(255,107,53,0.6); }
      }
      @keyframes legendaryGlow {
        0%   { box-shadow: 0 0 12px 4px rgba(255,215,0,0.7); text-shadow: 0 0 10px rgba(255,215,0,0.9); }
        50%  { box-shadow: 0 0 28px 10px rgba(255,215,0,1.0); text-shadow: 0 0 20px rgba(255,215,0,1.0); }
        100% { box-shadow: 0 0 12px 4px rgba(255,215,0,0.7); text-shadow: 0 0 10px rgba(255,215,0,0.9); }
      }
    `
    document.head.appendChild(style)
  }

  const glowAnimation = isLegendary
    ? 'legendaryGlow 1.2s ease-in-out infinite'
    : isGlowing
    ? 'comboPulse 1.0s ease-in-out infinite'
    : 'none'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 120,
        left: 'calc(50% - 80px)',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
        userSelect: 'none',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 0.5s ease-out',
        zIndex: 9000,
      }}
    >
      {/* Main combo container */}
      <div
        style={{
          background: 'rgba(0,0,0,0.75)',
          border: `2px solid ${comboColor}`,
          borderRadius: 10,
          padding: '8px 16px',
          textAlign: 'center',
          minWidth: 120,
          animation: glowAnimation,
        }}
      >
        {/* Legendary label */}
        {isLegendary && (
          <div
            style={{
              color: '#FFD700',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: 'uppercase',
              marginBottom: 2,
              textShadow: '0 0 8px rgba(255,215,0,0.8)',
            }}
          >
            LEGENDARY
          </div>
        )}

        {/* Combo count */}
        <div
          style={{
            color: comboColor,
            fontSize: 32,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: -1,
            textShadow: `0 0 12px ${comboColor}88`,
          }}
        >
          ×{count} COMBO
        </div>

        {/* Multiplier badge */}
        <div
          style={{
            color: '#FFFFFF',
            fontSize: 13,
            fontWeight: 600,
            marginTop: 4,
            background: `${comboColor}33`,
            borderRadius: 4,
            padding: '2px 8px',
          }}
        >
          ×{multiplier.toFixed(2)} DMG
        </div>
      </div>

      {/* Decay bar */}
      <div
        style={{
          width: 140,
          height: 4,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${decayFraction * 100}%`,
            height: '100%',
            background: isLowDecay ? '#FF3D3D' : comboColor,
            borderRadius: 2,
            transition: 'width 0.1s linear, background 0.2s ease',
          }}
        />
      </div>
    </div>
  )
}
