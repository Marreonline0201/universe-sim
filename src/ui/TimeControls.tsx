import { useGameStore } from '../store/gameStore'

const TIME_SCALES = [0.1, 0.5, 1, 10, 100, 1000, 10000, 100000, 1000000]
const LABELS      = ['0.1×', '0.5×', '1×', '10×', '100×', '1k×', '10k×', '100k×', '1M×']

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
  } as React.CSSProperties,
  pauseBtn: (paused: boolean): React.CSSProperties => ({
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
  scaleBtn: (active: boolean): React.CSSProperties => ({
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
          onClick={() => setTimeScale(s)}
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
