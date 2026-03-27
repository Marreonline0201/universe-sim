/**
 * EcosystemDashboard.tsx — M72-4
 *
 * Minimal HUD overlay showing live simulation statistics from the
 * NaturalSelectionSystem via SimulationIntegration.getSimulationStats().
 *
 * Displays: organism count, species count, births/deaths/speciations,
 * tick count, and last tick performance. Positioned top-right, non-intrusive,
 * toggleable via the [B] key (for "Biology").
 *
 * Zero dependency on player systems.
 */

import { useEffect, useRef, useState } from 'react'
import { getSimulationStats, isSimulationActive, getPopulationHistory, getOrganismDots, type OrganismDot } from '../biology/SimulationIntegration'
import { useGameStore } from '../store/gameStore'

const POLL_INTERVAL_MS = 500  // refresh stats twice per second

interface SimStats {
  organismCount: number
  speciesCount: number
  totalDeaths: number
  totalBirths: number
  totalSpeciations: number
  tickCount: number
  lastTickMs: number
}

export function EcosystemDashboard() {
  const [visible, setVisible] = useState(true)
  const [stats, setStats] = useState<SimStats | null>(null)
  const [history, setHistory] = useState<Array<{tick: number; organismCount: number; speciesCount: number}>>([])
  const [dots, setDots] = useState<OrganismDot[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const epoch = useGameStore(s => s.epoch)
  const simTime = useGameStore(s => s.simTime)

  // Toggle visibility with [B] key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'KeyB' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Don't toggle if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        setVisible(v => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Poll simulation stats
  useEffect(() => {
    function poll() {
      if (isSimulationActive()) {
        setStats(getSimulationStats())
        setHistory(getPopulationHistory().slice())  // copy to trigger re-render
        setDots(getOrganismDots())
      }
    }
    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  if (!visible || !stats) return null

  const netGrowth = stats.totalBirths - stats.totalDeaths
  const growthColor = netGrowth > 0 ? '#2ecc71' : netGrowth < 0 ? '#e74c3c' : '#888'

  return (
    <div style={{
      position: 'fixed',
      top: 48,
      right: 58,
      zIndex: 200,
      pointerEvents: 'none',
      fontFamily: 'monospace',
      fontSize: 10,
      color: '#c8d6e5',
      background: 'rgba(0, 0, 0, 0.75)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 6,
      padding: '8px 12px',
      minWidth: 180,
      backdropFilter: 'blur(4px)',
      lineHeight: 1.6,
    }}>
      {/* Header */}
      <div style={{
        fontSize: 9,
        letterSpacing: 2,
        color: '#55efc4',
        fontWeight: 700,
        marginBottom: 4,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 3,
      }}>
        ECOSYSTEM
      </div>

      {/* Epoch + sim time */}
      <Row label="Epoch" value={epoch} color="#f1c40f" />
      <Row label="Sim Time" value={simTime} color="#dfe6e9" />

      {/* Separator */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

      {/* Population */}
      <Row label="Organisms" value={String(stats.organismCount)} color="#74b9ff" />
      <Row label="Species" value={String(stats.speciesCount)} color="#a29bfe" />

      {/* Separator */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

      {/* Lifecycle events */}
      <Row label="Births" value={String(stats.totalBirths)} color="#2ecc71" />
      <Row label="Deaths" value={String(stats.totalDeaths)} color="#e74c3c" />
      <Row label="Net" value={`${netGrowth >= 0 ? '+' : ''}${netGrowth}`} color={growthColor} />
      <Row label="Speciations" value={String(stats.totalSpeciations)} color="#fd79a8" />

      {/* Separator */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

      {/* Performance */}
      <Row label="Ticks" value={String(stats.tickCount)} color="#636e72" />
      <Row
        label="Tick ms"
        value={stats.lastTickMs.toFixed(1)}
        color={stats.lastTickMs > 5 ? '#e74c3c' : '#636e72'}
      />

      {/* M78: Population history chart */}
      {history.length > 1 && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
          <PopulationChart data={history} />
        </>
      )}

      {/* M_vis: 2D population dot map — top-down planet view with organism positions */}
      {dots.length > 0 && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
          <OrganismDotMap dots={dots} />
        </>
      )}

      {/* Toggle hint */}
      <div style={{
        fontSize: 8,
        color: 'rgba(255,255,255,0.2)',
        textAlign: 'center',
        marginTop: 4,
      }}>
        [B] toggle
      </div>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function PopulationChart({ data }: { data: Array<{tick: number; organismCount: number; speciesCount: number}> }) {
  if (data.length < 2) return null

  const W = 170  // chart width in px
  const H = 60   // chart height in px
  const PAD = 2

  // Find ranges for scaling
  const maxOrg = Math.max(1, ...data.map(d => d.organismCount))
  const maxSpec = Math.max(1, ...data.map(d => d.speciesCount))

  // Build SVG polyline points for organism count
  const orgPoints = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
    const y = H - PAD - (d.organismCount / maxOrg) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Build SVG polyline points for species count (scaled to its own range)
  const specPoints = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
    const y = H - PAD - (d.speciesCount / maxSpec) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 8, color: '#888', marginBottom: 2 }}>
        <span style={{ color: '#74b9ff' }}>-- Pop ({maxOrg})</span>
        {' '}
        <span style={{ color: '#a29bfe' }}>-- Spp ({maxSpec})</span>
      </div>
      <svg
        width={W}
        height={H}
        style={{ display: 'block', background: 'rgba(255,255,255,0.03)', borderRadius: 3 }}
      >
        {/* Grid lines */}
        <line x1={PAD} y1={H/2} x2={W-PAD} y2={H/2} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
        <line x1={PAD} y1={H*0.25} x2={W-PAD} y2={H*0.25} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
        <line x1={PAD} y1={H*0.75} x2={W-PAD} y2={H*0.75} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
        {/* Organism count line */}
        <polyline
          fill="none"
          stroke="#74b9ff"
          strokeWidth={1.5}
          strokeLinejoin="round"
          points={orgPoints}
        />
        {/* Species count line */}
        <polyline
          fill="none"
          stroke="#a29bfe"
          strokeWidth={1}
          strokeLinejoin="round"
          strokeDasharray="3,2"
          points={specPoints}
        />
      </svg>
    </div>
  )
}

/**
 * M_vis: 2D top-down dot map showing organism positions projected onto the planet disc.
 * Green/teal dots = autotrophs (diet 0), amber/red dots = heterotrophs (diet 1).
 * Positions are equatorial-projected (planet viewed from above north pole).
 */
function OrganismDotMap({ dots }: { dots: OrganismDot[] }) {
  const SIZE = 170  // canvas size in px
  const RADIUS = SIZE / 2 - 4  // planet disc radius
  const CX = SIZE / 2
  const CY = SIZE / 2

  // Limit to 500 dots max to keep SVG render fast
  const visible = dots.length > 500 ? dots.slice(0, 500) : dots

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 8, color: '#888', marginBottom: 2 }}>
        <span style={{ color: '#55efc4' }}>* Auto</span>
        {' '}
        <span style={{ color: '#fdcb6e' }}>* Hetero</span>
        {' '}
        <span style={{ color: '#636e72' }}>({dots.length} orgs)</span>
      </div>
      <svg
        width={SIZE}
        height={SIZE}
        style={{ display: 'block', background: 'rgba(255,255,255,0.02)', borderRadius: SIZE / 2 }}
      >
        {/* Planet disc outline */}
        <circle cx={CX} cy={CY} r={RADIUS} fill="rgba(9,132,227,0.08)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />
        {/* Equator line */}
        <line x1={CX - RADIUS} y1={CY} x2={CX + RADIUS} y2={CY} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
        <line x1={CX} y1={CY - RADIUS} x2={CX} y2={CY + RADIUS} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
        {/* Organism dots */}
        {visible.map((dot, i) => {
          // Clamp to disc — organisms at poles may fall outside
          const px = CX + dot.nx * RADIUS
          const py = CY + dot.nz * RADIUS
          const color = dot.dietType === 0
            ? `hsl(${dot.hue},70%,65%)`   // autotroph: brighter greens/teals
            : `hsl(${(dot.hue + 30) % 360},80%,60%)`  // heterotroph: shifted warmer
          return <circle key={i} cx={px} cy={py} r={1.5} fill={color} opacity={0.85} />
        })}
      </svg>
    </div>
  )
}
