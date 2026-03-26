// ── WeatherForecastPanel.tsx ────────────────────────────────────────────────
// M50 Track B: Weather forecast panel.
// Shows current weather and 5-step forecast timeline.
// Accuracy label reflects Meteorology research unlock.

import React, { useState, useEffect } from 'react'
import { useWeatherStore } from '../../store/weatherStore'
import {
  forecastState,
  getForecasts,
  updateForecasts,
  type ForecastAccuracy,
  type WeatherForecast,
} from '../../game/WeatherForecastSystem'
import { useGameStore } from '../../store/gameStore'

// ── Weather icon/label map ──────────────────────────────────────────────────

const WEATHER_ICON: Record<string, string> = {
  CLEAR:           '☀️',
  CLOUDY:          '☁️',
  RAIN:            '🌧️',
  STORM:           '⛈️',
  BLIZZARD:        '❄️',
  TORNADO_WARNING: '🌪️',
  VOLCANIC_ASH:    '🌋',
  ACID_RAIN:       '☠️',
}

const WEATHER_LABEL: Record<string, string> = {
  CLEAR:           'Clear',
  CLOUDY:          'Cloudy',
  RAIN:            'Rain',
  STORM:           'Storm',
  BLIZZARD:        'Blizzard',
  TORNADO_WARNING: 'Tornado Warning',
  VOLCANIC_ASH:    'Volcanic Ash',
  ACID_RAIN:       'Acid Rain',
}

// Vague descriptions used when accuracy is 'vague'
const VAGUE_DESC: Record<string, string> = {
  CLEAR:           'Possibly clear',
  CLOUDY:          'Might be cloudy',
  RAIN:            'Might rain',
  STORM:           'Uncertain skies',
  BLIZZARD:        'Could get cold',
  TORNADO_WARNING: 'Rough weather',
  VOLCANIC_ASH:    'Dusty conditions?',
  ACID_RAIN:       'Hazardous?',
}

const ACCURACY_COLOR: Record<ForecastAccuracy, string> = {
  vague:       '#888',
  approximate: '#e6b93a',
  accurate:    '#2ecc71',
}

const ACCURACY_LABEL: Record<ForecastAccuracy, string> = {
  vague:       'Vague',
  approximate: 'Approximate',
  accurate:    'Accurate',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function weatherIcon(state: string): string {
  return WEATHER_ICON[state] ?? '🌡️'
}

function hourLabel(forecast: WeatherForecast, accuracy: ForecastAccuracy): string {
  if (accuracy === 'accurate') {
    return `+${forecast.hoursAhead}h`
  }
  if (accuracy === 'approximate') {
    // Time is ±1 hour — show approximation
    return `~+${forecast.hoursAhead}h`
  }
  // Vague — only show rough bucket
  if (forecast.hoursAhead <= 2) return 'Soon'
  if (forecast.hoursAhead <= 6) return 'Later'
  return 'Far'
}

// ── Panel component ──────────────────────────────────────────────────────────

export function WeatherForecastPanel() {
  const weatherStore  = useWeatherStore()
  const simSeconds    = useGameStore(s => s.simSeconds)
  const [, forceUpdate] = useState(0)

  const playerWeather = weatherStore.getPlayerWeather()
  const currentState  = playerWeather?.state ?? 'CLEAR'
  const forecasts     = getForecasts()
  const accuracy      = forecastState.accuracy

  // Refresh local render every 5 seconds (forecastState is a plain module object, not reactive)
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 5_000)
    return () => clearInterval(id)
  }, [])

  function handleCheckForecast() {
    updateForecasts(simSeconds, currentState)
    forceUpdate(n => n + 1)
  }

  const accuracyColor = ACCURACY_COLOR[accuracy]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Accuracy badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        border: `1px solid ${accuracyColor}44`,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Forecast Accuracy
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: accuracyColor }}>
          {ACCURACY_LABEL[accuracy]}
        </span>
      </div>

      {/* Current weather */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        border: '1px solid #2a2a2a',
        gap: 6,
      }}>
        <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Current Weather
        </span>
        <span style={{ fontSize: 40, lineHeight: 1.2 }}>{weatherIcon(currentState)}</span>
        <span style={{ fontSize: 16, color: '#ddd', fontFamily: 'monospace', fontWeight: 700 }}>
          {WEATHER_LABEL[currentState] ?? currentState}
        </span>
        {playerWeather && (
          <span style={{ fontSize: 10, color: '#666', fontFamily: 'monospace' }}>
            {playerWeather.temperature.toFixed(1)}°C &nbsp;·&nbsp; Wind {playerWeather.windSpeed.toFixed(1)} m/s
          </span>
        )}
      </div>

      {/* Forecast timeline */}
      <div>
        <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
          Forecast
        </div>

        {forecasts.length === 0 ? (
          <div style={{
            padding: '20px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 8,
            border: '1px dashed #2a2a2a',
            textAlign: 'center',
            color: '#555',
            fontFamily: 'monospace',
            fontSize: 12,
          }}>
            No forecast data. Check back later.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            {forecasts.map((fc, i) => {
              const icon = accuracy === 'vague' && fc.confidence < 0.25
                ? '❓'
                : weatherIcon(fc.predictedWeather)

              const label = accuracy === 'vague'
                ? (fc.confidence < 0.25 ? '?' : (VAGUE_DESC[fc.predictedWeather] ?? '?'))
                : (WEATHER_LABEL[fc.predictedWeather] ?? fc.predictedWeather)

              const hLabel = hourLabel(fc, accuracy)
              const confidencePct = Math.round(fc.confidence * 100)

              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '10px 6px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    border: '1px solid #222',
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  {/* Hour label */}
                  <span style={{ fontSize: 9, color: '#666', fontFamily: 'monospace', letterSpacing: 0.5 }}>
                    {hLabel}
                  </span>

                  {/* Weather icon */}
                  <span style={{ fontSize: 22, lineHeight: 1.2 }}>{icon}</span>

                  {/* Weather name */}
                  <span style={{
                    fontSize: 8,
                    color: accuracy === 'vague' ? '#666' : '#aaa',
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    lineHeight: 1.3,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                  }}>
                    {label}
                  </span>

                  {/* Confidence bar (only shown for approximate/accurate) */}
                  {accuracy !== 'vague' && (
                    <div style={{
                      width: '100%',
                      height: 3,
                      background: '#1e1e1e',
                      borderRadius: 2,
                      overflow: 'hidden',
                      marginTop: 2,
                    }}>
                      <div style={{
                        width: `${confidencePct}%`,
                        height: '100%',
                        background: accuracy === 'accurate' ? '#2ecc71' : '#e6b93a',
                        borderRadius: 2,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Check Forecast button */}
      <button
        onClick={handleCheckForecast}
        style={{
          background: 'rgba(205,68,32,0.15)',
          border: '1px solid rgba(205,68,32,0.4)',
          borderRadius: 8,
          color: '#cd4420',
          fontSize: 12,
          fontFamily: 'monospace',
          fontWeight: 700,
          padding: '10px 16px',
          cursor: 'pointer',
          letterSpacing: 1,
          textTransform: 'uppercase',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(205,68,32,0.28)'
          e.currentTarget.style.borderColor = 'rgba(205,68,32,0.7)'
          e.currentTarget.style.color = '#e8663a'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(205,68,32,0.15)'
          e.currentTarget.style.borderColor = 'rgba(205,68,32,0.4)'
          e.currentTarget.style.color = '#cd4420'
        }}
      >
        Check Forecast
      </button>

      {/* Last updated */}
      {forecastState.lastUpdated > 0 && (
        <div style={{ fontSize: 10, color: '#444', fontFamily: 'monospace', textAlign: 'center' }}>
          Last updated at sim-second {Math.floor(forecastState.lastUpdated)}
        </div>
      )}
    </div>
  )
}
