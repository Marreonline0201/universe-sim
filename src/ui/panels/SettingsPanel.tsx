// ── SettingsPanel ──────────────────────────────────────────────────────────────
// Graphics, audio, keybinds, time controls (admin), logout.

import { useClerk, useAuth } from '@clerk/react'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'

const TIME_SCALES = [0.1, 0.5, 1, 10, 100, 1000, 10000, 100000, 1000000]
const LABELS      = ['0.1×', '0.5×', '1×', '10×', '100×', '1k×', '10k×', '100k×', '1M×']

const HOTKEYS = [
  { key: 'I', action: 'Open Inventory' },
  { key: 'C', action: 'Open Crafting' },
  { key: 'T', action: 'Open Tech Tree' },
  { key: 'E', action: 'Open Evolution' },
  { key: 'J', action: 'Open Journal' },
  { key: 'Tab', action: 'Open Character' },
  { key: 'M', action: 'Open Map' },
  { key: 'Esc', action: 'Settings / Close panel' },
  { key: 'V', action: 'Cycle camera mode' },
  { key: 'W/A/S/D', action: 'Move' },
  { key: 'Space', action: 'Jump' },
  { key: 'Shift', action: 'Sprint' },
  { key: 'Ctrl', action: 'Crouch' },
]

export function SettingsPanel() {
  const { signOut } = useClerk()
  const { userId } = useAuth()
  const { paused, togglePause, timeScale, setTimeScale } = useGameStore()
  const addNotification = useUiStore(s => s.addNotification)
  const closePanel = useUiStore(s => s.closePanel)
  const isAdmin = userId === import.meta.env.VITE_ADMIN_USER_ID

  async function handleSetTimeScale(s: number) {
    setTimeScale(s)
    try {
      const { sendAdminSetTime } = await import('../../net/useWorldSocket')
      sendAdminSetTime(s, paused)
    } catch { /* no WS configured */ }
    fetch('/api/world-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeScale: s }),
    }).catch(() => {})
  }

  async function handleTogglePause() {
    const newPaused = !paused
    togglePause()
    try {
      const { sendAdminSetTime } = await import('../../net/useWorldSocket')
      sendAdminSetTime(timeScale, newPaused)
    } catch { /* no WS configured */ }
  }

  async function handleLogout() {
    closePanel()
    await signOut()
    addNotification('Logged out', 'info')
  }

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Admin: Time Controls */}
      {isAdmin && (
        <section>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 10 }}>
            TIME CONTROLS (ADMIN)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            <button
              onClick={handleTogglePause}
              style={{
                color: paused ? '#e74c3c' : '#2ecc71',
                background: 'none',
                border: `1px solid ${paused ? '#e74c3c' : '#2ecc71'}`,
                borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 14,
              }}
            >
              {paused ? '▶' : '⏸'}
            </button>
            {TIME_SCALES.map((s, i) => (
              <button
                key={s}
                onClick={() => handleSetTimeScale(s)}
                style={{
                  color: timeScale === s ? '#f1c40f' : '#888',
                  background: timeScale === s ? 'rgba(241,196,15,0.15)' : 'none',
                  border: `1px solid ${timeScale === s ? '#f1c40f' : '#333'}`,
                  borderRadius: 4, padding: '3px 7px', cursor: 'pointer',
                  fontSize: 10, fontFamily: 'monospace',
                }}
              >
                {LABELS[i]}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Keybinds */}
      <section>
        <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 10 }}>
          KEYBINDS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {HOTKEYS.map(({ key, action }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 3, padding: '1px 6px',
                color: '#ccc', fontFamily: 'monospace', fontSize: 10,
                minWidth: 48, textAlign: 'center',
              }}>
                {key}
              </span>
              <span style={{ color: '#888', marginLeft: 10, flex: 1 }}>{action}</span>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section>
        <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 8 }}>ABOUT</div>
        <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6 }}>
          Universe Simulation v0.1<br />
          A scientifically grounded multi-scale simulation.
        </div>
      </section>

      {/* Logout */}
      <section>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '10px 0',
            background: 'rgba(231,76,60,0.15)',
            border: '1px solid rgba(231,76,60,0.4)',
            borderRadius: 6,
            color: '#e74c3c',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'monospace',
            letterSpacing: 1,
            transition: 'all 0.15s',
          }}
        >
          LOG OUT
        </button>
      </section>
    </div>
  )
}
