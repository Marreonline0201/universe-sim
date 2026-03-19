// ── TechTreePanel ──────────────────────────────────────────────────────────────
// 150-node tech tree across 10 tiers. Click node to research.

import { useState } from 'react'
import { techTree } from '../../game/GameSingletons'
import { TECH_NODES, type TechNode } from '../../civilization/TechTree'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'

const TIER_LABELS = [
  'Stone Age', 'Bronze Age', 'Iron Age', 'Classical', 'Medieval',
  'Industrial', 'Modern', 'Information', 'Fusion', 'Simulation',
]

function NodeCard({ node, onResearch }: { node: TechNode; onResearch: (id: string) => void }) {
  const researched  = techTree.isResearched(node.id)
  const inProgress  = techTree.isInProgress(node.id)
  const prereqsMet  = node.prerequisites.every(p => techTree.isResearched(p))
  const available   = !researched && !inProgress && prereqsMet

  let borderColor = 'rgba(255,255,255,0.1)'
  let textColor = '#888'
  let bgColor = 'rgba(255,255,255,0.03)'

  if (researched)  { borderColor = 'rgba(46,204,113,0.5)'; textColor = '#2ecc71'; bgColor = 'rgba(46,204,113,0.08)' }
  if (inProgress)  { borderColor = 'rgba(241,196,15,0.5)';  textColor = '#f1c40f'; bgColor = 'rgba(241,196,15,0.08)' }
  if (available)   { borderColor = 'rgba(52,152,219,0.5)';  textColor = '#3498db'; bgColor = 'rgba(52,152,219,0.08)' }

  return (
    <div
      title={`${node.description}\n\nUnlocks: ${node.unlocks.join(', ')}\nHistorical: ${node.historicalAnalog}`}
      style={{
        padding: '6px 8px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        cursor: available ? 'pointer' : 'default',
        transition: 'all 0.1s',
      }}
      onClick={() => available && onResearch(node.id)}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: textColor, lineHeight: 1.3 }}>
        {node.name}
      </div>
      <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
        {node.epCost} EP
        {inProgress && ' · researching…'}
        {researched && ' · ✓'}
      </div>
    </div>
  )
}

export function TechTreePanel() {
  const simSeconds = useGameStore(s => s.simSeconds)
  const addNotification = useUiStore(s => s.addNotification)
  const [, forceRefresh] = useState(0)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)

  // Tick in-progress research
  const newlyCompleted = techTree.tickResearch(simSeconds)
  if (newlyCompleted.length > 0) {
    for (const id of newlyCompleted) {
      const node = TECH_NODES.find(n => n.id === id)
      addNotification(`Research complete: ${node?.name ?? id}`, 'discovery')
    }
  }

  function handleResearch(nodeId: string) {
    const ok = techTree.startResearch(nodeId, simSeconds)
    if (ok) {
      const node = TECH_NODES.find(n => n.id === nodeId)
      addNotification(`Researching: ${node?.name ?? nodeId}`, 'info')
      forceRefresh(r => r + 1)
    }
  }

  const tiers = selectedTier !== null
    ? [selectedTier]
    : Array.from({ length: 10 }, (_, i) => i)

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace' }}>
      {/* Tier filter tabs */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12,
      }}>
        <button
          onClick={() => setSelectedTier(null)}
          style={{
            fontSize: 9, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
            background: selectedTier === null ? 'rgba(52,152,219,0.3)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${selectedTier === null ? '#3498db' : '#333'}`,
            color: selectedTier === null ? '#3498db' : '#888',
          }}
        >
          All
        </button>
        {Array.from({ length: 10 }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelectedTier(selectedTier === i ? null : i)}
            style={{
              fontSize: 9, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
              background: selectedTier === i ? 'rgba(52,152,219,0.3)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${selectedTier === i ? '#3498db' : '#333'}`,
              color: selectedTier === i ? '#3498db' : '#888',
            }}
          >
            T{i}
          </button>
        ))}
      </div>

      {/* Tree tiers */}
      {tiers.map(tier => {
        const nodes = TECH_NODES.filter(n => n.tier === tier)
        return (
          <div key={tier} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 6,
              textTransform: 'uppercase',
            }}>
              Tier {tier} — {TIER_LABELS[tier]}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {nodes.map(node => (
                <NodeCard key={node.id} node={node} onResearch={handleResearch} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
