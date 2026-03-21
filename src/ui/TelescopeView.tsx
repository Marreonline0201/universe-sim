// ── TelescopeView.tsx ──────────────────────────────────────────────────────
// M11 Track D: Telescope overlay activated when player has ITEM.TELESCOPE equipped
// and presses F while facing the night sky.
//
// Renders a circular vignette (telescope barrel effect) with:
//   - Moon phase diagram (SVG arc showing illuminated fraction)
//   - Current moon age in days (0–28 day cycle synced to day/night angle)
//   - Three planet hints ("Distant light detected — spectral analysis suggests rocky body")
//   - L6 teaser: faint text "Signal detected — non-natural periodicity" on one planet
//
// Photorealism note: the vignette uses radial gradient with chromatic aberration
// at the edge (characteristic of refracting telescopes with uncorrected glass).

import React, { useEffect, useState } from 'react'

interface Props {
  dayAngle: number       // sun angle in radians — used to compute moon phase
  onClose: () => void
}

// Moon phase from day angle:
// Full cycle = 2π. Phase fraction 0=new moon, 0.5=full moon.
function getMoonPhase(dayAngle: number): { fraction: number; label: string; age: number } {
  // Moon phase offset from solar day — moon completes 1 orbit every ~29.5 sim days
  // We tie it to dayAngle for simplicity: one lunation = 10 full day cycles
  const lunationCycle = (dayAngle / (2 * Math.PI)) % 29.5
  const age = lunationCycle
  const fraction = (1 - Math.cos((age / 29.5) * 2 * Math.PI)) / 2

  let label = 'New Moon'
  if (age < 1.85)       label = 'New Moon'
  else if (age < 7.38)  label = 'Waxing Crescent'
  else if (age < 9.22)  label = 'First Quarter'
  else if (age < 14.77) label = 'Waxing Gibbous'
  else if (age < 16.61) label = 'Full Moon'
  else if (age < 22.15) label = 'Waning Gibbous'
  else if (age < 23.99) label = 'Last Quarter'
  else if (age < 29.5)  label = 'Waning Crescent'

  return { fraction, label, age }
}

// SVG moon phase — illuminated fraction rendered as a filled arc
function MoonPhaseDiagram({ fraction }: { fraction: number }) {
  const r = 40
  const cx = 60
  const cy = 60

  // Compute the terminator ellipse X-axis (a = r * cos(phase_angle))
  const phaseAngle = fraction * 2 * Math.PI
  const termX = r * Math.cos(phaseAngle - Math.PI / 2)
  const isWaxing = fraction < 0.5

  // Dark limb arc (full circle background)
  // Lit portion: SVG path using two arcs
  const sweep = fraction > 0.5 ? 1 : 0
  const termAbsX = Math.abs(termX)
  const lit = `
    M ${cx} ${cy - r}
    A ${r} ${r} 0 1 1 ${cx} ${cy + r}
    A ${termAbsX} ${r} 0 0 ${isWaxing ? 1 : 0} ${cx} ${cy - r}
    Z
  `

  return (
    <svg width={120} height={120} style={{ display: 'block', margin: '0 auto' }}>
      {/* Dark moon disc */}
      <circle cx={cx} cy={cy} r={r} fill="#1a1a2a" stroke="#4a4a6a" strokeWidth={1} />
      {/* Lit portion */}
      <path d={lit} fill="#d8d0c0" opacity={0.9} />
      {/* Limb glow */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff" strokeWidth={0.5} opacity={0.3} />
    </svg>
  )
}

const PLANET_DATA = [
  {
    name: 'Aethon',
    description: 'Rocky body, 0.7 AU. Spectral lines: Fe, Mg, SiO₂. Surface temperature ~340K.',
    teaser: null,
    color: '#ff9944',
  },
  {
    name: 'Velar',
    description: 'Gas giant, 2.1 AU. Methane and ammonia absorption bands detected. Faint ring system.',
    teaser: 'Signal periodicity: 1.847 Hz — anomalous. Non-thermal origin.',
    color: '#88bbff',
  },
  {
    name: 'Sulfis',
    description: 'Volcanic rocky world, 0.4 AU. SO₂ atmosphere, 700K surface. Intense infrared emission.',
    teaser: null,
    color: '#ffcc55',
  },
]

export function TelescopeView({ dayAngle, onClose }: Props) {
  const { fraction, label, age } = getMoonPhase(dayAngle)
  const [activePlanet, setActivePlanet] = useState<number | null>(null)

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)',
      pointerEvents: 'all',
    }}>
      {/* Telescope barrel vignette — circular aperture */}
      <div style={{
        position: 'relative',
        width: 640,
        height: 640,
        borderRadius: '50%',
        overflow: 'hidden',
        boxShadow: '0 0 0 200px rgba(0,0,0,0.97), 0 0 80px 20px rgba(0,0,0,0.9)',
        background: 'radial-gradient(circle at 50% 50%, #050a14 60%, #0a0520 100%)',
        border: '3px solid #2a2a3a',
      }}>
        {/* Chromatic aberration ring (characteristic of uncorrected glass lens) */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          boxShadow: 'inset 0 0 60px 20px rgba(80,40,180,0.18), inset 0 0 30px 8px rgba(220,100,40,0.12)',
          pointerEvents: 'none',
          zIndex: 10,
        }} />

        {/* Star field texture (CSS radial dots approximation) */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(1px 1px at 15% 20%, rgba(255,255,255,0.8) 0%, transparent 100%),' +
            'radial-gradient(1px 1px at 72% 35%, rgba(255,240,200,0.7) 0%, transparent 100%),' +
            'radial-gradient(1.5px 1.5px at 43% 68%, rgba(200,220,255,0.9) 0%, transparent 100%),' +
            'radial-gradient(1px 1px at 88% 55%, rgba(255,255,255,0.6) 0%, transparent 100%),' +
            'radial-gradient(1px 1px at 28% 80%, rgba(255,200,180,0.7) 0%, transparent 100%),' +
            'radial-gradient(1px 1px at 60% 15%, rgba(255,255,255,0.5) 0%, transparent 100%),' +
            'radial-gradient(1px 1px at 5% 55%, rgba(200,230,255,0.6) 0%, transparent 100%),' +
            'radial-gradient(1.5px 1.5px at 80% 80%, rgba(255,240,200,0.8) 0%, transparent 100%)',
        }} />

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 5,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          height: '100%',
          gap: 20,
          fontFamily: 'monospace',
          color: '#b0c8e0',
        }}>
          {/* Title */}
          <div style={{ fontSize: 13, letterSpacing: 3, color: '#6080a0', textTransform: 'uppercase' }}>
            Refracting Telescope — Observation Log
          </div>

          {/* Moon section */}
          <div style={{
            background: 'rgba(10,20,40,0.7)',
            border: '1px solid #1a2a4a',
            borderRadius: 8,
            padding: '12px 20px',
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#4a6a8a', marginBottom: 8, letterSpacing: 2 }}>LUNAR OBSERVATION</div>
            <MoonPhaseDiagram fraction={fraction} />
            <div style={{ marginTop: 8, fontSize: 14, color: '#d0e4f0' }}>{label}</div>
            <div style={{ fontSize: 11, color: '#4a6a8a', marginTop: 4 }}>
              Age: {age.toFixed(1)} days — Illumination: {(fraction * 100).toFixed(0)}%
            </div>
          </div>

          {/* Planets section */}
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: 11, color: '#4a6a8a', marginBottom: 8, letterSpacing: 2 }}>WANDERING STARS (PLANETS)</div>
            {PLANET_DATA.map((planet, i) => (
              <div
                key={planet.name}
                onClick={() => setActivePlanet(activePlanet === i ? null : i)}
                style={{
                  padding: '8px 12px',
                  marginBottom: 6,
                  background: activePlanet === i ? 'rgba(30,60,90,0.8)' : 'rgba(10,20,40,0.5)',
                  border: `1px solid ${activePlanet === i ? '#2a5a8a' : '#1a2a3a'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: planet.color,
                    boxShadow: `0 0 6px ${planet.color}`,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, color: '#c0d8f0', fontWeight: 600 }}>{planet.name}</span>
                  <span style={{ fontSize: 10, color: '#4a6a8a', marginLeft: 'auto' }}>
                    {activePlanet === i ? '[ collapse ]' : '[ analyze ]'}
                  </span>
                </div>
                {activePlanet === i && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#8ab0c8', lineHeight: 1.5 }}>
                      {planet.description}
                    </div>
                    {planet.teaser && (
                      <div style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        background: 'rgba(80,40,0,0.4)',
                        border: '1px solid #6a4a20',
                        borderRadius: 4,
                        fontSize: 10,
                        color: '#d4a060',
                        fontStyle: 'italic',
                      }}>
                        ANOMALY DETECTED: {planet.teaser}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: '#2a4a6a', marginTop: 'auto' }}>
            Press ESC to lower telescope
          </div>
        </div>
      </div>

      {/* Close button outside barrel */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20, right: 20,
          background: 'rgba(20,30,50,0.9)',
          border: '1px solid #2a4a6a',
          color: '#8ab0c8',
          padding: '6px 14px',
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        Lower Telescope [ESC]
      </button>
    </div>
  )
}
