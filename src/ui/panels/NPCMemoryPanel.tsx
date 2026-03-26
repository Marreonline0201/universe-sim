// ── NPCMemoryPanel ─────────────────────────────────────────────────────────────
// M63 Track B: Displays NPC memory state and contextual dialogue greetings.

import { useState, useEffect, useCallback } from 'react'
import {
  getAllMemories,
  getContextualGreeting,
  type NPCMemory,
  type MemoryType,
} from '../../game/NPCMemorySystem'
import {
  getRelationship,
  getRelationshipTierColor,
  type NPCRelationship,
} from '../../game/NPCRelationshipSystem'

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(simSeconds: number): string {
  const elapsed = Math.floor(Date.now() / 1000 - simSeconds)
  if (elapsed < 5)   return 'just now'
  if (elapsed < 60)  return `${elapsed}s ago`
  const mins = Math.floor(elapsed / 60)
  if (mins < 60)     return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)      return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getMemoryColor(type: MemoryType): string {
  switch (type) {
    case 'attacked':   return '#ef4444'
    case 'gifted':     return '#a78bfa'
    case 'traded':     return '#38bdf8'
    case 'helped':     return '#4ade80'
    case 'met_famous': return '#f59e0b'
    case 'seen_storm': return '#64748b'
    case 'saw_crime':  return '#f97316'
  }
}

function getMemoryLabel(type: MemoryType): string {
  switch (type) {
    case 'attacked':   return 'Attacked'
    case 'gifted':     return 'Gifted'
    case 'traded':     return 'Traded'
    case 'helped':     return 'Helped'
    case 'met_famous': return 'Boss Slayer'
    case 'seen_storm': return 'Storm Buddy'
    case 'saw_crime':  return 'Witnessed Crime'
  }
}

// ── Memory chip ───────────────────────────────────────────────────────────────

function MemoryChip({ memory }: { memory: NPCMemory }) {
  const color = getMemoryColor(memory.type)
  return (
    <span
      title={`${memory.detail} (weight: ${memory.weight})`}
      style={{
        padding: '2px 6px',
        fontSize: 8,
        fontFamily: 'monospace',
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        background: `${color}20`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        color,
        flexShrink: 0,
        cursor: 'default',
      }}
    >
      {getMemoryLabel(memory.type)}
    </span>
  )
}

// ── NPC Memory Card ───────────────────────────────────────────────────────────

interface NPCMemoryCardProps {
  npcId: string
  memories: NPCMemory[]
}

function NPCMemoryCard({ npcId, memories }: NPCMemoryCardProps) {
  const rel: NPCRelationship | null = getRelationship(npcId)

  const npcName = rel?.npcName ?? npcId
  const npcRole = rel?.npcRole ?? 'unknown'
  const tier = rel?.tier ?? 'neutral'
  const tierColor = getRelationshipTierColor(tier)

  const greeting = getContextualGreeting(npcId, npcName, npcRole)

  // Most recent memory timestamp
  const lastSeen = memories.length > 0
    ? Math.max(...memories.map(m => m.simSeconds))
    : 0

  // Sort memories: highest weight first
  const sortedMems = [...memories].sort((a, b) => b.weight - a.weight)

  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderLeft: `3px solid ${tierColor}55`,
      borderRadius: 4,
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
    }}>
      {/* Row 1: Name + role + tier */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 12,
            color: '#ddd',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {npcName}
          </span>
          <span style={{
            padding: '1px 5px',
            fontSize: 7,
            fontFamily: 'monospace',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 2,
            color: '#888',
            flexShrink: 0,
          }}>
            {npcRole}
          </span>
        </div>
        <span style={{
          padding: '2px 6px',
          fontSize: 8,
          fontFamily: 'monospace',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          background: `${tierColor}22`,
          border: `1px solid ${tierColor}55`,
          borderRadius: 3,
          color: tierColor,
          flexShrink: 0,
        }}>
          {tier}
        </span>
      </div>

      {/* Row 2: Greeting (contextual dialogue) */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: 9,
        color: '#9ca3af',
        fontStyle: 'italic',
        lineHeight: 1.5,
        padding: '5px 8px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 3,
      }}>
        "{greeting}"
      </div>

      {/* Row 3: Memory chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {sortedMems.map((mem, i) => (
          <MemoryChip key={i} memory={mem} />
        ))}
      </div>

      {/* Row 4: Last seen */}
      {lastSeen > 0 && (
        <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#444' }}>
          Last seen: {relativeTime(lastSeen)}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function NPCMemoryPanel() {
  const [entries, setEntries] = useState<Array<{ npcId: string; memories: NPCMemory[] }>>([])

  const refresh = useCallback(() => {
    const all = getAllMemories()
    const arr = Array.from(all.entries())
      .map(([npcId, memories]) => ({ npcId, memories }))
      // Sort: most memories first, then alphabetically
      .sort((a, b) => b.memories.length - a.memories.length || a.npcId.localeCompare(b.npcId))
    setEntries(arr)
  }, [])

  // Initial load + 10s fallback poll
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 10_000)
    return () => clearInterval(id)
  }, [refresh])

  // Refresh on relevant events
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('npc-gift', handler)
    window.addEventListener('npc-trade', handler)
    window.addEventListener('npc-attacked', handler)
    window.addEventListener('boss-defeated', handler)
    window.addEventListener('weather-event-started', handler)
    return () => {
      window.removeEventListener('npc-gift', handler)
      window.removeEventListener('npc-trade', handler)
      window.removeEventListener('npc-attacked', handler)
      window.removeEventListener('boss-defeated', handler)
      window.removeEventListener('weather-event-started', handler)
    }
  }, [refresh])

  const totalNPCs = entries.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Subtitle */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: 9,
        color: '#555',
        marginBottom: 12,
        letterSpacing: 0.5,
      }}>
        {totalNPCs} NPC{totalNPCs !== 1 ? 's' : ''} with memories
      </div>

      {/* NPC list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.length === 0 ? (
          <div style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 11,
            textAlign: 'center',
            padding: '40px 16px',
            lineHeight: 1.6,
          }}>
            No NPC memories recorded yet.{'\n'}
            Interact with the world to create memories.
          </div>
        ) : (
          entries.map(({ npcId, memories }) => (
            <NPCMemoryCard key={npcId} npcId={npcId} memories={memories} />
          ))
        )}
      </div>
    </div>
  )
}
