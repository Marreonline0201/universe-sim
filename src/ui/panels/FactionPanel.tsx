// ── FactionPanel.tsx ───────────────────────────────────────────────────────────
// M35 Track C: Faction allegiance panel — opened with G hotkey.
// Shows 4 faction cards, lets player join a faction (60s cooldown to switch),
// and displays faction relationship diagram.

import { useState, useEffect } from 'react'
import { useFactionStore } from '../../store/factionStore'
import {
  FACTIONS,
  FACTION_IDS,
  getFactionRelationship,
  getRelationshipColor,
  type FactionId,
} from '../../game/FactionSystem'

// ── Bonus description helpers ─────────────────────────────────────────────────

function formatBonuses(bonuses: Record<string, number | undefined>): string[] {
  const lines: string[] = []
  if (bonuses.combatXpMult) lines.push(`+${Math.round((bonuses.combatXpMult - 1) * 100)}% Combat XP`)
  if (bonuses.tradeDiscount) lines.push(`${Math.round(bonuses.tradeDiscount * 100)}% Trade Discount`)
  if (bonuses.craftXpMult) lines.push(`+${Math.round((bonuses.craftXpMult - 1) * 100)}% Craft XP`)
  if (bonuses.movespeedBonus) lines.push(`+${Math.round(bonuses.movespeedBonus * 100)}% Move Speed`)
  return lines
}

// ── Cooldown timer hook ───────────────────────────────────────────────────────

function useCooldownSeconds(): number {
  const joinedAt = useFactionStore(s => s.joinedAt)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (joinedAt === null) { setSeconds(0); return }

    function update() {
      const elapsed = Date.now() - joinedAt!
      const remaining = Math.max(0, 60 - Math.floor(elapsed / 1000))
      setSeconds(remaining)
    }
    update()
    const id = setInterval(update, 500)
    return () => clearInterval(id)
  }, [joinedAt])

  return seconds
}

// ── FactionPanel ──────────────────────────────────────────────────────────────

export function FactionPanel() {
  const playerFaction = useFactionStore(s => s.playerFaction)
  const joinFaction   = useFactionStore(s => s.joinFaction)
  const canSwitch     = useFactionStore(s => s.canSwitchFaction)
  const factionXp     = useFactionStore(s => s.factionXp)
  const cooldown      = useCooldownSeconds()

  const [confirmJoin, setConfirmJoin] = useState<FactionId | null>(null)

  function handleJoin(id: FactionId) {
    if (playerFaction === id) return
    if (!canSwitch()) return
    if (confirmJoin === id) {
      joinFaction(id)
      setConfirmJoin(null)
    } else {
      setConfirmJoin(id)
    }
  }

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #2a2a2a', paddingBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#888', letterSpacing: 1, textTransform: 'uppercase' }}>
          Faction Allegiance
        </div>
        {playerFaction ? (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{FACTIONS[playerFaction].icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: FACTIONS[playerFaction].color }}>
                {FACTIONS[playerFaction].name}
              </div>
              <div style={{ fontSize: 10, color: '#888' }}>
                Faction XP: {factionXp}
                {cooldown > 0 && (
                  <span style={{ color: '#cc8800', marginLeft: 8 }}>
                    Can switch in {cooldown}s
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
            You have not pledged allegiance to any faction.
          </div>
        )}
      </div>

      {/* Faction cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FACTION_IDS.map(id => {
          const f = FACTIONS[id]
          const isMember = playerFaction === id
          const isConfirming = confirmJoin === id
          const cantSwitch = playerFaction !== null && !canSwitch() && !isMember
          const bonuses = formatBonuses(f.bonuses)

          return (
            <div
              key={id}
              style={{
                border: isMember
                  ? `2px solid #ffd700`
                  : `1px solid rgba(255,255,255,0.1)`,
                borderLeft: `3px solid ${f.color}`,
                borderRadius: 6,
                padding: '10px 12px',
                background: isMember
                  ? 'rgba(255,215,0,0.06)'
                  : 'rgba(255,255,255,0.03)',
                position: 'relative',
              }}
            >
              {/* Member badge */}
              {isMember && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 10,
                  fontSize: 9,
                  color: '#ffd700',
                  fontWeight: 700,
                  letterSpacing: 1,
                  background: 'rgba(255,215,0,0.1)',
                  border: '1px solid rgba(255,215,0,0.3)',
                  borderRadius: 3,
                  padding: '1px 5px',
                }}>
                  MEMBER
                </div>
              )}

              {/* Faction info */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{f.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: f.color }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>
                    {f.description}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {bonuses.map(b => (
                      <span key={b} style={{
                        fontSize: 9,
                        color: '#88dd88',
                        background: 'rgba(68,170,68,0.12)',
                        border: '1px solid rgba(68,170,68,0.25)',
                        borderRadius: 3,
                        padding: '1px 5px',
                      }}>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Join button */}
              {!isMember && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => handleJoin(id)}
                    disabled={cantSwitch}
                    style={{
                      padding: '4px 12px',
                      fontSize: 10,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      background: isConfirming
                        ? 'rgba(205,68,32,0.3)'
                        : cantSwitch
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(255,255,255,0.08)',
                      border: isConfirming
                        ? '1px solid rgba(205,68,32,0.6)'
                        : '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4,
                      color: cantSwitch ? '#555' : isConfirming ? '#cd4420' : '#ccc',
                      cursor: cantSwitch ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isConfirming ? 'Confirm Join?' : 'Join'}
                  </button>
                  {isConfirming && (
                    <button
                      onClick={() => setConfirmJoin(null)}
                      style={{
                        padding: '4px 8px',
                        fontSize: 10,
                        fontFamily: 'monospace',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 4,
                        color: '#666',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {cantSwitch && (
                    <span style={{ fontSize: 9, color: '#666' }}>
                      Switch in {cooldown}s
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Faction relations diagram */}
      <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 14 }}>
        <div style={{ fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          Faction Relations
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
          {FACTION_IDS.map(a => (
            FACTION_IDS.filter(b => b !== a).map(b => {
              const rel = getFactionRelationship(a, b)
              // Only show each pair once
              if (FACTION_IDS.indexOf(a) >= FACTION_IDS.indexOf(b)) return null
              const colorA = FACTIONS[a].color
              const colorB = FACTIONS[b].color
              const relColor = getRelationshipColor(rel)
              return (
                <div key={`${a}-${b}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  padding: '3px 0',
                }}>
                  <span style={{ color: colorA }}>{FACTIONS[a].icon} {FACTIONS[a].name}</span>
                  <span style={{
                    color: relColor,
                    fontWeight: 700,
                    fontSize: 9,
                    background: `${relColor}22`,
                    border: `1px solid ${relColor}44`,
                    borderRadius: 3,
                    padding: '1px 5px',
                    flexShrink: 0,
                  }}>
                    {rel === 'war' ? '⚔ WAR' : rel === 'ally' ? '🤝 ALLY' : '— NEUTRAL'}
                  </span>
                  <span style={{ color: colorB }}>{FACTIONS[b].icon} {FACTIONS[b].name}</span>
                </div>
              )
            })
          ))}
        </div>
      </div>
    </div>
  )
}
