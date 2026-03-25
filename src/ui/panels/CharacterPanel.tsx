// ── CharacterPanel ─────────────────────────────────────────────────────────────
// Full character sheet: genome heatmap, vitals, evolution tier, civ tier, stats.

import { usePlayerStore } from '../../store/playerStore'
import { useGameStore } from '../../store/gameStore'
import { civTracker } from '../../game/GameSingletons'

const TIER_NAMES = [
  'Stone Age', 'Bronze Age', 'Iron Age', 'Classical', 'Medieval',
  'Industrial', 'Modern', 'Information', 'Fusion', 'Simulation',
]

function StatBar({ label, value, color, invert = false }: {
  label: string; value: number; color: string; invert?: boolean
}) {
  const display = invert ? 1 - value : value
  const pct = Math.max(0, Math.min(1, display)) * 100
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa', marginBottom: 2 }}>
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

/** 256-bit genome visualised as a 16×16 grid of coloured cells. */
function GenomeHeatmap({ mods }: { mods: Array<{ startBit: number; count: number; targetValue: number }> }) {
  const modifiedBits = new Set<number>()
  for (const m of mods) {
    for (let b = m.startBit; b < m.startBit + m.count; b++) modifiedBits.add(b)
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 6, letterSpacing: 1 }}>GENOME — 256 BIT</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 1.5 }}>
        {Array.from({ length: 256 }, (_, i) => (
          <div
            key={i}
            style={{
              width: '100%',
              paddingBottom: '100%',
              background: modifiedBits.has(i) ? '#3498db' : 'rgba(255,255,255,0.06)',
              borderRadius: 1,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 9, color: '#666' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#3498db', borderRadius: 1, marginRight: 3 }} />Modified</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 1, marginRight: 3 }} />Unmodified</span>
      </div>
    </div>
  )
}

export function CharacterPanel() {
  const { health, hunger, thirst, energy, fatigue, currentGoal, civTier, x, y, z } = usePlayerStore()
  const { epoch } = useGameStore()
  const genomeMods: Array<{ startBit: number; count: number; targetValue: number }> = []
  const civs = civTracker.getAllCivilizations()
  const playerCiv = civs[0] ?? null

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Identity */}
      <div style={{
        padding: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 6, letterSpacing: 1 }}>IDENTITY</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>Epoch</span>
          <span style={{ fontSize: 11, color: '#3498db' }}>{epoch.replace(/_/g, ' ')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>Civilization Tier</span>
          <span style={{ fontSize: 11, color: '#f1c40f' }}>{TIER_NAMES[civTier] ?? civTier}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#aaa' }}>Position</span>
          <span style={{ fontSize: 10, color: '#666' }}>
            {x.toFixed(1)}, {y.toFixed(1)}, {z.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Current goal */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(52,152,219,0.1)',
        border: '1px solid rgba(52,152,219,0.3)',
        borderRadius: 8,
        fontSize: 11, color: '#3498db',
      }}>
        <span style={{ color: '#555', fontSize: 10, marginRight: 8 }}>GOAL:</span>
        {currentGoal.replace(/_/g, ' ').toUpperCase()}
      </div>

      {/* Vitals */}
      <div>
        <div style={{ fontSize: 10, color: '#555', marginBottom: 8, letterSpacing: 1 }}>VITALS</div>
        <StatBar label="Health"   value={health}      color="#e74c3c" />
        <StatBar label="Satiety"  value={hunger}      color="#f39c12" invert />
        <StatBar label="Hydration" value={thirst}     color="#3498db" invert />
        <StatBar label="Energy"   value={energy}      color="#2ecc71" />
        <StatBar label="Stamina"  value={fatigue}     color="#9b59b6" invert />
      </div>

      {/* Civilization membership */}
      {playerCiv && (
        <div style={{
          padding: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: '#555', marginBottom: 6, letterSpacing: 1 }}>CIVILIZATION</div>
          <div style={{ fontSize: 12, color: playerCiv.color, fontWeight: 700, marginBottom: 4 }}>{playerCiv.name}</div>
          <div style={{ fontSize: 10, color: '#888' }}>Population: {playerCiv.population.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: '#888' }}>Treasury: {Math.round(playerCiv.treasury).toLocaleString()}</div>
        </div>
      )}

      {/* Genome heatmap */}
      <GenomeHeatmap mods={genomeMods} />
    </div>
  )
}
