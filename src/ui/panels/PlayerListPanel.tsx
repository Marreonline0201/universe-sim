// PlayerListPanel — players online list
import React from 'react'
import { useMultiplayerStore } from '../../store/multiplayerStore'

export function PlayerListPanel() {
  const players = useMultiplayerStore(s => s.remotePlayers)

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', color: '#ccc', fontSize: 12 }}>
      <div style={{ color: '#888', marginBottom: 16, letterSpacing: 2 }}>PLAYERS ONLINE</div>
      {Object.keys(players).length === 0 ? (
        <div style={{ color: '#555' }}>No other players online.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.values(players).map((p: any) => (
            <div key={p.id} style={{ color: '#ccc' }}>
              {p.username ?? p.id}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
