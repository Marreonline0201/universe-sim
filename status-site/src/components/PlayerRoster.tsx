import React from 'react'
import type { StatusPlayer } from '../hooks/useStatusSocket'

function healthColor(h: number): string {
  if (h > 0.6) return '#00cc66'
  if (h > 0.3) return '#ff9900'
  return '#ff3333'
}

function initials(name: string): string {
  return name
    .split(/[\s_-]/)
    .map(s => s[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

interface CardProps {
  player:     StatusPlayer
  selected:   boolean
  onSelect:   (id: string) => void
}

function PlayerCard({ player, selected, onSelect }: CardProps) {
  const hc = healthColor(player.health)

  return (
    <div
      onClick={() => onSelect(player.userId)}
      style={{
        cursor: 'pointer',
        padding: '10px 14px',
        borderRadius: 3,
        border: selected
          ? '1px solid rgba(0,255,120,0.5)'
          : '1px solid rgba(0,180,255,0.12)',
        background: selected
          ? 'rgba(0,255,120,0.06)'
          : 'rgba(0,20,40,0.5)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 200,
        maxWidth: 260,
        transition: 'border-color 0.2s, background 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Selected glow */}
      {selected && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 0% 50%, rgba(0,255,120,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Avatar hex */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 4,
        background: selected ? 'rgba(0,255,120,0.15)' : 'rgba(0,180,255,0.1)',
        border: selected ? '1px solid rgba(0,255,120,0.4)' : '1px solid rgba(0,180,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontFamily: '"Orbitron", monospace',
        fontSize: 11,
        fontWeight: 700,
        color: selected ? 'rgba(0,255,120,0.9)' : 'rgba(0,200,255,0.8)',
        letterSpacing: 1,
      }}>
        {initials(player.username)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: 0.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 5,
        }}>
          {player.username}
        </div>

        {/* Health bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <div style={{
            flex: 1,
            height: 3,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${player.health * 100}%`,
              height: '100%',
              background: hc,
              borderRadius: 2,
              transition: 'width 0.5s ease, background 0.5s',
              boxShadow: `0 0 6px ${hc}55`,
            }} />
          </div>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 8,
            color: hc,
            width: 26,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            {Math.round(player.health * 100)}%
          </span>
        </div>

        {/* Position */}
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 8,
          color: 'rgba(0,180,255,0.4)',
          letterSpacing: 0.5,
        }}>
          ({player.x.toFixed(0)}, {player.z.toFixed(0)})
        </div>
      </div>
    </div>
  )
}

interface Props {
  players:    StatusPlayer[]
  selectedId: string | null
  onSelect:   (id: string) => void
}

export function PlayerRoster({ players, selectedId, onSelect }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{
        padding: '8px 16px 6px',
        borderBottom: '1px solid rgba(0,180,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 8,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: 'rgba(0,180,255,0.4)',
        }}>
          ACTIVE AGENTS
        </span>
        <div style={{
          padding: '1px 6px',
          borderRadius: 2,
          background: 'rgba(0,200,255,0.1)',
          border: '1px solid rgba(0,200,255,0.2)',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 8,
          color: 'rgba(0,200,255,0.7)',
        }}>
          {players.length}
        </div>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
      }}>
        {players.length === 0 ? (
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 9,
            color: 'rgba(0,180,255,0.25)',
            letterSpacing: 2,
            fontStyle: 'italic',
          }}>
            NO AGENTS ONLINE — AWAITING CONNECTION
          </div>
        ) : (
          players.map(p => (
            <PlayerCard
              key={p.userId}
              player={p}
              selected={selectedId === p.userId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}
