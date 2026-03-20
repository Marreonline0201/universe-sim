// ── WorldBootstrapScreen ────────────────────────────────────────────────────────
// Full-screen animated timelapse UI shown while the server bootstraps the world.
// Players cannot join until bootstrapping is complete.

import { useEffect, useState } from 'react'
import type { BootstrapStatus } from '../hooks/useBootstrapStatus'

// Cosmic epochs with real start times (years since Big Bang).
// Earth formed 4.5 Gyr ago; universe is 13.8 Gyr old → Earth = 9.3 Gyr after Big Bang.
const EPOCHS = [
  { name: 'Quantum Singularity',  startYear: 0,        color: '#ffffff' },
  { name: 'Quark-Gluon Plasma',   startYear: 0.00001,  color: '#ff6b35' },
  { name: 'Hadron Formation',     startYear: 0.001,    color: '#ff9500' },
  { name: 'Nucleosynthesis',      startYear: 3,        color: '#ffcc00' },
  { name: 'Recombination Era',    startYear: 380_000,  color: '#ffe8a0' },
  { name: 'Dark Ages',            startYear: 500_000,  color: '#1a1a2e' },
  { name: 'First Stars Ignite',   startYear: 200_000_000, color: '#4fc3f7' },
  { name: 'Galaxy Formation',     startYear: 1_000_000_000, color: '#7e57c2' },
  { name: 'Stellar Nurseries',    startYear: 3_000_000_000, color: '#ef5350' },
  { name: 'Milky Way Matures',    startYear: 6_000_000_000, color: '#ab47bc' },
  { name: 'Solar System Forms',   startYear: 9_100_000_000, color: '#ff8f00' },
  { name: 'Earth Accretion',      startYear: 9_200_000_000, color: '#5d4037' },
  { name: 'Hadean Eon',           startYear: 9_250_000_000, color: '#b71c1c' },
  { name: 'World Ready',          startYear: 9_280_000_000, color: '#00e676' },
]

const SECS_PER_YEAR = 31_557_600 // Julian year
const BOOTSTRAP_TARGET_YEARS = 9.3e9

function getEpoch(simTimeSec: number) {
  const years = simTimeSec / SECS_PER_YEAR
  let current = EPOCHS[0]
  for (const e of EPOCHS) {
    if (years >= e.startYear) current = e
    else break
  }
  return current
}

function formatSimTime(simTimeSec: number): string {
  const years = simTimeSec / SECS_PER_YEAR
  if (years < 1) return `${(simTimeSec * 1000).toFixed(0)} ms`
  if (years < 1000) return `${years.toFixed(2)} years`
  if (years < 1_000_000) return `${(years / 1000).toFixed(2)} thousand years`
  if (years < 1_000_000_000) return `${(years / 1_000_000).toFixed(2)} million years`
  return `${(years / 1_000_000_000).toFixed(3)} billion years`
}


// Cinematic duration for the local animation (seconds of wall-clock time)
const ANIM_DURATION_SEC = 8

interface Props {
  status: BootstrapStatus
}

export function WorldBootstrapScreen({ status }: Props) {
  const { progress } = status
  const [tick, setTick] = useState(0)

  // Local animation timer — runs independently at fixed cinematic speed (8 seconds).
  // The server bootstrap completes almost instantly; this gives a smooth visual.
  const [animYears, setAnimYears] = useState(0)
  useEffect(() => {
    const startMs = performance.now()
    const id = setInterval(() => {
      const elapsed = (performance.now() - startMs) / 1000
      const fraction = Math.min(elapsed / ANIM_DURATION_SEC, 1)
      setAnimYears(fraction * BOOTSTRAP_TARGET_YEARS)
      setTick(t => t + 1)
    }, 80)
    return () => clearInterval(id)
  }, [])

  const animTimeSec = animYears * SECS_PER_YEAR
  const epoch = getEpoch(animTimeSec)
  // Progress bar uses server progress (accurate) but falls back to local animation fraction
  const pct = Math.min(100, Math.max(progress * 100, (animYears / BOOTSTRAP_TARGET_YEARS) * 100))

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at center, #050510 0%, #000005 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', color: '#fff', overflow: 'hidden',
      zIndex: 99999,
    }}>
      {/* Star field */}
      <StarField tick={tick} />

      {/* Central content */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 520, width: '90%' }}>

        {/* Title */}
        <div style={{ fontSize: 11, letterSpacing: 8, opacity: 0.4, marginBottom: 32, textTransform: 'uppercase' }}>
          Universe Simulation
        </div>

        {/* Epoch glow orb */}
        <div style={{
          width: 120, height: 120, borderRadius: '50%', margin: '0 auto 32px',
          background: `radial-gradient(circle, ${epoch.color}88 0%, ${epoch.color}22 60%, transparent 100%)`,
          boxShadow: `0 0 60px ${epoch.color}55, 0 0 120px ${epoch.color}22`,
          animation: 'pulse 2s ease-in-out infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 40 }}>
            {getEpochIcon(epoch.name)}
          </div>
        </div>

        {/* Epoch name */}
        <div style={{
          fontSize: 22, fontWeight: 700, marginBottom: 8,
          color: epoch.color, textShadow: `0 0 20px ${epoch.color}88`,
          transition: 'color 1s ease',
        }}>
          {epoch.name}
        </div>

        {/* Sim time */}
        <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 32 }}>
          {formatSimTime(animTimeSec)} elapsed
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%', height: 6, background: 'rgba(255,255,255,0.08)',
          borderRadius: 3, marginBottom: 12, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: `linear-gradient(90deg, #1a237e, ${epoch.color})`,
            borderRadius: 3,
            boxShadow: `0 0 12px ${epoch.color}99`,
            transition: 'width 0.5s ease',
          }} />
        </div>

        {/* Progress stats */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 11, opacity: 0.5, marginBottom: 40,
        }}>
          <span>{pct.toFixed(1)}% complete</span>
        </div>

        {/* Epoch timeline mini-map */}
        <EpochTimeline progress={progress} />

        {/* Wait message */}
        <div style={{
          marginTop: 40, fontSize: 11, opacity: 0.35, letterSpacing: 3,
          textTransform: 'uppercase', animation: 'blink 2s ease-in-out infinite',
        }}>
          World forming — please wait
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes blink {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.15; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}

// ── Star field ────────────────────────────────────────────────────────────────

const STARS = Array.from({ length: 180 }, (_, i) => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  delay: Math.random() * 3,
  dur: 2 + Math.random() * 3,
}))

function StarField({ tick }: { tick: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: '#fff',
            animation: `twinkle ${s.dur}s ${s.delay}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ── Epoch timeline ────────────────────────────────────────────────────────────

function EpochTimeline({ progress }: { progress: number }) {
  const currentYear = progress * BOOTSTRAP_TARGET_YEARS
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
      {EPOCHS.map((e) => {
        const reached = currentYear >= e.startYear
        return (
          <div
            key={e.name}
            title={e.name}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: reached ? e.color : 'rgba(255,255,255,0.1)',
              boxShadow: reached ? `0 0 6px ${e.color}` : 'none',
              transition: 'all 0.5s ease',
            }}
          />
        )
      })}
    </div>
  )
}

// ── Epoch icon map ────────────────────────────────────────────────────────────

function getEpochIcon(name: string): string {
  if (name.includes('Singularity'))   return '💥'
  if (name.includes('Quark'))         return '⚛'
  if (name.includes('Hadron'))        return '🔵'
  if (name.includes('Nucleosynthesis')) return '✨'
  if (name.includes('Recombination')) return '🌌'
  if (name.includes('Dark'))          return '🌑'
  if (name.includes('Stars Ignite'))  return '⭐'
  if (name.includes('Galaxy'))        return '🌀'
  if (name.includes('Nurseries'))     return '🔴'
  if (name.includes('Milky Way'))     return '🌌'
  if (name.includes('Solar'))         return '☀️'
  if (name.includes('Accretion'))     return '🪨'
  if (name.includes('Hadean'))        return '🌋'
  if (name.includes('Ready'))         return '🌍'
  return '🌌'
}
