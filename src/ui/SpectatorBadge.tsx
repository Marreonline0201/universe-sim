/**
 * SpectatorBadge.tsx — M72-1
 *
 * DOM overlay showing "SPECTATOR" badge and speed info when spectator
 * camera mode is active. Subscribes to the spectator state exported
 * from SpectatorCamera.tsx.
 */

import { useEffect, useState } from 'react'
import { isSpectatorActive, subscribeSpectator } from '../rendering/SpectatorCamera'

export function SpectatorBadge() {
  const [active, setActive] = useState(isSpectatorActive)

  useEffect(() => {
    return subscribeSpectator(setActive)
  }, [])

  if (!active) return null

  return (
    <div style={{
      position: 'fixed',
      top: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 250,
      pointerEvents: 'none',
      fontFamily: 'monospace',
    }}>
      <div style={{
        background: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid rgba(85, 239, 196, 0.4)',
        borderRadius: 4,
        padding: '4px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          color: '#55efc4',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 3,
        }}>
          SPECTATOR
        </span>
        <span style={{
          color: '#636e72',
          fontSize: 9,
        }}>
          WASD+QE fly | Scroll speed | Shift boost | [G] exit
        </span>
      </div>
    </div>
  )
}
