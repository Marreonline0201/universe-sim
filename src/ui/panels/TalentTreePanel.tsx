// ── TalentTreePanel.tsx ───────────────────────────────────────────────────────
// M65 Track A: Player Talent Tree — visual tree with 3 branch columns
// Combat | Crafting | Survival, 5 nodes each, connecting lines between nodes.

import React, { useState, useEffect, useCallback } from 'react'
import {
  getTalentTree,
  unlockTalent,
  isTalentAvailable,
  getAvailableTalentPoints,
  type TalentNode,
  type TalentBranch,
} from '../../game/TalentTreeSystem'

// ── Branch metadata ───────────────────────────────────────────────────────────

const BRANCH_META: Record<TalentBranch, { label: string; color: string; dimColor: string }> = {
  combat:   { label: 'COMBAT',   color: '#e05050', dimColor: '#5a2020' },
  crafting: { label: 'CRAFTING', color: '#e0a030', dimColor: '#5a4010' },
  survival: { label: 'SURVIVAL', color: '#50c050', dimColor: '#204820' },
}

const BRANCH_ORDER: TalentBranch[] = ['combat', 'crafting', 'survival']

// ── Keyframe injection (pulsing border animation) ─────────────────────────────

const PULSE_STYLE_ID = 'talent-tree-pulse-keyframes'

function injectPulseKeyframes() {
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PULSE_STYLE_ID
  style.textContent = `
    @keyframes talent-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255, 220, 80, 0.7); }
      70%  { box-shadow: 0 0 0 6px rgba(255, 220, 80, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 220, 80, 0); }
    }
  `
  document.head.appendChild(style)
}

// ── Node component ────────────────────────────────────────────────────────────

interface TalentNodeCardProps {
  node: TalentNode
  available: boolean
  onUnlock: (id: string) => void
}

function TalentNodeCard({ node, available, onUnlock }: TalentNodeCardProps) {
  const meta = BRANCH_META[node.branch]
  const [hovered, setHovered] = useState(false)

  let borderColor = '#2a2a2a'
  let background = 'rgba(20,20,20,0.9)'
  let opacity = 0.45
  let animation = ''
  let nameColor = '#555'
  let effectColor = '#444'

  if (node.unlocked) {
    borderColor = meta.color
    background = `rgba(${hexToRgb(meta.color)}, 0.12)`
    opacity = 1
    nameColor = meta.color
    effectColor = '#aaa'
  } else if (available) {
    borderColor = '#f0c040'
    background = 'rgba(240,192,64,0.06)'
    opacity = 1
    animation = 'talent-pulse 1.6s ease-in-out infinite'
    nameColor = '#e8d060'
    effectColor = '#999'
  } else if (hovered) {
    opacity = 0.55
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => available && onUnlock(node.id)}
      style={{
        position: 'relative',
        padding: '8px 10px',
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        background,
        opacity,
        cursor: available ? 'pointer' : 'default',
        transition: 'opacity 0.15s, border-color 0.15s',
        animation,
        userSelect: 'none',
      }}
    >
      {/* Position badge */}
      <div style={{
        position: 'absolute',
        top: 4,
        right: 6,
        fontSize: 9,
        color: node.unlocked ? meta.color : '#444',
        fontFamily: 'monospace',
        fontWeight: 700,
      }}>
        T{node.position}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'monospace',
        color: nameColor,
        marginBottom: 3,
        paddingRight: 16,
      }}>
        {node.unlocked ? '✓ ' : available ? '◎ ' : '○ '}{node.name}
      </div>

      {/* Effect */}
      <div style={{
        fontSize: 10,
        fontFamily: 'monospace',
        color: effectColor,
        lineHeight: 1.4,
      }}>
        {node.effect}
      </div>

      {/* Cost badge — only show if not unlocked */}
      {!node.unlocked && (
        <div style={{
          marginTop: 4,
          fontSize: 9,
          fontFamily: 'monospace',
          color: available ? '#f0c040' : '#444',
        }}>
          Cost: {node.cost} pt
        </div>
      )}
    </div>
  )
}

// ── Branch column ─────────────────────────────────────────────────────────────

interface BranchColumnProps {
  branch: TalentBranch
  nodes: TalentNode[]
  onUnlock: (id: string) => void
}

function BranchColumn({ branch, nodes, onUnlock }: BranchColumnProps) {
  const meta = BRANCH_META[branch]
  const sorted = [...nodes].sort((a, b) => a.position - b.position)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
      {/* Branch header */}
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 700,
        letterSpacing: 2,
        color: meta.color,
        paddingBottom: 8,
        borderBottom: `1px solid ${meta.dimColor}`,
        marginBottom: 8,
      }}>
        {meta.label}
      </div>

      {/* Nodes with connecting lines */}
      {sorted.map((node, idx) => (
        <React.Fragment key={node.id}>
          <TalentNodeCard
            node={node}
            available={isTalentAvailable(node.id)}
            onUnlock={onUnlock}
          />
          {/* Connector line between nodes */}
          {idx < sorted.length - 1 && (
            <div style={{
              width: 2,
              height: 12,
              margin: '0 auto',
              background: node.unlocked ? meta.color : '#2a2a2a',
              opacity: node.unlocked ? 0.8 : 0.4,
              transition: 'background 0.3s',
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255,255,255'
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function TalentTreePanel() {
  const [state, setState] = useState(() => getTalentTree())

  // Refresh state when talents change
  const refresh = useCallback(() => {
    setState({ ...getTalentTree() })
  }, [])

  useEffect(() => {
    injectPulseKeyframes()
    refresh()

    window.addEventListener('talent-unlocked', refresh)
    window.addEventListener('talent-points-changed', refresh)
    window.addEventListener('player-levelup', refresh)

    return () => {
      window.removeEventListener('talent-unlocked', refresh)
      window.removeEventListener('talent-points-changed', refresh)
      window.removeEventListener('player-levelup', refresh)
    }
  }, [refresh])

  const handleUnlock = useCallback((nodeId: string) => {
    const success = unlockTalent(nodeId)
    if (success) refresh()
  }, [refresh])

  const unlockedCount = state.nodes.filter(n => n.unlocked).length
  const totalNodes = state.nodes.length

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>
      {/* Header: talent point balance */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '10px 12px',
        background: 'rgba(255,220,80,0.06)',
        border: '1px solid rgba(255,220,80,0.2)',
        borderRadius: 6,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>TALENT POINTS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: state.availablePoints > 0 ? '#f0c040' : '#555' }}>
            {state.availablePoints}
            <span style={{ fontSize: 12, color: '#555', marginLeft: 6, fontWeight: 400 }}>available</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>PROGRESS</div>
          <div style={{ fontSize: 13, color: '#777' }}>
            {unlockedCount} / {totalNodes}
            <span style={{ fontSize: 10, color: '#555', marginLeft: 4 }}>unlocked</span>
          </div>
          <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>
            earned: {state.totalPointsEarned} pts total
          </div>
        </div>
      </div>

      {/* Earn hint */}
      {state.availablePoints === 0 && unlockedCount < totalNodes && (
        <div style={{
          fontSize: 10,
          color: '#555',
          textAlign: 'center',
          marginBottom: 12,
          fontStyle: 'italic',
        }}>
          Level up to earn talent points
        </div>
      )}

      {/* Branch columns */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        {BRANCH_ORDER.map(branch => (
          <BranchColumn
            key={branch}
            branch={branch}
            nodes={state.nodes.filter(n => n.branch === branch)}
            onUnlock={handleUnlock}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{
        marginTop: 16,
        padding: '8px 12px',
        borderTop: '1px solid #1e1e1e',
        display: 'flex',
        gap: 16,
        fontSize: 9,
        color: '#444',
      }}>
        <span>✓ Unlocked</span>
        <span>◎ Available</span>
        <span>○ Locked</span>
      </div>
    </div>
  )
}
