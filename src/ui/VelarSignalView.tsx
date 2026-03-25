// ── VelarSignalView ───────────────────────────────────────────────────────────
// M12: Overlay panel shown inside TelescopeView when ANOMALY_SIGNAL is received.
//
// Visual design:
//   - Dark teal/black panel (bg #0a1a1a, border 1px #00e5cc)
//   - Header: "ANOMALY SIGNAL — VELAR" in monospace, blinking red dot on left
//   - Morse-code-style blinking message display:
//       Short = 200ms on, 200ms off
//       Long  = 600ms on, 200ms off
//       Encoded from the anomaly message text for visual effect
//   - Signal strength bars (5 bars, animated fill left→right, 0.5Hz oscillation)
//   - Origin coordinates display: "VELAR // 4.2 AU // RA 14h 42m DEC -60.8°"
//     (fixed fictional coordinates consistent with M11 telescope reveal)
//   - L7 teaser text (bottom): "Classification: UNKNOWN INTELLIGENCE. Access level 7 required."
//   - Flashing "TRANSMITTING RESPONSE..." footer when active

import { useState, useEffect, useRef } from 'react'
import { DecoderPanel } from './DecoderPanel'
import { useVelarStore } from '../store/velarStore'
import { getLocalUserId, getLocalUsername } from '../net/useWorldSocket'

export interface AnomalySignalData {
  launcherId:   string
  launcherName: string
  message:      string
  timestamp:    number
}

interface Props {
  signal: AnomalySignalData | null
}

// ── Morse encoding (visual only — not standard ITU Morse) ─────────────────────

function textToMorsePulses(text: string): Array<{ dur: number; gap: number }> {
  // Simple visual encoding: each character gets 1-3 pulses based on char code parity
  const pulses: Array<{ dur: number; gap: number }> = []
  for (let i = 0; i < Math.min(text.length, 24); i++) {
    const c    = text.charCodeAt(i)
    const long = (c % 3) === 0
    pulses.push({ dur: long ? 600 : 200, gap: 200 })
    if (i % 5 === 4) pulses.push({ dur: 0, gap: 600 })  // word gap
  }
  return pulses
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VelarSignalView({ signal }: Props) {
  const [morseOn, setMorseOn]         = useState(false)
  const [pulseIdx, setPulseIdx]       = useState(0)
  const [signalBars, setSignalBars]   = useState([0.3, 0.5, 0.7, 0.9, 0.6])
  const [transmitting, setTransmitting] = useState(false)
  const [showDecoder, setShowDecoder]   = useState(false)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const isDecoded   = useVelarStore(s => s.isDecoded)
  const markDecoded = useVelarStore(s => s.markDecoded)

  const pulses = signal ? textToMorsePulses(signal.message) : []

  // Morse animation
  useEffect(() => {
    if (!signal || pulses.length === 0) return
    let idx = 0

    function step() {
      const p = pulses[idx % pulses.length]
      if (p.dur > 0) {
        setMorseOn(true)
        timerRef.current = setTimeout(() => {
          setMorseOn(false)
          timerRef.current = setTimeout(() => {
            idx++
            setPulseIdx(idx)
            step()
          }, p.gap)
        }, p.dur)
      } else {
        setMorseOn(false)
        timerRef.current = setTimeout(() => {
          idx++
          setPulseIdx(idx)
          step()
        }, p.gap)
      }
    }
    step()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [signal?.timestamp])

  // Signal bars animation
  useEffect(() => {
    if (!signal) return
    frameRef.current = setInterval(() => {
      const t = Date.now() / 1000
      setSignalBars([
        0.5 + 0.4 * Math.sin(t * 1.3),
        0.5 + 0.4 * Math.sin(t * 1.7 + 0.5),
        0.5 + 0.4 * Math.sin(t * 0.9 + 1.0),
        0.5 + 0.4 * Math.sin(t * 2.1 + 1.5),
        0.5 + 0.4 * Math.sin(t * 1.5 + 2.0),
      ])
    }, 80)

    // Transmitting footer after 3s
    const tt = setTimeout(() => setTransmitting(true), 3000)

    return () => {
      if (frameRef.current) clearInterval(frameRef.current)
      clearTimeout(tt)
      setTransmitting(false)
    }
  }, [signal?.timestamp])

  if (!signal) return null

  return (
    <div style={{
      position:        'absolute',
      bottom:          '80px',
      left:            '50%',
      transform:       'translateX(-50%)',
      width:           '480px',
      background:      '#0a1a1a',
      border:          '1px solid #00e5cc',
      borderRadius:    '4px',
      padding:         '14px 18px',
      fontFamily:      '"Courier New", monospace',
      color:           '#00e5cc',
      boxShadow:       '0 0 24px rgba(0,229,204,0.3)',
      pointerEvents:   'none',
      zIndex:          200,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{
          width:           '8px',
          height:          '8px',
          borderRadius:    '50%',
          background:      '#ff3030',
          animation:       'pulse-red 0.8s ease-in-out infinite',
          boxShadow:       '0 0 8px #ff3030',
        }} />
        <span style={{ fontSize: '11px', letterSpacing: '0.15em', fontWeight: 'bold' }}>
          ANOMALY SIGNAL — VELAR
        </span>
      </div>

      {/* Morse display */}
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:           '6px',
        marginBottom:  '10px',
        height:        '18px',
      }}>
        <span style={{ fontSize: '9px', opacity: 0.5 }}>SIG</span>
        <div style={{
          width:        '16px',
          height:       '16px',
          borderRadius: '50%',
          background:   morseOn ? '#00e5cc' : '#002222',
          boxShadow:    morseOn ? '0 0 12px #00e5cc' : 'none',
          transition:   'background 40ms, box-shadow 40ms',
        }} />
        <div style={{
          flex:       1,
          height:     '2px',
          background: '#002222',
          position:   'relative',
          overflow:   'hidden',
        }}>
          <div style={{
            position:   'absolute',
            left:       0, top: 0,
            height:     '100%',
            width:      `${(pulseIdx % 24) / 24 * 100}%`,
            background: '#00e5cc',
            opacity:    0.4,
            transition: 'width 80ms linear',
          }} />
        </div>
      </div>

      {/* Message */}
      <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '10px', lineHeight: 1.4 }}>
        {signal.message}
      </div>

      {/* Origin coordinates */}
      <div style={{ fontSize: '9px', opacity: 0.5, marginBottom: '10px', letterSpacing: '0.05em' }}>
        ORIGIN: VELAR // 4.2 AU // RA 14h 42m DEC -60.8°
      </div>

      {/* Signal bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', marginBottom: '10px', height: '20px' }}>
        {signalBars.map((v, i) => (
          <div key={i} style={{
            width:      '14px',
            height:     `${Math.round(v * 20)}px`,
            background: '#00e5cc',
            opacity:    0.6 + v * 0.3,
            transition: 'height 80ms ease',
          }} />
        ))}
        <span style={{ fontSize: '9px', opacity: 0.4, marginLeft: '6px', paddingBottom: '2px' }}>
          SIGNAL STRENGTH
        </span>
      </div>

      {/* L7 teaser */}
      <div style={{
        fontSize:      '9px',
        color:         '#ff6060',
        opacity:       0.7,
        marginBottom:  '8px',
        letterSpacing: '0.08em',
      }}>
        CLASSIFICATION: UNKNOWN INTELLIGENCE // ACCESS LEVEL 7 REQUIRED
      </div>

      {/* M13: Decoder button / status */}
      {!isDecoded && !showDecoder && transmitting && (
        <button
          onClick={() => setShowDecoder(true)}
          style={{
            display:       'block',
            width:         '100%',
            marginBottom:  '8px',
            padding:       '8px 0',
            background:    'rgba(0,229,204,0.1)',
            border:        '1px solid rgba(0,229,204,0.4)',
            borderRadius:  '4px',
            color:         '#00e5cc',
            fontFamily:    '"Courier New", monospace',
            fontSize:      '10px',
            letterSpacing: '0.12em',
            cursor:        'pointer',
            pointerEvents: 'all',
          }}
        >
          ATTEMPT DECODE
        </button>
      )}

      {showDecoder && !isDecoded && (
        <div style={{ pointerEvents: 'all' }}>
          <DecoderPanel
            onSuccess={() => {
              markDecoded(getLocalUserId(), getLocalUsername())
            }}
          />
        </div>
      )}

      {isDecoded && (
        <div style={{
          fontSize:      '9px',
          color:         '#00e5cc',
          marginBottom:  '8px',
          letterSpacing: '0.1em',
          opacity:       0.9,
        }}>
          COORDINATES LOCKED — VELAR CONTACT ESTABLISHED
        </div>
      )}

      {/* Transmitting footer */}
      {transmitting && (
        <div style={{
          fontSize:   '9px',
          opacity:    0.5,
          animation:  'blink-slow 1.2s step-end infinite',
        }}>
          TRANSMITTING RESPONSE...
        </div>
      )}

      <style>{`
        @keyframes pulse-red {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes blink-slow {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 0.1; }
        }
      `}</style>
    </div>
  )
}
