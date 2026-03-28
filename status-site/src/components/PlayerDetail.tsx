import React, { useEffect, useState } from 'react'
import type { StatusPlayer } from '../hooks/useStatusSocket'

interface VitalBarProps {
  label:  string
  value:  number
  color:  string
  icon:   string
}

function VitalBar({ label, value, color, icon }: VitalBarProps) {
  const pct = Math.max(0, Math.min(1, value))
  const isLow = pct < 0.25
  const barColor = isLow ? '#ff3333' : color

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{
        fontSize: 12,
        width: 18,
        textAlign: 'center',
        filter: isLow ? 'drop-shadow(0 0 4px #ff3333)' : 'none',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 8,
        color: 'rgba(0,180,255,0.4)',
        letterSpacing: 2,
        width: 52,
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: barColor,
          borderRadius: 2,
          boxShadow: isLow ? `0 0 6px ${barColor}` : 'none',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 9,
        color: isLow ? '#ff3333' : 'rgba(180,210,240,0.5)',
        width: 30,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {Math.round(pct * 100)}
      </span>
    </div>
  )
}

interface Props {
  player:  StatusPlayer
  onClose: () => void
}

export function PlayerDetail({ player, onClose }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 250)
  }

  const initials = player.username
    .split(/[\s_-]/)
    .map(s => s[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        paddingLeft: 16,
        paddingBottom: 16,
        backdropFilter: 'blur(2px)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 300,
          background: 'rgba(6,10,22,0.97)',
          border: '1px solid rgba(0,200,255,0.25)',
          borderRadius: 4,
          overflow: 'hidden',
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'transform 0.25s ease',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 0 30px rgba(0,180,255,0.05)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'rgba(0,180,255,0.05)',
          borderBottom: '1px solid rgba(0,180,255,0.12)',
        }}>
          {/* Avatar */}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 4,
            background: 'rgba(0,255,120,0.1)',
            border: '1px solid rgba(0,255,120,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"Orbitron", monospace',
            fontSize: 13,
            fontWeight: 700,
            color: 'rgba(0,255,120,0.9)',
            flexShrink: 0,
            letterSpacing: 1,
          }}>
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {player.username}
            </div>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 8,
              color: 'rgba(0,180,255,0.4)',
              letterSpacing: 2,
            }}>
              AGENT ID: {player.userId.slice(0, 12)}
            </div>
          </div>

          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: '1px solid rgba(0,180,255,0.15)',
              borderRadius: 2,
              color: 'rgba(0,180,255,0.5)',
              cursor: 'pointer',
              padding: '4px 8px',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 9,
              letterSpacing: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px' }}>
          {/* Vitals — health is the only server-side vital; rest shown as nominal */}
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            letterSpacing: 2,
            color: 'rgba(0,180,255,0.4)',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            VITALS
          </div>
          <VitalBar label="Health"  value={player.health} color="#cc2222" icon="♥" />

          {/* Position */}
          <div style={{
            marginTop: 12,
            padding: '10px 12px',
            background: 'rgba(0,180,255,0.04)',
            border: '1px solid rgba(0,180,255,0.1)',
            borderRadius: 2,
          }}>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 8,
              letterSpacing: 2,
              color: 'rgba(0,180,255,0.4)',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              COORDINATES
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
            }}>
              {[['X', player.x], ['Y', player.y], ['Z', player.z]].map(([axis, val]) => (
                <div key={axis as string}>
                  <div style={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: 7,
                    color: 'rgba(0,180,255,0.35)',
                    letterSpacing: 2,
                    marginBottom: 2,
                  }}>
                    {axis}
                  </div>
                  <div style={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.75)',
                    fontWeight: 500,
                  }}>
                    {(val as number).toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Note about limited server data */}
          <div style={{
            marginTop: 10,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            color: 'rgba(0,180,255,0.2)',
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}>
            Full vitals visible in-game only.
            Server telemetry: position + health.
          </div>
        </div>
      </div>
    </div>
  )
}
