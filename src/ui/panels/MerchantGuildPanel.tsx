// ── MerchantGuildPanel.tsx ────────────────────────────────────────────────────
// M54 Track A: Merchant Guild UI — join, track rank, complete trade contracts.

import React, { useState, useEffect } from 'react'
import {
  getGuildState,
  joinGuild,
  completeContract,
  getCurrentRankBonuses,
  getNextRank,
  getXpToNextRank,
  RANK_THRESHOLDS,
  RANK_BONUSES,
  type GuildContract,
  type GuildRank,
} from '../../game/MerchantGuildSystem'
import { useGameStore } from '../../store/gameStore'

// ── Style constants ────────────────────────────────────────────────────────────

const FONT  = 'monospace'
const DIM   = '#555'
const BG    = 'rgba(255,255,255,0.03)'
const BORDER = '1px solid #2a2a2a'

export const RANK_COLOR: Record<GuildRank, string> = {
  initiate:    '#6b7280',
  journeyman:  '#4ade80',
  trader:      '#60a5fa',
  merchant:    '#a78bfa',
  guildmaster: '#fbbf24',
}

const RANK_ORDER: GuildRank[] = ['initiate', 'journeyman', 'trader', 'merchant', 'guildmaster']

// ── Helpers ───────────────────────────────────────────────────────────────────

function rankLabel(rank: GuildRank): string {
  return rank.charAt(0).toUpperCase() + rank.slice(1)
}

function formatExpiry(contract: GuildContract, simSeconds: number): string {
  const remaining = Math.max(0, contract.expiresAt - simSeconds)
  if (remaining <= 0) return 'Expired'
  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: GuildRank }) {
  const color = RANK_COLOR[rank]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      background: `${color}22`,
      border: `1px solid ${color}55`,
      borderRadius: 4,
      color,
      fontFamily: FONT,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: 'uppercase',
    }}>
      {rankLabel(rank)}
    </span>
  )
}

function RankProgressBar({ rank, xp }: { rank: GuildRank; xp: number }) {
  const next = getNextRank()
  const prevThreshold = RANK_THRESHOLDS[rank]
  const nextThreshold = next ? RANK_THRESHOLDS[next] : prevThreshold
  const range    = nextThreshold - prevThreshold
  const progress = range > 0 ? Math.min(1, (xp - prevThreshold) / range) : 1
  const color    = RANK_COLOR[rank]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color, fontFamily: FONT, fontSize: 11, fontWeight: 700 }}>
          {rankLabel(rank)}
        </span>
        <span style={{ color: DIM, fontFamily: FONT, fontSize: 10 }}>
          {next ? `${xp} / ${nextThreshold} XP` : `${xp} XP — MAX RANK`}
        </span>
      </div>
      <div style={{
        height: 6, borderRadius: 3,
        background: '#1a1a1a', border: BORDER, overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress * 100}%`, height: '100%',
          background: color, borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
      {next && (
        <span style={{ color: DIM, fontFamily: FONT, fontSize: 9, textAlign: 'right' }}>
          {getXpToNextRank()} XP to {rankLabel(next)}
        </span>
      )}
    </div>
  )
}

function ContractCard({ contract, simSeconds, onComplete }: {
  contract: GuildContract
  simSeconds: number
  onComplete: (id: string) => void
}) {
  const expired = contract.expiresAt <= simSeconds
  const timeLeft = formatExpiry(contract, simSeconds)

  return (
    <div style={{
      background: BG,
      border: expired ? '1px solid #3a1a1a' : BORDER,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>{contract.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#ddd', fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
            {contract.name}
          </div>
          <div style={{ color: DIM, fontFamily: FONT, fontSize: 10, marginTop: 2 }}>
            {contract.description}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#f1c40f', fontFamily: FONT, fontSize: 10 }}>
          +{contract.reward.gold}g
        </span>
        <span style={{ color: '#4ade80', fontFamily: FONT, fontSize: 10 }}>
          +{contract.reward.guildXp} guild XP
        </span>
        <span style={{ color: expired ? '#ef4444' : '#888', fontFamily: FONT, fontSize: 10, marginLeft: 'auto' }}>
          ⏱ {timeLeft}
        </span>
      </div>

      <button
        disabled={expired}
        onClick={() => onComplete(contract.id)}
        style={{
          padding: '6px 12px',
          background: expired ? '#1a1a1a' : 'rgba(205,68,32,0.18)',
          border: expired ? '1px solid #2a2a2a' : '1px solid #cd4420',
          borderRadius: 4,
          color: expired ? DIM : '#cd4420',
          fontFamily: FONT,
          fontSize: 10,
          fontWeight: 700,
          cursor: expired ? 'not-allowed' : 'pointer',
          letterSpacing: 1,
          transition: 'all 0.12s',
          alignSelf: 'flex-start',
        }}
        onMouseEnter={e => { if (!expired) e.currentTarget.style.background = 'rgba(205,68,32,0.3)' }}
        onMouseLeave={e => { if (!expired) e.currentTarget.style.background = 'rgba(205,68,32,0.18)' }}
      >
        COMPLETE
      </button>
    </div>
  )
}

// ── Not-joined view ────────────────────────────────────────────────────────────

function GuildJoinView({ onJoin }: { onJoin: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        textAlign: 'center', padding: '24px 16px',
        background: BG, borderRadius: 10, border: BORDER,
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🏪</div>
        <div style={{ color: '#fff', fontFamily: FONT, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
          MERCHANT GUILD
        </div>
        <div style={{ color: DIM, fontFamily: FONT, fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
          Join the most powerful trading organisation in the realm.
          Complete contracts, rise in rank, and unlock exclusive bonuses.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: '#888', fontFamily: FONT, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Member Benefits
        </div>
        {RANK_ORDER.map(rank => (
          <div key={rank} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '8px 10px', background: BG, borderRadius: 6, border: BORDER,
          }}>
            <RankBadge rank={rank} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {RANK_BONUSES[rank].map((bonus, i) => (
                <span key={i} style={{ color: '#aaa', fontFamily: FONT, fontSize: 10 }}>
                  • {bonus}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onJoin}
        style={{
          padding: '14px 0',
          background: 'rgba(205,68,32,0.18)',
          border: '1px solid #cd4420',
          borderRadius: 6,
          color: '#cd4420',
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 2,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(205,68,32,0.32)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(205,68,32,0.18)'}
      >
        JOIN GUILD
      </button>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export function MerchantGuildPanel() {
  const simSeconds = useGameStore(s => s.simSeconds)
  const [, refresh] = useState(0)

  // Re-render every second for countdown timers
  useEffect(() => {
    const id = setInterval(() => refresh(n => n + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // Re-render on guild events
  useEffect(() => {
    const handler = () => refresh(n => n + 1)
    window.addEventListener('guild-joined',       handler)
    window.addEventListener('guild-rank-up',      handler)
    window.addEventListener('contract-completed', handler)
    return () => {
      window.removeEventListener('guild-joined',       handler)
      window.removeEventListener('guild-rank-up',      handler)
      window.removeEventListener('contract-completed', handler)
    }
  }, [])

  const state     = getGuildState()
  const bonuses   = getCurrentRankBonuses()
  const rankColor = RANK_COLOR[state.rank]

  function handleJoin() {
    joinGuild()
    refresh(n => n + 1)
  }

  function handleComplete(id: string) {
    completeContract(id)
    refresh(n => n + 1)
  }

  if (!state.joined) {
    return <GuildJoinView onJoin={handleJoin} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', background: BG,
        borderRadius: 8, border: `1px solid ${rankColor}33`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏪</span>
          <div>
            <div style={{ color: '#fff', fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
              MERCHANT GUILD
            </div>
            <div style={{ color: DIM, fontFamily: FONT, fontSize: 9, marginTop: 2 }}>
              Member in good standing
            </div>
          </div>
        </div>
        <RankBadge rank={state.rank} />
      </div>

      {/* Rank progress */}
      <div style={{ padding: '12px 14px', background: BG, borderRadius: 8, border: BORDER }}>
        <RankProgressBar rank={state.rank} xp={state.guildXp} />
      </div>

      {/* Active bonuses */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: '#888', fontFamily: FONT, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Active Bonuses
        </div>
        <div style={{ padding: '10px 14px', background: BG, borderRadius: 8, border: BORDER, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bonuses.map((bonus, i) => (
            <span key={i} style={{ color: '#4ade80', fontFamily: FONT, fontSize: 11 }}>
              ✓ {bonus}
            </span>
          ))}
        </div>
      </div>

      {/* Active contracts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ color: '#888', fontFamily: FONT, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Active Contracts
        </div>
        {state.activeContracts.length === 0 ? (
          <div style={{ color: DIM, fontFamily: FONT, fontSize: 11, padding: 12, textAlign: 'center' }}>
            No active contracts. Check back soon.
          </div>
        ) : (
          state.activeContracts.map(contract => (
            <ContractCard
              key={contract.id}
              contract={contract}
              simSeconds={simSeconds}
              onComplete={handleComplete}
            />
          ))
        )}
      </div>

      {/* Stats */}
      <div style={{ padding: '12px 14px', background: BG, borderRadius: 8, border: BORDER }}>
        <div style={{ color: '#888', fontFamily: FONT, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Statistics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {([
            ['Total Trades',    String(state.totalTrades)],
            ['Contracts Done',  String(state.completedContracts.length)],
            ['Guild XP',        String(state.guildXp)],
            ['Rank',            rankLabel(state.rank)],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: DIM, fontFamily: FONT, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {label}
              </span>
              <span style={{ color: '#ddd', fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
