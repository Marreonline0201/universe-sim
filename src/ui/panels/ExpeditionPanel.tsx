// ── ExpeditionPanel.tsx ────────────────────────────────────────────────────
// M68 Track C: Player Expedition System UI
// Timer-based idle mechanic: send expeditions, watch them complete, claim loot.

import { useState, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import {
  getDestinations,
  getActiveExpedition,
  getExpeditionHistory,
  sendExpedition,
  claimExpedition,
  type ActiveExpedition,
  type ExpeditionResult,
} from '../../game/ExpeditionSystem'
import { useGameStore } from '../../store/gameStore'

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  container: {
    fontFamily: 'monospace',
    color: '#ccc',
    fontSize: 12,
    padding: '12px 14px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 10,
    overflowY: 'auto' as const,
    maxHeight: 'calc(100vh - 60px)',
  },
  header: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    color: '#e8c87a',
    borderBottom: '1px solid #333',
    paddingBottom: 8,
    marginBottom: 2,
  },
  grid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: '10px 12px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 5,
  },
  cardHeader: {
    display: 'flex' as const,
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 20,
  },
  destName: {
    fontWeight: 700,
    color: '#e0d5b7',
    fontSize: 12,
  },
  dangerBadge: (danger: 'low' | 'medium' | 'high') => ({
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 3,
    background: danger === 'low' ? 'rgba(80,200,80,0.15)' : danger === 'medium' ? 'rgba(240,190,80,0.15)' : 'rgba(220,60,60,0.15)',
    color: danger === 'low' ? '#6de96d' : danger === 'medium' ? '#f0be50' : '#e05050',
    border: `1px solid ${danger === 'low' ? '#4a844a' : danger === 'medium' ? '#8a6e20' : '#8a2020'}`,
  }),
  description: {
    color: '#888',
    fontSize: 10,
    lineHeight: 1.4,
  },
  meta: {
    display: 'flex' as const,
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    fontSize: 10,
    color: '#777',
  },
  goldCost: {
    color: '#e8c87a',
    fontWeight: 700,
  },
  duration: {
    color: '#7ab8e8',
  },
  btn: (disabled: boolean) => ({
    marginTop: 6,
    padding: '5px 10px',
    background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(205,68,32,0.22)',
    border: `1px solid ${disabled ? '#333' : '#cd4420'}`,
    borderRadius: 4,
    color: disabled ? '#555' : '#cd4420',
    fontFamily: 'monospace',
    fontWeight: 700,
    fontSize: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: 1,
    transition: 'all 0.12s',
  }),
  claimBtn: {
    marginTop: 10,
    padding: '8px 16px',
    background: 'rgba(80,200,80,0.18)',
    border: '1px solid #4a844a',
    borderRadius: 5,
    color: '#6de96d',
    fontFamily: 'monospace',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
    letterSpacing: 1,
    width: '100%',
  },
  progressBar: {
    height: 6,
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    overflow: 'hidden' as const,
    marginTop: 4,
  },
  progressFill: (pct: number) => ({
    height: '100%',
    width: `${Math.min(100, pct * 100)}%`,
    background: 'linear-gradient(90deg, #cd4420, #e8c87a)',
    borderRadius: 3,
    transition: 'width 0.5s linear',
  }),
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#555',
    marginTop: 4,
  },
  resultCard: {
    background: 'rgba(100,200,100,0.06)',
    border: '1px solid #3a5a3a',
    borderRadius: 6,
    padding: '12px 14px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 6,
  },
  rareFind: {
    color: '#b47ae8',
    fontWeight: 700,
    background: 'rgba(100,50,200,0.12)',
    border: '1px solid #5a3a8a',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 11,
  },
  goldEarned: {
    color: '#e8c87a',
    fontWeight: 700,
    fontSize: 14,
  },
  story: {
    color: '#999',
    fontStyle: 'italic' as const,
    fontSize: 11,
    lineHeight: 1.5,
  },
  historyItem: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center',
    padding: '5px 8px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 4,
    fontSize: 10,
    color: '#777',
  },
  statusBig: {
    textAlign: 'center' as const,
    fontSize: 22,
    marginBottom: 4,
  },
  ongoingCard: {
    background: 'rgba(30,60,100,0.25)',
    border: '1px solid #2a4a7a',
    borderRadius: 8,
    padding: '14px 16px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 8,
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dangerIcon(danger: 'low' | 'medium' | 'high') {
  if (danger === 'low') return '🟢'
  if (danger === 'medium') return '🟡'
  return '🔴'
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function destName(id: string): string {
  return getDestinations().find(d => d.id === id)?.name ?? id
}

function destIcon(id: string): string {
  return getDestinations().find(d => d.id === id)?.icon ?? '🗺️'
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function ExpeditionPanel() {
  const gold = usePlayerStore(s => s.gold)
  const simSeconds = useGameStore(s => s.simSeconds)
  const destinations = getDestinations()

  const [active, setActive] = useState<ActiveExpedition | null>(() => getActiveExpedition())
  const [history, setHistory] = useState<ActiveExpedition[]>(() => getExpeditionHistory())
  const [lastClaimed, setLastClaimed] = useState<ExpeditionResult | null>(null)

  // Sync state from system on each simSeconds tick
  useEffect(() => {
    const next = getActiveExpedition()
    setActive(next ? { ...next } : null)
    setHistory(getExpeditionHistory())
  }, [simSeconds])

  // Listen for expedition-returned event
  useEffect(() => {
    function onReturned() {
      setActive(prev => {
        const current = getActiveExpedition()
        return current ? { ...current } : prev
      })
    }
    window.addEventListener('expedition-returned', onReturned)
    return () => window.removeEventListener('expedition-returned', onReturned)
  }, [])

  const handleSend = useCallback((destinationId: string) => {
    const ok = sendExpedition(destinationId)
    if (ok) {
      setActive(getActiveExpedition())
      setLastClaimed(null)
    }
  }, [])

  const handleClaim = useCallback(() => {
    const result = claimExpedition()
    if (result) {
      setLastClaimed(result)
      setActive(null)
      setHistory(getExpeditionHistory())
    }
  }, [])

  // Active expedition display
  const renderActiveExpedition = () => {
    if (!active) return null
    const dest = destinations.find(d => d.id === active.destinationId)
    if (!dest) return null

    if (active.status === 'returned') {
      const result = active.result!
      return (
        <div style={styles.resultCard}>
          <div style={styles.statusBig}>{dest.icon}</div>
          <div style={{ textAlign: 'center', fontWeight: 700, color: '#e0d5b7', fontSize: 13 }}>
            {dest.name} — EXPEDITION RETURNED
          </div>
          <div style={styles.goldEarned}>+{result.goldEarned} Gold</div>
          <div style={{ color: '#bbb', fontSize: 11 }}>
            Items: {result.itemsFound.join(', ')}
          </div>
          {result.rareFind && (
            <div style={styles.rareFind}>
              Rare Find: {result.rareFind}
            </div>
          )}
          <div style={styles.story}>&ldquo;{result.story}&rdquo;</div>
          {!result.success && (
            <div style={{ color: '#e05050', fontSize: 10, fontWeight: 700 }}>
              PARTIAL SUCCESS — expedition encountered difficulties
            </div>
          )}
          <button style={styles.claimBtn} onClick={handleClaim}>
            CLAIM REWARDS
          </button>
        </div>
      )
    }

    // Ongoing
    const elapsed = simSeconds - active.startedAt
    const total = active.endsAt - active.startedAt
    const pct = total > 0 ? elapsed / total : 0
    const remaining = Math.max(0, active.endsAt - simSeconds)

    return (
      <div style={styles.ongoingCard}>
        <div style={styles.statusBig}>{dest.icon}</div>
        <div style={{ textAlign: 'center', fontWeight: 700, color: '#e0d5b7', fontSize: 13 }}>
          {dest.name}
        </div>
        <div style={{ textAlign: 'center', color: '#7ab8e8', fontSize: 11, letterSpacing: 1 }}>
          EXPEDITION IN PROGRESS
        </div>
        <div style={styles.progressBar}>
          <div style={styles.progressFill(pct)} />
        </div>
        <div style={{ textAlign: 'center', color: '#888', fontSize: 10 }}>
          Returns in: <span style={{ color: '#e8c87a', fontWeight: 700 }}>{formatTime(remaining)}</span>
        </div>
        <div style={{ color: '#666', fontSize: 10, marginTop: 4 }}>
          Estimated rewards: {dest.rewards.gold[0]}–{dest.rewards.gold[1]} gold
          &nbsp;·&nbsp;{dest.rewards.items.slice(0, 2).join(', ')}...
          &nbsp;·&nbsp;<span style={{ color: '#b47ae8' }}>15% rare find</span>
        </div>
      </div>
    )
  }

  // Last claimed result flash
  const renderLastClaimed = () => {
    if (!lastClaimed) return null
    return (
      <div style={{ ...styles.card, background: 'rgba(100,200,100,0.08)', border: '1px solid #3a5a3a' }}>
        <div style={{ fontWeight: 700, color: '#6de96d', fontSize: 11 }}>REWARDS CLAIMED</div>
        <div style={styles.goldEarned}>+{lastClaimed.goldEarned} Gold</div>
        {lastClaimed.rareFind && (
          <div style={styles.rareFind}>Rare Find: {lastClaimed.rareFind}</div>
        )}
        <div style={{ color: '#bbb', fontSize: 10 }}>
          {lastClaimed.itemsFound.join(', ')}
        </div>
        <div style={styles.story}>&ldquo;{lastClaimed.story}&rdquo;</div>
      </div>
    )
  }

  // Destination grid (only when no active expedition)
  const renderGrid = () => {
    if (active) return null
    return (
      <>
        <div style={styles.sectionLabel}>CHOOSE DESTINATION</div>
        <div style={styles.grid}>
          {destinations.map(dest => {
            const canAfford = gold >= dest.goldCost
            return (
              <div key={dest.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <span style={styles.icon}>{dest.icon}</span>
                  <div>
                    <div style={styles.destName}>{dest.name}</div>
                    <span style={styles.dangerBadge(dest.danger)}>
                      {dangerIcon(dest.danger)} {dest.danger.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div style={styles.description}>{dest.description}</div>
                <div style={styles.meta}>
                  <span style={styles.goldCost}>{dest.goldCost}g</span>
                  <span style={styles.duration}>{formatTime(dest.duration)}</span>
                </div>
                <div style={{ fontSize: 9, color: '#555' }}>
                  Loot: {dest.rewards.items.slice(0, 2).join(', ')}
                  {dest.rewards.items.length > 2 ? '...' : ''}
                </div>
                <button
                  style={styles.btn(!canAfford)}
                  disabled={!canAfford}
                  onClick={() => canAfford && handleSend(dest.id)}
                >
                  SEND EXPEDITION
                </button>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // History (last 5 completed)
  const renderHistory = () => {
    if (history.length === 0) return null
    return (
      <>
        <div style={styles.sectionLabel}>EXPEDITION HISTORY</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {history.map(exp => {
            const result = exp.result
            return (
              <div key={exp.id} style={styles.historyItem}>
                <span>{destIcon(exp.destinationId)} {destName(exp.destinationId)}</span>
                <span style={{ color: result?.success === false ? '#e05050' : '#e8c87a', fontWeight: 700 }}>
                  {result ? `+${result.goldEarned}g` : '—'}
                  {result?.rareFind ? ' ★' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>EXPEDITIONS</div>
      <div style={{ color: '#666', fontSize: 10 }}>
        Gold: <span style={{ color: '#e8c87a', fontWeight: 700 }}>{gold}g</span>
        &nbsp;·&nbsp;Send scouts to gather resources while you explore.
      </div>
      {renderActiveExpedition()}
      {renderLastClaimed()}
      {renderGrid()}
      {renderHistory()}
    </div>
  )
}
