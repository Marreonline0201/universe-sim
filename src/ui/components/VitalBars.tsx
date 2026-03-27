/**
 * VitalBars — extracted from HUD.tsx (M71 Track B)
 *
 * Reusable vital/status bar components: RustVitalBar, WarmthBar, StaminaBar, ShelterIndicator.
 */
import React, { useState, useEffect } from 'react'
import { shelterState } from '../../game/ShelterSystem'

// ── Rust-style vital bar (icon + horizontal fill) ─────────────────────────────

interface RustVitalBarProps {
  value: number     // 0-1
  color: string
  icon: string
  label: string
}

export function RustVitalBar({ value, color, icon, label }: RustVitalBarProps) {
  const clamped = Math.max(0, Math.min(1, value))
  const isLow   = clamped < 0.25
  const barColor = isLow ? '#e74c3c' : color
  const displayValue = clamped > 0 && clamped < 0.005
    ? (clamped * 100).toFixed(2)
    : String(Math.round(clamped * 100))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      {/* Icon */}
      <span style={{
        fontSize: 13,
        width: 16,
        textAlign: 'center',
        opacity: isLow ? 1 : 0.75,
        filter: isLow ? 'drop-shadow(0 0 4px #e74c3c)' : 'none',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      {/* Bar track */}
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clamped * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.3s ease, background 0.3s',
        }} />
      </div>
      {/* Numeric value */}
      <span style={{
        fontSize: 9,
        color: isLow ? '#e74c3c' : '#888',
        fontFamily: 'monospace',
        width: 26,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {displayValue}
      </span>
    </div>
  )
}

// ── M29 Track B: Warmth bar ───────────────────────────────────────────────────

export function WarmthBar({ warmth }: { warmth: number }) {
  const clamped = Math.max(0, Math.min(100, warmth))
  const isLow   = clamped < 20
  const barColor = isLow ? '#e74c3c' : '#5588ff'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      <span style={{
        fontSize: 13,
        width: 16,
        textAlign: 'center',
        opacity: isLow ? 1 : 0.75,
        filter: isLow ? 'drop-shadow(0 0 4px #88bbff)' : 'none',
        flexShrink: 0,
        animation: isLow ? 'warmthPulse 1s ease-in-out infinite' : 'none',
      }}>
        \u2744
      </span>
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${clamped}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.3s ease, background 0.3s',
          animation: isLow ? 'warmthPulse 1s ease-in-out infinite' : 'none',
        }} />
      </div>
      <span style={{
        fontSize: 9,
        color: isLow ? '#e74c3c' : '#888',
        fontFamily: 'monospace',
        width: 26,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {Math.round(clamped)}
      </span>
    </div>
  )
}

// ── M38 Track B: Stamina bar ──────────────────────────────────────────────────

export function StaminaBar({ stamina, maxStamina }: { stamina: number; maxStamina: number }) {
  const clamped = Math.max(0, Math.min(maxStamina, stamina))
  const pct     = maxStamina > 0 ? clamped / maxStamina : 0
  const isLow   = pct < 0.3
  const barColor = isLow ? '#eab308' : '#22c55e'  // yellow when < 30%, green otherwise

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      <span style={{
        fontSize: 13,
        width: 16,
        textAlign: 'center',
        opacity: isLow ? 1 : 0.75,
        filter: isLow ? 'drop-shadow(0 0 4px #eab308)' : 'none',
        flexShrink: 0,
      }}>
        \u2699
      </span>
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          transition: 'width 0.2s ease, background 0.3s',
        }} />
      </div>
      <span style={{
        fontSize: 9,
        color: isLow ? '#eab308' : '#888',
        fontFamily: 'monospace',
        width: 26,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {Math.round(clamped)}
      </span>
    </div>
  )
}

// ── M42 Track B: Shelter indicator ───────────────────────────────────────────

export function ShelterIndicator() {
  const [snap, setSnap] = useState({ isSheltered: false, shelterType: null as string | null, shelterName: '' })
  useEffect(() => {
    const id = setInterval(() => {
      setSnap({
        isSheltered: shelterState.isSheltered,
        shelterType: shelterState.shelterType,
        shelterName: shelterState.shelterName,
      })
    }, 500)
    return () => clearInterval(id)
  }, [])

  if (!snap.isSheltered) return null

  const label =
    snap.shelterType === 'home'     ? '[ HOME ]'     :
    snap.shelterType === 'cave'     ? '[ CAVE ]'     :
    snap.shelterType === 'building' ? `[ ${snap.shelterName.toUpperCase()} ]` :
    '[ SHELTER ]'

  return (
    <div style={{
      marginTop: 4,
      fontSize: 9,
      color: '#44ff88',
      fontFamily: 'monospace',
      letterSpacing: 1,
      fontWeight: 700,
    }}>
      {label}
    </div>
  )
}
