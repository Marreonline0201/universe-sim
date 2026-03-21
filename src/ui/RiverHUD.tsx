// ── RiverHUD.tsx ──────────────────────────────────────────────────────────────
// M9 Track 1: River proximity HUD indicator.
//
// Shows a blue water droplet icon when the player is within 20m of a river,
// indicating drinkable fresh water is nearby.
// Mounted outside the Canvas in SceneRoot (DOM overlay, not R3F).

import React from 'react'
import { useRiverStore } from '../store/riverStore'

export function RiverHUD() {
  const nearRiver = useRiverStore(s => s.nearRiver)
  const inRiver   = useRiverStore(s => s.inRiver)

  if (!nearRiver) return null

  return (
    <div
      style={{
        position:        'fixed',
        bottom:          120,
        left:            '50%',
        transform:       'translateX(-50%)',
        zIndex:          45,
        pointerEvents:   'none',
        display:         'flex',
        alignItems:      'center',
        gap:             8,
        background:      inRiver ? 'rgba(20, 100, 220, 0.75)' : 'rgba(10, 60, 140, 0.65)',
        border:          `1px solid ${inRiver ? 'rgba(80, 180, 255, 0.8)' : 'rgba(60, 140, 255, 0.5)'}`,
        borderRadius:    8,
        padding:         '5px 14px',
        backdropFilter:  'blur(4px)',
        transition:      'background 0.3s, border 0.3s',
      }}
    >
      {/* Water droplet SVG icon */}
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M8 0 C8 0 1 8 1 13 C1 16.866 4.134 20 8 20 C11.866 20 15 16.866 15 13 C15 8 8 0 8 0Z"
          fill={inRiver ? '#60c8ff' : '#4aa0f0'}
          opacity={0.9}
        />
        <path
          d="M10.5 15 C9.5 16.2 7.5 16.5 6 15.5"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <span
        style={{
          color:       '#d0eeff',
          fontFamily:  'monospace',
          fontSize:    12,
          fontWeight:  500,
          letterSpacing: '0.02em',
        }}
      >
        {inRiver ? 'In river — press [E] to drink' : 'Fresh water nearby [20m]'}
      </span>
    </div>
  )
}
