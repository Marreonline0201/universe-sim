/**
 * WeatherWidgets — extracted from HUD.tsx (M71 Track B)
 *
 * Weather HUD widgets: WeatherIcon, WeatherWidget, StormWindIndicator.
 */
import React from 'react'
import type { WeatherState } from '../../store/weatherStore'

// ── M8: Weather HUD widget ────────────────────────────────────────────────────

export const WEATHER_ICONS: Record<WeatherState, string> = {
  CLEAR:           'sun',
  CLOUDY:          'cloud',
  RAIN:            'rain',
  STORM:           'storm',
  BLIZZARD:        'blizzard',
  TORNADO_WARNING: 'tornado',
  VOLCANIC_ASH:    'ash',
  ACID_RAIN:       'acid',
}

// ASCII-art style SVG icons -- photorealistic enough for a monospace sci-fi HUD
export function WeatherIcon({ state }: { state: WeatherState }) {
  const size = 18
  switch (state) {
    case 'CLEAR':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <circle cx="9" cy="9" r="4" fill="#f1c40f" />
          {[0,45,90,135,180,225,270,315].map((deg, i) => {
            const r = Math.PI * deg / 180
            const x1 = 9 + Math.cos(r) * 5.5, y1 = 9 + Math.sin(r) * 5.5
            const x2 = 9 + Math.cos(r) * 7.5, y2 = 9 + Math.sin(r) * 7.5
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f1c40f" strokeWidth="1.5" strokeLinecap="round" />
          })}
        </svg>
      )
    case 'CLOUDY':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="10" rx="6" ry="4" fill="#aabbcc" />
          <ellipse cx="7" cy="9" rx="3.5" ry="3" fill="#ccdde8" />
          <ellipse cx="12" cy="9" rx="3" ry="2.5" fill="#ccdde8" />
        </svg>
      )
    case 'RAIN':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="7" rx="5.5" ry="3.5" fill="#8899aa" />
          {[4,8,12].map((x, i) => (
            <line key={i} x1={x} y1="11" x2={x - 1} y2="16" stroke="#6699cc" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </svg>
      )
    case 'STORM':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="6" rx="6" ry="4" fill="#445566" />
          <polyline points="10,10 7,14 10,13 7,18" fill="none" stroke="#f1c40f" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
    case 'BLIZZARD':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="6" rx="6" ry="3.5" fill="#cce8ff" />
          {[3,7,11,15].map((x, i) => (
            <line key={i} x1={x} y1="11" x2={x + 2} y2="16" stroke="#aaddff" strokeWidth="1.5" strokeLinecap="round" />
          ))}
          <line x1="2" y1="10" x2="16" y2="10" stroke="#aaddff" strokeWidth="1" />
        </svg>
      )
    case 'TORNADO_WARNING':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="4" rx="7" ry="2.5" fill="#778899" />
          <ellipse cx="9" cy="8" rx="5" ry="2" fill="#667788" />
          <ellipse cx="9" cy="12" rx="3" ry="1.5" fill="#556677" />
          <ellipse cx="9" cy="16" rx="1" ry="1" fill="#445566" />
        </svg>
      )
    case 'VOLCANIC_ASH':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="6" rx="6" ry="3.5" fill="#887755" />
          {[4,8,12].map((x, i) => (
            <ellipse key={i} cx={x} cy={13 + i} rx="1.2" ry="0.8" fill="#aa8855" opacity="0.7" />
          ))}
        </svg>
      )
    case 'ACID_RAIN':
      return (
        <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
          <ellipse cx="9" cy="7" rx="5.5" ry="3.5" fill="#667744" />
          {[4,8,12].map((x, i) => (
            <line key={i} x1={x} y1="11" x2={x - 1} y2="16" stroke="#aaff44" strokeWidth="1.5" strokeLinecap="round" />
          ))}
        </svg>
      )
    default:
      return null
  }
}

interface WeatherWidgetProps {
  state: WeatherState
  tempC: number
}

export function WeatherWidget({ state, tempC }: WeatherWidgetProps) {
  const stormColor =
    state === 'TORNADO_WARNING' ? '#ffaa00' :
    state === 'VOLCANIC_ASH'   ? '#cc6600' :
    state === 'BLIZZARD'       ? '#aaddff' :
    state === 'ACID_RAIN'      ? '#aaff44' :
    state === 'STORM'          ? '#e74c3c' :
    state === 'RAIN'           ? '#6699cc' :
    state === 'CLOUDY'         ? '#aabbcc' : '#f1c40f'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(0,0,0,0.4)',
      border: `1px solid ${stormColor}44`,
      borderRadius: 3,
      padding: '3px 7px 3px 5px',
      marginTop: 2,
    }}>
      <WeatherIcon state={state} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{
          fontSize: 8,
          color: stormColor,
          fontFamily: 'monospace',
          letterSpacing: 1,
          fontWeight: 700,
          textTransform: 'uppercase',
          lineHeight: 1.3,
        }}>
          {state}
        </span>
        <span style={{
          fontSize: 8,
          color: tempC < 0 ? '#88bbff' : tempC > 35 ? '#ff7744' : '#88ccaa',
          fontFamily: 'monospace',
          letterSpacing: 0.5,
          lineHeight: 1.3,
        }}>
          {tempC > 0 ? '+' : ''}{tempC.toFixed(0)}\u00B0C
        </span>
      </div>
    </div>
  )
}

// ── M29 Track B: Storm wind direction indicator ───────────────────────────────

export function StormWindIndicator({ windDir }: { windDir: number }) {
  // windDir = degrees, 0=north clockwise. Arrow points INTO the wind.
  const arrowRad = (windDir + 180) * Math.PI / 180
  const cx = 10, cy = 10, r = 6
  const tx = cx + Math.sin(arrowRad) * r
  const ty = cy - Math.cos(arrowRad) * r

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(0,0,0,0.4)',
      border: '1px solid #ffaa0055',
      borderRadius: 3,
      padding: '3px 7px 3px 5px',
      marginTop: 2,
    }}>
      <svg width={20} height={20} viewBox="0 0 20 20" style={{ display: 'block' }}>
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke="#ffaa00" strokeWidth="2" strokeLinecap="round" />
        <circle cx={tx} cy={ty} r="2" fill="#ffaa00" />
      </svg>
      <span style={{ fontSize: 8, color: '#ffaa00', fontFamily: 'monospace', letterSpacing: 1, fontWeight: 700 }}>
        STORM
      </span>
    </div>
  )
}
