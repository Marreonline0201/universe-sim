// ── NPCSchedulePanel.tsx ───────────────────────────────────────────────────
// M55 Track A: NPC Daily Schedules Display.
// Shows all NPC roles, their current activity, and a 24-hour schedule timeline.

import React, { useState, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import {
  SCHEDULES,
  NPC_ROLE_SCHEDULES,
  getCurrentActivity,
  getInGameHour,
  getNPCName,
  getActivityDescription,
  getTimeOfDay,
  type NPCActivity,
} from '../../game/NPCScheduleSystem'

// ── Constants ───────────────────────────────────────────────────────────────

const ROLE_ICONS: Record<string, string> = {
  guard:      '⚔️',
  trader:     '💰',
  villager:   '🏘️',
  elder:      '📜',
  scout:      '🏹',
  artisan:    '🔨',
  healer:     '💊',
  blacksmith: '⚒️',
  scholar:    '📚',
}

const ROLE_DISPLAY: Record<string, string> = {
  guard:      'Guard',
  trader:     'Merchant',
  villager:   'Villager',
  elder:      'Elder',
  scout:      'Scout',
  artisan:    'Artisan',
  healer:     'Healer',
  blacksmith: 'Blacksmith',
  scholar:    'Scholar',
}

const ACTIVITY_COLORS: Record<NPCActivity, string> = {
  working:    '#2ecc71',
  eating:     '#e6b93a',
  sleeping:   '#555',
  patrolling: '#3498db',
  socializing:'#9b59b6',
}

const ACTIVITY_ICONS: Record<NPCActivity, string> = {
  working:    '⚙️',
  eating:     '🍖',
  sleeping:   '💤',
  patrolling: '👁️',
  socializing:'🗣️',
}

// AVAILABLE when working, eating, socializing, patrolling. SLEEPING is not.
function getStatusBadge(activity: NPCActivity): { label: string; color: string; bg: string } {
  if (activity === 'sleeping') {
    return { label: 'SLEEPING', color: '#888', bg: 'rgba(80,80,80,0.25)' }
  }
  if (activity === 'working' || activity === 'eating') {
    return { label: 'BUSY', color: '#e6b93a', bg: 'rgba(230,185,58,0.18)' }
  }
  // socializing, patrolling → available
  return { label: 'AVAILABLE', color: '#2ecc71', bg: 'rgba(46,204,113,0.18)' }
}

// All NPC roles from the SCHEDULES object
const ALL_ROLES = Object.keys(SCHEDULES)

// Build display NPC list: one per role, seeded from settlement 1
const NPC_LIST = ALL_ROLES.map((role, index) => ({
  role,
  name: getNPCName(1, role, index),
  icon: ROLE_ICONS[role] ?? '👤',
  displayRole: ROLE_DISPLAY[role] ?? role.charAt(0).toUpperCase() + role.slice(1),
}))

// ── Timeline bar ────────────────────────────────────────────────────────────

function ScheduleTimeline({ role, currentHour }: { role: string; currentHour: number }) {
  const schedule = SCHEDULES[role] ?? SCHEDULES.villager
  const totalWidth = 100 // percent

  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 4, overflow: 'hidden', background: '#1a1a1a', marginTop: 6 }}>
      {schedule.map((entry, i) => {
        const start = entry.startHour
        const end = entry.endHour
        // Handle midnight-wrap segments (e.g. sleeping 21–6)
        if (start > end) {
          // Split into two segments: start→24 and 0→end
          const seg1Width = ((24 - start) / 24) * totalWidth
          const seg1Left  = (start / 24) * totalWidth
          const seg2Width = (end / 24) * totalWidth
          return (
            <React.Fragment key={i}>
              <div style={{
                position: 'absolute',
                left: `${seg1Left}%`,
                width: `${seg1Width}%`,
                height: '100%',
                background: ACTIVITY_COLORS[entry.activity],
                opacity: 0.85,
              }} title={entry.activity} />
              <div style={{
                position: 'absolute',
                left: '0%',
                width: `${seg2Width}%`,
                height: '100%',
                background: ACTIVITY_COLORS[entry.activity],
                opacity: 0.85,
              }} title={entry.activity} />
            </React.Fragment>
          )
        }
        const segWidth = ((end - start) / 24) * totalWidth
        const segLeft  = (start / 24) * totalWidth
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${segLeft}%`,
              width: `${segWidth}%`,
              height: '100%',
              background: ACTIVITY_COLORS[entry.activity],
              opacity: 0.85,
            }}
            title={entry.activity}
          />
        )
      })}
      {/* Current time cursor */}
      <div style={{
        position: 'absolute',
        left: `${(currentHour / 24) * 100}%`,
        top: 0,
        bottom: 0,
        width: 2,
        background: '#fff',
        opacity: 0.9,
        borderRadius: 1,
      }} />
    </div>
  )
}

// ── NPC Card ─────────────────────────────────────────────────────────────────

function NPCCard({ npc, currentHour }: { npc: typeof NPC_LIST[0]; currentHour: number }) {
  const currentEntry = getCurrentActivity(npc.role, (currentHour / 24) * 2 * Math.PI)
  const status = getStatusBadge(currentEntry.activity)
  const activityIcon = ACTIVITY_ICONS[currentEntry.activity] ?? '❓'

  // Get verbose description from time-of-day system
  const tod = getTimeOfDay(currentHour)
  const roleSchedule = NPC_ROLE_SCHEDULES[npc.role]
  const todSlot = roleSchedule?.[tod]
  const activityDesc = todSlot
    ? todSlot.activity.charAt(0).toUpperCase() + todSlot.activity.slice(1)
    : getActivityDescription(currentEntry.activity, npc.name, npc.role).replace(`${npc.name} is `, '')

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid #222',
      borderRadius: 6,
      padding: '10px 12px',
      marginBottom: 8,
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#333')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#222')}
    >
      {/* Top row: icon + name + role badge + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 16 }}>{npc.icon}</span>
        <span style={{ color: '#ddd', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, flex: 1 }}>
          {npc.name}
        </span>
        <span style={{
          fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
          color: '#aaa', background: 'rgba(255,255,255,0.06)',
          padding: '2px 6px', borderRadius: 3, letterSpacing: 1,
        }}>
          {npc.displayRole.toUpperCase()}
        </span>
        <span style={{
          fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
          color: status.color, background: status.bg,
          padding: '2px 6px', borderRadius: 3, letterSpacing: 1,
        }}>
          {status.label}
        </span>
      </div>

      {/* Activity row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 12 }}>{activityIcon}</span>
        <span style={{ color: '#999', fontFamily: 'monospace', fontSize: 11 }}>
          {activityDesc}
          {todSlot && (
            <span style={{ color: '#555', marginLeft: 6 }}>
              @ {todSlot.location}
            </span>
          )}
        </span>
      </div>

      {/* 24h timeline */}
      <ScheduleTimeline role={npc.role} currentHour={currentHour} />

      {/* Hour labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        {[0, 6, 12, 18, 24].map(h => (
          <span key={h} style={{ color: '#333', fontFamily: 'monospace', fontSize: 8 }}>
            {h === 24 ? '0' : h}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Legend ───────────────────────────────────────────────────────────────────

function ActivityLegend() {
  const activities: NPCActivity[] = ['working', 'patrolling', 'eating', 'socializing', 'sleeping']
  const labels: Record<NPCActivity, string> = {
    working:    'Working',
    patrolling: 'Patrol',
    eating:     'Eating',
    socializing:'Social',
    sleeping:   'Sleeping',
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {activities.map(act => (
        <div key={act} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: ACTIVITY_COLORS[act] }} />
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#666' }}>{labels[act]}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function NPCSchedulePanel() {
  const dayAngle = useGameStore(s => s.dayAngle)
  const [search, setSearch] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [tick, setTick] = useState(0)

  // Re-render every 5 real seconds to reflect time advances
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  const currentHour = getInGameHour(dayAngle)
  const hourDisplay = `${String(Math.floor(currentHour)).padStart(2, '0')}:${String(Math.floor((currentHour % 1) * 60)).padStart(2, '0')}`
  const tod = getTimeOfDay(currentHour)

  // Filter NPCs
  const filtered = NPC_LIST.filter(npc => {
    const q = search.trim().toLowerCase()
    if (q && !npc.name.toLowerCase().includes(q) && !npc.role.toLowerCase().includes(q) && !npc.displayRole.toLowerCase().includes(q)) {
      return false
    }
    if (availableOnly) {
      const entry = getCurrentActivity(npc.role, dayAngle)
      const status = getStatusBadge(entry.activity)
      if (status.label !== 'AVAILABLE') return false
    }
    return true
  })

  const availableCount = NPC_LIST.filter(npc => {
    const entry = getCurrentActivity(npc.role, dayAngle)
    return getStatusBadge(entry.activity).label === 'AVAILABLE'
  }).length

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>
      {/* Time header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid #222',
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>IN-GAME TIME</div>
          <div style={{ fontSize: 18, color: '#fff', fontWeight: 700, letterSpacing: 2 }}>{hourDisplay}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>PERIOD</div>
          <div style={{ fontSize: 12, color: '#e6b93a', letterSpacing: 1 }}>{tod.toUpperCase()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>AVAILABLE</div>
          <div style={{ fontSize: 18, color: '#2ecc71', fontWeight: 700 }}>{availableCount}/{NPC_LIST.length}</div>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Search by name or role..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333',
            borderRadius: 4,
            padding: '6px 10px',
            color: '#ccc',
            fontFamily: 'monospace',
            fontSize: 11,
            outline: 'none',
          }}
        />
        <button
          onClick={() => setAvailableOnly(v => !v)}
          style={{
            padding: '6px 10px',
            background: availableOnly ? 'rgba(46,204,113,0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${availableOnly ? '#2ecc71' : '#333'}`,
            borderRadius: 4,
            color: availableOnly ? '#2ecc71' : '#666',
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          AVAILABLE NOW
        </button>
      </div>

      {/* Legend */}
      <ActivityLegend />

      {/* NPC count */}
      <div style={{ fontSize: 10, color: '#444', marginBottom: 8, letterSpacing: 1 }}>
        SHOWING {filtered.length} OF {NPC_LIST.length} NPCs
      </div>

      {/* NPC cards */}
      {filtered.length === 0 ? (
        <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: 24 }}>
          No NPCs match your filters.
        </div>
      ) : (
        filtered.map(npc => (
          <NPCCard key={npc.role} npc={npc} currentHour={currentHour} />
        ))
      )}
    </div>
  )
}
