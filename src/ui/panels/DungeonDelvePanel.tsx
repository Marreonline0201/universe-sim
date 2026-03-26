// ── DungeonDelvePanel ──────────────────────────────────────────────────────
// M61 Track C: Dungeon Delve Tracker UI

import { useState, useEffect, useCallback } from 'react'
import {
  DUNGEON_DEFINITIONS,
  startDelve,
  advanceFloor,
  abandonDelve,
  getActiveDelve,
  getDelveHistory,
  canStartDelve,
  getRemainingCooldown,
  type ActiveDelve,
  type CompletedDelve,
  type DungeonDefinition,
} from '../../game/DungeonDelveSystem'

// ── Formatting helpers ─────────────────────────────────────────────────────

function formatCooldown(ms: number): string {
  if (ms <= 0) return ''
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return `${sec}s`
  return `${min}m ${sec}s`
}

function difficultyColor(d: DungeonDefinition['difficulty']): string {
  if (d === 'normal') return '#4caf50'
  if (d === 'hard') return '#ff9800'
  return '#f44336'
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DungeonCard({ def, cooldownMs, onStart }: {
  def: DungeonDefinition
  cooldownMs: number
  onStart: (id: string) => void
}) {
  const ready = cooldownMs <= 0
  const cdStr = formatCooldown(cooldownMs)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid #2a2a2a',
      borderRadius: 6,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22 }}>{def.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
            {def.name}
          </div>
          <div style={{ color: difficultyColor(def.difficulty), fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 }}>
            {def.difficulty.toUpperCase()}
          </div>
        </div>
      </div>

      <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.4 }}>
        {def.description}
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'monospace' }}>
        <span style={{ color: '#aaa' }}>
          Floors: <span style={{ color: '#e0e0e0' }}>{def.minDepth}–{def.maxDepth}</span>
        </span>
        <span style={{ color: '#aaa' }}>
          Gold: <span style={{ color: '#ffd54f' }}>{def.baseReward.gold}</span>
        </span>
        <span style={{ color: '#aaa' }}>
          XP: <span style={{ color: '#64b5f6' }}>{def.baseReward.xp}</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 10 }}>
          Cooldown: {def.cooldownMinutes}m
        </span>
        {ready ? (
          <button
            onClick={() => onStart(def.id)}
            style={{
              background: 'rgba(205,68,32,0.18)',
              border: '1px solid #cd4420',
              color: '#cd4420',
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              padding: '4px 14px',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(205,68,32,0.35)'
              e.currentTarget.style.color = '#ff7043'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(205,68,32,0.18)'
              e.currentTarget.style.color = '#cd4420'
            }}
          >
            START
          </button>
        ) : (
          <span style={{ color: '#f44336', fontFamily: 'monospace', fontSize: 11 }}>
            {cdStr}
          </span>
        )}
      </div>
    </div>
  )
}

function ActiveDelveCard({ delve, onAdvance, onAbandon }: {
  delve: ActiveDelve
  onAdvance: () => void
  onAbandon: () => void
}) {
  const def = DUNGEON_DEFINITIONS.find(d => d.id === delve.dungeonId)
  const progress = delve.currentFloor / delve.maxFloor

  return (
    <div style={{
      background: 'rgba(205,68,32,0.08)',
      border: '1px solid #cd4420',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }}>{def?.icon ?? '⚔️'}</span>
        <div>
          <div style={{
            color: '#cd4420', fontFamily: 'monospace', fontSize: 11,
            letterSpacing: 2, fontWeight: 700, marginBottom: 2,
          }}>
            IN DELVE
          </div>
          <div style={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: 15, fontWeight: 700 }}>
            {def?.name ?? delve.dungeonId}
          </div>
        </div>
      </div>

      {/* Floor progress */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 11 }}>Floor Progress</span>
          <span style={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
            {delve.currentFloor} / {delve.maxFloor}
          </span>
        </div>
        <div style={{ background: '#1a1a1a', borderRadius: 3, height: 8, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, progress * 100)}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #cd4420, #ff7043)',
            borderRadius: 3,
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Accumulated loot */}
      <div style={{ display: 'flex', gap: 20, fontSize: 12, fontFamily: 'monospace' }}>
        <span style={{ color: '#aaa' }}>
          Gold collected: <span style={{ color: '#ffd54f', fontWeight: 700 }}>{delve.lootCollected.gold}</span>
        </span>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          onClick={onAdvance}
          style={{
            flex: 1,
            background: 'rgba(76,175,80,0.15)',
            border: '1px solid #4caf50',
            color: '#4caf50',
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            padding: '8px 0',
            borderRadius: 5,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(76,175,80,0.3)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(76,175,80,0.15)'
          }}
        >
          {delve.currentFloor >= delve.maxFloor ? 'COMPLETE DELVE' : 'ADVANCE FLOOR'}
        </button>
        <button
          onClick={onAbandon}
          style={{
            flex: 1,
            background: 'rgba(244,67,54,0.12)',
            border: '1px solid #444',
            color: '#888',
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            padding: '8px 0',
            borderRadius: 5,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#f44336'
            e.currentTarget.style.borderColor = '#f44336'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = '#888'
            e.currentTarget.style.borderColor = '#444'
          }}
        >
          ABANDON
        </button>
      </div>
    </div>
  )
}

function HistoryRow({ run }: { run: CompletedDelve }) {
  const isCompleted = run.status === 'completed'
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 10px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 4,
      borderLeft: `3px solid ${isCompleted ? '#4caf50' : '#555'}`,
      fontFamily: 'monospace',
      fontSize: 11,
    }}>
      <div>
        <div style={{ color: isCompleted ? '#e0e0e0' : '#666' }}>{run.dungeonName}</div>
        <div style={{ color: '#555', marginTop: 2 }}>
          {run.floorsCleared}/{run.maxFloor} floors — {isCompleted ? 'Completed' : 'Abandoned'}
        </div>
      </div>
      {isCompleted ? (
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#ffd54f' }}>{run.goldEarned}g</div>
          <div style={{ color: '#64b5f6' }}>{run.xpEarned} xp</div>
        </div>
      ) : (
        <div style={{ color: '#555' }}>—</div>
      )}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function DungeonDelvePanel() {
  const [activeDelve, setActiveDelve] = useState<ActiveDelve | null>(getActiveDelve())
  const [history, setHistory] = useState<CompletedDelve[]>(getDelveHistory())
  const [cooldowns, setCooldowns] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>()
    for (const def of DUNGEON_DEFINITIONS) {
      m.set(def.id, getRemainingCooldown(def.id))
    }
    return m
  })
  const [, forceUpdate] = useState(0)

  const refresh = useCallback(() => {
    setActiveDelve(getActiveDelve())
    setHistory(getDelveHistory())
    setCooldowns(() => {
      const m = new Map<string, number>()
      for (const def of DUNGEON_DEFINITIONS) {
        m.set(def.id, getRemainingCooldown(def.id))
      }
      return m
    })
    forceUpdate(n => n + 1)
  }, [])

  useEffect(() => {
    const events = ['delve-started', 'delve-floor-cleared', 'delve-completed', 'delve-abandoned']
    events.forEach(e => window.addEventListener(e, refresh))

    // 5s fallback poll (for cooldown countdown display)
    const interval = setInterval(refresh, 5_000)

    return () => {
      events.forEach(e => window.removeEventListener(e, refresh))
      clearInterval(interval)
    }
  }, [refresh])

  function handleStart(dungeonId: string) {
    startDelve(dungeonId)
    refresh()
  }

  function handleAdvance() {
    advanceFloor()
    refresh()
  }

  function handleAbandon() {
    abandonDelve()
    refresh()
  }

  const recentHistory = history.slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Active delve section */}
      {activeDelve ? (
        <ActiveDelveCard
          delve={activeDelve}
          onAdvance={handleAdvance}
          onAbandon={handleAbandon}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            color: '#555',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
            marginBottom: 4,
          }}>
            SELECT DUNGEON
          </div>
          {DUNGEON_DEFINITIONS.map(def => (
            <DungeonCard
              key={def.id}
              def={def}
              cooldownMs={cooldowns.get(def.id) ?? 0}
              onStart={handleStart}
            />
          ))}
        </div>
      )}

      {/* History section */}
      {recentHistory.length > 0 && (
        <div>
          <div style={{
            color: '#555',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
            marginBottom: 8,
          }}>
            RECENT RUNS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentHistory.map((run, i) => (
              <HistoryRow key={i} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
