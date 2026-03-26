/**
 * SailingHUD.tsx — M28 Track B
 *
 * DOM overlay panel shown bottom-right when player is mounted on a raft.
 * Displays: sailing label, compass heading arrow, speed in m/s.
 * Also shows "Too shallow" warning when shore collision occurs.
 */

import React, { useState, useEffect } from 'react'
import { getRaftState, getShoreNotifyTimer } from '../game/RaftSystem'

// Poll rate — 100ms is fast enough for HUD without burning CPU
const POLL_MS = 100

export function SailingHUD() {
  const [state, setState] = useState(() => ({
    mounted: false,
    heading: 0,
    speed: 0,
    shoreTimer: 0,
  }))

  useEffect(() => {
    const id = setInterval(() => {
      const r = getRaftState()
      setState({
        mounted:    r.mounted,
        heading:    r.heading,
        speed:      r.speed,
        shoreTimer: getShoreNotifyTimer(),
      })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [])

  if (!state.mounted) return null

  // Convert heading (radians, CCW from North) to compass degrees CW from North
  const headingDeg = ((-state.heading * 180 / Math.PI) % 360 + 360) % 360
  const compassLabel = headingToCardinal(headingDeg)

  // Arrow rotation: CSS transform rotate where 0 = up = North
  const arrowRot = headingDeg  // clockwise from north

  return (
    <>
      {/* Main sailing HUD panel — bottom-right */}
      <div
        style={{
          position:      'fixed',
          bottom:        80,
          right:         16,
          zIndex:        46,
          pointerEvents: 'none',
          background:    'rgba(0, 0, 0, 0.72)',
          border:        '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius:  8,
          padding:       '10px 14px',
          fontFamily:    'monospace',
          color:         '#e0e8ff',
          minWidth:      130,
          backdropFilter: 'blur(4px)',
        }}
      >
        {/* Label */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#7bc8ff', marginBottom: 8 }}>
          ⛵ SAILING
        </div>

        {/* Compass */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {/* Arrow SVG */}
          <div style={{ transform: `rotate(${arrowRot}deg)`, transition: 'transform 0.15s ease', lineHeight: 0 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="11,2 15,18 11,15 7,18" fill="#7bc8ff" />
              <polygon points="11,22 7,6 11,9 15,6" fill="rgba(120,180,255,0.35)" />
            </svg>
          </div>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: '#aaa', fontSize: 10 }}>HDG</span>{' '}
            <span style={{ fontWeight: 600 }}>{Math.round(headingDeg)}°</span>{' '}
            <span style={{ color: '#7bc8ff', fontSize: 10 }}>{compassLabel}</span>
          </div>
        </div>

        {/* Speed */}
        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#aaa', fontSize: 10 }}>SPD</span>{' '}
          <span style={{ fontWeight: 600, color: state.speed > 0.1 ? '#7bffb8' : '#888' }}>
            {state.speed.toFixed(1)}
          </span>{' '}
          <span style={{ color: '#555', fontSize: 10 }}>m/s</span>
        </div>

        {/* Controls hint */}
        <div style={{ fontSize: 9, color: '#444', marginTop: 8, lineHeight: 1.5 }}>
          WASD steer · Q/E rotate · E dismount
        </div>
      </div>

      {/* "Too shallow" warning — fades after 1s */}
      {state.shoreTimer > 0 && (
        <div
          style={{
            position:      'fixed',
            bottom:        200,
            right:         16,
            zIndex:        47,
            pointerEvents: 'none',
            background:    'rgba(200, 100, 20, 0.85)',
            border:        '1px solid #e07030',
            borderRadius:  6,
            padding:       '5px 12px',
            fontFamily:    'monospace',
            fontSize:      12,
            fontWeight:    700,
            color:         '#fff',
            opacity:       Math.min(1, state.shoreTimer * 2),
            transition:    'opacity 0.1s',
          }}
        >
          Too shallow
        </div>
      )}
    </>
  )
}

function headingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}
