// ── CaveFeaturesPanel.tsx ──────────────────────────────────────────────────
// M50 Track C: Cave biome enhancements — panel showing discoverable cave
// features. Visible only when the player is underground.

import React, { useState, useEffect, useCallback } from 'react'
import { useCaveStore } from '../../store/caveStore'
import { useUiStore } from '../../store/uiStore'
import { inventory } from '../../game/GameSingletons'
import {
  CAVE_FEATURES,
  harvestFeature,
  isFeatureAvailable,
  getFeatureTimeRemaining,
  type CaveFeature,
} from '../../game/CaveFeatureSystem'
import { MAT } from '../../player/Inventory'

// ── Material name lookup ───────────────────────────────────────────────────

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.replace(/_/g, ' ').toLowerCase()])
) as Record<number, string>

function matName(id: number): string {
  return MAT_NAMES[id] ?? `mat#${id}`
}

// ── Cooldown tick hook ─────────────────────────────────────────────────────

/** Re-render every second so cooldown countdowns stay live. */
function useTick(intervalMs = 1000): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}

// ── Feature row ────────────────────────────────────────────────────────────

interface FeatureRowProps {
  feature: CaveFeature
  tick: number
  onHarvest: (featureId: string) => void
}

function FeatureRow({ feature, tick: _tick, onHarvest }: FeatureRowProps) {
  const available = isFeatureAvailable(feature.id)
  const secsRemaining = available ? 0 : getFeatureTimeRemaining(feature.id)

  // Format seconds → "1m 30s" or just "45s"
  const cooldownLabel =
    secsRemaining >= 60
      ? `${Math.floor(secsRemaining / 60)}m ${secsRemaining % 60}s`
      : `${secsRemaining}s`

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '12px 14px',
        marginBottom: 8,
        opacity: available ? 1 : 0.65,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{feature.icon}</span>
        <span style={{ color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, flex: 1 }}>
          {feature.name}
        </span>
        <button
          onClick={() => onHarvest(feature.id)}
          disabled={!available}
          style={{
            background: available ? 'rgba(205,68,32,0.18)' : 'rgba(80,80,80,0.18)',
            border: `1px solid ${available ? '#cd4420' : '#444'}`,
            borderRadius: 4,
            color: available ? '#cd4420' : '#555',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            cursor: available ? 'pointer' : 'default',
            padding: '4px 10px',
            whiteSpace: 'nowrap',
            transition: 'all 0.12s',
          }}
        >
          {available ? 'Harvest' : `Available in ${cooldownLabel}`}
        </button>
      </div>

      {/* Description */}
      <div style={{ color: '#888', fontSize: 11, fontFamily: 'monospace', marginBottom: 8, lineHeight: 1.5 }}>
        {feature.description}
      </div>

      {/* Loot preview */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {feature.lootTable
          .filter((row, i, arr) => arr.findIndex(r => r.matId === row.matId) === i)  // deduplicate
          .map(row => (
            <span
              key={row.matId}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid #333',
                borderRadius: 3,
                padding: '2px 6px',
                fontSize: 10,
                fontFamily: 'monospace',
                color: '#aaa',
              }}
            >
              {matName(row.matId)}
              <span style={{ color: '#666', marginLeft: 3 }}>
                {Math.round(row.chance * 100)}%
              </span>
            </span>
          ))}
      </div>

      {/* Interact prompt */}
      <div style={{ marginTop: 6, color: '#555', fontSize: 10, fontFamily: 'monospace', fontStyle: 'italic' }}>
        {feature.interactPrompt}
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function CaveFeaturesPanel() {
  const underground = useCaveStore(s => s.underground)
  const addNotification = useUiStore(s => s.addNotification)
  const tick = useTick()

  const handleHarvest = useCallback((featureId: string) => {
    const drops = harvestFeature(featureId)
    if (drops.length === 0) return

    // Add items to inventory
    for (const drop of drops) {
      inventory.addItem({ itemId: 0, materialId: drop.matId, quantity: drop.qty, quality: 0.8 })
    }

    // Build notification message
    const label = drops
      .map(d => `+${d.qty} ${matName(d.matId)}`)
      .join(', ')

    const feature = CAVE_FEATURES.find(f => f.id === featureId)
    addNotification(`${feature?.icon ?? ''} ${label}`, 'info')
  }, [addNotification])

  // Empty state when not underground
  if (!underground) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        gap: 12,
        textAlign: 'center',
      }}>
        <span style={{ fontSize: 36 }}>⛏</span>
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7 }}>
          Enter a cave to discover its features.
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Section header */}
      <div style={{
        color: '#666',
        fontSize: 10,
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 12,
        paddingBottom: 6,
        borderBottom: '1px solid #222',
      }}>
        Cave Features — {CAVE_FEATURES.length} available
      </div>

      {CAVE_FEATURES.map(feature => (
        <FeatureRow
          key={feature.id}
          feature={feature}
          tick={tick}
          onHarvest={handleHarvest}
        />
      ))}
    </div>
  )
}
