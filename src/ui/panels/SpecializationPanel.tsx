// ── SpecializationPanel.tsx ───────────────────────────────────────────────────
// M49 Track A: Skill Specialization Trees
//
// Shows specialization choices for skills that have specs (combat, crafting,
// survival, smithing, fishing). Players choose one path per skill at level 10.

import { useState } from 'react'
import {
  SKILL_SPECS,
  getChosenSpec,
  getSpecsForSkill,
  chooseSpec,
  isSpecLocked,
  type SkillSpec,
} from '../../game/SkillSpecializationSystem'
import { skillSystem } from '../../game/SkillSystem'

// Skills that have specializations
const SPEC_SKILL_IDS = ['combat', 'crafting', 'survival', 'smithing', 'fishing'] as const
type SpecSkillId = typeof SPEC_SKILL_IDS[number]

const SKILL_DISPLAY: Record<SpecSkillId, { name: string; color: string }> = {
  combat:   { name: 'Combat',   color: '#f44336' },
  crafting: { name: 'Crafting', color: '#ff9800' },
  survival: { name: 'Survival', color: '#e91e63' },
  smithing: { name: 'Smithing', color: '#9c27b0' },
  fishing:  { name: 'Fishing',  color: '#2196f3' },
}

// ── SpecCard ──────────────────────────────────────────────────────────────────

interface SpecCardProps {
  spec: SkillSpec
  skillLevel: number
  chosenSpecId: string | null
  onChosen: () => void
}

function SpecCard({ spec, skillLevel, chosenSpecId, onChosen }: SpecCardProps) {
  const isChosen = chosenSpecId === spec.id
  const otherChosen = chosenSpecId !== null && chosenSpecId !== spec.id
  const locked = skillLevel < spec.requiredLevel
  const dim = locked || otherChosen

  const skillColor = SKILL_DISPLAY[spec.skillId as SpecSkillId]?.color ?? '#888'

  let borderColor = '#333'
  let bgColor = 'rgba(255,255,255,0.02)'
  if (isChosen) {
    borderColor = '#4caf50'
    bgColor = 'rgba(76,175,80,0.12)'
  } else if (!dim) {
    borderColor = skillColor + '66'
    bgColor = 'rgba(255,255,255,0.04)'
  }

  function handleChoose() {
    if (dim || isChosen) return
    // Pass the current skill level to chooseSpec for the level check
    const success = chooseSpec(spec.id, skillLevel)
    if (success) onChosen()
  }

  return (
    <div style={{
      position: 'relative',
      flex: '1 1 0',
      minWidth: 110,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: '10px 10px 10px 10px',
      background: bgColor,
      opacity: dim ? 0.45 : 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      transition: 'opacity 0.15s, border-color 0.15s',
    }}>
      {/* Chosen badge */}
      {isChosen && (
        <div style={{
          position: 'absolute',
          top: 6,
          right: 6,
          fontSize: 8,
          fontFamily: 'monospace',
          fontWeight: 700,
          color: '#4caf50',
          letterSpacing: 0.5,
          background: 'rgba(76,175,80,0.15)',
          borderRadius: 3,
          padding: '1px 4px',
        }}>
          ✓ CHOSEN
        </div>
      )}

      {/* Icon + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>{spec.icon}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: isChosen ? '#4caf50' : '#ddd' }}>
          {spec.name}
        </span>
      </div>

      {/* Description */}
      <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#888', lineHeight: 1.4 }}>
        {spec.description}
      </div>

      {/* Bonus list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
        {spec.bonuses.map((bonus, i) => (
          <div key={i} style={{
            fontFamily: 'monospace',
            fontSize: 8,
            color: isChosen ? '#a5d6a7' : '#666',
            lineHeight: 1.3,
          }}>
            • {bonus}
          </div>
        ))}
      </div>

      {/* Locked overlay */}
      {locked && (
        <div style={{
          marginTop: 6,
          fontFamily: 'monospace',
          fontSize: 8,
          color: '#555',
          textAlign: 'center',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 5,
        }}>
          🔒 Requires Level {spec.requiredLevel}
        </div>
      )}

      {/* Choose button */}
      {!locked && !isChosen && !otherChosen && (
        <button
          onClick={handleChoose}
          style={{
            marginTop: 6,
            padding: '3px 0',
            fontFamily: 'monospace',
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.5,
            background: skillColor + '22',
            border: `1px solid ${skillColor}88`,
            borderRadius: 3,
            color: skillColor,
            cursor: 'pointer',
          }}
        >
          Choose
        </button>
      )}
    </div>
  )
}

// ── SkillSpecRow ──────────────────────────────────────────────────────────────

interface SkillSpecRowProps {
  skillId: SpecSkillId
  tick: number
  onUpdate: () => void
}

function SkillSpecRow({ skillId, tick: _tick, onUpdate }: SkillSpecRowProps) {
  const skillLevel = skillSystem.getLevel(skillId)
  const specs = getSpecsForSkill(skillId)
  const chosenSpec = getChosenSpec(skillId)
  const chosenSpecId = chosenSpec?.id ?? null
  const { name, color } = SKILL_DISPLAY[skillId]

  if (specs.length === 0) return null

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 5,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color }}>
          {name}
        </span>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 9,
          color: skillLevel >= 10 ? '#f1c40f' : '#666',
          marginLeft: 'auto',
        }}>
          {skillLevel >= 10 ? 'Lv. MAX' : `Lv. ${skillLevel}`}
        </span>
      </div>

      {/* Spec cards side by side */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {specs.map(spec => (
          <SpecCard
            key={spec.id}
            spec={spec}
            skillLevel={skillLevel}
            chosenSpecId={chosenSpecId}
            onChosen={onUpdate}
          />
        ))}
      </div>
    </div>
  )
}

// ── SpecializationPanel ───────────────────────────────────────────────────────

export function SpecializationPanel() {
  const [tick, setTick] = useState(0)

  function handleUpdate() {
    setTick(t => t + 1)
  }

  // Check if any skill has reached level 10
  const anyUnlocked = SPEC_SKILL_IDS.some(id => skillSystem.getLevel(id) >= 10)

  return (
    <div style={{ color: '#ccc', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: 11, color: '#eee', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
          SKILL SPECIALIZATIONS
        </div>
        <div style={{ fontSize: 9, color: '#666', lineHeight: 1.5 }}>
          Choose one path per skill at level 10 — your choice is permanent.
        </div>
      </div>

      {/* Empty state */}
      {!anyUnlocked && (
        <div style={{
          padding: '20px 0',
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#444',
          lineHeight: 1.7,
        }}>
          🔒 Reach level 10 in any skill to unlock specializations.
        </div>
      )}

      {/* Skill rows */}
      {SPEC_SKILL_IDS.map(id => (
        <SkillSpecRow
          key={id}
          skillId={id}
          tick={tick}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  )
}
