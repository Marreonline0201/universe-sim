// ── PlayerListPanel.tsx ─────────────────────────────────────────────────────
// M29 Track C: Lists all currently online remote players with ping indicators.
// Hotkey: P. Registered in SidebarShell as lazy-loaded panel.

import { useMultiplayerStore } from '../../store/multiplayerStore'

const RUST_ORANGE = '#cd4420'
const AFK_THRESHOLD_MS = 60_000

function pingColor(pingMs: number | undefined): string {
  if (pingMs === undefined) return '#666'
  if (pingMs < 100) return '#2ecc71'
  if (pingMs < 250) return '#f39c12'
  return '#e74c3c'
}

function pingLabel(pingMs: number | undefined): string {
  if (pingMs === undefined) return '?ms'
  return `${pingMs}ms`
}

function avatarColor(username: string): string {
  // Deterministic color from username — cycles through a fixed palette
  const COLORS = ['#cd4420', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e74c3c', '#e67e22']
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) & 0xffff
  return COLORS[hash % COLORS.length]
}

export function PlayerListPanel() {
  const remotePlayers = useMultiplayerStore(s => s.remotePlayers)
  const playerPings   = useMultiplayerStore(s => s.playerPings)

  const players = Array.from(remotePlayers.values())
  const now = Date.now()

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: '"Courier New", monospace',
      color: '#e0d6c8',
    }}>
      <h3 style={{
        margin: 0,
        fontSize: 14,
        color: RUST_ORANGE,
        borderBottom: `1px solid #2a2a2a`,
        paddingBottom: 8,
        letterSpacing: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span>PLAYERS ONLINE</span>
        <span style={{
          fontSize: 11,
          background: 'rgba(205,68,32,0.18)',
          border: `1px solid ${RUST_ORANGE}55`,
          borderRadius: 3,
          padding: '1px 6px',
          color: '#ccc',
          letterSpacing: 1,
        }}>
          {players.length}
        </span>
      </h3>

      {players.length === 0 && (
        <div style={{
          color: '#444',
          fontSize: 12,
          textAlign: 'center',
          padding: '24px 0',
          letterSpacing: 1,
        }}>
          NO OTHER PLAYERS ONLINE
        </div>
      )}

      {players.map(p => {
        const pingMs  = playerPings.get(p.userId)
        const isAFK   = (now - (p.lastMovedAt ?? now)) > AFK_THRESHOLD_MS
        const initial = p.username.charAt(0).toUpperCase()
        const color   = avatarColor(p.username)

        return (
          <div
            key={p.userId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid #1e1e1e',
              borderRadius: 4,
              padding: '8px 10px',
            }}
          >
            {/* Avatar circle */}
            <div style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}>
              {initial}
            </div>

            {/* Username + status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#e0d6c8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {p.username}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {/* Online/AFK badge */}
                <span style={{
                  fontSize: 9,
                  background: isAFK ? 'rgba(243,156,18,0.18)' : 'rgba(46,204,113,0.18)',
                  border: `1px solid ${isAFK ? '#f39c1244' : '#2ecc7144'}`,
                  color: isAFK ? '#f39c12' : '#2ecc71',
                  borderRadius: 2,
                  padding: '1px 5px',
                  letterSpacing: 1,
                }}>
                  {isAFK ? 'AFK' : 'ONLINE'}
                </span>
                {/* Health bar mini */}
                <span style={{ fontSize: 9, color: '#555', letterSpacing: 0.5 }}>
                  HP {Math.round(p.health * 100)}%
                </span>
              </div>
            </div>

            {/* Ping indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}>
              <div style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: pingColor(pingMs),
                boxShadow: `0 0 5px ${pingColor(pingMs)}88`,
              }} />
              <span style={{
                fontSize: 9,
                color: pingColor(pingMs),
                fontFamily: 'monospace',
                minWidth: 28,
                textAlign: 'right',
              }}>
                {pingLabel(pingMs)}
              </span>
            </div>
          </div>
        )
      })}

      <div style={{
        marginTop: 8,
        fontSize: 9,
        color: '#333',
        textAlign: 'center',
        letterSpacing: 1,
      }}>
        PRESS P TO CLOSE · F TO INSPECT NEARBY PLAYER
      </div>
    </div>
  )
}
