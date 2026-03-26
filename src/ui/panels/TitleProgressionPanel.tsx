// M59 Track B: Title Progression Panel — earned/locked titles with equip mechanic

import React, { useState, useEffect, useCallback } from 'react'
import {
  TITLE_DEFINITIONS,
  getUnlockedTitles,
  getEquippedTitleId,
  equipTitle,
  unequipTitle,
  type TitleDefinition,
} from '../../game/TitleProgressionSystem'
import { usePlayerStatsStore } from '../../store/playerStatsStore'

// ── Rarity config ─────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<TitleDefinition['rarity'], string> = {
  common:    '#9ca3af',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  legendary: '#facc15',
}

const RARITY_BG: Record<TitleDefinition['rarity'], string> = {
  common:    'rgba(156,163,175,0.06)',
  uncommon:  'rgba(74,222,128,0.05)',
  rare:      'rgba(96,165,250,0.07)',
  legendary: 'rgba(250,204,21,0.08)',
}

const RARITY_BORDER: Record<TitleDefinition['rarity'], string> = {
  common:    'rgba(156,163,175,0.2)',
  uncommon:  'rgba(74,222,128,0.25)',
  rare:      'rgba(96,165,250,0.3)',
  legendary: 'rgba(250,204,21,0.4)',
}

const RARITY_LABEL: Record<TitleDefinition['rarity'], string> = {
  common:    '● COMMON',
  uncommon:  '◇ UNCOMMON',
  rare:      '◆ RARE',
  legendary: '★ LEGENDARY',
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function getStatValue(stat: string): number {
  const stats = usePlayerStatsStore.getState().stats as unknown as Record<string, number>
  return stats[stat] ?? 0
}

// ── Title card ─────────────────────────────────────────────────────────────────

function TitleCard({
  def,
  isUnlocked,
  isEquipped,
  onEquip,
  onUnequip,
}: {
  def: TitleDefinition
  isUnlocked: boolean
  isEquipped: boolean
  onEquip: (id: string) => void
  onUnequip: () => void
}) {
  const color = RARITY_COLORS[def.rarity]
  const currentVal = getStatValue(def.requirement.stat)
  const progress = Math.min(1, currentVal / def.requirement.value)

  const borderColor = isEquipped
    ? '#cd4420'
    : isUnlocked
    ? RARITY_BORDER[def.rarity]
    : 'rgba(255,255,255,0.06)'

  const bgColor = isEquipped
    ? 'rgba(205,68,32,0.1)'
    : isUnlocked
    ? RARITY_BG[def.rarity]
    : 'rgba(255,255,255,0.02)'

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: '10px 12px',
      opacity: isUnlocked ? 1 : 0.55,
      transition: 'all 0.15s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{def.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: isUnlocked ? (isEquipped ? '#cd4420' : color) : '#555',
            fontFamily: 'monospace',
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {def.title}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {isEquipped && (
            <span style={{
              fontSize: 8, color: '#cd4420', fontFamily: 'monospace',
              border: '1px solid rgba(205,68,32,0.5)', borderRadius: 3,
              padding: '1px 4px', letterSpacing: 0.5,
            }}>
              EQUIPPED
            </span>
          )}
          <span style={{
            fontSize: 8,
            color: isUnlocked ? color : '#444',
            fontFamily: 'monospace',
            letterSpacing: 0.3,
          }}>
            {RARITY_LABEL[def.rarity]}
          </span>
        </div>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 10, color: isUnlocked ? '#999' : '#555',
        marginBottom: 6, lineHeight: 1.4,
      }}>
        {def.description}
      </div>

      {/* Progress bar (locked or unlocked-but-not-equipped) */}
      {!isEquipped && (
        <div style={{ marginBottom: isUnlocked ? 8 : 0 }}>
          <div style={{
            width: '100%', height: 3,
            background: 'rgba(255,255,255,0.07)',
            borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: isUnlocked ? color : '#374151',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 8, color: '#555', fontFamily: 'monospace', marginTop: 2,
          }}>
            <span>
              {Math.min(currentVal, def.requirement.value).toLocaleString()} / {def.requirement.value.toLocaleString()}
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
        </div>
      )}

      {/* Equip / Unequip buttons */}
      {isUnlocked && (
        isEquipped ? (
          <button
            onClick={onUnequip}
            style={{
              width: '100%',
              padding: '5px 0',
              background: 'rgba(205,68,32,0.12)',
              border: '1px solid rgba(205,68,32,0.4)',
              borderRadius: 4,
              color: '#cd4420',
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(205,68,32,0.22)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(205,68,32,0.12)' }}
          >
            UNEQUIP
          </button>
        ) : (
          <button
            onClick={() => onEquip(def.id)}
            style={{
              width: '100%',
              padding: '5px 0',
              background: `${RARITY_BG[def.rarity]}`,
              border: `1px solid ${RARITY_BORDER[def.rarity]}`,
              borderRadius: 4,
              color,
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            EQUIP
          </button>
        )
      )}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 14 }}>
      <div style={{ flex: 1, height: 1, background: `${color}33` }} />
      <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'monospace', letterSpacing: 1 }}>
        {label} ({count})
      </span>
      <div style={{ flex: 1, height: 1, background: `${color}33` }} />
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function TitleProgressionPanel() {
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(
    () => new Set(getUnlockedTitles().map(t => t.id))
  )
  const [equippedId, setEquippedId] = useState<string | null>(() => getEquippedTitleId())

  const refresh = useCallback(() => {
    setUnlockedIds(new Set(getUnlockedTitles().map(t => t.id)))
    setEquippedId(getEquippedTitleId())
  }, [])

  useEffect(() => {
    const iv = setInterval(refresh, 5000)
    window.addEventListener('title-unlocked', refresh)
    return () => {
      clearInterval(iv)
      window.removeEventListener('title-unlocked', refresh)
    }
  }, [refresh])

  const handleEquip = useCallback((id: string) => {
    equipTitle(id)
    refresh()
  }, [refresh])

  const handleUnequip = useCallback(() => {
    unequipTitle()
    refresh()
  }, [refresh])

  const totalTitles = TITLE_DEFINITIONS.length
  const unlockedCount = unlockedIds.size

  // Sort by rarity tier then id
  const rarityOrder: Record<TitleDefinition['rarity'], number> = { legendary: 0, rare: 1, uncommon: 2, common: 3 }
  const sortedDefs = [...TITLE_DEFINITIONS].sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity])

  const unlockedDefs = sortedDefs.filter(d => unlockedIds.has(d.id))
  const lockedDefs   = sortedDefs.filter(d => !unlockedIds.has(d.id))

  const equippedDef = equippedId ? TITLE_DEFINITIONS.find(d => d.id === equippedId) ?? null : null

  return (
    <div style={{ padding: 12, color: '#ccc', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#eee', letterSpacing: 1, marginBottom: 2 }}>
          TITLE PROGRESSION
        </div>
        <div style={{ fontSize: 10, color: '#666' }}>
          Earn titles through cumulative achievements
        </div>
      </div>

      {/* Progress summary */}
      <div style={{
        background: 'rgba(250,204,21,0.06)',
        border: '1px solid rgba(250,204,21,0.15)',
        borderRadius: 5,
        padding: '6px 10px',
        marginBottom: 10,
        fontSize: 11,
        color: '#facc15',
        fontFamily: 'monospace',
      }}>
        {unlockedCount} / {totalTitles} titles unlocked
        {equippedDef && (
          <span style={{ color: '#cd4420', marginLeft: 10 }}>
            • Equipped: {equippedDef.title}
          </span>
        )}
      </div>

      {/* Unlocked titles */}
      {unlockedDefs.length > 0 && (
        <>
          <SectionHeader label="UNLOCKED" count={unlockedDefs.length} color="#4ade80" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unlockedDefs.map(def => (
              <TitleCard
                key={def.id}
                def={def}
                isUnlocked={true}
                isEquipped={def.id === equippedId}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
            ))}
          </div>
        </>
      )}

      {/* Locked titles */}
      {lockedDefs.length > 0 && (
        <>
          <SectionHeader label="LOCKED" count={lockedDefs.length} color="#4b5563" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lockedDefs.map(def => (
              <TitleCard
                key={def.id}
                def={def}
                isUnlocked={false}
                isEquipped={false}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
            ))}
          </div>
        </>
      )}

      {unlockedCount === 0 && (
        <div style={{ textAlign: 'center', color: '#555', fontSize: 11, padding: '20px 0' }}>
          Complete achievements to earn titles
        </div>
      )}
    </div>
  )
}
