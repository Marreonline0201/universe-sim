// ── SettingsPanel ──────────────────────────────────────────────────────────────
// Graphics, audio, keybinds, time controls (admin), logout.

import { useClerk, useAuth } from '@clerk/react'
import { useGameStore } from '../../store/gameStore'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'

const TIME_SCALES = [0.1, 0.5, 1, 10, 100, 1000, 10000, 100000, 1000000, 1e8, 1e9, 1e10, 1e12]
const LABELS      = ['0.1×', '0.5×', '1×', '10×', '100×', '1k×', '10k×', '100k×', '1M×', '100M×', '1B×', '10B×', '1T×']

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
  const { userId, getToken } = useAuth()
  const { paused, togglePause, timeScale, setTimeScale, flyMode, setFlyMode, adminSpeedMult, setAdminSpeedMult } = useGameStore()
  const { health, hunger, thirst, energy, fatigue, evolutionPoints, civTier, updateVitals, addEvolutionPoints, setCivTier } = usePlayerStore()
  const addNotification = useUiStore(s => s.addNotification)
  const closePanel = useUiStore(s => s.closePanel)
  const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'
  const isAdmin = DEV_BYPASS || userId === import.meta.env.VITE_ADMIN_USER_ID

  async function handleSetTimeScale(s: number) {
    setTimeScale(s)
    try {
      const { sendAdminSetTime } = await import('../../net/useWorldSocket')
      sendAdminSetTime(s, paused)
    } catch { /* no WS configured */ }
    getToken().then(token => {
      if (!token) return
      fetch('/api/world-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ timeScale: s }),
      }).catch(() => {})
    })
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
    if (DEV_BYPASS) {
      // No Clerk session in dev bypass mode — just reload to simulate logout
      window.location.reload()
      return
    }
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

      {/* Admin: Movement + Fly + Vitals */}
      {isAdmin && (
        <section>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 10 }}>
            MOVEMENT (ADMIN)
          </div>
          {/* Fly mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <button
              onClick={() => setFlyMode(!flyMode)}
              style={{
                color: flyMode ? '#3af' : '#888',
                background: flyMode ? 'rgba(51,170,255,0.15)' : 'none',
                border: `1px solid ${flyMode ? '#3af' : '#333'}`,
                borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12,
              }}
            >
              {flyMode ? '✈ FLY ON' : '✈ FLY OFF'}
            </button>
            <span style={{ fontSize: 10, color: '#555' }}>Space=rise  Ctrl=descend</span>
          </div>
          {/* Speed multiplier */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#888', width: 70 }}>Speed ×{adminSpeedMult.toFixed(1)}</span>
            <input
              type="range" min={0.1} max={50} step={0.1}
              value={adminSpeedMult}
              onChange={e => setAdminSpeedMult(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#3af' }}
            />
            <button onClick={() => setAdminSpeedMult(1)} style={{ fontSize: 10, background: 'none', border: '1px solid #333', color: '#666', borderRadius: 3, padding: '2px 6px', cursor: 'pointer' }}>reset</button>
          </div>
        </section>
      )}

      {/* Admin: Editable Vitals */}
      {isAdmin && (
        <section>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 10 }}>
            PLAYER VARIABLES (ADMIN)
          </div>
          {([
            { label: 'Health',  value: health,  key: 'health',  color: '#4caf50' },
            { label: 'Hunger',  value: hunger,  key: 'hunger',  color: '#ff9800' },
            { label: 'Thirst',  value: thirst,  key: 'thirst',  color: '#2196f3' },
            { label: 'Energy',  value: energy,  key: 'energy',  color: '#ffeb3b' },
            { label: 'Fatigue', value: fatigue, key: 'fatigue', color: '#e91e63' },
          ] as Array<{label:string;value:number;key:string;color:string}>).map(({ label, value, key, color }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#888', width: 56 }}>{label}</span>
              <input
                type="range" min={0} max={1} step={0.01}
                value={value}
                onChange={e => updateVitals({ [key]: parseFloat(e.target.value) })}
                style={{ flex: 1, accentColor: color }}
              />
              <span style={{ fontSize: 10, color, width: 32, textAlign: 'right' }}>{(value * 100).toFixed(0)}%</span>
            </div>
          ))}
          {/* Evolution Points */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: '#888', width: 56 }}>Evo Pts</span>
            <input
              type="number" min={0} step={10}
              value={evolutionPoints}
              onChange={e => {
                const delta = parseInt(e.target.value) - evolutionPoints
                if (!isNaN(delta)) addEvolutionPoints(delta)
              }}
              style={{ width: 80, background: '#111', border: '1px solid #333', color: '#fff', borderRadius: 3, padding: '2px 6px', fontSize: 11 }}
            />
          </div>
          {/* Civ Tier */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#888', width: 56 }}>Civ Tier</span>
            <input
              type="range" min={0} max={9} step={1}
              value={civTier}
              onChange={e => setCivTier(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: '#a0f' }}
            />
            <span style={{ fontSize: 10, color: '#a0f', width: 32, textAlign: 'right' }}>T{civTier}</span>
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
