// ── QuestPanel.tsx ──────────────────────────────────────────────────────────
// M23 Track B: Quest log UI — shows active quests with progress bars,
// completed quests collapsed, and locked quests hidden.
// Hotkey: Q. Registered in SidebarShell as lazy-loaded panel.

import { useState, useEffect } from 'react'
import { questSystem } from '../../game/GameSingletons'
import type { Quest, QuestCategory } from '../../game/QuestSystem'

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

export function QuestPanel() {
  const [, forceRefresh] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Poll every 500ms for quest progress updates
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 500)
    return () => clearInterval(id)
  }, [])

  const active = questSystem.getActiveQuests()
  const completed = questSystem.getCompletedQuests()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '8px',
      fontFamily: '"Courier New", monospace', color: '#e0d6c8',
      maxHeight: '100%', overflow: 'auto',
    }}>
      <h3 style={{ margin: 0, fontSize: '14px', color: '#f39c12', borderBottom: '1px solid #555', paddingBottom: '6px' }}>
        QUEST LOG
      </h3>

      {/* Active Quests */}
      {active.length === 0 && (
        <div style={{ color: '#888', fontSize: '12px', padding: '8px' }}>
          No active quests. Explore the world to unlock new objectives.
        </div>
      )}

      {active.map(q => (
        <QuestCard
          key={q.id}
          quest={q}
          expanded={expandedId === q.id}
          onToggle={() => setExpandedId(expandedId === q.id ? null : q.id)}
        />
      ))}

      {/* Completed Quests */}
      {completed.length > 0 && (
        <>
          <h4 style={{ margin: '8px 0 4px', fontSize: '12px', color: '#888', borderTop: '1px solid #444', paddingTop: '8px' }}>
            COMPLETED ({completed.length})
          </h4>
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
