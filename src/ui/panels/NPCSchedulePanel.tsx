// -- NPCSchedulePanel.tsx
// M68 Track B: NPC Daily Schedule System UI

import { useState, useEffect } from 'react'
import {
  getAllNPCActivities,
  getNPCFullSchedule,
  getCurrentTimeOfDay,
  getDayProgress,
  SCHEDULED_NPCS,
  type TimeOfDay,
  type ScheduleEntry,
} from '../../game/NPCScheduleSystem'

const TIME_BLOCKS: Array<{ id: TimeOfDay; label: string; icon: string }> = [
  { id: 'dawn',      label: 'Dawn',      icon: '🌅' },
  { id: 'morning',   label: 'Morning',   icon: '☀️' },
  { id: 'afternoon', label: 'Afternoon', icon: '🌤' },
  { id: 'evening',   label: 'Evening',   icon: '🌇' },
  { id: 'night',     label: 'Night',     icon: '🌙' },
]

const MOOD_COLORS: Record<string, string> = {
  peaceful: '#a78bfa',
  focused: '#38bdf8',
  absorbed: '#34d399',
  serene: '#c084fc',
  tired: '#94a3b8',
  grumpy: '#f97316',
  industrious: '#fb923c',
  busy: '#fbbf24',
  relaxed: '#4ade80',
  exhausted: '#64748b',
  vigilant: '#60a5fa',
  stern: '#ef4444',
  alert: '#facc15',
  methodical: '#38bdf8',
  weary: '#94a3b8',
  content: '#86efac',
  cheerful: '#fde68a',
  compassionate: '#f9a8d4',
  restful: '#c4b5fd',
  hurried: '#f87171',
  energetic: '#4ade80',
  shrewd: '#fb923c',
  calculating: '#94a3b8',
  satisfied: '#86efac',
}

function getMoodColor(mood: string): string {
  return MOOD_COLORS[mood] ?? '#6b7280'
}

interface NPCCardProps {
  npc: typeof SCHEDULED_NPCS[number]
  current: ScheduleEntry
  currentTimeOfDay: TimeOfDay
}

function NPCCard({ npc, current, currentTimeOfDay }: NPCCardProps) {
  const [expanded, setExpanded] = useState(false)
  const fullSchedule = getNPCFullSchedule(npc.id)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: '12px 14px',
      marginBottom: 8,
    }}>
      {/* NPC header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 24 }}>{npc.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{npc.name}</div>
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>{npc.role.toUpperCase()}</div>
        </div>
        <div style={{
          fontSize: 11,
          color: getMoodColor(current.mood),
          background: 'rgba(0,0,0,0.3)',
          padding: '2px 8px',
          borderRadius: 12,
          border: `1px solid ${getMoodColor(current.mood)}44`,
        }}>
          {current.mood}
        </div>
      </div>

      {/* Current activity */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 20 }}>{current.icon}</span>
        <div>
          <div style={{ color: '#cbd5e1', fontSize: 13 }}>{current.location}</div>
          <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>{current.activity}</div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          background: 'none',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          color: '#64748b',
          fontSize: 11,
          cursor: 'pointer',
          padding: '3px 10px',
          width: '100%',
          letterSpacing: 0.5,
        }}
      >
        {expanded ? 'HIDE SCHEDULE' : 'VIEW FULL SCHEDULE'}
      </button>

      {/* Full schedule expansion */}
      {expanded && (
        <div style={{ marginTop: 8 }}>
          {fullSchedule.map(({ timeOfDay, entry }) => {
            const block = TIME_BLOCKS.find(b => b.id === timeOfDay)
            const isActive = timeOfDay === currentTimeOfDay
            return (
              <div
                key={timeOfDay}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  borderRadius: 4,
                  marginBottom: 3,
                  background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border: isActive ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                }}
              >
                <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.5 }}>{block?.icon}</span>
                <div style={{ minWidth: 60, fontSize: 11, color: isActive ? '#a5b4fc' : '#475569' }}>
                  {block?.label}
                </div>
                <span style={{ fontSize: 16 }}>{entry.icon}</span>
                <div>
                  <div style={{ fontSize: 12, color: isActive ? '#cbd5e1' : '#64748b' }}>{entry.location}</div>
                  <div style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>{entry.activity}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function NPCSchedulePanel() {
  const [activities, setActivities] = useState(() => getAllNPCActivities())
  const [tod, setTod] = useState<TimeOfDay>(() => getCurrentTimeOfDay())
  const [progress, setProgress] = useState(() => getDayProgress())

  // Refresh on schedule change event
  useEffect(() => {
    function onScheduleChanged() {
      setActivities(getAllNPCActivities())
      setTod(getCurrentTimeOfDay())
      setProgress(getDayProgress())
    }
    window.addEventListener('npc-schedule-changed', onScheduleChanged)
    return () => window.removeEventListener('npc-schedule-changed', onScheduleChanged)
  }, [])

  const todBlock = TIME_BLOCKS.find(b => b.id === tod)

  return (
    <div style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#94a3b8', marginBottom: 4 }}>
          NPC DAILY SCHEDULES
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>{todBlock?.icon}</span>
          <span style={{ fontSize: 14, color: '#e2e8f0' }}>{todBlock?.label}</span>
        </div>
        {/* Day progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ fontSize: 10, color: '#475569', marginTop: 3, textAlign: 'right' }}>
          Day {Math.round(progress * 100)}% complete
        </div>
      </div>

      {/* Time block indicator row */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {TIME_BLOCKS.map(block => {
          const isActive = block.id === tod
          return (
            <div
              key={block.id}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '4px 2px',
                borderRadius: 4,
                background: isActive ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                border: isActive ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div style={{ fontSize: 14 }}>{block.icon}</div>
              <div style={{ fontSize: 9, color: isActive ? '#a5b4fc' : '#475569', letterSpacing: 0.5 }}>
                {block.label.toUpperCase()}
              </div>
            </div>
          )
        })}
      </div>

      {/* NPC activity cards */}
      {activities.map(({ npc, current }) => (
        <NPCCard
          key={npc.id}
          npc={npc}
          current={current}
          currentTimeOfDay={tod}
        />
      ))}
    </div>
  )
}
