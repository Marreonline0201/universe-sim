// ── FactionStandingPanel.tsx ───────────────────────────────────────────────────
// M56 Track B: Aggregated faction reputation panel.
// Shows per-faction rep totals, standing tier badges, and top settlements.

import React, { useEffect, useState } from 'react'
import { useReputationStore } from '../../store/reputationStore'
import { useFactionStore } from '../../store/factionStore'
import { FACTIONS, FACTION_IDS, type FactionId } from '../../game/FactionSystem'

// ── Standing tier definitions ─────────────────────────────────────────────────

interface StandingTier {
  label: string
  color: string
  min: number
  max: number
}

const STANDING_TIERS: StandingTier[] = [
  { label: 'HOSTILE',  color: '#cc3333', min: -Infinity, max: -1 },
  { label: 'NEUTRAL',  color: '#888888', min: 0,         max: 99 },
  { label: 'FRIENDLY', color: '#44aa44', min: 100,       max: 299 },
  { label: 'HONORED',  color: '#4488cc', min: 300,       max: 599 },
  { label: 'REVERED',  color: '#9944dd', min: 600,       max: 999 },
  { label: 'EXALTED',  color: '#ddaa00', min: 1000,      max: Infinity },
]

function getStandingTier(rep: number): StandingTier {
  for (let i = STANDING_TIERS.length - 1; i >= 0; i--) {
    if (rep >= STANDING_TIERS[i].min) return STANDING_TIERS[i]
  }
  return STANDING_TIERS[0]
}

/** Returns 0–1 progress within the current tier toward the next. */
function tierProgress(rep: number): { pct: number; next: StandingTier | null; needed: number } {
  const tier = getStandingTier(rep)
  const idx = STANDING_TIERS.indexOf(tier)
  if (idx === STANDING_TIERS.length - 1) return { pct: 1, next: null, needed: 0 }
  const next = STANDING_TIERS[idx + 1]
  // Guard: HOSTILE tier has min: -Infinity — use 0 progress to avoid NaN
  if (!isFinite(tier.min)) return { pct: 0, next, needed: next.min - rep }
  const rangeEnd = next.min
  const pct = Math.min(1, Math.max(0, (rep - tier.min) / (rangeEnd - tier.min)))
  return { pct, next, needed: rangeEnd - rep }
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

interface SettlementEntry {
  id: number
  name: string
  rep: number
}

interface FactionData {
  factionId: FactionId
  totalRep: number
  settlements: SettlementEntry[]
}

function buildFactionData(): FactionData[] {
  const repState = useReputationStore.getState()
  const factionState = useFactionStore.getState()

  const buckets: Record<FactionId, SettlementEntry[]> = {
    rangers: [], merchants: [], scholars: [], outlaws: [],
  }

  for (const settlement of Object.values(repState.settlements)) {
    const fid = factionState.getSettlementFaction(settlement.settlementId)
    if (fid && buckets[fid]) {
      buckets[fid].push({
        id: settlement.settlementId,
        name: settlement.settlementName,
        rep: settlement.points,
      })
    }
  }

  return FACTION_IDS.map(fid => {
    const settlements = buckets[fid].sort((a, b) => b.rep - a.rep)
    const totalRep = settlements.reduce((sum, s) => sum + s.rep, 0)
    return { factionId: fid, totalRep, settlements }
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: StandingTier }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 3,
      background: tier.color + '22',
      border: `1px solid ${tier.color}55`,
      color: tier.color,
      fontSize: 10,
      fontFamily: 'monospace',
      fontWeight: 700,
      letterSpacing: 1,
    }}>
      {tier.label}
    </span>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{
      width: '100%',
      height: 4,
      background: '#1e1e1e',
      borderRadius: 2,
      overflow: 'hidden',
      marginTop: 4,
    }}>
      <div style={{
        width: `${Math.round(pct * 100)}%`,
        height: '100%',
        background: color,
        borderRadius: 2,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function FactionCard({ data }: { data: FactionData }) {
  const faction = FACTIONS[data.factionId]
  const tier = getStandingTier(data.totalRep)
  const { pct, next, needed } = tierProgress(data.totalRep)
  const topSettlements = data.settlements.slice(0, 3)

  return (
    <div style={{
      background: '#111',
      border: '1px solid #222',
      borderRadius: 6,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{faction.icon}</span>
          <div>
            <div style={{ color: '#ddd', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
              {faction.name}
            </div>
            <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 10, marginTop: 1 }}>
              {faction.description}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <TierBadge tier={tier} />
          <div style={{ color: '#666', fontFamily: 'monospace', fontSize: 10, marginTop: 4 }}>
            {data.totalRep >= 0 ? '+' : ''}{data.totalRep} REP
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar pct={pct} color={tier.color} />
      {next && (
        <div style={{ color: '#444', fontFamily: 'monospace', fontSize: 9, marginTop: 3 }}>
          {needed} rep to <span style={{ color: next.color }}>{next.label}</span>
        </div>
      )}
      {!next && (
        <div style={{ color: tier.color, fontFamily: 'monospace', fontSize: 9, marginTop: 3 }}>
          Maximum standing achieved
        </div>
      )}

      {/* Settlement list */}
      {topSettlements.length > 0 ? (
        <div style={{ marginTop: 10, borderTop: '1px solid #1a1a1a', paddingTop: 8 }}>
          <div style={{ color: '#444', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>
            TOP SETTLEMENTS
          </div>
          {topSettlements.map(s => {
            const sTier = getStandingTier(s.rep)
            return (
              <div key={s.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 3,
              }}>
                <span style={{ color: '#777', fontFamily: 'monospace', fontSize: 10 }}>
                  {s.name}
                </span>
                <span style={{ color: sTier.color, fontFamily: 'monospace', fontSize: 10 }}>
                  {s.rep >= 0 ? '+' : ''}{s.rep}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ color: '#333', fontFamily: 'monospace', fontSize: 10, marginTop: 8 }}>
          No reputation recorded with this faction.
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function FactionStandingPanel() {
  const [, forceUpdate] = useState(0)

  // Subscribe to reputation store so changes re-render the panel
  useReputationStore(s => s.settlements)
  useFactionStore(s => s.settlementFactions)

  // Also listen to rep-change events + 3s interval fallback
  useEffect(() => {
    const tick = () => forceUpdate(n => n + 1)
    const onRepChange = () => forceUpdate(n => n + 1)

    window.addEventListener('reputation-changed', onRepChange)
    window.addEventListener('reputation-tier-up', onRepChange)
    window.addEventListener('reputation-tier-down', onRepChange)

    const interval = setInterval(tick, 3000)
    return () => {
      window.removeEventListener('reputation-changed', onRepChange)
      window.removeEventListener('reputation-tier-up', onRepChange)
      window.removeEventListener('reputation-tier-down', onRepChange)
      clearInterval(interval)
    }
  }, [])

  const factionData = buildFactionData()

  const totalFactions = factionData.length
  const friendlyOrBetter = factionData.filter(f => f.totalRep >= 100).length

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>
      {/* Subtitle */}
      <div style={{ color: '#555', fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>
        Your reputation across the world's factions
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
          <div style={{ color: '#ddd', fontSize: 16, fontWeight: 700 }}>{totalFactions}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#888', fontSize: 9, letterSpacing: 1 }}>FRIENDLY+</div>
          <div style={{ color: '#44aa44', fontSize: 16, fontWeight: 700 }}>{friendlyOrBetter}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#888', fontSize: 9, letterSpacing: 1 }}>TOTAL REP</div>
          <div style={{ color: '#ddaa00', fontSize: 16, fontWeight: 700 }}>
            {factionData.reduce((s, f) => s + f.totalRep, 0)}
          </div>
        </div>
      </div>

      {/* Faction cards */}
      {factionData.map(fd => (
        <FactionCard key={fd.factionId} data={fd} />
      ))}

      {/* Tier legend */}
      <div style={{
        marginTop: 4,
        padding: '10px 12px',
        background: '#0d0d0d',
        borderRadius: 4,
        border: '1px solid #1a1a1a',
      }}>
        <div style={{ color: '#444', fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>TIER THRESHOLDS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STANDING_TIERS.map(t => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
              <span style={{ color: '#555', fontSize: 9 }}>
                {t.label}
                {isFinite(t.min) ? ` (${t.min >= 0 ? '+' : ''}${t.min})` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
