// ── AchievementTrophyPanel.tsx ─────────────────────────────────────────────────
// M62 Track C: Achievement Trophy Room — visual showcase of unlocked achievements
// Reads from AchievementShowcaseSystem; never modifies it.

import React, { useState, useEffect, useCallback } from 'react'
import { getMilestones, claimMilestone, type ShowcaseMilestone } from '../../game/AchievementShowcaseSystem'
import { usePlayerStatsStore } from '../../store/playerStatsStore'

// ── Types ──────────────────────────────────────────────────────────────────────

type FilterTab = 'ALL' | 'UNLOCKED' | 'LOCKED'

// ── Confetti flash — scale pulse on claim ─────────────────────────────────────

const CLAIM_FLASH_STYLE = `
@keyframes trophy-claim-flash {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}
.trophy-claim-flash {
  animation: trophy-claim-flash 300ms ease-out forwards;
}
`

function injectClaimFlashStyle() {
  if (document.getElementById('trophy-claim-flash-style')) return
  const tag = document.createElement('style')
  tag.id = 'trophy-claim-flash-style'
  tag.textContent = CLAIM_FLASH_STYLE
  document.head.appendChild(tag)
}

// ── Progress bar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number
  max: number
  color: string
}

function ProgressBar({ value, max, color }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div>
      <div style={{
        width: '100%',
        height: 3,
        background: 'rgba(255,255,255,0.07)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 8,
        color: '#555',
        fontFamily: 'monospace',
        marginTop: 2,
      }}>
        <span>{value.toLocaleString()} / {max.toLocaleString()}</span>
        <span>{Math.round(pct)}%</span>
      </div>
    </div>
  )
}

// ── Reward badge ───────────────────────────────────────────────────────────────

interface RewardBadgeProps {
  gold: number
  xp: number
  skill?: string
  dimmed: boolean
}

function RewardBadge({ gold, xp, skill, dimmed }: RewardBadgeProps) {
  const alpha = dimmed ? 0.3 : 1
  return (
    <div style={{
      display: 'flex',
      gap: 5,
      flexWrap: 'wrap',
      marginTop: 5,
      opacity: alpha,
    }}>
      <span style={{
        fontSize: 8,
        fontFamily: 'monospace',
        color: '#f0c040',
        background: 'rgba(240,192,64,0.1)',
        border: '1px solid rgba(240,192,64,0.25)',
        borderRadius: 3,
        padding: '1px 5px',
      }}>
        +{xp} XP
      </span>
      <span style={{
        fontSize: 8,
        fontFamily: 'monospace',
        color: '#a78040',
        background: 'rgba(167,128,64,0.1)',
        border: '1px solid rgba(167,128,64,0.25)',
        borderRadius: 3,
        padding: '1px 5px',
      }}>
        {gold}g
      </span>
      {skill && (
        <span style={{
          fontSize: 8,
          fontFamily: 'monospace',
          color: '#60a5fa',
          background: 'rgba(96,165,250,0.1)',
          border: '1px solid rgba(96,165,250,0.2)',
          borderRadius: 3,
          padding: '1px 5px',
          textTransform: 'capitalize',
        }}>
          {skill}
        </span>
      )}
    </div>
  )
}

// ── Achievement card ───────────────────────────────────────────────────────────

interface AchievementCardProps {
  milestone: ShowcaseMilestone
  currentStatValue: number
  onClaim: (id: string) => void
  flashingId: string | null
}

function AchievementCard({ milestone, currentStatValue, onClaim, flashingId }: AchievementCardProps) {
  const { id, title, description, icon, requirement, reward, unlocked, claimed } = milestone
  const isFlashing = flashingId === id
  const canClaim = unlocked && !claimed

  const borderColor = unlocked
    ? (claimed ? 'rgba(240,192,64,0.35)' : 'rgba(240,192,64,0.6)')
    : 'rgba(255,255,255,0.07)'

  const bgColor = unlocked
    ? (claimed ? 'rgba(240,192,64,0.05)' : 'rgba(240,192,64,0.08)')
    : 'rgba(255,255,255,0.02)'

  return (
    <div
      className={isFlashing ? 'trophy-claim-flash' : undefined}
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: '9px 10px',
        opacity: unlocked ? 1 : 0.35,
        transition: 'border-color 0.2s, opacity 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Icon + title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 4 }}>
        <span style={{
          fontSize: 20,
          lineHeight: 1,
          flexShrink: 0,
          filter: unlocked ? 'none' : 'grayscale(1)',
          opacity: unlocked ? 1 : 0.5,
        }}>
          {icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: unlocked ? '#f0c040' : '#666',
            letterSpacing: 0.4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {unlocked ? title : '???'}
          </div>
          <div style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: unlocked ? '#999' : '#555',
            marginTop: 1,
            lineHeight: 1.4,
          }}>
            {unlocked ? description : 'Hidden achievement'}
          </div>
        </div>
      </div>

      {/* Progress bar — show for locked achievements or unlocked-but-not-claimed */}
      {!claimed && (
        <ProgressBar
          value={Math.min(currentStatValue, requirement.value)}
          max={requirement.value}
          color={unlocked ? '#f0c040' : '#444'}
        />
      )}

      {/* Reward badge */}
      <RewardBadge gold={reward.gold} xp={reward.xp} skill={reward.skill} dimmed={!unlocked} />

      {/* Claim / status row */}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        {claimed && (
          <span style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: '#f0c040',
            letterSpacing: 0.5,
          }}>
            ✓ CLAIMED
          </span>
        )}
        {canClaim && (
          <button
            onClick={() => onClaim(id)}
            style={{
              fontSize: 9,
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#0e0e0e',
              background: '#f0c040',
              border: 'none',
              borderRadius: 3,
              padding: '3px 8px',
              cursor: 'pointer',
              letterSpacing: 0.5,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#ffd060')}
            onMouseLeave={e => (e.currentTarget.style.background = '#f0c040')}
          >
            CLAIM
          </button>
        )}
        {!unlocked && (
          <span style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: '#444',
            letterSpacing: 0.5,
          }}>
            LOCKED
          </span>
        )}
      </div>
    </div>
  )
}

// ── Filter tabs ────────────────────────────────────────────────────────────────

interface FilterTabsProps {
  active: FilterTab
  onChange: (tab: FilterTab) => void
  counts: Record<FilterTab, number>
}

function FilterTabs({ active, onChange, counts }: FilterTabsProps) {
  const tabs: FilterTab[] = ['ALL', 'UNLOCKED', 'LOCKED']
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      marginBottom: 12,
    }}>
      {tabs.map(tab => {
        const isActive = tab === active
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            style={{
              fontSize: 9,
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: 0.6,
              color: isActive ? '#f0c040' : '#555',
              background: isActive ? 'rgba(240,192,64,0.1)' : 'transparent',
              border: `1px solid ${isActive ? 'rgba(240,192,64,0.4)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 3,
              padding: '4px 10px',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.color = '#aaa'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.color = '#555'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
              }
            }}
          >
            {tab} <span style={{ opacity: 0.7 }}>({counts[tab]})</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function AchievementTrophyPanel() {
  const [milestones, setMilestones] = useState<ShowcaseMilestone[]>(() => getMilestones())
  const [filter, setFilter] = useState<FilterTab>('ALL')
  const [flashingId, setFlashingId] = useState<string | null>(null)
  const stats = usePlayerStatsStore(s => s.stats)

  // Inject CSS animation once
  useEffect(() => {
    injectClaimFlashStyle()
  }, [])

  const refresh = useCallback(() => {
    setMilestones(getMilestones())
  }, [])

  useEffect(() => {
    const iv = setInterval(refresh, 5_000)
    window.addEventListener('milestone-unlocked', refresh)
    window.addEventListener('milestone-claimed', refresh)
    return () => {
      clearInterval(iv)
      window.removeEventListener('milestone-unlocked', refresh)
      window.removeEventListener('milestone-claimed', refresh)
    }
  }, [refresh])

  const handleClaim = useCallback((id: string) => {
    const success = claimMilestone(id)
    if (success) {
      setFlashingId(id)
      setTimeout(() => setFlashingId(null), 350)
      refresh()
    }
  }, [refresh])

  // Derive stats
  const unlockedCount = milestones.filter(m => m.unlocked).length
  const totalCount    = milestones.length
  const claimedXp    = milestones
    .filter(m => m.claimed)
    .reduce((sum, m) => sum + m.reward.xp, 0)

  const counts: Record<FilterTab, number> = {
    ALL:      totalCount,
    UNLOCKED: unlockedCount,
    LOCKED:   totalCount - unlockedCount,
  }

  const filtered = milestones.filter(m => {
    if (filter === 'UNLOCKED') return m.unlocked
    if (filter === 'LOCKED')   return !m.unlocked
    return true
  })

  // We don't have live player stats here, so we read current progress as min(stat, max)
  // AchievementShowcaseSystem stores the requirement; we pass 0 for locked stats display.
  // For a cleaner progress display we derive from the unlocked flag.
  function getStatValue(m: ShowcaseMilestone): number {
    if (m.unlocked) return m.requirement.value
    return (stats as Record<string, number>)[m.requirement.stat] ?? 0
  }

  return (
    <div style={{ padding: 12, color: '#ccc', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#f0c040',
          letterSpacing: 1.5,
          marginBottom: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>🏆</span>
          <span>TROPHY ROOM</span>
        </div>
        <div style={{ fontSize: 10, color: '#666' }}>
          Unlock achievements by meeting milestones, then claim your rewards.
        </div>
      </div>

      {/* Stats header */}
      <div style={{
        background: 'rgba(240,192,64,0.07)',
        border: '1px solid rgba(240,192,64,0.2)',
        borderRadius: 5,
        padding: '7px 12px',
        marginBottom: 12,
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, color: '#f0c040', fontFamily: 'monospace', fontWeight: 700 }}>
          {unlockedCount} / {totalCount} Unlocked
        </span>
        <span style={{ fontSize: 11, color: '#a78040', fontFamily: 'monospace' }}>
          {claimedXp.toLocaleString()} XP claimed
        </span>
        {unlockedCount > 0 && unlockedCount === totalCount && (
          <span style={{ fontSize: 10, color: '#f0c040', fontFamily: 'monospace', letterSpacing: 0.5 }}>
            ✓ ALL UNLOCKED
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <FilterTabs active={filter} onChange={setFilter} counts={counts} />

      {/* Achievement grid */}
      {filtered.length === 0 ? (
        <div style={{
          color: '#444',
          fontFamily: 'monospace',
          fontSize: 11,
          textAlign: 'center',
          padding: '24px 0',
        }}>
          No achievements in this category.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}>
          {filtered.map(m => (
            <AchievementCard
              key={m.id}
              milestone={m}
              currentStatValue={getStatValue(m)}
              onClaim={handleClaim}
              flashingId={flashingId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
