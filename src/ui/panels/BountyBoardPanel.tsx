// ── BountyBoardPanel.tsx ──────────────────────────────────────────────────────
// M54 Track B: Enemy Bounty Board panel.
// Hotkey: none assigned (sidebar only). Registered in SidebarShell.

import { useState, useCallback } from 'react'
import {
  getActiveBounties,
  getCompletedBounties,
  claimBounty,
  type Bounty,
  type BountyDifficulty,
} from '../../game/BountyBoardSystem'
import { useGameStore } from '../../store/gameStore'

// ── Difficulty colours ────────────────────────────────────────────────────────

const DIFF_COLOR: Record<BountyDifficulty, string> = {
  easy:      '#4ade80',
  medium:    '#f97316',
  hard:      '#ef4444',
  legendary: '#fbbf24',
}

const DIFF_LABEL: Record<BountyDifficulty, string> = {
  easy:      'EASY',
  medium:    'MEDIUM',
  hard:      'HARD',
  legendary: 'LEGENDARY',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(expiresAt: number, simSeconds: number): string {
  const remaining = Math.max(0, expiresAt - simSeconds)
  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)
  if (remaining <= 0) return 'EXPIRED'
  return `${mins}m ${secs}s`
}

// ── BountyCard ────────────────────────────────────────────────────────────────

interface BountyCardProps {
  bounty: Bounty
  simSeconds: number
  onClaim: (id: string) => void
}

function BountyCard({ bounty, simSeconds, onClaim }: BountyCardProps) {
  const isComplete  = bounty.currentKills >= bounty.targetCount
  const isExpired   = simSeconds > bounty.expiresAt
  const canClaim    = isComplete && !bounty.claimed && !isExpired
  const diffColor   = DIFF_COLOR[bounty.difficulty]
  const pct         = Math.min(1, bounty.currentKills / bounty.targetCount)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${isComplete && !bounty.claimed ? diffColor + '55' : '#2a2a2a'}`,
      borderLeft: `3px solid ${diffColor}`,
      borderRadius: 6,
      padding: '12px 14px',
      marginBottom: 10,
      opacity: isExpired ? 0.5 : 1,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{bounty.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2,
            color: diffColor,
          }}>
            WANTED — {bounty.targetSpecies.toUpperCase()}
          </div>
          <div style={{ color: '#666', fontFamily: 'monospace', fontSize: 10, marginTop: 2 }}>
            Posted by: {bounty.poster}
          </div>
        </div>
        {/* Difficulty badge */}
        <span style={{
          background: diffColor + '22',
          color: diffColor,
          border: `1px solid ${diffColor}55`,
          borderRadius: 3,
          padding: '2px 6px',
          fontFamily: 'monospace',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          {DIFF_LABEL[bounty.difficulty]}
        </span>
      </div>

      {/* Description */}
      <div style={{
        color: '#999',
        fontFamily: 'monospace',
        fontSize: 10,
        marginBottom: 8,
        fontStyle: 'italic',
      }}>
        "{bounty.description}"
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: '#888',
          fontFamily: 'monospace',
          fontSize: 10,
          marginBottom: 4,
        }}>
          <span>Kills: {bounty.currentKills} / {bounty.targetCount}</span>
          {isComplete && <span style={{ color: diffColor, fontWeight: 700 }}>COMPLETE</span>}
        </div>
        <div style={{
          height: 4,
          background: '#1a1a1a',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: diffColor,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Reward row + claim button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 10 }}>
          <span style={{ color: '#f59e0b' }}>⚜ {bounty.reward.gold} gold</span>
          <span style={{ color: '#555', margin: '0 6px' }}>·</span>
          <span style={{ color: '#60a5fa' }}>+{bounty.reward.reputationBonus} rep</span>
          <span style={{ color: '#555', margin: '0 6px' }}>·</span>
          <span style={{ color: isExpired ? '#ef4444' : '#555' }}>
            {formatCountdown(bounty.expiresAt, simSeconds)}
          </span>
        </div>
        <button
          disabled={!canClaim}
          onClick={() => canClaim && onClaim(bounty.id)}
          style={{
            padding: '4px 12px',
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            borderRadius: 3,
            border: canClaim ? `1px solid ${diffColor}` : '1px solid #333',
            background: canClaim ? diffColor + '22' : 'transparent',
            color: canClaim ? diffColor : '#444',
            cursor: canClaim ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            if (canClaim) e.currentTarget.style.background = diffColor + '44'
          }}
          onMouseLeave={e => {
            if (canClaim) e.currentTarget.style.background = diffColor + '22'
          }}
        >
          CLAIM
        </button>
      </div>
    </div>
  )
}

// ── CompletedBountyRow ────────────────────────────────────────────────────────

function CompletedBountyRow({ bounty }: { bounty: Bounty }) {
  const diffColor = DIFF_COLOR[bounty.difficulty]
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 10px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 4,
      marginBottom: 6,
      opacity: 0.55,
    }}>
      <span style={{ fontSize: 16 }}>{bounty.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 10, fontWeight: 700 }}>
          {bounty.targetSpecies}
          <span style={{ color: '#555', marginLeft: 6, fontWeight: 400 }}>by {bounty.poster}</span>
        </div>
        <div style={{ color: '#f59e0b', fontFamily: 'monospace', fontSize: 10 }}>
          +{bounty.reward.gold} gold · +{bounty.reward.reputationBonus} rep
        </div>
      </div>
      <span style={{
        background: diffColor + '22',
        color: diffColor,
        border: `1px solid ${diffColor}44`,
        borderRadius: 3,
        padding: '2px 6px',
        fontFamily: 'monospace',
        fontSize: 9,
        fontWeight: 700,
      }}>
        CLAIMED ✓
      </span>
    </div>
  )
}

// ── BountyBoardPanel ──────────────────────────────────────────────────────────

export function BountyBoardPanel() {
  const [, forceRefresh] = useState(0)
  const simSeconds = useGameStore(s => s.simSeconds)

  const active    = getActiveBounties()
  const completed = getCompletedBounties().slice(0, 3)

  const handleClaim = useCallback((id: string) => {
    const success = claimBounty(id)
    if (success) forceRefresh(n => n + 1)
  }, [])

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Board header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 18,
        paddingBottom: 12,
        borderBottom: '1px solid #2a2a2a',
      }}>
        <span style={{ fontSize: 24 }}>⭐</span>
        <div>
          <div style={{
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 3,
          }}>
            BOUNTY BOARD
          </div>
          <div style={{ color: '#555', fontSize: 10, marginTop: 2 }}>
            {active.length} active · {completed.length} recently claimed
          </div>
        </div>
      </div>

      {/* Active bounties */}
      <div style={{ marginBottom: 4 }}>
        <div style={{
          color: '#666',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 2,
          marginBottom: 10,
          textTransform: 'uppercase',
        }}>
          Active Bounties ({active.length})
        </div>

        {active.length === 0 ? (
          <div style={{
            color: '#444',
            fontSize: 11,
            textAlign: 'center',
            padding: '24px 0',
            border: '1px dashed #2a2a2a',
            borderRadius: 6,
          }}>
            No active bounties posted.
            <br />
            <span style={{ fontSize: 9, color: '#333', marginTop: 4, display: 'block' }}>
              Check back after bounties refresh.
            </span>
          </div>
        ) : (
          active.map(b => (
            <BountyCard
              key={b.id}
              bounty={b}
              simSeconds={simSeconds}
              onClaim={handleClaim}
            />
          ))
        )}
      </div>

      {/* Completed bounties */}
      {completed.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{
            color: '#666',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 2,
            marginBottom: 10,
            textTransform: 'uppercase',
            paddingTop: 12,
            borderTop: '1px solid #1e1e1e',
          }}>
            Recently Claimed
          </div>
          {completed.map(b => (
            <CompletedBountyRow key={b.id} bounty={b} />
          ))}
        </div>
      )}
    </div>
  )
}
