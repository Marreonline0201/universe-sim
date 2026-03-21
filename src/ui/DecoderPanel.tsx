// ── DecoderPanel.tsx ──────────────────────────────────────────────────────────
// M13 Track A: Morse decoder for the Velar anomaly signal.
//
// The signal from VelarSignalView blinks in a seeded pattern.
// Player clicks a DOT or DASH button to match each pulse.
// The correct sequence (8 symbols, derived from world seed 0xdeadbeef)
// reveals the Velar star coordinates: "14h42m / -60.8° / 4.2AU"
//
// On success:
//   1. Fires VELAR_DECODED WS message to server.
//   2. Server persists to discoveries table and broadcasts to all players.
//   3. FirstContactOverlay cinematic fires.
//
// Visual: dark teal terminal aesthetic matching VelarSignalView.

import { useState, useEffect, useRef } from 'react'
import { getWorldSocket } from '../net/useWorldSocket'

// ── Correct decode sequence (seeded from 0xdeadbeef) ──────────────────────────
// Derived from the same seededRand used in NightSkyRenderer — consistent world.
// 8-symbol Morse: DOT=short, DASH=long. Spells visual "VELAR" in our encoding.
export const VELAR_SEQUENCE: Array<'dot' | 'dash'> = [
  'dash', 'dot', 'dash', 'dot',   // V E (simplified)
  'dot',  'dash', 'dot',  'dash', // L A R
]

const SYMBOL_LABELS: Record<'dot' | 'dash', string> = {
  dot:  '●  SHORT',
  dash: '━  LONG',
}

interface Props {
  onSuccess: () => void
  disabled?: boolean
}

export function DecoderPanel({ onSuccess, disabled }: Props) {
  const [entered, setEntered] = useState<Array<'dot' | 'dash'>>([])
  const [feedback, setFeedback] = useState<'idle' | 'error' | 'success'>('idle')
  const [attempts, setAttempts] = useState(0)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Current progress vs correct sequence
  const currentPos = entered.length
  const isDone     = currentPos >= VELAR_SEQUENCE.length

  function handleInput(sym: 'dot' | 'dash') {
    if (disabled || isDone || feedback === 'error') return

    const expected = VELAR_SEQUENCE[currentPos]
    if (sym === expected) {
      const next = [...entered, sym]
      setEntered(next)
      if (next.length === VELAR_SEQUENCE.length) {
        // Correct!
        setFeedback('success')
        // Broadcast to server
        try {
          const ws = getWorldSocket()
          if (ws) ws.send({ type: 'VELAR_DECODED' })
        } catch {}
        onSuccess()
      }
    } else {
      // Wrong input — flash error, reset
      setFeedback('error')
      setAttempts(a => a + 1)
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
      feedbackTimer.current = setTimeout(() => {
        setEntered([])
        setFeedback('idle')
      }, 900)
    }
  }

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
  }, [])

  const borderColor =
    feedback === 'success' ? '#00e5cc' :
    feedback === 'error'   ? '#ff3030' :
    '#1a3a3a'

  return (
    <div style={{
      background:   '#060f0f',
      border:       `1px solid ${borderColor}`,
      borderRadius: '6px',
      padding:      '16px 20px',
      fontFamily:   '"Courier New", monospace',
      color:        '#00e5cc',
      marginTop:    '12px',
      transition:   'border-color 0.2s',
      boxShadow:    `0 0 16px ${borderColor}22`,
    }}>

      {/* Header */}
      <div style={{ fontSize: '10px', letterSpacing: '0.15em', opacity: 0.7, marginBottom: '12px' }}>
        SIGNAL DECODER — MATCH THE PULSE SEQUENCE
      </div>

      {/* Sequence progress display */}
      <div style={{
        display:       'flex',
        gap:           '6px',
        alignItems:    'center',
        marginBottom:  '14px',
        flexWrap:      'wrap',
      }}>
        {VELAR_SEQUENCE.map((sym, i) => {
          const state =
            i < entered.length  ? (entered[i] === sym ? 'correct' : 'wrong') :
            i === entered.length ? 'active' :
            'pending'

          const bg =
            state === 'correct' ? '#00e5cc' :
            state === 'wrong'   ? '#ff3030' :
            state === 'active'  ? 'rgba(0,229,204,0.25)' :
            'rgba(255,255,255,0.06)'

          const border =
            state === 'active'  ? '1px solid #00e5cc' :
            state === 'correct' ? '1px solid #00e5cc' :
            state === 'wrong'   ? '1px solid #ff3030' :
            '1px solid rgba(255,255,255,0.1)'

          return (
            <div
              key={i}
              style={{
                width:        sym === 'dash' ? '28px' : '12px',
                height:       '12px',
                borderRadius: '2px',
                background:   bg,
                border,
                transition:   'all 0.15s',
                boxShadow:    state === 'active' ? '0 0 8px rgba(0,229,204,0.5)' : 'none',
              }}
            />
          )
        })}
        <span style={{ fontSize: '9px', opacity: 0.4, marginLeft: '8px' }}>
          {currentPos}/{VELAR_SEQUENCE.length}
        </span>
      </div>

      {/* Hint for current expected input */}
      {!isDone && feedback !== 'error' && feedback !== 'success' && (
        <div style={{ fontSize: '9px', opacity: 0.45, marginBottom: '10px', letterSpacing: '0.08em' }}>
          NEXT: {VELAR_SEQUENCE[currentPos] === 'dot' ? 'SHORT PULSE' : 'LONG PULSE'}
        </div>
      )}

      {/* Buttons */}
      {!isDone && feedback !== 'success' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['dot', 'dash'] as const).map(sym => (
            <button
              key={sym}
              onClick={() => handleInput(sym)}
              disabled={disabled || feedback === 'error'}
              style={{
                flex:          sym === 'dash' ? 2 : 1,
                padding:       '10px 0',
                background:    'rgba(0,229,204,0.08)',
                border:        '1px solid rgba(0,229,204,0.3)',
                borderRadius:  '4px',
                color:         '#00e5cc',
                fontFamily:    '"Courier New", monospace',
                fontSize:      '11px',
                letterSpacing: '0.08em',
                cursor:        disabled || feedback === 'error' ? 'not-allowed' : 'pointer',
                opacity:       disabled || feedback === 'error' ? 0.4 : 1,
                transition:    'background 0.1s',
              }}
              onMouseEnter={e => {
                if (!disabled && feedback !== 'error')
                  e.currentTarget.style.background = 'rgba(0,229,204,0.18)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(0,229,204,0.08)'
              }}
            >
              {SYMBOL_LABELS[sym]}
            </button>
          ))}
        </div>
      )}

      {/* Status messages */}
      {feedback === 'error' && (
        <div style={{ fontSize: '10px', color: '#ff3030', marginTop: '8px', letterSpacing: '0.08em' }}>
          INCORRECT SEQUENCE — RESETTING... (attempt {attempts})
        </div>
      )}
      {feedback === 'success' && (
        <div style={{ fontSize: '10px', color: '#00e5cc', marginTop: '8px', letterSpacing: '0.1em' }}>
          COORDINATES LOCKED — VELAR // 4.2 AU // RA 14h 42m DEC -60.8°
        </div>
      )}
      {!isDone && feedback === 'idle' && attempts > 2 && (
        <div style={{ fontSize: '9px', opacity: 0.35, marginTop: '8px' }}>
          Hint: match the blink pattern above — short blink = DOT, long blink = DASH
        </div>
      )}
    </div>
  )
}
