// ── EvolutionPanel ─────────────────────────────────────────────────────────────
// Radial tree of 50+ evolution nodes. Spend EP to unlock traits.

import { useEffect, useState } from 'react'
import { ReactFlow, Background, Controls, type Node, type Edge, MarkerType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { evolutionTree } from '../../game/GameSingletons'
import { EVOLUTION_NODES, type EvolutionNode } from '../../player/EvolutionTree'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'

const CATEGORY_COLORS: Record<EvolutionNode['category'], string> = {
  body:         '#e67e22',
  metabolism:   '#e74c3c',
  senses:       '#9b59b6',
  locomotion:   '#3498db',
  defense:      '#95a5a6',
  neural:       '#1abc9c',
  social:       '#f39c12',
  civilization: '#2ecc71',
}

const CATEGORY_LABELS: Record<EvolutionNode['category'], string> = {
  body:         '🦴 Body',
  metabolism:   '🔥 Metabolism',
  senses:       '👁 Senses',
  locomotion:   '🏃 Locomotion',
  defense:      '🛡 Defense',
  neural:       '🧠 Neural',
  social:       '👥 Social',
  civilization: '🏛 Civilization',
}

function NodeCard({ node, ep, onUnlock }: {
  node: EvolutionNode
  ep: number
  onUnlock: (id: string) => void
}) {
  const unlocked    = evolutionTree.isUnlocked(node.id)
  const prereqsMet  = node.prerequisites.every(p => evolutionTree.isUnlocked(p))
  const canAfford   = ep >= node.epCost
  const available   = !unlocked && prereqsMet

  const color = CATEGORY_COLORS[node.category]

  return (
    <div
      title={`${node.description}\n\nPrereqs: ${node.prerequisites.join(', ') || 'none'}`}
      onClick={() => available && canAfford && onUnlock(node.id)}
      style={{
        padding: '6px 8px',
        background: unlocked
          ? `${color}22`
          : available && canAfford
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(255,255,255,0.02)',
        border: `1px solid ${unlocked ? color : available ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 6,
        cursor: available && canAfford ? 'pointer' : 'default',
        opacity: !unlocked && (!prereqsMet || !canAfford) ? 0.4 : 1,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: unlocked ? color : '#ccc' }}>
        {node.name}
        {unlocked && <span style={{ marginLeft: 4, fontSize: 10 }}>✓</span>}
      </div>
      <div style={{ fontSize: 9, color: '#777', marginTop: 2 }}>
        {node.epCost} EP
        {!prereqsMet && ' · locked'}
        {prereqsMet && !canAfford && !unlocked && ' · need EP'}
      </div>
    </div>
  )
}

function buildEvoGraph(ep: number): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const categories = Array.from(new Set(EVOLUTION_NODES.map(n => n.category)))
  const byCategory: Record<string, EvolutionNode[]> = {}
  for (const cat of categories) {
    byCategory[cat] = EVOLUTION_NODES.filter(n => n.category === cat)
  }

  for (const node of EVOLUTION_NODES) {
    const unlocked   = evolutionTree.isUnlocked(node.id)
    const prereqsMet = node.prerequisites.every(p => evolutionTree.isUnlocked(p))
    const canAfford  = ep >= node.epCost
    const available  = !unlocked && prereqsMet

    const color    = CATEGORY_COLORS[node.category]
    const catIdx   = categories.indexOf(node.category)
    const idxInCat = byCategory[node.category].indexOf(node)

    let bg = 'rgba(255,255,255,0.03)'
    let borderColor = '#333'
    let textColor = '#555'
    if (unlocked) {
      bg = `${color}22`; borderColor = color; textColor = color
    } else if (available && canAfford) {
      bg = 'rgba(255,255,255,0.07)'; borderColor = 'rgba(255,255,255,0.25)'; textColor = '#ccc'
    }

    nodes.push({
      id: node.id,
      position: { x: catIdx * 190, y: idxInCat * 80 },
      data: {
        label: (
          <div style={{ fontSize: 10, fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 700, color: textColor }}>
              {node.name}{unlocked ? ' ✓' : ''}
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>{node.epCost} EP</div>
          </div>
        ),
      },
      style: {
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: '4px 8px',
        minWidth: 110,
        opacity: !unlocked && (!prereqsMet || !canAfford) ? 0.4 : 1,
        cursor: available && canAfford ? 'pointer' : 'default',
      },
    } as Node)

    for (const prereq of node.prerequisites) {
      edges.push({
        id: `${prereq}→${node.id}`,
        source: prereq,
        target: node.id,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#444' },
        style: { stroke: unlocked ? color : '#333', strokeWidth: 1 },
      })
    }
  }

  return { nodes, edges }
}

export function EvolutionPanel() {
  const epFromStore = usePlayerStore(s => s.evolutionPoints)
  const addEP = usePlayerStore(s => s.addEvolutionPoints)
  const addNotification = useUiStore(s => s.addNotification)
  const [, forceRefresh] = useState(0)
  const [activeCategory, setActiveCategory] = useState<EvolutionNode['category'] | null>(null)
  const [graphView, setGraphView] = useState(false)

  // Sync EP from store into the evolution tree singleton
  useEffect(() => {
    const diff = epFromStore - evolutionTree.currentPoints
    if (diff > 0) evolutionTree.addPoints(diff)
  }, [epFromStore])

  function handleUnlock(nodeId: string) {
    const node = EVOLUTION_NODES.find(n => n.id === nodeId)
    if (!node) return
    if (evolutionTree.unlock(nodeId)) {
      addEP(-node.epCost)
      addNotification(`Evolved: ${node.name}`, 'discovery')
      forceRefresh(r => r + 1)
    }
  }

  const categories = Array.from(
    new Set(EVOLUTION_NODES.map(n => n.category))
  ) as EvolutionNode['category'][]

  const filteredNodes = activeCategory
    ? EVOLUTION_NODES.filter(n => n.category === activeCategory)
    : EVOLUTION_NODES

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace' }}>
      {/* EP balance */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 14,
        padding: '8px 12px',
        background: 'rgba(241,196,15,0.1)',
        border: '1px solid rgba(241,196,15,0.3)',
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 18 }}>⚡</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1c40f' }}>
            {epFromStore.toLocaleString()} EP
          </div>
          <div style={{ fontSize: 10, color: '#888' }}>Evolution Points available</div>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['List', 'Graph'] as const).map(v => (
          <button
            key={v}
            onClick={() => setGraphView(v === 'Graph')}
            style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
              background: (graphView ? v === 'Graph' : v === 'List') ? 'rgba(155,89,182,0.3)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${(graphView ? v === 'Graph' : v === 'List') ? '#9b59b6' : '#333'}`,
              color: (graphView ? v === 'Graph' : v === 'List') ? '#9b59b6' : '#888',
            }}
          >{v}</button>
        ))}
      </div>

      {graphView ? (
        <div style={{ height: 520, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(() => {
            const evoGraph = buildEvoGraph(epFromStore)
            return (
              <ReactFlow
                nodes={evoGraph.nodes}
                edges={evoGraph.edges}
                onNodeClick={(_, node) => handleUnlock(node.id)}
                fitView
                colorMode="dark"
                minZoom={0.2}
              >
                <Background color="#222" gap={24} />
                <Controls />
              </ReactFlow>
            )
          })()}
        </div>
      ) : (
        <>
          {/* Category filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            <button
              onClick={() => setActiveCategory(null)}
              style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                background: !activeCategory ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${!activeCategory ? '#fff' : '#333'}`,
                color: !activeCategory ? '#fff' : '#888',
              }}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  background: activeCategory === cat
                    ? `${CATEGORY_COLORS[cat]}33` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${activeCategory === cat ? CATEGORY_COLORS[cat] : '#333'}`,
                  color: activeCategory === cat ? CATEGORY_COLORS[cat] : '#888',
                }}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Node grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {filteredNodes.map(node => (
              <NodeCard key={node.id} node={node} ep={epFromStore} onUnlock={handleUnlock} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
