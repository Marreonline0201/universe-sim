// ── SkillPanel.tsx ────────────────────────────────────────────────────────────
// M27 Track A: Skill progression panel — lists all skills with levels, XP bars.
// M36 Track A: Added "Tree" tab with branching skill tree nodes + prestige system.
// Press K to open.

import React, { useEffect, useState } from 'react'
import { skillSystem, SkillSystem, SKILL_TREE, type SkillId, type SkillNode } from '../../game/SkillSystem'
import { useSkillStore } from '../../store/skillStore'

const RUST_ORANGE = '#cd4420'

const SKILL_DESCRIPTIONS: Record<SkillId, string> = {
  gathering:   'Increases harvest speed. Lv10 = 50% faster.',
  crafting:    'Improves crafted item quality. Lv10 = +20% quality.',
  combat:      'Boosts damage dealt. Lv10 = +50% damage.',
  survival:    'Slows hunger & thirst drain. Lv10 = 30% less drain.',
  exploration: 'Expands fog-of-war reveal radius & movement speed.',
  smithing:    'Improves smithed item quality. Lv10 = +25% quality.',
  husbandry:   'Improves taming success chance. Lv10 = +50% chance.',
}

// ── Skills Tab ────────────────────────────────────────────────────────────────

function SkillRow({ skillId }: { skillId: SkillId }) {
  const skill    = skillSystem.getSkill(skillId)
  const progress = skillSystem.getXpProgress(skillId)
  const xpNext   = skillSystem.getXpForNextLevel(skillId)
  const name     = SkillSystem.getSkillName(skillId)
  const color    = SkillSystem.getSkillColor(skillId)
  const icon     = SkillSystem.getSkillIcon(skillId)
  const isMaxed  = skill.level >= 10

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 4,
      padding: '8px 10px',
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color, fontWeight: 700, width: 28, textAlign: 'center', flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ddd', fontWeight: 600, flex: 1, letterSpacing: 0.5 }}>
          {name}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: isMaxed ? '#f1c40f' : RUST_ORANGE, fontWeight: 700, letterSpacing: 1 }}>
          {isMaxed ? 'MAX' : `Lv. ${skill.level}`}
        </span>
      </div>
      <div style={{ fontSize: 9, color: '#777', marginBottom: 6, lineHeight: 1.4, fontFamily: 'monospace', letterSpacing: 0.3 }}>
        {SKILL_DESCRIPTIONS[skillId]}
      </div>
      <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: isMaxed ? '#f1c40f' : color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      {!isMaxed && (
        <div style={{ fontSize: 8, color: '#555', fontFamily: 'monospace', textAlign: 'right', letterSpacing: 0.5 }}>
          {skill.xp} / {xpNext} XP
        </div>
      )}
    </div>
  )
}

// ── Tree Tab ──────────────────────────────────────────────────────────────────

function NodeCard({ node, skillLevel }: { node: SkillNode; skillLevel: number }) {
  const { unlockedNodes, skillPoints, spendSkillPoints, unlockNode } = useSkillStore()
  const [hovered, setHovered] = useState(false)

  const isUnlocked = unlockedNodes.includes(node.id)
  const prereqsMet = node.requires.every(reqId => unlockedNodes.includes(reqId))
  const tierLevelReq = node.row === 0 ? 5 : node.row === 1 ? 10 : 15
  const tierUnlocked = skillLevel >= tierLevelReq
  const canUnlock = !isUnlocked && prereqsMet && tierUnlocked && skillPoints >= node.cost
  const isLocked = !prereqsMet || !tierUnlocked

  const color = SkillSystem.getSkillColor(node.skillId)

  let border = '1px solid rgba(255,255,255,0.15)'
  let bg = 'rgba(255,255,255,0.03)'
  let textColor = '#888'

  if (isUnlocked) {
    border = `2px solid ${color}`
    bg = `${color}22`
    textColor = '#eee'
  } else if (canUnlock || (prereqsMet && tierUnlocked)) {
    border = `1px solid ${color}88`
    bg = 'rgba(255,255,255,0.06)'
    textColor = '#bbb'
  }

  function handleUnlock() {
    if (!canUnlock) return
    const spent = spendSkillPoints(node.cost)
    if (spent) unlockNode(node.id)
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: bg,
        border,
        borderRadius: 5,
        padding: '6px 8px',
        minWidth: 100,
        maxWidth: 120,
        cursor: canUnlock ? 'pointer' : 'default',
        opacity: isLocked ? 0.45 : 1,
        transition: 'all 0.15s',
      }}
    >
      {/* Lock icon for unavailable nodes */}
      {isLocked && (
        <div style={{ position: 'absolute', top: 3, right: 4, fontSize: 9, color: '#555' }}>🔒</div>
      )}
      {/* Unlocked checkmark */}
      {isUnlocked && (
        <div style={{ position: 'absolute', top: 3, right: 4, fontSize: 9, color }}>✓</div>
      )}

      <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: isUnlocked ? color : textColor, marginBottom: 3, paddingRight: 12 }}>
        {node.name}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#666', lineHeight: 1.3 }}>
        {node.description}
      </div>

      {/* Unlock button */}
      {!isUnlocked && prereqsMet && tierUnlocked && (
        <button
          onClick={handleUnlock}
          disabled={!canUnlock}
          style={{
            marginTop: 5,
            width: '100%',
            padding: '2px 0',
            fontSize: 8,
            fontFamily: 'monospace',
            background: canUnlock ? `${color}33` : 'rgba(255,255,255,0.05)',
            border: `1px solid ${canUnlock ? color : '#444'}`,
            borderRadius: 3,
            color: canUnlock ? color : '#555',
            cursor: canUnlock ? 'pointer' : 'not-allowed',
            letterSpacing: 0.5,
          }}
        >
          Unlock ({node.cost} pt{node.cost !== 1 ? 's' : ''})
        </button>
      )}

      {/* Tooltip on hover */}
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: '110%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#111',
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: '5px 8px',
          whiteSpace: 'nowrap',
          zIndex: 100,
          pointerEvents: 'none',
        }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#eee', fontWeight: 700 }}>{node.name}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#aaa', marginTop: 2 }}>{node.description}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#666', marginTop: 2 }}>
            Cost: {node.cost} skill point{node.cost !== 1 ? 's' : ''}
          </div>
          {!tierUnlocked && (
            <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#f44336', marginTop: 2 }}>
              Requires {SkillSystem.getSkillName(node.skillId)} Lv. {tierLevelReq}
            </div>
          )}
          {tierUnlocked && !prereqsMet && (
            <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#f44336', marginTop: 2 }}>
              Unlock prerequisites first
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SkillTreeSection({ skillId }: { skillId: SkillId }) {
  const nodes = SKILL_TREE[skillId]
  const color = SkillSystem.getSkillColor(skillId)
  const skillLevel = skillSystem.getLevel(skillId)

  // Group nodes by row
  const rows: SkillNode[][] = [[], [], []]
  for (const node of nodes) {
    rows[node.row].push(node)
  }
  // Sort within rows by col
  for (const row of rows) row.sort((a, b) => a.col - b.col)

  const rowLabels = ['Tier I (Lv.5)', 'Tier II (Lv.10)', 'Tier III (Lv.15)']

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 5,
      padding: '8px 10px',
      marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color, fontWeight: 700 }}>
          {SkillSystem.getSkillIcon(skillId)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#ddd', fontWeight: 700 }}>
          {SkillSystem.getSkillName(skillId)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 9, color: skillLevel >= 10 ? '#f1c40f' : '#666', marginLeft: 'auto' }}>
          Lv. {skillLevel}
        </span>
      </div>

      {/* Rows */}
      {rows.map((rowNodes, rowIdx) => {
        if (rowNodes.length === 0) return null
        return (
          <div key={rowIdx} style={{ marginBottom: rowIdx < 2 ? 8 : 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#555', letterSpacing: 0.5, marginBottom: 4 }}>
              {rowLabels[rowIdx]}
            </div>
            {/* Connector line above tier 2+ */}
            {rowIdx > 0 && rowNodes.length > 0 && (
              <div style={{ borderLeft: `1px dashed ${color}44`, marginLeft: 10, height: 6, marginBottom: 2 }} />
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {rowNodes.map(node => (
                <NodeCard key={node.id} node={node} skillLevel={skillLevel} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Prestige Section ──────────────────────────────────────────────────────────

function PrestigeSection() {
  const prestigeCount = useSkillStore(s => s.prestigeCount)
  const canPrestige = skillSystem.canPrestige()

  function handlePrestige() {
    if (!canPrestige) return
    skillSystem.prestige()
  }

  return (
    <div style={{
      marginTop: 12,
      border: canPrestige ? '2px solid #f1c40f' : '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6,
      padding: '10px 12px',
      background: canPrestige ? 'rgba(241,196,15,0.06)' : 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: canPrestige ? '#f1c40f' : '#555', fontWeight: 700, marginBottom: 4 }}>
        PRESTIGE {prestigeCount > 0 ? `(x${prestigeCount})` : ''}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#777', lineHeight: 1.5, marginBottom: 8 }}>
        Reset all skills to level 0, keep unlocked nodes, and gain a permanent +10% XP bonus per prestige.
        {prestigeCount > 0 && (
          <span style={{ color: '#f1c40f', display: 'block', marginTop: 2 }}>
            Current bonus: +{prestigeCount * 10}% XP gain
          </span>
        )}
      </div>
      {canPrestige ? (
        <button
          onClick={handlePrestige}
          style={{
            width: '100%',
            padding: '5px 0',
            fontFamily: 'monospace',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            background: 'rgba(241,196,15,0.15)',
            border: '1px solid #f1c40f',
            borderRadius: 4,
            color: '#f1c40f',
            cursor: 'pointer',
          }}
        >
          ✨ Prestige — Reset skills, keep nodes, +10% XP permanently
        </button>
      ) : (
        <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#444', textAlign: 'center' }}>
          Requires all skills at level 10
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type Tab = 'skills' | 'tree'

export function SkillPanel() {
  const [, setTick] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>('skills')
  const skillPoints = useSkillStore(s => s.skillPoints)
  const prestigeCount = useSkillStore(s => s.prestigeCount)

  useEffect(() => {
    const unsub = skillSystem.subscribe(() => setTick(t => t + 1))
    return unsub
  }, [])

  const skillIds = SkillSystem.getAllSkillIds()
  const totalLevel = skillIds.reduce((sum, id) => sum + skillSystem.getLevel(id), 0)
  const maxTotal = SkillSystem.getMaxLevel() * skillIds.length

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    flex: 1,
    padding: '5px 0',
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    background: activeTab === tab ? 'rgba(205,68,32,0.2)' : 'transparent',
    border: 'none',
    borderBottom: activeTab === tab ? `2px solid ${RUST_ORANGE}` : '2px solid transparent',
    color: activeTab === tab ? '#eee' : '#555',
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: '4px 0', color: '#ccc', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 11, color: '#eee', fontWeight: 700, letterSpacing: 1 }}>
          SKILL PROGRESSION
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {prestigeCount > 0 && (
            <span style={{ fontSize: 9, color: '#f1c40f', letterSpacing: 0.5 }}>
              ✨ ×{prestigeCount}
            </span>
          )}
          <span style={{ fontSize: 9, color: '#666', letterSpacing: 1 }}>
            {totalLevel}/{maxTotal}
          </span>
        </div>
      </div>

      {/* Skill points banner */}
      {skillPoints > 0 && (
        <div style={{
          background: 'rgba(241,196,15,0.1)',
          border: '1px solid rgba(241,196,15,0.3)',
          borderRadius: 4,
          padding: '5px 10px',
          marginBottom: 8,
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#f1c40f',
          textAlign: 'center',
          letterSpacing: 0.5,
        }}>
          ⭐ {skillPoints} Skill Point{skillPoints !== 1 ? 's' : ''} Available
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button style={tabStyle('skills')} onClick={() => setActiveTab('skills')}>SKILLS</button>
        <button style={tabStyle('tree')} onClick={() => setActiveTab('tree')}>TREE</button>
      </div>

      {/* Skills tab */}
      {activeTab === 'skills' && (
        <>
          {skillIds.map(id => (
            <SkillRow key={id} skillId={id} />
          ))}
          <div style={{ marginTop: 10, fontSize: 8, color: '#444', textAlign: 'center', letterSpacing: 0.5, lineHeight: 1.5 }}>
            XP is earned automatically through gameplay actions.<br />
            Each level grants passive bonuses + 1 skill point.
          </div>
        </>
      )}

      {/* Tree tab */}
      {activeTab === 'tree' && (
        <>
          {skillIds.map(id => (
            <SkillTreeSection key={id} skillId={id} />
          ))}
          <PrestigeSection />
        </>
      )}
    </div>
  )
}

// Re-export as SkillTreePanel for SidebarShell compatibility
export { SkillPanel as SkillTreePanel }
