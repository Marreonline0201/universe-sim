// ── ProgressionPanel.tsx ──────────────────────────────────────────────────────
// M37 Track C: Shows earned titles, progression toward unearned titles,
// total play stats, and a title equip picker.
// Opened by J hotkey (replaces Journal hotkey slot — see SidebarShell).

import React, { useState, useEffect } from 'react'
import {
  TITLES,
  getEarnedTitles,
  getEquippedTitle,
  getEquippedTitleId,
  equipTitle,
} from '../../game/TitleSystem'
import { usePlayerStatsStore } from '../../store/playerStatsStore'
import { skillSystem } from '../../game/SkillSystem'
import { useSkillStore } from '../../store/skillStore'
import { usePlayerStore } from '../../store/playerStore'

const RUST_ORANGE = '#cd4420'

const RARITY_COLORS = {
  common: '#aaaaaa',
  rare: '#44aadd',
  legendary: '#ffdd00',
}

const RARITY_LABELS = {
  common: 'COMMON',
  rare: 'RARE',
  legendary: 'LEGENDARY',
}

function RarityBadge({ rarity }: { rarity: 'common' | 'rare' | 'legendary' }) {
  const color = RARITY_COLORS[rarity]
  return (
    <span style={{
      fontSize: 8,
      color,
      border: `1px solid ${color}55`,
      background: `${color}18`,
      borderRadius: 2,
      padding: '1px 5px',
      fontFamily: 'monospace',
      letterSpacing: 1,
      fontWeight: 700,
      flexShrink: 0,
    }}>
      {RARITY_LABELS[rarity]}
    </span>
  )
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: 11, color: '#e0d6c8', fontFamily: 'monospace', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

export function ProgressionPanel() {
  const [, setTick] = useState(0)
  const [equippedId, setEquippedId] = useState(getEquippedTitleId())
  const stats = usePlayerStatsStore(s => s.stats)
  const prestigeCount = useSkillStore(s => s.prestigeCount)
  const homeSet = usePlayerStore(s => s.homeSet)

  // Refresh every second so title requirements reflect live state
  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1)
      setEquippedId(getEquippedTitleId())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const earnedTitles = getEarnedTitles()
  const earnedIds = new Set(earnedTitles.map(t => t.id))
  const equippedTitle = getEquippedTitle()

  // Compute title progress descriptions for unearned titles
  function getTitleProgress(titleId: string): string | null {
    switch (titleId) {
      case 'gatherer': {
        const lv = skillSystem.getLevel('gathering')
        return lv >= 5 ? null : `Gathering level ${lv}/5`
      }
      case 'warrior': {
        const lv = skillSystem.getLevel('combat')
        return lv >= 5 ? null : `Combat level ${lv}/5`
      }
      case 'homesteader':
        return homeSet ? null : 'Place your home base (H)'
      case 'bossslayer': {
        const n = stats.bossesKilled
        return n >= 1 ? null : `Bosses killed: ${n}/1`
      }
      case 'explorer': {
        const n = stats.settlementsDiscovered
        return n >= 5 ? null : `Settlements discovered: ${n}/5`
      }
      case 'alchemist': {
        const n = stats.potionsBrewed
        return n >= 10 ? null : `Potions brewed: ${n}/10`
      }
      case 'tamer': {
        const n = stats.animalsTamed
        return n >= 3 ? null : `Animals tamed: ${n}/3`
      }
      case 'prestige':
        return prestigeCount >= 1 ? null : `Prestige count: ${prestigeCount}/1`
      case 'allskills': {
        const ids = ['gathering', 'crafting', 'combat', 'survival', 'exploration', 'smithing', 'husbandry'] as const
        const lowest = Math.min(...ids.map(id => skillSystem.getLevel(id)))
        return lowest >= 10 ? null : `Lowest skill level: ${lowest}/10`
      }
      case 'golden': {
        const n = stats.goldenFishCaught
        return n >= 1 ? null : `Golden fish caught: ${n}/1`
      }
      default:
        return null
    }
  }

  function handleEquip(titleId: string) {
    equipTitle(titleId)
    setEquippedId(titleId)
  }

  return (
    <div style={{ padding: 12, color: '#ccc', fontFamily: 'monospace' }}>

      {/* ── Current title display ── */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${equippedTitle.color}44`,
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: '#555', letterSpacing: 1, marginBottom: 3 }}>EQUIPPED TITLE</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: equippedTitle.color, letterSpacing: 1 }}>
            [{equippedTitle.name}]
          </div>
          <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>{equippedTitle.description}</div>
        </div>
        <RarityBadge rarity={equippedTitle.rarity} />
      </div>

      {/* ── Earned titles list ── */}
      <div style={{ fontSize: 12, color: RUST_ORANGE, letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
        TITLES ({earnedTitles.length}/{TITLES.length} EARNED)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
        {TITLES.map(title => {
          const earned = earnedIds.has(title.id)
          const isEquipped = equippedId === title.id
          const progress = !earned ? getTitleProgress(title.id) : null

          return (
            <div
              key={title.id}
              onClick={() => earned && handleEquip(title.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                background: isEquipped
                  ? `${title.color}18`
                  : earned
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(0,0,0,0.3)',
                border: isEquipped
                  ? `1px solid ${title.color}66`
                  : earned
                    ? '1px solid rgba(255,255,255,0.1)'
                    : '1px solid rgba(255,255,255,0.04)',
                borderRadius: 4,
                opacity: earned ? 1 : 0.45,
                cursor: earned ? 'pointer' : 'default',
                transition: 'background 0.15s, border 0.15s',
              }}
            >
              {/* Color dot */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: earned ? title.color : '#333',
                flexShrink: 0,
                boxShadow: earned ? `0 0 6px ${title.color}88` : 'none',
              }} />

              {/* Title name */}
              <span style={{
                flex: 1,
                fontSize: 11,
                fontWeight: 700,
                color: earned ? title.color : '#444',
              }}>
                [{earned ? title.name : '???'}]
              </span>

              {/* Progress or description */}
              <span style={{ fontSize: 9, color: '#555', flex: 1, textAlign: 'right', lineHeight: 1.3 }}>
                {earned ? title.description : (progress ?? title.description)}
              </span>

              <RarityBadge rarity={title.rarity} />

              {/* Equipped indicator */}
              {isEquipped && (
                <span style={{ fontSize: 9, color: title.color, fontWeight: 700, letterSpacing: 1 }}>
                  ON
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Lifetime stats ── */}
      <div style={{ fontSize: 12, color: RUST_ORANGE, letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
        LIFETIME STATS
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
        <StatRow label="Kills" value={stats.killCount.toLocaleString()} />
        <StatRow label="Resources gathered" value={stats.resourcesGathered.toLocaleString()} />
        <StatRow label="Items crafted" value={stats.itemsCrafted.toLocaleString()} />
        <StatRow label="Gold earned" value={stats.totalGoldEarned.toLocaleString()} />
        <StatRow label="Potions brewed" value={stats.potionsBrewed} />
        <StatRow label="Animals tamed" value={stats.animalsTamed} />
        <StatRow label="Settlements discovered" value={stats.settlementsDiscovered} />
        <StatRow label="Bosses killed" value={stats.bossesKilled} />
        <StatRow label="Distance traveled (m)" value={Math.round(stats.distanceTraveled).toLocaleString()} />
        <StatRow label="Golden fish caught" value={stats.goldenFishCaught} />
      </div>

      <div style={{ fontSize: 9, color: '#333', textAlign: 'center', letterSpacing: 1 }}>
        PRESS J TO CLOSE
      </div>
    </div>
  )
}
