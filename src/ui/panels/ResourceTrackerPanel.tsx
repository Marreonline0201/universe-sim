// ── ResourceTrackerPanel.tsx ──────────────────────────────────────────────────
// M55 Track B: Resource tracker panel.
// Shows all resource nodes, their charge bars, depletion status, respawn countdown.

import { useState, useEffect, useCallback } from 'react'
import {
  getNodes,
  type ResourceNode,
} from '../../game/ResourceDepletionSystem'
import { useGameStore } from '../../store/gameStore'
import { usePlayerStore } from '../../store/playerStore'

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'available' | 'depleted'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDistance(px: number, pz: number, node: ResourceNode): number {
  const dx = node.position.x - px
  const dz = node.position.z - pz
  return Math.sqrt(dx * dx + dz * dz)
}

function formatRespawnCountdown(depletedAt: number | null, respawnTime: number, simSeconds: number): string {
  if (depletedAt === null) return 'Soon...'
  const elapsed = simSeconds - depletedAt
  const remaining = Math.max(0, respawnTime - elapsed)
  if (remaining <= 0) return 'Respawning...'
  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function chargeBarColor(current: number, max: number): string {
  const ratio = max > 0 ? current / max : 0
  if (ratio <= 0) return '#ef4444'
  if (ratio < 0.5) return '#f59e0b'
  return '#22c55e'
}

function formatDistance(dist: number): string {
  if (dist < 10) return '<10m'
  if (dist < 1000) return `${Math.round(dist)}m`
  return `${(dist / 1000).toFixed(1)}km`
}

// ── NodeCard ──────────────────────────────────────────────────────────────────

interface NodeCardProps {
  node: ResourceNode
  simSeconds: number
  distance: number
}

function NodeCard({ node, simSeconds, distance }: NodeCardProps) {
  const chargeRatio = node.maxCharges > 0 ? node.currentCharges / node.maxCharges : 0
  const barColor = chargeBarColor(node.currentCharges, node.maxCharges)

  return (
    <div style={{
      background: node.depleted ? 'rgba(20,20,20,0.7)' : 'rgba(30,30,30,0.8)',
      border: `1px solid ${node.depleted ? '#333' : '#3a3a3a'}`,
      borderRadius: 6,
      padding: '10px 12px',
      marginBottom: 8,
      opacity: node.depleted ? 0.7 : 1,
    }}>
      {/* Row 1: icon + name + type badge + distance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{node.icon}</span>
        <span style={{
          flex: 1,
          color: node.depleted ? '#777' : '#ddd',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
        }}>
          {node.name}
        </span>
        <span style={{
          background: 'rgba(205,68,32,0.15)',
          border: '1px solid rgba(205,68,32,0.3)',
          borderRadius: 3,
          color: '#cd4420',
          fontFamily: 'monospace',
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 5px',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          {node.type.replace('_', ' ')}
        </span>
        <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10 }}>
          {formatDistance(distance)}
        </span>
      </div>

      {/* Row 2: charge bar */}
      <div style={{ marginBottom: node.depleted ? 6 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10 }}>CHARGES</span>
          <span style={{ color: barColor, fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>
            {node.currentCharges} / {node.maxCharges}
          </span>
        </div>
        <div style={{
          height: 4,
          background: '#1a1a1a',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${chargeRatio * 100}%`,
            height: '100%',
            background: barColor,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Row 3: respawn countdown (only if depleted) */}
      {node.depleted && (
        <div style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ color: '#666', fontSize: 11 }}>⏳</span>
          <span style={{ color: '#e6b93a', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
            Respawns in {formatRespawnCountdown(node.depletedAt, node.respawnTime, simSeconds)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── ResourceTrackerPanel ──────────────────────────────────────────────────────

export function ResourceTrackerPanel() {
  const simSeconds = useGameStore(s => s.simSeconds)
  const px = usePlayerStore(s => s.x)
  const pz = usePlayerStore(s => s.z)

  const [nodes, setNodes] = useState<ResourceNode[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [, forceUpdate] = useState(0)

  // Refresh every 2 seconds
  useEffect(() => {
    function refresh() {
      setNodes([...getNodes()])
      forceUpdate(n => n + 1)
    }
    refresh()
    const id = setInterval(refresh, 2_000)
    return () => clearInterval(id)
  }, [])

  // Sort: nearby available first, depleted last
  const sorted = [...nodes].sort((a, b) => {
    if (a.depleted !== b.depleted) return a.depleted ? 1 : -1
    const dA = getDistance(px, pz, a)
    const dB = getDistance(px, pz, b)
    return dA - dB
  })

  const filtered = sorted.filter(n => {
    if (filter === 'available') return !n.depleted
    if (filter === 'depleted')  return n.depleted
    return true
  })

  const depletedCount = nodes.filter(n => n.depleted).length

  const onFilterChange = useCallback((f: FilterTab) => setFilter(f), [])

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '5px 0',
    background: active ? 'rgba(205,68,32,0.18)' : 'transparent',
    border: `1px solid ${active ? '#cd4420' : '#2a2a2a'}`,
    borderRadius: 4,
    color: active ? '#cd4420' : '#555',
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'all 0.12s',
  })

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Header with depleted badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#888', fontSize: 11, letterSpacing: 1 }}>
          {nodes.length} nodes tracked
        </span>
        {depletedCount > 0 && (
          <span style={{
            background: 'rgba(239,68,68,0.18)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 12,
            color: '#ef4444',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
          }}>
            {depletedCount} DEPLETED
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button style={TAB_STYLE(filter === 'all')}       onClick={() => onFilterChange('all')}>ALL</button>
        <button style={TAB_STYLE(filter === 'available')} onClick={() => onFilterChange('available')}>AVAILABLE</button>
        <button style={TAB_STYLE(filter === 'depleted')}  onClick={() => onFilterChange('depleted')}>DEPLETED</button>
      </div>

      {/* Node list */}
      {filtered.length === 0 ? (
        <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '32px 0' }}>
          {filter === 'depleted' ? 'No depleted nodes.' : 'No resource nodes found.'}
        </div>
      ) : (
        filtered.map(node => (
          <NodeCard
            key={node.id}
            node={node}
            simSeconds={simSeconds}
            distance={getDistance(px, pz, node)}
          />
        ))
      )}
    </div>
  )
}
