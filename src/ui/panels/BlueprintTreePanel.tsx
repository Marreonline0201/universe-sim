// ── BlueprintTreePanel.tsx ────────────────────────────────────────────────────
// M63 Track A: Crafting Blueprint Unlock Tree
// Visual tree panel for browsing and unlocking blueprint nodes using BP.

import React, { useState, useEffect, useCallback } from 'react'
import {
  getBlueprintState,
  unlockBlueprint,
  type BlueprintNode,
  type BlueprintState,
} from '../../game/BlueprintUnlockSystem'

// ── Category colors ────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<BlueprintNode['category'], string> = {
  tools:      '#e67e22',
  weapons:    '#e74c3c',
  armor:      '#3498db',
  alchemy:    '#9b59b6',
  structures: '#2ecc71',
  advanced:   '#f39c12',
}

// ── Node card ─────────────────────────────────────────────────────────────────

interface NodeCardProps {
  node: BlueprintNode
  allNodes: Map<string, BlueprintNode>
  bp: number
  onUnlock: (id: string) => boolean
}

function NodeCard({ node, allNodes, bp, onUnlock }: NodeCardProps) {
  const [flash, setFlash] = useState(false)

  const prereqsMet = node.requires.every(reqId => {
    const req = allNodes.get(reqId)
    return req?.unlocked === true
  })
  const canAfford = bp >= node.cost
  const isAvailable = !node.unlocked && prereqsMet
  const catColor = CATEGORY_COLOR[node.category]

  const missingPrereqs = node.requires
    .filter(reqId => !allNodes.get(reqId)?.unlocked)
    .map(reqId => allNodes.get(reqId)?.name ?? reqId)

  function handleUnlock() {
    if (!isAvailable || !canAfford) return
    const success = onUnlock(node.id)
    if (success) {
      setFlash(true)
      setTimeout(() => setFlash(false), 400)
    }
  }

  // Border color
  let borderColor = '#2a2a2a'
  if (node.unlocked) borderColor = catColor
  else if (isAvailable && canAfford) borderColor = '#2ecc71'
  else if (isAvailable && !canAfford) borderColor = '#e67e22'

  // Background
  let bgColor = 'rgba(20,20,20,0.8)'
  if (node.unlocked) bgColor = `${catColor}18`
  else if (!prereqsMet) bgColor = 'rgba(12,12,12,0.6)'

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 4,
        padding: '10px 12px',
        width: 130,
        minHeight: 110,
        background: bgColor,
        opacity: !prereqsMet ? 0.55 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'all 0.15s',
        transform: flash ? 'scale(1.15)' : 'scale(1)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{node.icon}</span>
        <span style={{
          color: node.unlocked ? catColor : '#ccc',
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          lineHeight: 1.3,
        }}>
          {node.name}
        </span>
      </div>

      {/* Description */}
      <div style={{
        color: '#666',
        fontFamily: 'monospace',
        fontSize: 9,
        lineHeight: 1.4,
        flex: 1,
      }}>
        {node.description}
      </div>

      {/* Status / action */}
      {node.unlocked ? (
        <div style={{
          color: catColor,
          fontFamily: 'monospace',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          ✓ UNLOCKED
        </div>
      ) : !prereqsMet ? (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 9 }}>
          Requires: {missingPrereqs.join(', ')}
        </div>
      ) : (
        <button
          onClick={handleUnlock}
          disabled={!canAfford}
          style={{
            background: canAfford ? 'rgba(46,204,113,0.15)' : 'transparent',
            border: `1px solid ${canAfford ? '#2ecc71' : '#e67e22'}`,
            borderRadius: 3,
            color: canAfford ? '#2ecc71' : '#e67e22',
            fontFamily: 'monospace',
            fontSize: 9,
            fontWeight: 700,
            padding: '3px 6px',
            cursor: canAfford ? 'pointer' : 'not-allowed',
            letterSpacing: 0.5,
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => {
            if (canAfford) {
              e.currentTarget.style.background = 'rgba(46,204,113,0.28)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = canAfford ? 'rgba(46,204,113,0.15)' : 'transparent'
          }}
        >
          UNLOCK — {node.cost} BP
        </button>
      )}
    </div>
  )
}

// ── Tier row ──────────────────────────────────────────────────────────────────

interface TierRowProps {
  tier: 1 | 2 | 3
  nodes: BlueprintNode[]
  allNodes: Map<string, BlueprintNode>
  bp: number
  onUnlock: (id: string) => boolean
}

function TierRow({ tier, nodes, allNodes, bp, onUnlock }: TierRowProps) {
  const tierLabel = ['', 'TIER I — FOUNDATIONS', 'TIER II — ADVANCED', 'TIER III — MASTERY'][tier]
  const tierColor = ['', '#666', '#8a7', '#f39c12'][tier]

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        color: tierColor,
        fontFamily: 'monospace',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: `1px solid ${tierColor}33`,
      }}>
        {tierLabel}
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        {nodes.map(node => (
          <NodeCard
            key={node.id}
            node={node}
            allNodes={allNodes}
            bp={bp}
            onUnlock={onUnlock}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BlueprintTreePanel() {
  const [state, setState] = useState<BlueprintState>(() => getBlueprintState())

  const refresh = useCallback(() => {
    setState(getBlueprintState())
  }, [])

  useEffect(() => {
    window.addEventListener('blueprint-unlocked', refresh)
    window.addEventListener('blueprint-bp-changed', refresh)
    return () => {
      window.removeEventListener('blueprint-unlocked', refresh)
      window.removeEventListener('blueprint-bp-changed', refresh)
    }
  }, [refresh])

  function handleUnlock(nodeId: string): boolean {
    const success = unlockBlueprint(nodeId)
    if (success) refresh()
    return success
  }

  const nodeMap = new Map<string, BlueprintNode>(state.nodes.map(n => [n.id, n]))

  const tier1 = state.nodes.filter(n => n.tier === 1)
  const tier2 = state.nodes.filter(n => n.tier === 2)
  const tier3 = state.nodes.filter(n => n.tier === 3)

  const bpPct = (state.bp / state.maxBp) * 100
  const bpColor = state.bp >= state.maxBp ? '#e74c3c' : state.bp >= state.maxBp * 0.75 ? '#e67e22' : '#2ecc71'

  const unlockedCount = state.nodes.filter(n => n.unlocked).length

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc', fontSize: 12 }}>
      {/* BP header */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #2a2a2a',
        borderRadius: 4,
        padding: '12px 14px',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#fff', fontWeight: 700, letterSpacing: 1 }}>
            BLUEPRINT POINTS
          </span>
          <span style={{ color: bpColor, fontWeight: 700, fontSize: 14 }}>
            {state.bp} / {state.maxBp}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 6,
          background: '#1a1a1a',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 8,
        }}>
          <div style={{
            height: '100%',
            width: `${bpPct}%`,
            background: bpColor,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>

        <div style={{ color: '#555', fontSize: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span>Earn 1 BP per 5 crafts</span>
          <span style={{ color: '#888' }}>{unlockedCount} / {state.nodes.length} unlocked</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
      }}>
        {(Object.entries(CATEGORY_COLOR) as [BlueprintNode['category'], string][]).map(([cat, color]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            <span style={{ color: '#555', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {cat}
            </span>
          </div>
        ))}
      </div>

      {/* Tree tiers */}
      <TierRow tier={1} nodes={tier1} allNodes={nodeMap} bp={state.bp} onUnlock={handleUnlock} />
      <TierRow tier={2} nodes={tier2} allNodes={nodeMap} bp={state.bp} onUnlock={handleUnlock} />
      <TierRow tier={3} nodes={tier3} allNodes={nodeMap} bp={state.bp} onUnlock={handleUnlock} />
    </div>
  )
}
