// ── NPCEmotionPanel ───────────────────────────────────────────────────────────
// M65 Track C: Displays all NPCs with their current mood, intensity, and history.

import { useState, useEffect, useCallback } from 'react'
import {
  getAllNPCEmotions,
  type NPCEmotion,
  type EmotionState,
} from '../../game/NPCEmotionSystem'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEmotionIcon(emotion: EmotionState): string {
  switch (emotion) {
    case 'happy':    return '😊'
    case 'content':  return '🙂'
    case 'neutral':  return '😐'
    case 'anxious':  return '😰'
    case 'angry':    return '😠'
    case 'scared':   return '😨'
    case 'grieving': return '😢'
  }
}

function getEmotionColor(emotion: EmotionState): string {
  switch (emotion) {
    case 'happy':    return '#22c55e'   // green
    case 'content':  return '#14b8a6'   // teal
    case 'neutral':  return '#6b7280'   // gray
    case 'anxious':  return '#eab308'   // yellow
    case 'angry':    return '#ef4444'   // red
    case 'scared':   return '#a855f7'   // purple
    case 'grieving': return '#1d4ed8'   // dark-blue
  }
}

function getEmotionLabel(emotion: EmotionState): string {
  switch (emotion) {
    case 'happy':    return 'Happy'
    case 'content':  return 'Content'
    case 'neutral':  return 'Neutral'
    case 'anxious':  return 'Anxious'
    case 'angry':    return 'Angry'
    case 'scared':   return 'Scared'
    case 'grieving': return 'Grieving'
  }
}

function formatSimTime(simSeconds: number): string {
  if (simSeconds <= 0) return 'start'
  const mins = Math.floor(simSeconds / 60)
  if (mins < 1) return `${Math.floor(simSeconds)}s`
  const hours = Math.floor(mins / 60)
  if (hours < 1) return `${mins}m`
  return `${hours}h ${mins % 60}m`
}

// ── NPC Card ──────────────────────────────────────────────────────────────────

function NPCCard({ npc }: { npc: NPCEmotion }) {
  const color = getEmotionColor(npc.emotion)
  const icon = getEmotionIcon(npc.emotion)
  const label = getEmotionLabel(npc.emotion)
  const recentHistory = npc.history.slice(-3)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header: name + icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: '#fff',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 0.5,
          }}>
            {npc.npcName}
          </div>
          <div style={{
            color,
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            {label}
          </div>
        </div>
      </div>

      {/* Intensity bar */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}>
          <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 10 }}>
            INTENSITY
          </span>
          <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 10 }}>
            {npc.intensity}%
          </span>
        </div>
        <div style={{
          height: 6,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${npc.intensity}%`,
            background: color,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Reason */}
      {npc.reason && (
        <div style={{
          color: '#aaa',
          fontFamily: 'monospace',
          fontSize: 10,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          "{npc.reason}"
        </div>
      )}

      {/* History */}
      {recentHistory.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
          <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 9, marginBottom: 4, letterSpacing: 0.5 }}>
            RECENT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentHistory.slice().reverse().map((entry, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: 0.6 + i * 0.1,
              }}>
                <span style={{ fontSize: 11 }}>{getEmotionIcon(entry.emotion)}</span>
                <span style={{ color: getEmotionColor(entry.emotion), fontFamily: 'monospace', fontSize: 9, fontWeight: 600 }}>
                  {getEmotionLabel(entry.emotion)}
                </span>
                <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 9, flex: 1, textAlign: 'right' }}>
                  @{formatSimTime(entry.at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function NPCEmotionPanel() {
  const [emotions, setEmotions] = useState<NPCEmotion[]>([])

  const refresh = useCallback(() => {
    setEmotions(getAllNPCEmotions())
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [refresh])

  if (emotions.length === 0) {
    return (
      <div style={{
        color: '#555',
        fontFamily: 'monospace',
        fontSize: 12,
        textAlign: 'center',
        padding: '32px 16px',
      }}>
        No NPC emotion data available.
        <br />
        <span style={{ opacity: 0.6, fontSize: 10 }}>
          Emotions load once the system initialises.
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary bar */}
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        padding: '8px 0',
        borderBottom: '1px solid #1a1a1a',
        marginBottom: 4,
      }}>
        {(['happy','content','neutral','anxious','angry','scared','grieving'] as EmotionState[]).map(emotion => {
          const count = emotions.filter(e => e.emotion === emotion).length
          if (count === 0) return null
          return (
            <div key={emotion} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: `${getEmotionColor(emotion)}18`,
              border: `1px solid ${getEmotionColor(emotion)}44`,
              borderRadius: 4,
              padding: '2px 6px',
            }}>
              <span style={{ fontSize: 11 }}>{getEmotionIcon(emotion)}</span>
              <span style={{
                color: getEmotionColor(emotion),
                fontFamily: 'monospace',
                fontSize: 10,
                fontWeight: 600,
              }}>
                {count}
              </span>
            </div>
          )
        })}
      </div>

      {/* NPC grid — 2 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
      }}>
        {emotions.map(npc => (
          <NPCCard key={npc.npcId} npc={npc} />
        ))}
      </div>
    </div>
  )
}
