// ── PetPanel.tsx ──────────────────────────────────────────────────────────────
// M45 Track A: Pet & Companion management panel.
// M58 Track C: Pet advancement — level, XP, bond, skill tree
// Tame small creatures for passive buffs. Hotkey: P

import { useState, useEffect, useCallback } from 'react'
import {
  PET_DEFS,
  PetType,
  playerPet,
  tamePet,
  dismissPet,
} from '../../game/PetSystem'
import {
  getPetState,
  addPetXp,
  unlockSkill,
  feedPet,
  type PetSkill,
} from '../../game/PetAdvancementSystem'
import { inventory } from '../../game/GameSingletons'
import { MAT } from '../../player/Inventory'

// Build a material-name lookup from MAT enum keys
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [
    v as number,
    k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
  ])
)

const PET_ORDER = [
  PetType.FOX,
  PetType.CROW,
  PetType.RABBIT,
  PetType.WOLF,
  PetType.OWL,
]

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    fontFamily: 'monospace',
    color: '#ccc',
    userSelect: 'none',
  } as React.CSSProperties,
  header: {
    color: '#4dd9ac',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 12,
    borderBottom: '1px solid #1e4a40',
    paddingBottom: 6,
  } as React.CSSProperties,
  activePetCard: {
    background: 'rgba(20,60,50,0.6)',
    border: '1px solid #2a6a55',
    borderRadius: 6,
    padding: '14px 16px',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  } as React.CSSProperties,
  petIcon: {
    fontSize: 36,
    textAlign: 'center' as const,
    marginBottom: 4,
  } as React.CSSProperties,
  petName: {
    color: '#4dd9ac',
    fontSize: 15,
    fontWeight: 700,
    textAlign: 'center' as const,
    letterSpacing: 1,
  } as React.CSSProperties,
  buffRow: {
    color: '#8de8c8',
    fontSize: 11,
    textAlign: 'center' as const,
    opacity: 0.9,
  } as React.CSSProperties,
  dismissBtn: {
    background: 'rgba(180,40,40,0.18)',
    border: '1px solid #5a1a1a',
    color: '#d47070',
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    padding: '6px 14px',
    cursor: 'pointer',
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'center' as const,
    transition: 'background 0.15s',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  } as React.CSSProperties,
  card: {
    background: 'rgba(14,14,14,0.8)',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  } as React.CSSProperties,
  cardIcon: {
    fontSize: 28,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  cardName: {
    color: '#eee',
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center' as const,
    letterSpacing: 0.5,
  } as React.CSSProperties,
  cardBuff: {
    color: '#4dd9ac',
    fontSize: 10,
    textAlign: 'center' as const,
    lineHeight: 1.4,
  } as React.CSSProperties,
  costRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    justifyContent: 'center' as const,
    marginTop: 2,
  } as React.CSSProperties,
  tameBtn: {
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 1.5,
    padding: '5px 10px',
    cursor: 'pointer',
    borderRadius: 4,
    marginTop: 4,
    transition: 'background 0.15s',
    border: 'none',
    width: '100%',
  } as React.CSSProperties,
}

// ── XP Bar ────────────────────────────────────────────────────────────────────

function XpBar({ xp, xpToNext }: { xp: number; xpToNext: number }) {
  const pct = Math.min(100, Math.round((xp / xpToNext) * 100))
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#8de8c8', marginBottom: 2 }}>
        <span>XP</span>
        <span>{xp} / {xpToNext}</span>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #2a8a6a, #4dd9ac)',
          borderRadius: 3,
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  )
}

// ── Bond Meter ────────────────────────────────────────────────────────────────

function BondMeter({ bond, onFeed }: { bond: number; onFeed: () => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#aaa', letterSpacing: 1 }}>BOND</span>
        <span style={{ fontSize: 10, color: '#f4a460' }}>{bond}/100</span>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 3, height: 6, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{
          width: `${bond}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #c07030, #f4a460)',
          borderRadius: 3,
          transition: 'width 0.3s',
        }} />
      </div>
      <button
        style={{
          fontFamily: 'monospace',
          fontSize: 10,
          letterSpacing: 1.5,
          padding: '5px 12px',
          cursor: 'pointer',
          borderRadius: 4,
          background: 'rgba(120,60,10,0.35)',
          border: '1px solid #6a3a10',
          color: '#f4a460',
          transition: 'background 0.15s',
          width: '100%',
        }}
        onClick={onFeed}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(160,80,20,0.5)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(120,60,10,0.35)')}
      >
        🍖 FEED PET (+5 bond)
      </button>
    </div>
  )
}

// ── Skill Card ────────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  skillPoints,
  allSkills,
  onUnlock,
}: {
  skill: PetSkill
  skillPoints: number
  allSkills: PetSkill[]
  onUnlock: (id: string) => void
}) {
  const prereqsMet = skill.requires.every(reqId => {
    const req = allSkills.find(s => s.id === reqId)
    return req?.unlocked === true
  })
  const canUnlock = !skill.unlocked && prereqsMet && skillPoints >= skill.cost

  const borderColor = skill.unlocked
    ? '#4dd9ac'
    : canUnlock
    ? '#2a6a55'
    : '#222'

  const bgColor = skill.unlocked
    ? 'rgba(20,70,55,0.7)'
    : canUnlock
    ? 'rgba(14,40,30,0.6)'
    : 'rgba(10,10,10,0.5)'

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: '10px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      opacity: (!prereqsMet && !skill.unlocked) ? 0.5 : 1,
    }}>
      <div style={{ fontSize: 20, textAlign: 'center' }}>{skill.icon}</div>
      <div style={{ color: skill.unlocked ? '#4dd9ac' : '#ccc', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
        {skill.name}
      </div>
      <div style={{ color: '#888', fontSize: 9, textAlign: 'center', lineHeight: 1.4 }}>
        {skill.description}
      </div>
      <div style={{ color: '#6de0b8', fontSize: 9, textAlign: 'center', lineHeight: 1.3 }}>
        {skill.bonus}
      </div>
      {skill.requires.length > 0 && (
        <div style={{ color: '#555', fontSize: 8, textAlign: 'center' }}>
          Requires: {skill.requires.join(', ')}
        </div>
      )}
      {!skill.unlocked && (
        <button
          disabled={!canUnlock}
          onClick={() => onUnlock(skill.id)}
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 1,
            padding: '4px 8px',
            marginTop: 2,
            borderRadius: 4,
            cursor: canUnlock ? 'pointer' : 'not-allowed',
            background: canUnlock ? 'rgba(20,100,80,0.5)' : 'rgba(20,20,20,0.4)',
            border: `1px solid ${canUnlock ? '#2a6a55' : '#222'}`,
            color: canUnlock ? '#4dd9ac' : '#444',
            transition: 'background 0.15s',
          }}
        >
          UNLOCK ({skill.cost} pt{skill.cost !== 1 ? 's' : ''})
        </button>
      )}
      {skill.unlocked && (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#4dd9ac', marginTop: 2 }}>
          ✓ UNLOCKED
        </div>
      )}
    </div>
  )
}

// ── Skill Tree Section ────────────────────────────────────────────────────────

function SkillTreeSection({ onUnlock }: { onUnlock: (id: string) => void }) {
  const petState = getPetState()
  if (!petState) return null

  const { skills, skillPoints } = petState

  const tier1 = skills.filter(s => s.tier === 1)
  const tier2 = skills.filter(s => s.tier === 2)
  const tier3 = skills.filter(s => s.tier === 3)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        color: '#4dd9ac',
        fontSize: 10,
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 8,
        borderBottom: '1px solid #1e4a40',
        paddingBottom: 6,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>Skill Tree</span>
        <span style={{ color: skillPoints > 0 ? '#f4d060' : '#555', fontSize: 10 }}>
          {skillPoints} unspent pt{skillPoints !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ marginBottom: 6, fontSize: 9, color: '#555', letterSpacing: 1, textTransform: 'uppercase' }}>— Tier 1 —</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
        {tier1.map(skill => (
          <SkillCard
            key={skill.id}
            skill={skill}
            skillPoints={skillPoints}
            allSkills={skills}
            onUnlock={onUnlock}
          />
        ))}
      </div>

      <div style={{ marginBottom: 6, fontSize: 9, color: '#555', letterSpacing: 1, textTransform: 'uppercase' }}>— Tier 2 —</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        {tier2.map(skill => (
          <SkillCard
            key={skill.id}
            skill={skill}
            skillPoints={skillPoints}
            allSkills={skills}
            onUnlock={onUnlock}
          />
        ))}
      </div>

      <div style={{ marginBottom: 6, fontSize: 9, color: '#555', letterSpacing: 1, textTransform: 'uppercase' }}>— Tier 3 —</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {tier3.map(skill => (
          <SkillCard
            key={skill.id}
            skill={skill}
            skillPoints={skillPoints}
            allSkills={skills}
            onUnlock={onUnlock}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function PetPanel() {
  // Tick to trigger re-render for inventory polling + pet state
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick(t => t + 1), [])

  // Poll inventory every 500ms to update cost affordability
  useEffect(() => {
    const id = setInterval(rerender, 500)
    return () => clearInterval(id)
  }, [rerender])

  // Re-render on pet events
  useEffect(() => {
    window.addEventListener('pet-tamed', rerender)
    window.addEventListener('pet-dismissed', rerender)
    window.addEventListener('pet-levelup', rerender)
    window.addEventListener('pet-skill-unlocked', rerender)
    window.addEventListener('pet-fed', rerender)
    return () => {
      window.removeEventListener('pet-tamed', rerender)
      window.removeEventListener('pet-dismissed', rerender)
      window.removeEventListener('pet-levelup', rerender)
      window.removeEventListener('pet-skill-unlocked', rerender)
      window.removeEventListener('pet-fed', rerender)
    }
  }, [rerender])

  const activePet = playerPet
  const petState = getPetState()

  const handleFeed = useCallback(() => {
    feedPet()
    rerender()
  }, [rerender])

  const handleUnlockSkill = useCallback((skillId: string) => {
    unlockSkill(skillId)
    rerender()
  }, [rerender])

  // Dev: add XP button (hidden in prod — remove if unwanted)
  const handleAddXp = useCallback(() => {
    addPetXp(50)
    rerender()
  }, [rerender])

  if (activePet) {
    const def = PET_DEFS[activePet.type]
    return (
      <div style={S.root}>
        <div style={S.header}>Active Companion</div>
        <div style={S.activePetCard}>
          <div style={S.petIcon}>{def.icon}</div>
          <div style={S.petName}>{def.name}</div>
          {def.buffDesc.map((desc, i) => (
            <div key={i} style={S.buffRow}>✦ {desc}</div>
          ))}

          {/* Level + XP */}
          {petState && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#f4d060', fontWeight: 700 }}>
                  Level {petState.level}
                </span>
                <span style={{ fontSize: 9, color: '#555' }}>
                  {petState.skillPoints > 0 ? `${petState.skillPoints} skill pt${petState.skillPoints !== 1 ? 's' : ''} available!` : ''}
                </span>
              </div>
              <XpBar xp={petState.xp} xpToNext={petState.xpToNext} />
            </div>
          )}

          <button
            style={S.dismissBtn}
            onClick={() => { dismissPet(); rerender() }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(180,40,40,0.38)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(180,40,40,0.18)')}
          >
            DISMISS
          </button>
        </div>

        {/* Bond meter */}
        {petState && (
          <BondMeter bond={petState.bond} onFeed={handleFeed} />
        )}

        {/* Dev XP button */}
        {import.meta.env.DEV && (
          <button
            onClick={handleAddXp}
            style={{
              fontFamily: 'monospace', fontSize: 9, padding: '3px 8px', marginBottom: 8,
              background: 'rgba(60,40,10,0.4)', border: '1px solid #444', color: '#888',
              borderRadius: 3, cursor: 'pointer', width: '100%',
            }}
          >
            [DEV] +50 Pet XP
          </button>
        )}

        {/* Skill tree */}
        <SkillTreeSection onUnlock={handleUnlockSkill} />

        <div style={{ color: '#555', fontSize: 10, textAlign: 'center', marginTop: 12 }}>
          Dismiss your current companion to tame a new one.
        </div>
      </div>
    )
  }

  return (
    <div style={S.root}>
      <div style={S.header}>Tame a Companion</div>
      <div style={{ color: '#666', fontSize: 11, marginBottom: 14 }}>
        Offer materials to tame a creature. Your companion will follow you and grant passive buffs.
      </div>
      <div style={S.grid}>
        {PET_ORDER.map(type => {
          const def = PET_DEFS[type]
          const canAfford = def.tameCost.every(
            ({ materialId, qty }) => inventory.countMaterial(materialId) >= qty
          )
          return (
            <div
              key={type}
              style={{
                ...S.card,
                borderColor: canAfford ? '#2a4a40' : '#2a2a2a',
              }}
            >
              <div style={S.cardIcon}>{def.icon}</div>
              <div style={S.cardName}>{def.name}</div>
              <div style={S.cardBuff}>{def.buffDesc[0]}</div>
              <div style={S.costRow}>
                {def.tameCost.map(({ materialId, qty }) => {
                  const has = inventory.countMaterial(materialId)
                  const enough = has >= qty
                  return (
                    <span
                      key={materialId}
                      style={{
                        fontSize: 9,
                        color: enough ? '#8de8c8' : '#c04040',
                        background: enough ? 'rgba(20,60,50,0.5)' : 'rgba(60,10,10,0.5)',
                        borderRadius: 3,
                        padding: '2px 5px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {MAT_NAMES[materialId] ?? `Mat#${materialId}`} ×{qty}
                    </span>
                  )
                })}
              </div>
              <button
                style={{
                  ...S.tameBtn,
                  background: canAfford ? 'rgba(20,100,80,0.5)' : 'rgba(30,30,30,0.4)',
                  color: canAfford ? '#4dd9ac' : '#444',
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  border: `1px solid ${canAfford ? '#2a6a55' : '#2a2a2a'}`,
                }}
                disabled={!canAfford}
                onClick={() => {
                  if (tamePet(type)) rerender()
                }}
              >
                TAME
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
