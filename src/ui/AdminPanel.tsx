import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { useGameStore } from '../store/gameStore'
import { inventory } from '../game/GameSingletons'
import { MAT } from '../player/Inventory'
import { saveGodMode } from '../store/saveStore'

interface PlayerRow {
  user_id: string
  username: string
  pos_x: number; pos_y: number; pos_z: number
  health: number; hunger: number; thirst: number
  energy: number; fatigue: number
  ev_points: number; civ_tier: number
  current_goal: string
  sim_seconds: number
  updated_at: string
}

function bar(v: number, color: string) {
  return (
    <div style={{ display: 'inline-block', width: 60, height: 8, background: '#333', borderRadius: 4, verticalAlign: 'middle' }}>
      <div style={{ width: `${Math.round(v * 100)}%`, height: '100%', background: color, borderRadius: 4 }} />
    </div>
  )
}

function fmtSecs(s: number) {
  const y = s / 31_557_600
  if (y >= 1e6) return `${(y / 1e6).toFixed(1)} Myr`
  if (y >= 1000) return `${(y / 1000).toFixed(1)} kyr`
  if (y >= 1) return `${y.toFixed(1)} yr`
  if (s >= 86400) return `${(s / 86400).toFixed(1)} days`
  if (s >= 3600) return `${(s / 3600).toFixed(1)} hr`
  return `${s.toFixed(0)} s`
}

export function AdminPanel() {
  const { getToken, userId } = useAuth()
  const [open, setOpen] = useState(false)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [godMode, setGodMode] = useState(() => inventory.isGodMode())
  const { setSpectateTarget, spectateTarget } = useGameStore()

  const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'
  const isAdmin = DEV_BYPASS || userId === import.meta.env.VITE_ADMIN_USER_ID

  async function load() {
    setLoading(true)
    const token = await getToken()
    const res = await fetch('/api/admin', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setPlayers(data.players ?? [])
    setLoading(false)
  }

  useEffect(() => { if (isAdmin && open) load() }, [isAdmin, open])

  if (!isAdmin) return null

  return (
    <>
      {/* Admin button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 196,
          background: '#ff4444', color: '#fff', border: 'none',
          padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, letterSpacing: 1,
        }}
      >
        ADMIN
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.85)', overflowY: 'auto',
          padding: 24, color: '#fff', fontFamily: 'monospace',
        }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Admin Panel — Universe Sim</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    (Object.values(MAT) as Array<string | number>).filter((v): v is number => typeof v === 'number').forEach(matId => {
                      inventory.addItem({ itemId: 0, materialId: matId, quantity: 99, quality: 1.0 })
                    })
                  }}
                  style={{ background: '#7c3aed', color: '#fff', border: '1px solid #9f67ff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}
                >
                  Give All Materials
                </button>
                <button
                  onClick={() => {
                    const next = !godMode
                    setGodMode(next)
                    inventory.setGodMode(next)
                    saveGodMode(next)
                  }}
                  style={{ background: godMode ? '#16a34a' : '#374151', color: '#fff', border: `1px solid ${godMode ? '#4ade80' : '#555'}`, padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}
                >
                  God Mode {godMode ? 'ON' : 'OFF'}
                </button>
                <button onClick={load} style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}>
                  Refresh
                </button>
                {spectateTarget && (
                  <button onClick={() => setSpectateTarget(null)} style={{ background: '#555', color: '#fff', border: '1px solid #777', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}>
                    Free Camera
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 12, opacity: 0.5, fontSize: 12 }}>
              {players.length} registered player{players.length !== 1 ? 's' : ''}
            </div>

            {loading ? (
              <div style={{ opacity: 0.5 }}>Loading...</div>
            ) : players.length === 0 ? (
              <div style={{ opacity: 0.5 }}>No players yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #444', opacity: 0.6 }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Username</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Position</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>HP</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Hunger</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Thirst</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Energy</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Sim Time</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Tier</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Goal</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Last Seen</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Camera</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => (
                    <tr key={p.user_id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p.username || p.user_id.slice(0, 12)}</td>
                      <td style={{ padding: '6px 8px', opacity: 0.7 }}>{p.pos_x.toFixed(1)}, {p.pos_y.toFixed(1)}, {p.pos_z.toFixed(1)}</td>
                      <td style={{ padding: '6px 8px' }}>{bar(p.health, '#4caf50')}</td>
                      <td style={{ padding: '6px 8px' }}>{bar(p.hunger, '#ff9800')}</td>
                      <td style={{ padding: '6px 8px' }}>{bar(p.thirst, '#2196f3')}</td>
                      <td style={{ padding: '6px 8px' }}>{bar(p.energy, '#ffeb3b')}</td>
                      <td style={{ padding: '6px 8px', opacity: 0.7 }}>{fmtSecs(p.sim_seconds)}</td>
                      <td style={{ padding: '6px 8px' }}>T{p.civ_tier}</td>
                      <td style={{ padding: '6px 8px', opacity: 0.7 }}>{p.current_goal}</td>
                      <td style={{ padding: '6px 8px', opacity: 0.5 }}>{new Date(p.updated_at).toLocaleString()}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <button
                          onClick={() => setSpectateTarget({ x: p.pos_x, y: p.pos_y, z: p.pos_z })}
                          style={{ background: '#1a6bff', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                        >
                          Focus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  )
}
