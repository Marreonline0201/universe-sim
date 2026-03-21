// ── JournalPanel ───────────────────────────────────────────────────────────────
// Scrollable list of discovered journal entries grouped by category.

import { useState, useEffect } from 'react'
import { journal } from '../../game/GameSingletons'
import type { Discovery } from '../../player/DiscoveryJournal'

const CATEGORY_LABELS: Record<Discovery['category'], string> = {
  physics:      '⚛ Physics',
  chemistry:    '🧪 Chemistry',
  biology:      '🌱 Biology',
  technology:   '⚙ Technology',
  social:       '👥 Social',
  cosmic:       '🌌 Cosmic',
}

const CATEGORY_COLORS: Record<Discovery['category'], string> = {
  physics:    '#3498db',
  chemistry:  '#9b59b6',
  biology:    '#2ecc71',
  technology: '#f39c12',
  social:     '#e67e22',
  cosmic:     '#1abc9c',
}

function formatSimTime(secs: number): string {
  if (secs < 60)         return `${secs.toFixed(1)} s`
  if (secs < 3600)       return `${(secs / 60).toFixed(1)} min`
  if (secs < 86400)      return `${(secs / 3600).toFixed(1)} hr`
  if (secs < 31_557_600) return `${(secs / 86400).toFixed(1)} days`
  const years = secs / 31_557_600
  if (years < 1000)      return `${years.toFixed(1)} yr`
  if (years < 1e6)       return `${(years / 1000).toFixed(2)} kyr`
  return `${(years / 1e6).toFixed(2)} Myr`
}

export function JournalPanel() {
  const [activeCategory, setActiveCategory] = useState<Discovery['category'] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [, forceRefresh] = useState(0)

  // Poll every 500ms so new journal entries appear without reopening the panel
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 500)
    return () => clearInterval(id)
  }, [])

  const allDiscoveries = journal.getAll()
  const filtered = activeCategory
    ? allDiscoveries.filter(d => d.category === activeCategory)
    : allDiscoveries

  const categories = Array.from(
    new Set(allDiscoveries.map(d => d.category))
  ) as Discovery['category'][]

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace' }}>
      {/* Stats */}
      <div style={{
        marginBottom: 12, padding: '8px 12px',
        background: 'rgba(26,188,156,0.1)',
        border: '1px solid rgba(26,188,156,0.3)',
        borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 18 }}>📖</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1abc9c' }}>
            {allDiscoveries.length} discoveries
          </div>
          <div style={{ fontSize: 10, color: '#888' }}>across {categories.length} categories</div>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        <button
          onClick={() => setActiveCategory(null)}
          style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
            background: !activeCategory ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${!activeCategory ? '#fff' : '#333'}`,
            color: !activeCategory ? '#fff' : '#888',
          }}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              background: activeCategory === cat ? `${CATEGORY_COLORS[cat]}33` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${activeCategory === cat ? CATEGORY_COLORS[cat] : '#333'}`,
              color: activeCategory === cat ? CATEGORY_COLORS[cat] : '#888',
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Discovery entries */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', fontSize: 12, marginTop: 32 }}>
          No discoveries yet.<br />Explore and interact with the world.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map(d => {
          const color = CATEGORY_COLORS[d.category]
          const isExpanded = expanded === String(d.id)
          return (
            <div
              key={d.id}
              onClick={() => setExpanded(isExpanded ? null : String(d.id))}
              style={{
                padding: '8px 10px',
                background: isExpanded ? `${color}15` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isExpanded ? color : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>{d.name}</span>
                <span style={{ fontSize: 9, color: '#555' }}>{formatSimTime(d.timestamp)}</span>
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                {CATEGORY_LABELS[d.category]}
              </div>
              {isExpanded && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
                    {d.description}
                  </div>
                  {d.unlocks.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 10, color: '#2ecc71' }}>
                      Unlocks: {d.unlocks.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
