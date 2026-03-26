// ── FactionReputationPanel.tsx ────────────────────────────────────────────────
// M62 Track A: Reputation & Faction Standing System panel.
// Displays all 6 factions with standing bars, tier badges, and descriptions.

import React, { useEffect, useState } from 'react'
import {
  getFactionStandings,
  getFactionTierColor,
  type FactionStanding,
  type FactionTier,
} from '../../game/FactionReputationSystem'

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: FactionTier }) {
  const color = getFactionTierColor(tier)
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 3,
      background: color + '22',
      border: `1px solid ${color}55`,
      color,
      fontSize: 10,
      fontFamily: 'monospace',
      fontWeight: 700,
      letterSpacing: 1,
    }}>
      {tier.toUpperCase()}
    </span>
  )
}

// ── Standing bar ──────────────────────────────────────────────────────────────
// Zero-centered: negative fills left, positive fills right.

function StandingBar({ standing, color }: { standing: number; color: string }) {
  // Map -1000..1000 to 0..100% for the filled half
  const pct = Math.abs(standing) / 1000 * 50  // max 50% width from center
  const isNeg = standing < 0

  return (
    <div style={{
      width: '100%',
      height: 6,
      background: '#1a1a1a',
      borderRadius: 3,
      overflow: 'hidden',
      position: 'relative',
      marginTop: 6,
    }}>
      {/* Center tick */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: 1,
        background: '#333',
        transform: 'translateX(-50%)',
      }} />
      {/* Fill */}
      <div style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: `${pct}%`,
        background: color,
        borderRadius: 3,
        transition: 'width 0.3s ease',
        ...(isNeg
          ? { right: '50%' }
          : { left: '50%' }
        ),
      }} />
    </div>
  )
}

// ── Faction card ──────────────────────────────────────────────────────────────

function FactionCard({ faction }: { faction: FactionStanding }) {
  const color = getFactionTierColor(faction.tier)
  const sign = faction.standing >= 0 ? '+' : ''

  return (
    <div style={{
      background: '#111',
      border: '1px solid #222',
      borderLeft: `3px solid ${color}44`,
      borderRadius: 6,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>{faction.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{
              color: '#ddd',
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}>
              {faction.name}
            </div>
            <div style={{
              color: '#555',
              fontFamily: 'monospace',
              fontSize: 10,
              marginTop: 2,
              lineHeight: 1.4,
            }}>
              {faction.description}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <TierBadge tier={faction.tier} />
          <div style={{
            color: color,
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 700,
            marginTop: 4,
          }}>
            {sign}{faction.standing}
          </div>
        </div>
      </div>

      {/* Standing bar */}
      <StandingBar standing={faction.standing} color={color} />

      {/* Standing label */}
      <div style={{
        color: '#444',
        fontFamily: 'monospace',
        fontSize: 9,
        marginTop: 3,
        textAlign: 'center',
      }}>
        {sign}{faction.standing} / {faction.tier}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function FactionReputationPanel() {
  const [factions, setFactions] = useState<FactionStanding[]>(() => getFactionStandings())

  useEffect(() => {
    function onChanged() {
      setFactions(getFactionStandings())
    }
    window.addEventListener('faction-standing-changed', onChanged)
    return () => window.removeEventListener('faction-standing-changed', onChanged)
  }, [])

  const friendly = factions.filter(f => f.standing >= 100).length
  const hostile  = factions.filter(f => f.standing < -99).length
  const total    = factions.reduce((s, f) => s + f.standing, 0)
  const totalSign = total >= 0 ? '+' : ''

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>
      {/* Subtitle */}
      <div style={{ color: '#555', fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>
        Your standing with the world's major factions
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 16,
        padding: '8px 12px',
        background: '#0d0d0d',
        borderRadius: 4,
        border: '1px solid #1e1e1e',
      }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#888', fontSize: 9, letterSpacing: 1 }}>FACTIONS</div>
          <div style={{ color: '#ddd', fontSize: 16, fontWeight: 700 }}>{factions.length}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#888', fontSize: 9, letterSpacing: 1 }}>ALLIED</div>
          <div style={{ color: '#4ade80', fontSize: 16, fontWeight: 700 }}>{friendly}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#888', fontSize: 9, letterSpacing: 1 }}>HOSTILE</div>
          <div style={{ color: '#f97316', fontSize: 16, fontWeight: 700 }}>{hostile}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#888', fontSize: 9, letterSpacing: 1 }}>NET REP</div>
          <div style={{ color: total >= 0 ? '#38bdf8' : '#ef4444', fontSize: 14, fontWeight: 700 }}>
            {totalSign}{total}
          </div>
        </div>
      </div>

      {/* Faction cards */}
      {factions.map(f => (
        <FactionCard key={f.id} faction={f} />
      ))}

      {/* Tier legend */}
      <div style={{
        marginTop: 4,
        padding: '10px 12px',
        background: '#0d0d0d',
        borderRadius: 4,
        border: '1px solid #1a1a1a',
      }}>
        <div style={{ color: '#444', fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>
          TIER THRESHOLDS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(
            [
              { tier: 'hated',    label: 'Hated',    threshold: '< −400' },
              { tier: 'hostile',  label: 'Hostile',  threshold: '≥ −399' },
              { tier: 'neutral',  label: 'Neutral',  threshold: '≥ −99' },
              { tier: 'friendly', label: 'Friendly', threshold: '≥ +100' },
              { tier: 'honored',  label: 'Honored',  threshold: '≥ +400' },
              { tier: 'exalted',  label: 'Exalted',  threshold: '≥ +750' },
            ] as const
          ).map(({ tier, label, threshold }) => {
            const color = getFactionTierColor(tier)
            return (
              <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ color: '#555', fontSize: 9 }}>
                  {label} ({threshold})
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
