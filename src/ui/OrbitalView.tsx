// ── OrbitalView.tsx ───────────────────────────────────────────────────────────
// M13 Track B: Solar system view showing planetary orbital paths + probe data.
//
// Displayed inside TelescopeView when 'orbital' tab is selected.
//
// Visual elements:
//   - SVG canvas (400×400) showing the star at center (yellow circle)
//   - Elliptical orbital paths for each planet (dashed stroke, planet color)
//   - Current planet position dot (filled, pulsing if probe has visited)
//   - Planet info panel on hover/click
//   - "Launch Probe" button if player has orbital_capsule in inventory
//   - Probe result panel when PROBE_LANDED data available

import { useState, useEffect, useRef } from 'react'
import { SYSTEM_PLANETS, type PlanetDef, type ProbeResult } from '../game/OrbitalMechanicsSystem'
import { launchOrbitalCapsule, getOrbitEllipsePoints } from '../game/OrbitalMechanicsSystem'
import { useVelarStore } from '../store/velarStore'
import { inventory } from '../game/GameSingletons'

const CANVAS = 400   // SVG viewport size
const CENTER = CANVAS / 2

// Orbit radii in SVG units (scaled so Velar at 2.1 AU = ~160px from center)
const AU_TO_SVG = 72

interface Props {
  simTime: number   // current simulation time in seconds
}

// Get orbital ellipse SVG path from planet def
function orbitPath(planet: PlanetDef): string {
  const a = planet.semiMajorAU * AU_TO_SVG
  const e = planet.eccentricity
  const b = a * Math.sqrt(1 - e * e)
  // SVG ellipse centered at (CENTER, CENTER)
  return `M ${CENTER + a} ${CENTER} ` +
    `a ${a} ${b} 0 1 0 ${-2 * a} 0 ` +
    `a ${a} ${b} 0 1 0 ${2 * a} 0`
}

// Current planet position (simple circular approximation for display)
function planetPos(planet: PlanetDef, tSec: number): { x: number; y: number } {
  const tYears  = planet.semiMajorAU ** 1.5
  const period  = tYears * 365.25 * 86400
  const angle   = (tSec / period) * 2 * Math.PI
  const r       = planet.semiMajorAU * AU_TO_SVG
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  }
}

function hasOrbitalCapsule(): boolean {
  for (let i = 0; i < inventory.slotCount; i++) {
    const slot = inventory.getSlot(i)
    if (slot && slot.itemId === 66) return true
  }
  return false
}

export function OrbitalView({ simTime }: Props) {
  const [selected, setSelected]   = useState<string | null>(null)
  const [hasCapsule, setHasCapsule] = useState(false)
  const [launched, setLaunched]   = useState(false)
  const [tick, setTick]           = useState(0)
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const probeResults = useVelarStore(s => s.probeResults)

  // Refresh planet positions ~10Hz
  useEffect(() => {
    frameRef.current = setInterval(() => setTick(t => t + 1), 100)
    return () => { if (frameRef.current) clearInterval(frameRef.current) }
  }, [])

  // Check capsule availability
  useEffect(() => {
    setHasCapsule(hasOrbitalCapsule())
  }, [tick])

  function handleLaunch() {
    if (launchOrbitalCapsule()) {
      setLaunched(true)
      setHasCapsule(false)
      setTimeout(() => setLaunched(false), 8000)
    }
  }

  const selectedPlanet = SYSTEM_PLANETS.find(p => p.name === selected)
  const selectedProbe  = selected ? probeResults.get(selected) : undefined

  return (
    <div style={{
      width:      '100%',
      fontFamily: 'monospace',
      color:      '#b0c8e0',
    }}>
      <div style={{ fontSize: '11px', color: '#4a6a8a', marginBottom: '10px', letterSpacing: 2 }}>
        SOLAR SYSTEM — ORBITAL MECHANICS
      </div>

      {/* SVG orbital map */}
      <div style={{ position: 'relative', textAlign: 'center', marginBottom: '12px' }}>
        <svg
          width={CANVAS}
          height={CANVAS}
          viewBox={`0 0 ${CANVAS} ${CANVAS}`}
          style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}
        >
          {/* Background */}
          <rect width={CANVAS} height={CANVAS} fill="rgba(4,8,20,0.9)" rx={8} />

          {/* Orbital ellipses */}
          {SYSTEM_PLANETS.map(planet => (
            <path
              key={planet.name}
              d={orbitPath(planet)}
              fill="none"
              stroke={planet.color}
              strokeWidth={selected === planet.name ? 1.5 : 0.8}
              strokeDasharray={selected === planet.name ? '4 3' : '2 4'}
              opacity={selected === planet.name ? 0.9 : 0.4}
            />
          ))}

          {/* Star (our sun) */}
          <circle cx={CENTER} cy={CENTER} r={8} fill="#ffe080" opacity={0.95} />
          <circle cx={CENTER} cy={CENTER} r={14} fill="none" stroke="#ffe080" strokeWidth={1} opacity={0.3} />

          {/* Planet dots */}
          {SYSTEM_PLANETS.map(planet => {
            const pos = planetPos(planet, simTime + tick * 0.1)
            const hasProbe = probeResults.has(planet.name)
            const isSelected = selected === planet.name

            return (
              <g key={planet.name} style={{ cursor: 'pointer' }} onClick={() => setSelected(s => s === planet.name ? null : planet.name)}>
                {/* Outer glow ring if probe visited */}
                {hasProbe && (
                  <circle
                    cx={pos.x} cy={pos.y} r={9}
                    fill="none"
                    stroke={planet.color}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                )}
                {/* Planet body */}
                <circle
                  cx={pos.x} cy={pos.y}
                  r={isSelected ? 6 : 4}
                  fill={planet.color}
                  opacity={0.9}
                />
                {/* Planet name label */}
                <text
                  x={pos.x + 8}
                  y={pos.y + 4}
                  fill={planet.color}
                  fontSize={8}
                  opacity={0.7}
                  fontFamily="monospace"
                >
                  {planet.name}
                </text>
              </g>
            )
          })}

          {/* AU scale indicator */}
          <line x1={CENTER} y1={CANVAS - 16} x2={CENTER + AU_TO_SVG} y2={CANVAS - 16}
            stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
          <text x={CENTER + AU_TO_SVG / 2 - 8} y={CANVAS - 6}
            fill="rgba(255,255,255,0.25)" fontSize={7} fontFamily="monospace">
            1 AU
          </text>
        </svg>
      </div>

      {/* Selected planet detail */}
      {selectedPlanet && (
        <div style={{
          background:   'rgba(10,20,40,0.8)',
          border:       `1px solid ${selectedPlanet.color}44`,
          borderRadius: '6px',
          padding:      '10px 14px',
          marginBottom: '10px',
          fontSize:     '11px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: selectedPlanet.color,
              boxShadow: `0 0 6px ${selectedPlanet.color}`,
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#c0d8f0' }}>{selectedPlanet.name}</span>
            <span style={{ fontSize: 9, color: '#4a6a8a', marginLeft: 'auto' }}>
              {selectedPlanet.semiMajorAU} AU
            </span>
          </div>

          <div style={{ color: '#8ab0c8', lineHeight: 1.6, marginBottom: 8 }}>
            Type: {selectedPlanet.type}. Orbital period: {(selectedPlanet.semiMajorAU ** 1.5).toFixed(2)} years.
            Eccentricity: {selectedPlanet.eccentricity}.
          </div>

          {selectedProbe ? (
            <div style={{
              background: 'rgba(0,229,204,0.05)',
              border: '1px solid rgba(0,229,204,0.2)',
              borderRadius: 4,
              padding: '8px 10px',
              fontSize: 10,
            }}>
              <div style={{ color: '#00e5cc', marginBottom: 4, letterSpacing: '0.08em' }}>
                PROBE DATA
              </div>
              <div style={{ color: '#8ab0c8', lineHeight: 1.7 }}>
                Surface temp: {selectedProbe.surfaceTemp} K ({(selectedProbe.surfaceTemp - 273).toFixed(0)}°C)<br />
                Atmosphere: {selectedProbe.atmosphere}<br />
                Resources: {selectedProbe.resources.join(', ')}
              </div>
            </div>
          ) : (
            <div style={{ color: '#4a6a8a', fontSize: 10, fontStyle: 'italic' }}>
              No probe data — launch an orbital capsule to survey this planet.
            </div>
          )}
        </div>
      )}

      {/* Launch controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={handleLaunch}
          disabled={!hasCapsule || launched}
          style={{
            padding:       '8px 18px',
            background:    hasCapsule && !launched ? 'rgba(0,229,204,0.12)' : 'rgba(255,255,255,0.04)',
            border:        `1px solid ${hasCapsule && !launched ? 'rgba(0,229,204,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius:  '4px',
            color:         hasCapsule && !launched ? '#00e5cc' : '#4a6a8a',
            fontFamily:    'monospace',
            fontSize:      '11px',
            letterSpacing: '0.1em',
            cursor:        hasCapsule && !launched ? 'pointer' : 'not-allowed',
          }}
        >
          {launched ? 'PROBE EN ROUTE...' : hasCapsule ? 'LAUNCH ORBITAL CAPSULE' : 'NEED ORBITAL CAPSULE'}
        </button>
        <span style={{ fontSize: 9, color: '#3a5a7a' }}>
          {hasCapsule ? 'capsule ready' : 'craft: 3x Rocket + 5x Circuit Board + 10x Steel'}
        </span>
      </div>
    </div>
  )
}
