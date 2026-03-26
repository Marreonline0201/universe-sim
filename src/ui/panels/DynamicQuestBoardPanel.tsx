// ── DynamicQuestBoardPanel.tsx ────────────────────────────────────────────────
// M65 Track B: Dynamic Quest Board UI — procedural quests, difficulty badges

import React, { useState, useCallback } from 'react'
import { useGameStore } from '../../store/gameStore'
import {
  getBoardQuests,
  acceptBoardQuest,
  completeBoardQuest,
  getNextRefreshIn,
  type BoardQuest,
  type QuestDifficulty,
} from '../../game/DynamicQuestBoardSystem'

const REFRESH_INTERVAL = 300

// ── Difficulty badge colors ───────────────────────────────────────────────────

const DIFFICULTY_COLOR: Record<QuestDifficulty, { bg: string; text: string; border: string }> = {
  easy:      { bg: 'rgba(34, 197, 94, 0.15)',  text: '#22c55e', border: '#22c55e' },
  medium:    { bg: 'rgba(234, 179, 8, 0.15)',  text: '#eab308', border: '#eab308' },
  hard:      { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: '#f97316' },
  legendary: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: '#a855f7' },
}

const DIFFICULTY_LABEL: Record<QuestDifficulty, string> = {
  easy: 'EASY',
  medium: 'MEDIUM',
  hard: 'HARD',
  legendary: 'LEGENDARY',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: QuestDifficulty }) {
  const colors = DIFFICULTY_COLOR[difficulty]
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 3,
      fontSize: 9,
      fontFamily: 'monospace',
      fontWeight: 700,
      letterSpacing: 1,
      background: colors.bg,
      color: colors.text,
      border: `1px solid ${colors.border}`,
    }}>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  )
}

interface QuestCardProps {
  quest: BoardQuest
  onAccept?: (id: string) => void
  onComplete?: (id: string) => void
}

function QuestCard({ quest, onAccept, onComplete }: QuestCardProps) {
  const colors = DIFFICULTY_COLOR[quest.difficulty]
  const isActive = quest.accepted && !quest.completed

  return (
    <div style={{
      background: isActive ? 'rgba(20, 28, 20, 0.6)' : 'rgba(20, 20, 20, 0.5)',
      border: `1px solid ${isActive ? colors.border : '#2a2a2a'}`,
      borderLeft: `3px solid ${colors.border}`,
      borderRadius: 5,
      padding: '12px 14px',
      marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <DifficultyBadge difficulty={quest.difficulty} />
        {quest.timeLimit > 0 && (
          <span style={{ color: '#666', fontFamily: 'monospace', fontSize: 10 }}>
            ⏱ {Math.round(quest.timeLimit / 60)}m limit
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        color: '#e8e8e8',
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 700,
        marginBottom: 4,
      }}>
        {quest.title}
      </div>

      {/* Description */}
      <div style={{
        color: '#888',
        fontFamily: 'monospace',
        fontSize: 11,
        marginBottom: 8,
        lineHeight: 1.4,
      }}>
        {quest.description}
      </div>

      {/* Objective */}
      <div style={{
        color: '#aaa',
        fontFamily: 'monospace',
        fontSize: 11,
        padding: '5px 8px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #333',
        borderRadius: 3,
        marginBottom: 8,
      }}>
        <span style={{ color: '#666' }}>OBJECTIVE: </span>
        {quest.objective}
      </div>

      {/* Rewards */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#f0c040', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
          💰 {quest.reward.gold}g
        </span>
        <span style={{ color: '#60a0e0', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
          ✨ {quest.reward.xp} XP
        </span>
        {quest.reward.item && (
          <span style={{ color: '#c080e0', fontFamily: 'monospace', fontSize: 11 }}>
            🎁 {quest.reward.item}
          </span>
        )}
      </div>

      {/* Action button */}
      {!quest.accepted && onAccept && (
        <button
          onClick={() => onAccept(quest.id)}
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: '5px 14px',
            borderRadius: 3,
            cursor: 'pointer',
            width: '100%',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          ACCEPT QUEST
        </button>
      )}

      {isActive && onComplete && (
        <button
          onClick={() => onComplete(quest.id)}
          style={{
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid #22c55e',
            color: '#22c55e',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: '5px 14px',
            borderRadius: 3,
            cursor: 'pointer',
            width: '100%',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          COMPLETE QUEST
        </button>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function DynamicQuestBoardPanel() {
  const simSeconds = useGameStore(s => s.simSeconds)
  const [, forceUpdate] = useState(0)

  const refresh = useCallback(() => forceUpdate(n => n + 1), [])

  const quests = getBoardQuests()
  const activeQuests = quests.filter(q => q.accepted && !q.completed)
  const availableQuests = quests.filter(q => !q.accepted && !q.completed)

  const nextRefresh = getNextRefreshIn(simSeconds)
  const nextRefreshMin = Math.floor(nextRefresh / 60)
  const nextRefreshSec = Math.round(nextRefresh % 60)

  const handleAccept = useCallback((id: string) => {
    acceptBoardQuest(id)
    refresh()
  }, [refresh])

  const handleComplete = useCallback((id: string) => {
    completeBoardQuest(id)
    refresh()
  }, [refresh])

  // Group available quests by difficulty
  const byDifficulty: Record<QuestDifficulty, BoardQuest[]> = {
    easy: [],
    medium: [],
    hard: [],
    legendary: [],
  }
  for (const q of availableQuests) {
    byDifficulty[q.difficulty].push(q)
  }

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>
      {/* Board header with refresh timer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0 14px',
        borderBottom: '1px solid #2a2a2a',
        marginBottom: 16,
      }}>
        <div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
            📋 Quest Board
          </div>
          <div style={{ color: '#555', fontSize: 10, marginTop: 2 }}>
            Procedurally generated bounties from the guild
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid #333',
          borderRadius: 4,
          padding: '6px 10px',
          textAlign: 'center',
        }}>
          <div style={{ color: '#555', fontSize: 9, letterSpacing: 1 }}>REFRESH IN</div>
          <div style={{ color: '#cd4420', fontSize: 13, fontWeight: 700 }}>
            {nextRefreshMin}:{nextRefreshSec.toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* Active quests section */}
      {activeQuests.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            color: '#22c55e',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2,
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span>ACTIVE QUESTS</span>
            <span style={{
              background: 'rgba(34,197,94,0.15)',
              border: '1px solid #22c55e',
              borderRadius: 3,
              padding: '1px 6px',
              fontSize: 10,
            }}>
              {activeQuests.length}
            </span>
          </div>
          {activeQuests.map(q => (
            <QuestCard
              key={q.id}
              quest={q}
              onComplete={handleComplete}
            />
          ))}
        </div>
      )}

      {/* Available quests section */}
      <div>
        <div style={{
          color: '#777',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          marginBottom: 12,
        }}>
          AVAILABLE QUESTS
        </div>

        {availableQuests.length === 0 ? (
          <div style={{
            color: '#444',
            fontSize: 12,
            textAlign: 'center',
            padding: '24px 0',
          }}>
            No quests available right now. Check back after the next refresh.
          </div>
        ) : (
          (['easy', 'medium', 'hard', 'legendary'] as QuestDifficulty[]).map(diff => {
            const diffQuests = byDifficulty[diff]
            if (diffQuests.length === 0) return null
            return (
              <div key={diff} style={{ marginBottom: 8 }}>
                {diffQuests.map(q => (
                  <QuestCard
                    key={q.id}
                    quest={q}
                    onAccept={handleAccept}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Footer info */}
      <div style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid #2a2a2a',
        color: '#444',
        fontSize: 10,
        textAlign: 'center',
        lineHeight: 1.5,
      }}>
        Board holds 6 quests • Refreshes every {REFRESH_INTERVAL / 60}m
        <br />
        Accepted quests persist across refreshes
      </div>
    </div>
  )
}
