// ── RelationshipPanel ─────────────────────────────────────────────────────────
// M51 Track B: View and filter NPC relationships with the player.

import { useState, useEffect } from 'react'
import {
  getAllRelationships,
  getRelationshipTierColor,
  type NPCRelationship,
  type RelationshipTier,
} from '../../game/NPCRelationshipSystem'

type FilterTab = 'all' | 'friendly' | 'hostile'

const TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all',      label: 'All' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'hostile',  label: 'Hostile' },
]

const FRIENDLY_TIERS: RelationshipTier[] = ['friendly', 'trusted', 'beloved']
const HOSTILE_TIERS:  RelationshipTier[] = ['hostile', 'unfriendly']

function relativeTime(ts: number): string {
  const elapsed = Math.floor((Date.now() - ts) / 1000)
  if (elapsed < 5)  return 'just now'
  if (elapsed < 60) return `${elapsed}s ago`
  const mins = Math.floor(elapsed / 60)
  if (mins < 60)    return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function AffinityBar({ affinity, tier }: { affinity: number; tier: RelationshipTier }) {
  const color = getRelationshipTierColor(tier)
  // Bar spans -100 to 100. Zero is at center (50%).
  // Width = |affinity| / 100 * 50%
  const widthPct = (Math.abs(affinity) / 100) * 50
  const isNeg = affinity < 0

  return (
    <div style={{
      position: 'relative',
      height: 6,
      background: 'rgba(255,255,255,0.06)',
      borderRadius: 3,
      overflow: 'hidden',
    }}>
      {/* Zero-center line */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        width: 1,
        height: '100%',
        background: 'rgba(255,255,255,0.15)',
      }} />
      {/* Fill */}
      <div style={{
        position: 'absolute',
        top: 0,
        height: '100%',
        width: `${widthPct}%`,
        left: isNeg ? `${50 - widthPct}%` : '50%',
        background: color,
        borderRadius: 3,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function RelationshipCard({ rel }: { rel: NPCRelationship }) {
  const color = getRelationshipTierColor(rel.tier)
  const lastTwoNotes = rel.notes.slice(-2)

  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderLeft: `3px solid ${color}55`,
      borderRadius: 4,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Row 1: Name + role badge + tier badge */}
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
            {rel.npcName}
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
            {rel.npcRole}
          </span>
        </div>
        <span style={{
          padding: '2px 6px',
          fontSize: 8,
          fontFamily: 'monospace',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          background: `${color}22`,
          border: `1px solid ${color}55`,
          borderRadius: 3,
          color: color,
          flexShrink: 0,
        }}>
          {rel.tier}
        </span>
      </div>

      {/* Row 2: Affinity bar */}
      <AffinityBar affinity={rel.affinity} tier={rel.tier} />

      {/* Row 3: Affinity value + interaction count + last seen */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 9,
          color: rel.affinity >= 0 ? color : color,
          fontWeight: 700,
        }}>
          {rel.affinity >= 0 ? '+' : ''}{rel.affinity}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#555' }}>
            {rel.interactions} interaction{rel.interactions !== 1 ? 's' : ''}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 8, color: '#444' }}>
            Last seen: {relativeTime(rel.lastSeen)}
          </span>
        </div>
      </div>

      {/* Row 4: Notes */}
      {lastTwoNotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {lastTwoNotes.map((note, i) => (
            <span key={i} style={{
              fontFamily: 'monospace',
              fontSize: 8,
              color: '#555',
              fontStyle: 'italic',
            }}>
              · {note}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function RelationshipPanel() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [relationships, setRelationships] = useState<NPCRelationship[]>([])
  const [, setTick] = useState(0)

  // Refresh data and timestamps periodically
  useEffect(() => {
    function refresh() {
      setRelationships(getAllRelationships())
    }
    refresh()
    const id = setInterval(() => {
      refresh()
      setTick(t => t + 1)
    }, 15_000)
    return () => clearInterval(id)
  }, [])

  const filtered = relationships.filter(rel => {
    if (activeTab === 'all')      return true
    if (activeTab === 'friendly') return FRIENDLY_TIERS.includes(rel.tier)
    if (activeTab === 'hostile')  return HOSTILE_TIERS.includes(rel.tier)
    return true
  })

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
        {relationships.length} NPC{relationships.length !== 1 ? 's' : ''} encountered
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const accentColor = tab.id === 'friendly' ? '#4ade80' : tab.id === 'hostile' ? '#ef4444' : '#cd4420'
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '3px 10px',
                fontSize: 9,
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: `1px solid ${isActive ? accentColor : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 3,
                background: isActive ? `${accentColor}22` : 'transparent',
                color: isActive ? accentColor : '#666',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#aaa'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#666'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Relationship list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.length === 0 ? (
          <div style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: 11,
            textAlign: 'center',
            padding: '40px 16px',
            lineHeight: 1.6,
          }}>
            {relationships.length === 0
              ? 'No NPCs encountered yet.\nInteract with the world to build relationships.'
              : `No ${activeTab} NPCs found.`}
          </div>
        ) : (
          filtered.map(rel => <RelationshipCard key={rel.npcId} rel={rel} />)
        )}
      </div>
    </div>
  )
}
