// ── BestiaryPanel.tsx ─────────────────────────────────────────────────────────
// M49 Track C: Bestiary — lists all enemy variants with stats, biome tags, loot preview.
// Accessible from SidebarShell panel key 'bestiary'.

import React, { useState } from 'react'
import { ENEMY_VARIANTS, getEliteVariant, type EnemyVariant } from '../../game/EnemyVariantSystem'
import { MAT } from '../../player/Inventory'

// ── Material name lookup ──────────────────────────────────────────────────────
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([name, id]) => [id, name.replace(/_/g, ' ').toLowerCase()])
) as Record<number, string>

function matName(id: number): string {
  return MAT_NAMES[id] ?? `mat#${id}`
}

// ── Category filter config ────────────────────────────────────────────────────
const CATEGORIES: Array<{ label: string; biome: string | null }> = [
  { label: 'All',      biome: null },
  { label: 'Forest',   biome: 'forest' },
  { label: 'Desert',   biome: 'desert' },
  { label: 'Cave',     biome: 'cave' },
  { label: 'Snow',     biome: 'snow' },
  { label: 'Volcanic', biome: 'volcanic' },
]

const BIOME_COLORS: Record<string, string> = {
  forest:     '#4ade80',
  taiga:      '#34d399',
  desert:     '#fbbf24',
  cave:       '#94a3b8',
  underground:'#64748b',
  snow:       '#7dd3fc',
  tundra:     '#93c5fd',
  volcanic:   '#f97316',
  lava:       '#ef4444',
}

// ── Sort options ──────────────────────────────────────────────────────────────
type SortKey = 'xp' | 'hp' | 'damage'

function sortVariants(variants: EnemyVariant[], key: SortKey): EnemyVariant[] {
  return [...variants].sort((a, b) => {
    if (key === 'xp')     return b.xpReward   - a.xpReward
    if (key === 'hp')     return b.baseHp      - a.baseHp
    if (key === 'damage') return b.baseDamage  - a.baseDamage
    return 0
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BiomeTag({ biome }: { biome: string }) {
  const color = BIOME_COLORS[biome] ?? '#888'
  return (
    <span style={{
      fontSize: 8,
      fontFamily: 'monospace',
      color,
      background: `${color}22`,
      border: `1px solid ${color}55`,
      borderRadius: 3,
      padding: '1px 4px',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}>
      {biome}
    </span>
  )
}

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid rgba(255,255,255,0.08)`,
      borderRadius: 4,
      padding: '3px 6px',
      minWidth: 40,
    }}>
      <span style={{ fontSize: 7, color: '#666', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}

interface VariantCardProps {
  variant: EnemyVariant
  isExpanded: boolean
  onToggle: () => void
}

function VariantCard({ variant, isExpanded, onToggle }: VariantCardProps) {
  const eliteVersion = getEliteVariant(variant.id)
  const topLoot = variant.lootTable.slice(0, 2)

  return (
    <div
      onClick={onToggle}
      style={{
        background: variant.isElite ? 'rgba(251,191,36,0.07)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${variant.isElite ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6,
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{variant.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#eee', fontFamily: 'monospace' }}>
              {variant.species}
            </span>
            {variant.isElite && (
              <span style={{ fontSize: 10, color: '#fbbf24' }} title="Elite variant">⭐</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
            {variant.biome.map(b => <BiomeTag key={b} biome={b} />)}
          </div>
        </div>
        {/* XP badge */}
        <div style={{
          fontSize: 9,
          fontFamily: 'monospace',
          color: '#a78bfa',
          background: 'rgba(167,139,250,0.12)',
          border: '1px solid rgba(167,139,250,0.3)',
          borderRadius: 3,
          padding: '2px 6px',
          whiteSpace: 'nowrap',
        }}>
          {variant.xpReward} XP
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <StatPill label="HP"  value={variant.baseHp}    color="#4ade80" />
        <StatPill label="DMG" value={variant.baseDamage} color="#f87171" />
        <StatPill label="SPD" value={`${variant.speed.toFixed(1)}x`} color="#38bdf8" />
      </div>

      {/* Description */}
      <div style={{ fontSize: 10, color: '#888', lineHeight: 1.4, marginBottom: 6 }}>
        {variant.description}
      </div>

      {/* Loot preview — top 2 items */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {topLoot.map((entry, i) => (
          <div key={i} style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: '#facc15',
            background: 'rgba(250,204,21,0.08)',
            border: '1px solid rgba(250,204,21,0.2)',
            borderRadius: 3,
            padding: '2px 6px',
          }}>
            {matName(entry.matId)} ×{entry.qty}
            <span style={{ color: '#888', marginLeft: 2 }}>
              ({Math.round(entry.chance * 100)}%)
            </span>
          </div>
        ))}
        {variant.lootTable.length > 2 && (
          <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace', alignSelf: 'center' }}>
            +{variant.lootTable.length - 2} more
          </span>
        )}
      </div>

      {/* Expanded: full loot + elite preview */}
      {isExpanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
          {/* Full loot table */}
          <div style={{ fontSize: 9, color: '#aaa', fontFamily: 'monospace', marginBottom: 8 }}>
            <span style={{ color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 8 }}>Full Loot Table</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              {variant.lootTable.map((entry, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{matName(entry.matId)}</span>
                  <span style={{ color: '#facc15' }}>×{entry.qty} · {Math.round(entry.chance * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Elite variant preview */}
          <div style={{
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: 4,
            padding: '6px 8px',
          }}>
            <div style={{ fontSize: 9, color: '#fbbf24', fontFamily: 'monospace', fontWeight: 700, marginBottom: 4 }}>
              ⭐ Elite: {eliteVersion.species}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <StatPill label="HP"  value={eliteVersion.baseHp}    color="#4ade80" />
              <StatPill label="DMG" value={eliteVersion.baseDamage} color="#f87171" />
              <StatPill label="XP"  value={eliteVersion.xpReward}  color="#a78bfa" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BestiaryPanel() {
  const [categoryBiome, setCategoryBiome] = useState<string | null>(null)
  const [sortKey, setSortKey]             = useState<SortKey>('xp')
  const [expandedId, setExpandedId]       = useState<string | null>(null)

  const filtered = categoryBiome === null
    ? ENEMY_VARIANTS
    : ENEMY_VARIANTS.filter(v => v.biome.includes(categoryBiome))

  const sorted = sortVariants(filtered, sortKey)

  function handleToggle(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  return (
    <div style={{ padding: 12, color: '#ccc', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#eee' }}>
          Bestiary
        </span>
        <span style={{ fontSize: 11, color: '#888' }}>
          {sorted.length}/{ENEMY_VARIANTS.length} entries
        </span>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {CATEGORIES.map(cat => {
          const active = categoryBiome === cat.biome
          return (
            <button
              key={cat.label}
              onClick={() => setCategoryBiome(cat.biome)}
              style={{
                padding: '2px 8px',
                fontSize: 9,
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                background: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 3,
                color: active ? '#eee' : '#888',
                cursor: 'pointer',
              }}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Sort controls */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sort:</span>
        {(['xp', 'hp', 'damage'] as SortKey[]).map(key => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            style={{
              padding: '2px 7px',
              fontSize: 9,
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              background: sortKey === key ? 'rgba(205,68,32,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${sortKey === key ? '#cd4420' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 3,
              color: sortKey === key ? '#cd4420' : '#888',
              cursor: 'pointer',
            }}
          >
            {key === 'xp' ? 'XP' : key === 'hp' ? 'HP' : 'Dmg'}
          </button>
        ))}
      </div>

      {/* Entry list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.length === 0 ? (
          <div style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 24 }}>
            No enemies found for this biome.
          </div>
        ) : (
          sorted.map(variant => (
            <VariantCard
              key={variant.id}
              variant={variant}
              isExpanded={expandedId === variant.id}
              onToggle={() => handleToggle(variant.id)}
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div style={{ fontSize: 9, color: '#444', textAlign: 'center', marginTop: 12 }}>
        Click any entry to see full loot table and elite stats.
      </div>
    </div>
  )
}
