// ── FirstContactOverlay.tsx ───────────────────────────────────────────────────
// M13 Track A: Cinematic overlay shown to ALL players when VELAR_DECODED fires.
//
// Sequence (12 seconds total):
//   0-1s:  Black fade-in from transparent
//   1-3s:  Night sky materialises — 200 CSS stars appear
//   3-6s:  A single point of light pulses at Velar coordinates (top-right quadrant)
//   6-9s:  Text fades in: "First Contact — the universe is not empty."
//   9-11s: Secondary text: decoded by <playerName>
//   11-12s: Fade out, dismiss
//
// Photorealism approach: uses CSS radial-gradient star field so it works as a DOM
// overlay without requiring a Three.js canvas. The pulsing Velar dot uses a
// compound box-shadow to simulate atmospheric scintillation.

import { useEffect, useState, useRef } from 'react'

interface Props {
  decoderName: string  // who decoded it
  onDone: () => void
}

// Pre-computed star positions (seeded, stable across renders)
function generateStars(count: number) {
  const stars: Array<{ x: number; y: number; size: number; opacity: number }> = []
  let s = 0xdeadbeef >>> 0
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff }
  for (let i = 0; i < count; i++) {
    stars.push({
      x:       rand() * 100,
      y:       rand() * 100,
      size:    0.5 + rand() * 1.5,
      opacity: 0.3 + rand() * 0.7,
    })
  }
  return stars
}

const STARS = generateStars(200)

export function FirstContactOverlay({ decoderName, onDone }: Props) {
  const [phase, setPhase]           = useState<'fadein' | 'stars' | 'pulse' | 'text' | 'fadeout'>('fadein')
  const [overlayOpacity, setOverlayOpacity] = useState(0)
  const [starsOpacity, setStarsOpacity]     = useState(0)
  const [velarOpacity, setVelarOpacity]     = useState(0)
  const [textOpacity, setTextOpacity]       = useState(0)
  const [subTextOpacity, setSubTextOpacity] = useState(0)
  const [velarPulse, setVelarPulse]         = useState(0)   // 0–1 sine
  const [done, setDone]                     = useState(false)
  const frameRef = useRef<number | null>(null)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const start = Date.now()
    startRef.current = start

    function animate() {
      const t = (Date.now() - start) / 1000  // seconds elapsed

      // Overlay background fade-in
      setOverlayOpacity(Math.min(1, t / 1.0))

      // Stars fade in 1–3s
      setStarsOpacity(t < 1 ? 0 : Math.min(1, (t - 1) / 2))

      // Velar dot appears 3–4s, pulses 4–8s
      if (t >= 3) {
        const vt = t - 3
        setVelarOpacity(Math.min(1, vt / 0.8))
        setVelarPulse(0.5 + 0.5 * Math.sin(vt * 2.5))
      }

      // Primary text fades in 6–7.5s
      setTextOpacity(t < 6 ? 0 : Math.min(1, (t - 6) / 1.5))

      // Sub-text fades in 8.5–10s
      setSubTextOpacity(t < 8.5 ? 0 : Math.min(1, (t - 8.5) / 1.5))

      if (t >= 12) {
        // Fade out
        const ft = t - 12
        const fo = Math.max(0, 1 - ft / 1.2)
        setOverlayOpacity(fo)
        setStarsOpacity(fo)
        setTextOpacity(fo)
        setSubTextOpacity(fo)
        setVelarOpacity(fo)
        if (ft >= 1.2 && !done) {
          setDone(true)
          onDone()
        }
        return
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <div style={{
      position:        'fixed',
      inset:           0,
      zIndex:          9000,
      background:      `rgba(0,0,8,${overlayOpacity})`,
      pointerEvents:   'none',
      overflow:        'hidden',
    }}>
      {/* Star field */}
      <div style={{ position: 'absolute', inset: 0, opacity: starsOpacity, transition: 'opacity 0.1s' }}>
        {STARS.map((star, i) => (
          <div
            key={i}
            style={{
              position:    'absolute',
              left:        `${star.x}%`,
              top:         `${star.y}%`,
              width:       `${star.size}px`,
              height:      `${star.size}px`,
              borderRadius: '50%',
              background:  '#ffffff',
              opacity:     star.opacity,
              transform:   'translate(-50%, -50%)',
            }}
          />
        ))}
      </div>

      {/* Velar point of light — top-right quadrant at RA 14h42m DEC -60.8° */}
      {velarOpacity > 0 && (
        <div style={{
          position:    'absolute',
          left:        '72%',
          top:         '28%',
          transform:   'translate(-50%, -50%)',
          opacity:     velarOpacity,
        }}>
          <div style={{
            width:        '8px',
            height:       '8px',
            borderRadius: '50%',
            background:   '#88bbff',
            boxShadow: [
              `0 0 ${4 + velarPulse * 8}px ${2 + velarPulse * 4}px rgba(136,187,255,${0.6 + velarPulse * 0.4})`,
              `0 0 ${16 + velarPulse * 24}px ${4 + velarPulse * 8}px rgba(136,187,255,${0.2 + velarPulse * 0.2})`,
            ].join(', '),
            transition:   'box-shadow 0.08s',
          }} />
        </div>
      )}

      {/* Primary text */}
      <div style={{
        position:    'absolute',
        bottom:      '38%',
        left:        '50%',
        transform:   'translateX(-50%)',
        textAlign:   'center',
        opacity:     textOpacity,
        fontFamily:  '"Courier New", monospace',
        color:       '#d0e8ff',
        whiteSpace:  'nowrap',
      }}>
        <div style={{ fontSize: '22px', letterSpacing: '0.2em', fontWeight: 300 }}>
          First Contact
        </div>
        <div style={{
          fontSize:      '13px',
          letterSpacing: '0.3em',
          color:         '#8ab0d0',
          marginTop:     '10px',
          opacity:       0.9,
        }}>
          THE UNIVERSE IS NOT EMPTY
        </div>
      </div>

      {/* Sub-text — decoder credit */}
      <div style={{
        position:      'absolute',
        bottom:        '30%',
        left:          '50%',
        transform:     'translateX(-50%)',
        textAlign:     'center',
        opacity:       subTextOpacity,
        fontFamily:    '"Courier New", monospace',
        color:         'rgba(136,187,255,0.6)',
        fontSize:      '11px',
        letterSpacing: '0.15em',
        whiteSpace:    'nowrap',
      }}>
        DECODED BY {decoderName.toUpperCase()} — VELAR COORDINATES CONFIRMED
      </div>

      <style>{`
        @keyframes velar-scintillate {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 1.0; }
        }
      `}</style>
    </div>
  )
}
