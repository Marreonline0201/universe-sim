// ── SkillTreePanel.tsx ────────────────────────────────────────────────────────
// M22 Track B: Player skill progression UI.
// Shows 6 skill cards in a 2x3 grid with XP bars, level indicators, and bonus descriptions.

import { useEffect, useState, useCallback } from 'react'
import { skillSystem, SkillSystem, type SkillId, type SkillData } from '../../game/SkillSystem'

const ALL_SKILLS = SkillSystem.getAllSkillIds()

const BONUS_DESCRIPTIONS: Record<SkillId, (level: number) => string> = {
  gathering: (l) => l > 0 ? `Harvest ${l * 5}% faster` : 'Harvest resources faster',
  crafting: (l) => l > 0 ? `+${(l * 2).toFixed(0)}% craft quality` : 'Improve crafted item quality',
  combat: (l) => l > 0 ? `+${l * 5}% damage dealt` : 'Deal more damage in combat',
  survival: (l) => l > 0 ? `-${l * 3}% hunger/thirst drain` : 'Slow hunger and thirst drain',
  exploration: (l) => l > 0 ? `+${l * 5}% reveal range, +${(l * 1.5).toFixed(1)}% speed` : 'Move faster, reveal more map',
  smithing: (l) => l > 0 ? `+${(l * 2.5).toFixed(1)}% smithing quality` : 'Improve smithed item quality',
  husbandry: (l) => l > 0 ? `+${l * 5}% taming success chance` : 'Improve taming success chance',
}

export function SkillTreePanel() {
  // Subscribe to skill system changes for re-render
  const [, setVersion] = useState(0)
  useEffect(() => {
    return skillSystem.subscribe(() => setVersion(v => v + 1))
  }, [])

  const skills = skillSystem.getAllSkills()

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 4 }}>
        PLAYER SKILLS
      </div>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 8 }}>
        Earn XP by gathering, crafting, fighting, surviving, and exploring.
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
      }}>
        {ALL_SKILLS.map(id => (
          <SkillCard key={id} skillId={id} data={skills[id]} />
        ))}
      </div>

      {/* Total level summary */}
      <div style={{
        marginTop: 8,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 6,
        border: '1px solid #222',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: '#888' }}>Total Level</span>
        <span style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>
          {ALL_SKILLS.reduce((sum, id) => sum + skills[id].level, 0)} / {ALL_SKILLS.length * 10}
        </span>
      </div>
    </div>
  )
}

// ── SkillCard ─────────────────────────────────────────────────────────────────

function SkillCard({ skillId, data }: { skillId: SkillId; data: SkillData }) {
  const color = SkillSystem.getSkillColor(skillId)
  const icon = SkillSystem.getSkillIcon(skillId)
  const name = SkillSystem.getSkillName(skillId)
  const progress = skillSystem.getXpProgress(skillId)
  const xpNeeded = skillSystem.getXpForNextLevel(skillId)
  const isMaxed = data.level >= 10

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${data.level > 0 ? color + '44' : '#222'}`,
      borderRadius: 6,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Header: icon + name + level */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color, fontWeight: 700 }}>{icon}</span>
          <span style={{ fontSize: 12, color: '#ddd', fontWeight: 600 }}>{name}</span>
        </div>
        <span style={{
          fontSize: 13,
          color: isMaxed ? '#ffd700' : color,
          fontWeight: 700,
        }}>
          {isMaxed ? 'MAX' : `Lv.${data.level}`}
        </span>
      </div>

      {/* XP bar */}
      <div style={{
        width: '100%',
        height: 6,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress * 100}%`,
          height: '100%',
          background: isMaxed
            ? 'linear-gradient(90deg, #ffd700, #ffaa00)'
            : `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* XP text */}
      <div style={{ fontSize: 9, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
        <span>{isMaxed ? 'Complete' : `${data.xp} / ${xpNeeded} XP`}</span>
        <span>{isMaxed ? '' : `${(progress * 100).toFixed(0)}%`}</span>
      </div>

      {/* Bonus description */}
      <div style={{ fontSize: 10, color: data.level > 0 ? color : '#555', marginTop: 2 }}>
        {BONUS_DESCRIPTIONS[skillId](data.level)}
      </div>
    </div>
  )
}
