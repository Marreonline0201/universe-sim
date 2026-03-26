// src/ui/panels/WorldBossPanel.tsx
// M60 Track B: World Boss lifecycle panel — shows active boss, countdown, defeat button, history.

import { useState, useEffect, useCallback } from 'react'
import {
  getActiveBoss,
  getBossHistory,
  getBossDefinition,
  getNextSpawnAt,
  defeatBoss,
  type ActiveBoss,
} from '../../game/WorldBossSystem'
import { useGameStore } from '../../store/gameStore'

// ── Helpers ────────────────────────────────────────────────────────────────────

const DIFFICULTY_COLOR: Record<string, string> = {
  hard:      '#e0a030',
  epic:      '#9b59b6',
  legendary: '#e74c3c',
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatTimestamp(simSeconds: number): string {
  const m = Math.floor(simSeconds / 60)
  const s = Math.floor(simSeconds % 60)
  return `T+${m}:${s.toString().padStart(2, '0')}`
}

// ── ActiveBossCard ─────────────────────────────────────────────────────────────

interface ActiveBossCardProps {
  boss: ActiveBoss
  simNow: number
  onDefeat: (id: string) => void
}

function ActiveBossCard({ boss, simNow, onDefeat }: ActiveBossCardProps) {
  const def = getBossDefinition(boss.bossId)
  if (!def) return null

  const elapsed  = simNow - boss.spawnedAt
  const remaining = Math.max(0, 600 - elapsed)
  const diffColor = DIFFICULTY_COLOR[def.difficulty] ?? '#888'

  return (
    <div style={{
      background: 'rgba(40,10,10,0.9)',
      border: `1px solid ${diffColor}55`,
      borderLeft: `3px solid ${diffColor}`,
      borderRadius: 6,
      padding: '14px 16px',
      marginBottom: 16,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{def.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 1,
          }}>
            {def.name}
          </div>
          <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 10, marginTop: 2 }}>
            Condition: {def.spawnCondition}
          </div>
        </div>
        <span style={{
          background: `${diffColor}22`,
          border: `1px solid ${diffColor}66`,
          borderRadius: 3,
          color: diffColor,
          fontFamily: 'monospace',
          fontSize: 9,
          fontWeight: 700,
          padding: '2px 6px',
          letterSpacing: 1,
        }}>
          {def.difficulty.toUpperCase()}
        </span>
      </div>

      {/* Description */}
      <div style={{
        color: '#aaa',
        fontFamily: 'monospace',
        fontSize: 10,
        lineHeight: '1.5',
        marginBottom: 10,
      }}>
        {def.description}
      </div>

      {/* Rewards row */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 10,
        flexWrap: 'wrap',
      }}>
        <span style={{ color: '#f0c040', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
          💰 {def.rewards.gold}g
        </span>
        <span style={{ color: '#5bc8af', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
          ✨ {def.rewards.xp} {def.rewards.skill} XP
        </span>
        <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
          + loot drops
        </span>
      </div>

      {/* Countdown */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: remaining < 60 ? '#e74c3c' : '#888',
        }}>
          ⏱ Expires in: <strong style={{ color: remaining < 60 ? '#e74c3c' : '#ccc' }}>
            {formatCountdown(remaining)}
          </strong>
        </span>
        <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10 }}>
          Spawned {formatTimestamp(boss.spawnedAt)}
        </span>
      </div>

      {/* Defeat button */}
      <button
        onClick={() => onDefeat(boss.bossId)}
        style={{
          width: '100%',
          padding: '8px 0',
          background: diffColor,
          border: 'none',
          borderRadius: 4,
          color: '#000',
          fontFamily: 'monospace',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1,
          cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.82')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        ⚔️ DEFEAT {def.name.toUpperCase()}
      </button>
    </div>
  )
}

// ── HistoryRow ─────────────────────────────────────────────────────────────────

interface HistoryRowProps {
  entry: ActiveBoss
}

function HistoryRow({ entry }: HistoryRowProps) {
  const def = getBossDefinition(entry.bossId)
  const icon = def?.icon ?? '👹'
  const name = def?.name ?? entry.bossId

  const statusColor = entry.status === 'defeated' ? '#2ecc71' : '#666'
  const statusLabel = entry.status === 'defeated' ? 'DEFEATED' : 'EXPIRED'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ flex: 1, color: '#aaa', fontFamily: 'monospace', fontSize: 11 }}>{name}</span>
      <span style={{
        fontFamily: 'monospace',
        fontSize: 9,
        fontWeight: 700,
        color: statusColor,
        letterSpacing: 0.5,
      }}>
        {statusLabel}
      </span>
      <span style={{ color: '#444', fontFamily: 'monospace', fontSize: 9 }}>
        {formatTimestamp(entry.defeatedAt ?? entry.spawnedAt)}
      </span>
    </div>
  )
}

// ── WorldBossPanel ─────────────────────────────────────────────────────────────

export function WorldBossPanel() {
  const [activeBoss, setActiveBoss]  = useState<ActiveBoss | null>(() => getActiveBoss())
  const [history, setHistory]        = useState<ActiveBoss[]>(() => getBossHistory())
  const [nextSpawnAt, setNextSpawnAt] = useState<number>(() => getNextSpawnAt())
  const simNow = useGameStore(s => s.simSeconds ?? 0)

  const refresh = useCallback(() => {
    setActiveBoss(getActiveBoss())
    setHistory(getBossHistory())
    setNextSpawnAt(getNextSpawnAt())
  }, [])

  // Listen to boss events
  useEffect(() => {
    const onSpawned  = () => refresh()
    const onDefeated = () => refresh()
    const onExpired  = () => refresh()

    window.addEventListener('boss-spawned',  onSpawned)
    window.addEventListener('boss-defeated', onDefeated)
    window.addEventListener('boss-expired',  onExpired)

    // Fallback poll every 5s
    const id = setInterval(() => {
      refresh()
    }, 5_000)

    return () => {
      window.removeEventListener('boss-spawned',  onSpawned)
      window.removeEventListener('boss-defeated', onDefeated)
      window.removeEventListener('boss-expired',  onExpired)
      clearInterval(id)
    }
  }, [refresh])

  const handleDefeat = useCallback((bossId: string) => {
    defeatBoss(bossId)
    refresh()
  }, [refresh])

  const timeToNext = Math.max(0, nextSpawnAt - simNow)

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      {/* Section header */}
      <div style={{
        color: '#cd4420',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 2,
        marginBottom: 12,
        textTransform: 'uppercase',
      }}>
        {activeBoss ? '⚡ ACTIVE WORLD BOSS' : '— NO ACTIVE BOSS —'}
      </div>

      {activeBoss ? (
        <ActiveBossCard
          boss={activeBoss}
          simNow={simNow}
          onDefeat={handleDefeat}
        />
      ) : (
        <div style={{
          background: 'rgba(20,20,20,0.6)',
          border: '1px solid #2a2a2a',
          borderRadius: 5,
          padding: '14px 16px',
          marginBottom: 16,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👹</div>
          <div style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>
            No world boss currently active.
          </div>
          <div style={{ color: '#888', fontSize: 11 }}>
            Next boss spawns in ~<strong style={{ color: '#ccc' }}>
              {formatCountdown(timeToNext)}
            </strong>
          </div>
        </div>
      )}

      {/* Boss History */}
      {history.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            color: '#555',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 2,
            marginBottom: 8,
            textTransform: 'uppercase',
          }}>
            Recent Bosses
          </div>
          {history.slice(0, 5).map((entry, i) => (
            <HistoryRow key={`${entry.bossId}-${entry.spawnedAt}-${i}`} entry={entry} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 16, borderTop: '1px solid #1a1a1a', paddingTop: 12 }}>
        <div style={{ color: '#444', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>DIFFICULTY</div>
        {Object.entries(DIFFICULTY_COLOR).map(([tier, color]) => (
          <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ color: '#666', fontSize: 10, textTransform: 'capitalize' }}>{tier}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
