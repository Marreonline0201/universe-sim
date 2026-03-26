// src/ui/WeatherEffectsHUD.tsx
// M57 Track C: Weather effects HUD — shows active weather modifiers in the top-right corner

import { useEffect, useState, useCallback } from 'react'
import { getCurrentWeatherEffect, type WeatherEffect } from '../game/WeatherEffectsSystem'

// Weather conditions that are "perfect" — hide the HUD when these are active
const HIDE_IN = new Set(['clear', 'sunny'])

function getWeatherKey(): string {
  const effect = getCurrentWeatherEffect()
  return effect.name.toLowerCase()
}

export function WeatherEffectsHUD() {
  const [effect, setEffect] = useState<WeatherEffect | null>(null)
  const [weatherName, setWeatherName] = useState<string>('clear')

  const refresh = useCallback(() => {
    const key = getWeatherKey()
    setWeatherName(key)
    setEffect(getCurrentWeatherEffect())
  }, [])

  useEffect(() => {
    refresh()

    window.addEventListener('weather-changed', refresh)
    const interval = setInterval(refresh, 5000)

    return () => {
      window.removeEventListener('weather-changed', refresh)
      clearInterval(interval)
    }
  }, [refresh])

  if (!effect || HIDE_IN.has(weatherName)) return null

  const { movementMult, damageMult, gatherMult, visibilityMult } = effect

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 80,
        zIndex: 900,
        pointerEvents: 'none',
        maxWidth: 160,
        background: 'rgba(0,0,0,0.65)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '7px 10px',
        backdropFilter: 'blur(6px)',
        color: '#fff',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {/* Weather name + icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{effect.icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{effect.name}</span>
      </div>

      {/* Modifier lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {movementMult !== 1.0 && (
          <ModLine
            label="Movement"
            value={movementMult}
            format={v => `${Math.round(v * 100)}%`}
            downIsRed
          />
        )}
        {damageMult !== 1.0 && (
          <ModLine
            label="Dmg Taken"
            value={damageMult}
            format={v => `${Math.round(v * 100)}%`}
            downIsRed={false}
          />
        )}
        {gatherMult !== 1.0 && (
          <ModLine
            label="Gather"
            value={gatherMult}
            format={v => `${Math.round(v * 100)}%`}
            downIsRed
            downColor="#f59e0b"
          />
        )}
        {visibilityMult < 0.9 && (
          <ModLine
            label="Visibility"
            value={visibilityMult}
            format={v => `${Math.round(v * 100)}%`}
            downIsRed
            downColor="#f59e0b"
          />
        )}
      </div>
    </div>
  )
}

interface ModLineProps {
  label: string
  value: number
  format: (v: number) => string
  /** true = below 1.0 is red, above 1.0 is green */
  downIsRed: boolean
  /** override color for "below 1.0" case (default red) */
  downColor?: string
}

function ModLine({ label, value, format, downIsRed, downColor = '#ef4444' }: ModLineProps) {
  const above = value > 1.0
  const arrow = above ? '↑' : '↓'

  let color: string
  if (above) {
    color = downIsRed ? '#4ade80' : '#ef4444'
  } else {
    color = downIsRed ? downColor : '#4ade80'
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, opacity: 0.9 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {arrow} {format(value)}
      </span>
    </div>
  )
}
