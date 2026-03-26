// ── QuestPanel.tsx ──────────────────────────────────────────────────────────
// M23 Track B: Quest log (milestone quests) — active, completed, locked.
// M33 Track A: Settlement quest board — Board / Active tabs.
//
// Hotkey: Q. Registered in SidebarShell as lazy-loaded panel.

import { useState, useEffect } from 'react'
import { questSystem } from '../../game/GameSingletons'
import type { Quest, QuestCategory } from '../../game/QuestSystem'
import { useSettlementQuestStore } from '../../store/settlementQuestStore'
import { useSettlementStore } from '../../store/settlementStore'
import type { BoardQuest, BoardQuestType } from '../../store/settlementQuestStore'

// ── Milestone quest styles ────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<QuestCategory, string> = {
  tutorial:      '#f39c12',
  exploration:   '#3498db',
  crafting:      '#2ecc71',
  combat:        '#e74c3c',
  civilization:  '#9b59b6',
}

const CATEGORY_ICONS: Record<QuestCategory, string> = {
  tutorial:      'TUT',
  exploration:   'EXP',
  crafting:      'CRF',
  combat:        'CMB',
  civilization:  'CIV',
}

// ── Board quest styles ────────────────────────────────────────────────────────

const TYPE_ICONS: Record<BoardQuestType, string> = {
  gather:  '🌿',
  hunt:    '⚔️',
  explore: '🗺️',
  craft:   '🔨',
}

const TYPE_COLORS: Record<BoardQuestType, string> = {
  gather:  '#2ecc71',
  hunt:    '#e74c3c',
  explore: '#3498db',
  craft:   '#f39c12',
}

// ── Tab type ──────────────────────────────────────────────────────────────────

type Tab = 'board' | 'active' | 'log'

// ── Main QuestPanel ───────────────────────────────────────────────────────────

export function QuestPanel() {
  const [tab, setTab] = useState<Tab>('board')
  const [, forceRefresh] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Poll every 500ms for quest progress updates
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 500)
    return () => clearInterval(id)
  }, [])

  const activeLog = questSystem.getActiveQuests()
  const completedLog = questSystem.getCompletedQuests()

  const { quests: boardQuests, getActiveQuests: getBoardActive, acceptQuest, abandonQuest } = useSettlementQuestStore()
  const boardActive = getBoardActive()
  const settlements = useSettlementStore(s => s.settlements)
  const nearSettlementId = useSettlementStore(s => s.nearSettlementId)
  const ensureQuests = useSettlementQuestStore(s => s.ensureSettlementQuests)

  // Generate quests for nearby settlement when panel opens
  useEffect(() => {
    if (nearSettlementId != null) {
      const s = settlements.get(nearSettlementId)
      if (s) ensureQuests(s.id, s.name)
    }
    // Also ensure quests for all known settlements
    for (const s of settlements.values()) {
      ensureQuests(s.id, s.name)
    }
  }, [nearSettlementId, settlements, ensureQuests])

  // Available quests from nearest settlement (or all if none near)
  const nearSettlement = nearSettlementId != null ? settlements.get(nearSettlementId) : null
  const availableForBoard = nearSettlement
    ? Object.values(boardQuests).filter(q => q.settlementId === nearSettlement.id && !q.accepted && !q.completed)
    : Object.values(boardQuests).filter(q => !q.accepted && !q.completed)

  const completedBoardQuests = Object.values(boardQuests).filter(q => q.completed)

  const tabStyle = (t: Tab): React.CSSProperties => ({
    flex: 1,
    padding: '6px 4px',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
    border: 'none',
    borderBottom: tab === t ? '2px solid #cd4420' : '2px solid transparent',
    background: tab === t ? 'rgba(205,68,32,0.12)' : 'transparent',
    color: tab === t ? '#cd4420' : '#666',
    transition: 'all 0.12s',
    textTransform: 'uppercase',
  })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      fontFamily: '"Courier New", monospace', color: '#e0d6c8',
      maxHeight: '100%', overflow: 'hidden',
      background: '#111',
    }}>
      {/* Tab strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: 8 }}>
        <button style={tabStyle('board')} onClick={() => setTab('board')}>
          Board {nearSettlement ? `(${nearSettlement.name})` : ''}
        </button>
        <button style={tabStyle('active')} onClick={() => setTab('active')}>
          Active ({boardActive.length})
        </button>
        <button style={tabStyle('log')} onClick={() => setTab('log')}>
          Quest Log
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {/* ── Board tab: available settlement quests ── */}
        {tab === 'board' && (
          <BoardTab
            available={availableForBoard}
            completed={completedBoardQuests}
            nearSettlement={nearSettlement?.name ?? null}
            onAccept={acceptQuest}
          />
        )}

        {/* ── Active tab: accepted board quests ── */}
        {tab === 'active' && (
          <ActiveTab
            quests={boardActive}
            onAbandon={abandonQuest}
          />
        )}

        {/* ── Quest Log tab: milestone quests ── */}
        {tab === 'log' && (
          <LogTab
            active={activeLog}
            completed={completedLog}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
          />
        )}
      </div>
    </div>
  )
}

// ── Board tab ─────────────────────────────────────────────────────────────────

function BoardTab({
  available,
  completed,
  nearSettlement,
  onAccept,
}: {
  available: BoardQuest[]
  completed: BoardQuest[]
  nearSettlement: string | null
  onAccept: (id: string) => void
}) {
  if (!nearSettlement && available.length === 0) {
    return (
      <div style={{ color: '#888', fontSize: 12, padding: '16px 8px', textAlign: 'center' }}>
        <div style={{ marginBottom: 8, fontSize: 20 }}>📋</div>
        Approach a settlement to view its quest board.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {nearSettlement && (
        <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, padding: '0 2px 4px', borderBottom: '1px solid #222' }}>
          QUEST BOARD — {nearSettlement.toUpperCase()}
        </div>
      )}

      {available.length === 0 ? (
        <div style={{ color: '#888', fontSize: 12, padding: '8px' }}>
          No quests available. Check back later.
        </div>
      ) : (
        available.map(q => (
          <BoardQuestCard key={q.id} quest={q} showAccept onAccept={() => onAccept(q.id)} />
        ))
      )}

      {completed.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, padding: '4px 0 2px', borderTop: '1px solid #222', marginTop: 4 }}>
            COMPLETED ({completed.length})
          </div>
          {completed.map(q => (
            <div key={q.id} style={{
              padding: '6px 8px',
              background: 'rgba(46,204,113,0.05)',
              border: '1px solid rgba(46,204,113,0.15)',
              borderRadius: 4,
              fontSize: 11,
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{ color: '#2ecc71', fontSize: 14 }}>✓</span>
              <span style={{ flex: 1 }}>{q.title}</span>
              <span style={{ fontSize: 9, color: '#555' }}>{q.settlementName}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Active tab ────────────────────────────────────────────────────────────────

function ActiveTab({ quests, onAbandon }: { quests: BoardQuest[]; onAbandon: (id: string) => void }) {
  if (quests.length === 0) {
    return (
      <div style={{ color: '#888', fontSize: 12, padding: '16px 8px', textAlign: 'center' }}>
        <div style={{ marginBottom: 8, fontSize: 20 }}>⚔️</div>
        No active quests. Accept quests from the Board tab.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {quests.map(q => (
        <BoardQuestCard key={q.id} quest={q} showAbandon onAbandon={() => onAbandon(q.id)} />
      ))}
    </div>
  )
}

// ── Board quest card ──────────────────────────────────────────────────────────

function BoardQuestCard({
  quest,
  showAccept,
  showAbandon,
  onAccept,
  onAbandon,
}: {
  quest: BoardQuest
  showAccept?: boolean
  showAbandon?: boolean
  onAccept?: () => void
  onAbandon?: () => void
}) {
  const progress = quest.progress
  const total = quest.targetCount
  const pct = total > 0 ? Math.min(100, (progress / total) * 100) : 0
  const typeColor = TYPE_COLORS[quest.type]
  const typeIcon = TYPE_ICONS[quest.type]

  return (
    <div style={{
      background: 'rgba(0,0,0,0.4)',
      border: `1px solid ${typeColor}33`,
      borderLeft: `3px solid ${typeColor}`,
      borderRadius: 4,
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>{typeIcon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e0d6c8' }}>{quest.title}</div>
          <div style={{ fontSize: 9, color: '#666', marginTop: 1 }}>{quest.settlementName}</div>
        </div>
      </div>

      {/* Description */}
      <div style={{ fontSize: 10, color: '#999', lineHeight: 1.4 }}>{quest.description}</div>

      {/* Progress bar (only when active) */}
      {quest.accepted && (
        <div style={{ marginTop: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888', marginBottom: 2 }}>
            <span>Progress</span>
            <span>{progress}/{total}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`,
              height: '100%',
              background: pct >= 100 ? '#2ecc71' : typeColor,
              borderRadius: 2,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Reward row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 10, color: '#f1c40f' }}>⭐ {quest.reward.xp} XP</span>
        <span style={{ fontSize: 10, color: '#f39c12' }}>💰 {quest.reward.gold} gold</span>
        <div style={{ flex: 1 }} />
        {showAccept && onAccept && (
          <button
            onClick={onAccept}
            style={{
              padding: '3px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 700,
              background: 'rgba(46,204,113,0.15)',
              border: '1px solid rgba(46,204,113,0.4)',
              borderRadius: 3,
              color: '#2ecc71',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            ACCEPT
          </button>
        )}
        {showAbandon && onAbandon && (
          <button
            onClick={onAbandon}
            style={{
              padding: '3px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 700,
              background: 'rgba(231,76,60,0.1)',
              border: '1px solid rgba(231,76,60,0.3)',
              borderRadius: 3,
              color: '#e74c3c',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            ABANDON
          </button>
        )}
      </div>
    </div>
  )
}

// ── Quest Log tab (milestone quests) ─────────────────────────────────────────

function LogTab({
  active,
  completed,
  expandedId,
  onToggle,
}: {
  active: Quest[]
  completed: Quest[]
  expandedId: string | null
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, padding: '0 2px 4px', borderBottom: '1px solid #222' }}>
        MILESTONE QUEST LOG
      </div>

      {active.length === 0 && (
        <div style={{ color: '#888', fontSize: 12, padding: '8px' }}>
          No active milestone quests.
        </div>
      )}

      {active.map(q => (
        <QuestCard
          key={q.id}
          quest={q}
          expanded={expandedId === q.id}
          onToggle={() => onToggle(q.id)}
        />
      ))}

      {completed.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, padding: '4px 0 2px', borderTop: '1px solid #222', marginTop: 4 }}>
            COMPLETED ({completed.length})
          </div>
          {completed.map(q => (
            <div key={q.id} style={{
              padding: '4px 8px', background: 'rgba(255,255,255,0.03)',
              borderRadius: '4px', fontSize: '11px', color: '#666',
              borderLeft: `3px solid ${CATEGORY_COLORS[q.category]}40`,
            }}>
              <span style={{ color: '#2ecc71' }}>&#10003;</span>{' '}
              {q.title}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Milestone quest card ──────────────────────────────────────────────────────

function QuestCard({ quest, expanded, onToggle }: { quest: Quest; expanded: boolean; onToggle: () => void }) {
  const totalProgress = quest.objectives.reduce((sum, o) => sum + Math.min(o.current / o.target, 1), 0)
  const progressPct = (totalProgress / quest.objectives.length) * 100

  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)', borderRadius: '6px',
      borderLeft: `3px solid ${CATEGORY_COLORS[quest.category]}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          padding: '8px 10px', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: '8px',
          background: expanded ? 'rgba(255,255,255,0.05)' : 'transparent',
        }}
      >
        <span style={{
          fontSize: '10px', fontWeight: 'bold',
          color: CATEGORY_COLORS[quest.category],
          background: `${CATEGORY_COLORS[quest.category]}20`,
          padding: '1px 4px', borderRadius: '2px',
        }}>
          {CATEGORY_ICONS[quest.category]}
        </span>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#e0d6c8' }}>
            {quest.title}
          </div>
          {/* Progress bar */}
          <div style={{
            height: '3px', background: '#333', borderRadius: '2px',
            marginTop: '3px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${progressPct}%`,
              background: progressPct >= 100 ? '#2ecc71' : CATEGORY_COLORS[quest.category],
              borderRadius: '2px', transition: 'width 0.3s',
            }} />
          </div>
        </div>

        <span style={{ fontSize: '11px', color: '#888' }}>
          {Math.round(progressPct)}%
        </span>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{ padding: '6px 10px 10px', fontSize: '11px' }}>
          <div style={{ color: '#999', marginBottom: '6px' }}>{quest.description}</div>

          {/* Objectives */}
          {quest.objectives.map((obj, i) => {
            const done = obj.current >= obj.target
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '2px 0', color: done ? '#2ecc71' : '#ccc',
              }}>
                <span style={{ fontSize: '10px' }}>{done ? '[\u2713]' : '[ ]'}</span>
                <span style={{ flex: 1 }}>{obj.description}</span>
                <span style={{ color: '#888', fontSize: '10px' }}>
                  {obj.current}/{obj.target}
                </span>
              </div>
            )
          })}

          {/* Rewards */}
          <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid #333' }}>
            <span style={{ fontSize: '10px', color: '#f39c12' }}>Rewards: </span>
            {quest.rewards.map((r, i) => (
              <span key={i} style={{ fontSize: '10px', color: '#ccc' }}>
                {r.type === 'xp' ? `+${r.amount} ${r.skillName} XP` :
                 r.type === 'gold' ? `+${r.amount}💰` :
                 r.type === 'recipe' ? 'Recipe unlock' :
                 `+${r.amount ?? 1} item`}
                {i < quest.rewards.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
