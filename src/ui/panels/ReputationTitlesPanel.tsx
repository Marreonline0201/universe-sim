// ── ReputationTitlesPanel.tsx ─────────────────────────────────────────────────
// M50 Track A: Full panel showing earned titles, locked titles, faction rep.

import { useState } from 'react'
import {
  REPUTATION_TITLES,
  getActiveTitle,
  getEarnedTitles,
  setActiveTitle,
  type ReputationTitle,
} from '../../game/ReputationTitleSystem'
import { useReputationStore } from '../../store/reputationStore'
import { useFactionStore } from '../../store/factionStore'

// ── Rarity helpers ─────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<ReputationTitle['rarity'], string> = {
  common:    '#888888',
  uncommon:  '#44cc66',
  rare:      '#4488ff',
  legendary: '#ffcc00',
}

const RARITY_GLOW: Record<ReputationTitle['rarity'], string> = {
  common:    'none',
  uncommon:  '0 0 8px rgba(68,204,102,0.4)',
  rare:      '0 0 10px rgba(68,136,255,0.5)',
  legendary: '0 0 14px rgba(255,204,0,0.6)',
}

const RARITY_LABEL: Record<ReputationTitle['rarity'], string> = {
  common:    '● COMMON',
  uncommon:  '◇ UNCOMMON',
  rare:      '◆ RARE',
  legendary: '★ LEGENDARY',
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export function ReputationTitlesPanel() {
  const [activeId, setActiveId] = useState<string>(() => getActiveTitle()?.id ?? 'newcomer')
  const settlements = useReputationStore(s => s.settlements)
  const factionXp   = useFactionStore(s => s.factionXp)
  const playerFaction = useFactionStore(s => s.playerFaction)

  const earned = getEarnedTitles()
  const earnedSet = new Set(earned.map(t => t.id))

  const active = REPUTATION_TITLES.find(t => t.id === activeId) ?? earned[0]

  function handleEquip(titleId: string) {
    const ok = setActiveTitle(titleId)
    if (ok) {
      setActiveId(titleId)
      window.dispatchEvent(new Event('rep-title-changed'))
    }
  }

  // Build faction rep summary from settlement store
  // Group settlement points by faction (factionId = playerFaction or best guess)
  const factionReps: Record<string, number> = {}
  for (const s of Object.values(settlements)) {
    const fid = playerFaction ?? 'plains'   // fall back to avoid empty display
    factionReps[fid] = (factionReps[fid] ?? 0) + s.points
  }

  // Total rep = sum of all settlement points
  const totalRep = Object.values(settlements).reduce((acc, s) => acc + Math.max(0, s.points), 0)

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Active title display ── */}
      {active && (
        <div style={{
          border: `2px solid ${RARITY_COLORS[active.rarity]}`,
          borderRadius: 8,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.03)',
          boxShadow: RARITY_GLOW[active.rarity],
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <div style={{ fontSize: 9, color: '#666', letterSpacing: 1, textTransform: 'uppercase' }}>
            Active Title
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>{active.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: RARITY_COLORS[active.rarity] }}>
                {active.name}
              </div>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{active.description}</div>
            </div>
            <div style={{
              marginLeft: 'auto',
              fontSize: 9,
              color: RARITY_COLORS[active.rarity],
              background: `${RARITY_COLORS[active.rarity]}18`,
              border: `1px solid ${RARITY_COLORS[active.rarity]}44`,
              borderRadius: 3,
              padding: '2px 6px',
              letterSpacing: 0.5,
            }}>
              {RARITY_LABEL[active.rarity]}
            </div>
          </div>
          <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
            Overall rep: {totalRep} pts · Faction XP: {factionXp}
          </div>
        </div>
      )}

      {/* ── Title grid ── */}
      <div>
        <div style={{ fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          All Titles
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {REPUTATION_TITLES.map(title => {
            const isEarned = earnedSet.has(title.id)
            const isActive = title.id === activeId
            const color = isEarned ? RARITY_COLORS[title.rarity] : '#333'
            return (
              <div
                key={title.id}
                onClick={() => isEarned && handleEquip(title.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 5,
                  border: isActive
                    ? `2px solid ${RARITY_COLORS[title.rarity]}`
                    : `1px solid ${isEarned ? `${RARITY_COLORS[title.rarity]}33` : '#222'}`,
                  background: isActive
                    ? `${RARITY_COLORS[title.rarity]}12`
                    : isEarned ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.2)',
                  cursor: isEarned ? 'pointer' : 'default',
                  opacity: isEarned ? 1 : 0.45,
                  transition: 'opacity 0.12s, border-color 0.12s',
                  boxShadow: isActive ? RARITY_GLOW[title.rarity] : 'none',
                }}
              >
                <span style={{ fontSize: 16, filter: isEarned ? 'none' : 'grayscale(1)' }}>
                  {title.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color }}>
                    {title.name}
                    {isActive && (
                      <span style={{
                        marginLeft: 6,
                        fontSize: 8,
                        background: `${RARITY_COLORS[title.rarity]}22`,
                        border: `1px solid ${RARITY_COLORS[title.rarity]}55`,
                        borderRadius: 3,
                        padding: '1px 4px',
                        color: RARITY_COLORS[title.rarity],
                        letterSpacing: 0.5,
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: isEarned ? '#888' : '#444', marginTop: 1 }}>
                    {title.description}
                  </div>
                </div>
                <div style={{ fontSize: 9, color: isEarned ? color : '#444', flexShrink: 0, textAlign: 'right' }}>
                  {isEarned ? (
                    <span style={{ color: '#44aa44' }}>✓ Earned</span>
                  ) : (
                    <>
                      {title.factionId
                        ? `${title.factionId} rep: ${title.requiredRep}`
                        : `${title.requiredRep} total rep`
                      }
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Settlement reputation section ── */}
      <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 14 }}>
        <div style={{ fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          Settlement Reputation
        </div>
        {Object.keys(settlements).length === 0 ? (
          <div style={{ fontSize: 10, color: '#555' }}>
            No settlements discovered yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {Object.values(settlements).map(s => {
              const pct = Math.max(0, Math.min(100, (s.points + 1000) / 20))
              const tierColor =
                s.tier === 'revered'  ? '#ffcc00' :
                s.tier === 'honored'  ? '#44aaff' :
                s.tier === 'friendly' ? '#44cc66' :
                s.tier === 'hostile'  ? '#cc4444' : '#888'
              return (
                <div key={s.settlementId} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ color: '#bbb' }}>{s.settlementName}</span>
                    <span style={{ color: tierColor, fontWeight: 700, fontSize: 9, textTransform: 'uppercase' }}>
                      {s.tier} ({s.points > 0 ? '+' : ''}{s.points})
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: tierColor,
                      borderRadius: 2,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
