// ── DiscoveriesPanel.tsx ──────────────────────────────────────────────────────
// M54 Track C: Shows all location discoveries made while exploring the world.

import React, { useState, useEffect } from 'react'
import {
  getDiscoveries,
  getDiscoveredCount,
  getTotalCount,
  type WorldDiscovery,
  type DiscoveryCategory,
} from '../../game/ExplorationDiscoverySystem'

// ── Category colours ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<DiscoveryCategory, string> = {
  ruins:           '#f97316',
  shrine:          '#a78bfa',
  camp:            '#6b7280',
  landmark:        '#fbbf24',
  dungeon_entrance:'#ef4444',
  hidden_cache:    '#4ade80',
}

const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  ruins:           'Ruins',
  shrine:          'Shrine',
  camp:            'Camp',
  landmark:        'Landmark',
  dungeon_entrance:'Dungeon',
  hidden_cache:    'Cache',
}

// ── Time-ago helper ───────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Discovery row ─────────────────────────────────────────────────────────────

function DiscoveryRow({ d }: { d: WorldDiscovery }) {
  const color = CATEGORY_COLORS[d.category] ?? '#888'
  const label = CATEGORY_LABELS[d.category] ?? d.category

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
        padding: '8px 10px',
        marginBottom: 6,
      }}
    >
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 16 }}>{d.icon}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#eee', fontFamily: 'monospace' }}>
          {d.name}
        </span>
        {/* Category badge */}
        <span
          style={{
            fontSize: 8,
            color,
            background: `${color}22`,
            border: `1px solid ${color}55`,
            borderRadius: 3,
            padding: '1px 4px',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </span>
        {/* Gold reward badge */}
        <span
          style={{
            fontSize: 9,
            color: '#fbbf24',
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: 3,
            padding: '1px 5px',
            fontFamily: 'monospace',
          }}
        >
          +{d.rewardGold}g
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: 10, color: '#888', marginBottom: 3, paddingLeft: 22 }}>
        {d.description}
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 9, color: '#555', paddingLeft: 22, fontFamily: 'monospace' }}>
        Found: {timeAgo(d.discoveredAt)}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function DiscoveriesPanel() {
  // Re-render every 5 s so "X ago" timestamps stay fresh + new discoveries appear
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 5_000)
    return () => clearInterval(id)
  }, [])

  const discoveries = getDiscoveries()
  const discovered = getDiscoveredCount()
  const total = getTotalCount()
  const pct = total > 0 ? (discovered / total) * 100 : 0

  return (
    <div style={{ fontFamily: 'monospace', color: '#ccc' }}>

      {/* Header + counter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>
          EXPLORATIONS
        </span>
        <span style={{ fontSize: 10, color: '#888' }}>
          {discovered} / {total} discovered
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 5,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #f97316, #fbbf24)',
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Discovery list */}
      {discoveries.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: '#555',
            fontSize: 12,
          }}
        >
          Explore the world to find hidden locations.
        </div>
      ) : (
        <div>
          {discoveries.map(d => (
            <DiscoveryRow key={d.id} d={d} />
          ))}
        </div>
      )}
    </div>
  )
}
