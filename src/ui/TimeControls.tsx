import type { CSSProperties } from 'react'
import { useAuth } from '@clerk/react'
import { useGameStore } from '../store/gameStore'

const TIME_SCALES = [0.1, 0.5, 1, 10, 100, 1000, 10000, 100000, 1000000, 1e8, 1e9, 1e10, 1e12]
const LABELS      = ['0.1×', '0.5×', '1×', '10×', '100×', '1k×', '10k×', '100k×', '1M×', '100M×', '1B×', '10B×', '1T×']

const styles = {
  container: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    background: 'rgba(0,0,0,0.75)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '6px 14px',
    backdropFilter: 'blur(6px)',
  } as CSSProperties,
  pauseBtn: (paused: boolean): CSSProperties => ({
    color: paused ? '#e74c3c' : '#2ecc71',
    background: 'none',
    border: `1px solid ${paused ? '#e74c3c' : '#2ecc71'}`,
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 14,
    minWidth: 36,
    transition: 'all 0.15s',
  }),
  scaleBtn: (active: boolean): CSSProperties => ({
    color: active ? '#f1c40f' : '#888',
    background: active ? 'rgba(241,196,15,0.15)' : 'none',
    border: `1px solid ${active ? '#f1c40f' : '#333'}`,
    borderRadius: 4,
    padding: '3px 7px',
    cursor: 'pointer',
    fontSize: 10,
    fontFamily: 'monospace',
    transition: 'all 0.1s',
  }),
} as const

export function TimeControls() {
  const { paused, togglePause, timeScale, setTimeScale } = useGameStore()
  const { getToken } = useAuth()

  async function handleSetTimeScale(s: number) {
    setTimeScale(s)
    // Persist to server so all players get the new time scale
    const token = await getToken()
    fetch('/api/world-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ timeScale: s }),
    }).catch(() => {})
  }

  return (
    <div style={styles.container}>
      <button
        onClick={togglePause}
        style={styles.pauseBtn(paused)}
        title={paused ? 'Resume simulation' : 'Pause simulation'}
        aria-label={paused ? 'Resume' : 'Pause'}
      >
        {paused ? '▶' : '⏸'}
      </button>

      {TIME_SCALES.map((s, i) => (
        <button
          key={s}
          onClick={() => handleSetTimeScale(s)}
          style={styles.scaleBtn(timeScale === s)}
          title={`Set time scale to ${LABELS[i]}`}
          aria-label={`Time scale ${LABELS[i]}`}
          aria-pressed={timeScale === s}
        >
          {LABELS[i]}
        </button>
      ))}
    </div>
  )
}
