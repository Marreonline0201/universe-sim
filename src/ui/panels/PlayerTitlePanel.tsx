// ── PlayerTitlePanel.tsx ──────────────────────────────────────────────────────
// M66 Track B: Player Title Panel
// Shows all 20 titles grouped by rarity. Equip button for unlocked titles.

import React, { useState, useEffect, useCallback } from 'react'
import {
  getAllTitles,
  getEquippedTitle,
  equipTitle,
  type PlayerTitle,
} from '../../game/PlayerTitleSystem'

// ── Rarity colour map ─────────────────────────────────────────────────────────

const RARITY_COLOR: Record<PlayerTitle['rarity'], string> = {
  common:    '#aaaaaa',
  rare:      '#4fc3f7',
  epic:      '#ce93d8',
  legendary: '#ffd54f',
}

const RARITY_GLOW: Record<PlayerTitle['rarity'], string> = {
  common:    '0 0 8px rgba(170,170,170,0.4)',
  rare:      '0 0 10px rgba(79,195,247,0.5)',
  epic:      '0 0 12px rgba(206,147,216,0.6)',
  legendary: '0 0 16px rgba(255,213,79,0.7)',
}

const RARITY_ORDER: PlayerTitle['rarity'][] = ['legendary', 'epic', 'rare', 'common']
const RARITY_LABEL: Record<PlayerTitle['rarity'], string> = {
  legendary: 'LEGENDARY',
  epic:      'EPIC',
  rare:      'RARE',
  common:    'COMMON',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlayerTitlePanel() {
  const [titles, setTitles] = useState<PlayerTitle[]>(() => getAllTitles())
  const [equippedId, setEquippedId] = useState<string | null>(
    () => getEquippedTitle()?.id ?? null
  )

  // Refresh on unlock or equip events
  const refresh = useCallback(() => {
    setTitles([...getAllTitles()])
    setEquippedId(getEquippedTitle()?.id ?? null)
  }, [])

  useEffect(() => {
    window.addEventListener('title-unlocked', refresh)
    window.addEventListener('title-equipped', refresh)
    return () => {
      window.removeEventListener('title-unlocked', refresh)
      window.removeEventListener('title-equipped', refresh)
    }
  }, [refresh])

  const handleEquip = useCallback((id: string) => {
    equipTitle(id)
    setEquippedId(id)
  }, [])

  const unlockedCount = titles.filter(t => t.unlocked).length

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc', fontSize: 12 }}>
      {/* Header summary */}
      <div style={{
        marginBottom: 16,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 6,
        border: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, letterSpacing: 1 }}>
          TITLES UNLOCKED
        </span>
        <span style={{ color: '#ffd54f', fontWeight: 700, fontSize: 14 }}>
          {unlockedCount} / {titles.length}
        </span>
      </div>

      {/* Active title display */}
      {equippedId && (() => {
        const active = titles.find(t => t.id === equippedId)
        return active ? (
          <div style={{
            marginBottom: 16,
            padding: '8px 14px',
            background: 'rgba(255,213,79,0.06)',
            borderRadius: 6,
            border: '1px solid rgba(255,213,79,0.3)',
          }}>
            <div style={{ color: '#888', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
              ACTIVE TITLE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{active.icon}</span>
              <span style={{ color: RARITY_COLOR[active.rarity], fontWeight: 700, fontSize: 13 }}>
                {active.name}
              </span>
            </div>
          </div>
        ) : null
      })()}

      {/* Titles grouped by rarity */}
      {RARITY_ORDER.map(rarity => {
        const group = titles.filter(t => t.rarity === rarity)
        if (group.length === 0) return null
        const unlockedInGroup = group.filter(t => t.unlocked).length
        return (
          <div key={rarity} style={{ marginBottom: 20 }}>
            {/* Rarity header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              paddingBottom: 6,
              borderBottom: `1px solid ${RARITY_COLOR[rarity]}33`,
            }}>
              <span style={{
                color: RARITY_COLOR[rarity],
                fontWeight: 700,
                letterSpacing: 2,
                fontSize: 10,
              }}>
                {RARITY_LABEL[rarity]}
              </span>
              <span style={{ color: '#555', fontSize: 10 }}>
                {unlockedInGroup}/{group.length}
              </span>
            </div>

            {/* Title cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.map(title => {
                const isEquipped = title.id === equippedId
                const isUnlocked = title.unlocked
                return (
                  <div
                    key={title.id}
                    style={{
                      padding: '10px 12px',
                      background: isEquipped
                        ? `rgba(${rarityRgb(rarity)},0.08)`
                        : isUnlocked
                          ? 'rgba(255,255,255,0.03)'
                          : 'rgba(0,0,0,0.2)',
                      borderRadius: 6,
                      border: isEquipped
                        ? `1px solid ${RARITY_COLOR[rarity]}88`
                        : isUnlocked
                          ? '1px solid #2a2a2a'
                          : '1px solid #1a1a1a',
                      boxShadow: isEquipped ? RARITY_GLOW[rarity] : 'none',
                      opacity: isUnlocked ? 1 : 0.55,
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      {/* Icon */}
                      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, opacity: isUnlocked ? 1 : 0.4 }}>
                        {isUnlocked ? title.icon : '🔒'}
                      </span>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: isUnlocked ? RARITY_COLOR[rarity] : '#444',
                          fontWeight: 700,
                          fontSize: 12,
                          marginBottom: 3,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}>
                          {title.name}
                          {isEquipped && (
                            <span style={{
                              fontSize: 9,
                              color: RARITY_COLOR[rarity],
                              border: `1px solid ${RARITY_COLOR[rarity]}66`,
                              borderRadius: 3,
                              padding: '1px 5px',
                              letterSpacing: 1,
                            }}>
                              EQUIPPED
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#666', fontSize: 11, lineHeight: 1.4 }}>
                          {title.description}
                        </div>
                        {title.unlocked && title.unlockedAt !== undefined && (
                          <div style={{ color: '#444', fontSize: 10, marginTop: 4 }}>
                            Unlocked at {Math.floor(title.unlockedAt / 60)}m game time
                          </div>
                        )}
                      </div>

                      {/* Equip button */}
                      {isUnlocked && !isEquipped && (
                        <button
                          onClick={() => handleEquip(title.id)}
                          style={{
                            flexShrink: 0,
                            padding: '4px 10px',
                            background: 'transparent',
                            border: `1px solid ${RARITY_COLOR[rarity]}66`,
                            borderRadius: 4,
                            color: RARITY_COLOR[rarity],
                            fontSize: 10,
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            letterSpacing: 1,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = `rgba(${rarityRgb(rarity)},0.15)`
                            e.currentTarget.style.borderColor = RARITY_COLOR[rarity]
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.borderColor = `${RARITY_COLOR[rarity]}66`
                          }}
                        >
                          EQUIP
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Helper: rarity → RGB string for rgba() usage ──────────────────────────────

function rarityRgb(rarity: PlayerTitle['rarity']): string {
  switch (rarity) {
    case 'legendary': return '255,213,79'
    case 'epic':      return '206,147,216'
    case 'rare':      return '79,195,247'
    case 'common':    return '170,170,170'
  }
}
