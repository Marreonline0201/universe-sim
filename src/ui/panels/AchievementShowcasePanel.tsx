// M57 Track A: Achievement Showcase Panel — milestone rewards with claim mechanics

import React, { useState, useEffect, useCallback } from 'react'
import {
  getMilestones,
  claimMilestone,
  type ShowcaseMilestone,
} from '../../game/AchievementShowcaseSystem'
import { usePlayerStatsStore } from '../../store/playerStatsStore'

// ── Stat display helpers ──────────────────────────────────────────────────────

function getStatValue(stat: string): number {
  const stats = usePlayerStatsStore.getState().stats as unknown as Record<string, number>
  return stats[stat] ?? 0
}

// ── Milestone card ─────────────────────────────────────────────────────────────

function MilestoneCard({
  milestone,
  onClaim,
}: {
  milestone: ShowcaseMilestone
  onClaim: (id: string) => void
}) {
  const { id, title, description, icon, requirement, reward, unlocked, claimed } = milestone
  const currentVal = getStatValue(requirement.stat)
  const progress = Math.min(1, currentVal / requirement.value)

  const isClaimable = unlocked && !claimed

  let borderColor = 'rgba(255,255,255,0.08)'
  let bgColor = 'rgba(255,255,255,0.03)'
  let titleColor = '#888'

  if (claimed) {
    borderColor = 'rgba(74,222,128,0.2)'
    bgColor = 'rgba(74,222,128,0.04)'
    titleColor = '#6ee7a0'
  } else if (isClaimable) {
    borderColor = 'rgba(250,204,21,0.4)'
    bgColor = 'rgba(250,204,21,0.07)'
    titleColor = '#facc15'
  } else if (unlocked) {
    borderColor = 'rgba(251,146,60,0.3)'
    bgColor = 'rgba(251,146,60,0.05)'
    titleColor = '#fb923c'
  }

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: '10px 12px',
      opacity: claimed ? 0.6 : 1,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: titleColor }}>
          {title}
        </span>
        {claimed && (
          <span style={{ fontSize: 9, color: '#6ee7a0', fontFamily: 'monospace' }}>CLAIMED</span>
        )}
      </div>

      {/* Description */}
      <div style={{ fontSize: 10, color: '#999', marginBottom: 6, lineHeight: 1.4 }}>
        {description}
      </div>

      {/* Progress bar */}
      {!claimed && (
        <div style={{ marginBottom: 5 }}>
          <div style={{
            width: '100%', height: 4,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: isClaimable ? '#facc15' : unlocked ? '#fb923c' : '#4b5563',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 8, color: '#666', fontFamily: 'monospace', marginTop: 2,
          }}>
            <span>{Math.min(currentVal, requirement.value).toLocaleString()} / {requirement.value.toLocaleString()}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
        </div>
      )}

      {/* Reward line */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 9, color: '#aaa', fontFamily: 'monospace',
        marginBottom: isClaimable ? 8 : 0,
      }}>
        <span style={{ color: '#facc15' }}>+{reward.gold}g</span>
        <span style={{ color: '#60a5fa' }}>+{reward.xp} XP</span>
        {reward.skill && (
          <span style={{ color: '#a78bfa' }}>({reward.skill})</span>
        )}
      </div>

      {/* Claim button */}
      {isClaimable && (
        <button
          onClick={() => onClaim(id)}
          style={{
            width: '100%',
            padding: '5px 0',
            background: 'rgba(250,204,21,0.15)',
            border: '1px solid rgba(250,204,21,0.5)',
            borderRadius: 4,
            color: '#facc15',
            fontSize: 10,
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(250,204,21,0.28)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(250,204,21,0.15)'
          }}
        >
          CLAIM REWARD
        </button>
      )}
    </div>
  )
}

// ── Section header ──────────────────────────────────────────────────────────────

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 12,
    }}>
      <div style={{ flex: 1, height: 1, background: `${color}33` }} />
      <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'monospace', letterSpacing: 1 }}>
        {label} ({count})
      </span>
      <div style={{ flex: 1, height: 1, background: `${color}33` }} />
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────────

export function AchievementShowcasePanel() {
  const [milestones, setMilestones] = useState<ShowcaseMilestone[]>(() => getMilestones())

  const refresh = useCallback(() => {
    setMilestones(getMilestones())
  }, [])

  useEffect(() => {
    // Refresh every 5 seconds
    const iv = setInterval(refresh, 5000)

    // Listen for milestone events
    window.addEventListener('milestone-unlocked', refresh)
    window.addEventListener('milestone-claimed', refresh)

    return () => {
      clearInterval(iv)
      window.removeEventListener('milestone-unlocked', refresh)
      window.removeEventListener('milestone-claimed', refresh)
    }
  }, [refresh])

  const handleClaim = useCallback((id: string) => {
    claimMilestone(id)
    refresh()
  }, [refresh])

  // Sort into 4 buckets
  const claimable   = milestones.filter(m => m.unlocked && !m.claimed)
  const inProgress  = milestones.filter(m => !m.unlocked && !m.claimed)
  const claimed     = milestones.filter(m => m.claimed)
  const totalClaimed = milestones.filter(m => m.claimed).length

  return (
    <div style={{ padding: 12, color: '#ccc', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#eee', letterSpacing: 1, marginBottom: 2 }}>
          ACHIEVEMENT SHOWCASE
        </div>
        <div style={{ fontSize: 10, color: '#666' }}>
          Complete milestones to earn rewards
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
        {totalClaimed} / {milestones.length} milestones achieved
        {claimable.length > 0 && (
          <span style={{ color: '#fb923c', marginLeft: 10 }}>
            • {claimable.length} ready to claim
          </span>
        )}
      </div>

      {/* CLAIMABLE section */}
      {claimable.length > 0 && (
        <>
          <SectionHeader label="CLAIMABLE" count={claimable.length} color="#facc15" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {claimable.map(m => (
              <MilestoneCard key={m.id} milestone={m} onClaim={handleClaim} />
            ))}
          </div>
        </>
      )}

      {/* IN PROGRESS section */}
      {inProgress.length > 0 && (
        <>
          <SectionHeader label="IN PROGRESS" count={inProgress.length} color="#9ca3af" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {inProgress.map(m => (
              <MilestoneCard key={m.id} milestone={m} onClaim={handleClaim} />
            ))}
          </div>
        </>
      )}

      {/* CLAIMED section */}
      {claimed.length > 0 && (
        <>
          <SectionHeader label="CLAIMED" count={claimed.length} color="#4ade80" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {claimed.map(m => (
              <MilestoneCard key={m.id} milestone={m} onClaim={handleClaim} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
