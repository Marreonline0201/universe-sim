// ── SkillPanel.tsx ────────────────────────────────────────────────────────────
// M27 Track A: Skill progression panel — lists all 6 skills with levels,
// XP bars, and bonus descriptions. Read-only. Press K to open.

import React, { useEffect, useState } from 'react'
import { skillSystem, SkillSystem, type SkillId } from '../../game/SkillSystem'

const RUST_ORANGE = '#cd4420'

const SKILL_DESCRIPTIONS: Record<SkillId, string> = {
  gathering:   'Increases harvest speed. Lv10 = 50% faster.',
  crafting:    'Improves crafted item quality. Lv10 = +20% quality.',
  combat:      'Boosts damage dealt. Lv10 = +50% damage.',
  survival:    'Slows hunger & thirst drain. Lv10 = 30% less drain.',
  exploration: 'Expands fog-of-war reveal radius & movement speed.',
  smithing:    'Improves smithed item quality. Lv10 = +25% quality.',
}

interface SkillRowProps {
  skillId: SkillId
}

function SkillRow({ skillId }: SkillRowProps) {
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
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color,
          fontWeight: 700,
          width: 28,
          textAlign: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </span>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#ddd',
          fontWeight: 600,
          flex: 1,
          letterSpacing: 0.5,
        }}>
          {name}
        </span>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: isMaxed ? '#f1c40f' : RUST_ORANGE,
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          {isMaxed ? 'MAX' : `Lv. ${skill.level}`}
        </span>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 9,
        color: '#777',
        marginBottom: 6,
        lineHeight: 1.4,
        fontFamily: 'monospace',
        letterSpacing: 0.3,
      }}>
        {SKILL_DESCRIPTIONS[skillId]}
      </div>

      {/* XP bar */}
      <div style={{
        width: '100%',
        height: 4,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 3,
      }}>
        <div style={{
          width: `${progress * 100}%`,
          height: '100%',
          background: isMaxed ? '#f1c40f' : color,
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* XP numbers */}
      {!isMaxed && (
        <div style={{
          fontSize: 8,
          color: '#555',
          fontFamily: 'monospace',
          textAlign: 'right',
          letterSpacing: 0.5,
        }}>
          {skill.xp} / {xpNext} XP
        </div>
      )}
    </div>
  )
}

export function SkillPanel() {
  const [, setTick] = useState(0)

  // Subscribe to skill system updates for live re-renders
  useEffect(() => {
    const unsub = skillSystem.subscribe(() => setTick(t => t + 1))
    return unsub
  }, [])

  const skillIds = SkillSystem.getAllSkillIds()
  const totalLevel = skillIds.reduce((sum, id) => sum + skillSystem.getLevel(id), 0)
  const maxTotal = SkillSystem.getMaxLevel() * skillIds.length

  return (
    <div style={{ padding: '4px 0', color: '#ccc', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 11, color: '#eee', fontWeight: 700, letterSpacing: 1 }}>
          SKILL PROGRESSION
        </span>
        <span style={{ fontSize: 9, color: '#666', letterSpacing: 1 }}>
          {totalLevel}/{maxTotal} Levels
        </span>
      </div>

      {/* Skill rows */}
      {skillIds.map(id => (
        <SkillRow key={id} skillId={id} />
      ))}

      {/* Footer hint */}
      <div style={{
        marginTop: 10,
        fontSize: 8,
        color: '#444',
        textAlign: 'center',
        letterSpacing: 0.5,
        lineHeight: 1.5,
      }}>
        XP is earned automatically through gameplay actions.<br />
        Each level grants passive bonuses — no choices required.
      </div>
    </div>
  )
}

// Re-export as SkillTreePanel for SidebarShell compatibility
export { SkillPanel as SkillTreePanel }
