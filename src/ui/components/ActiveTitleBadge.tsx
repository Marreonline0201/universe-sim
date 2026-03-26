// ── ActiveTitleBadge.tsx ──────────────────────────────────────────────────────
// M50 Track A: Compact inline badge that displays the player's active
// reputation title. Clicking it opens the titles panel.

import { useState, useEffect } from 'react'
import { getActiveTitle, type ReputationTitle } from '../../game/ReputationTitleSystem'
import { useUiStore } from '../../store/uiStore'

const RARITY_COLORS: Record<ReputationTitle['rarity'], string> = {
  common:    '#888888',
  uncommon:  '#44cc66',
  rare:      '#4488ff',
  legendary: '#ffcc00',
}

export function ActiveTitleBadge() {
  const [title, setTitle] = useState<ReputationTitle | null>(getActiveTitle)
  const togglePanel = useUiStore(s => s.togglePanel)

  // Refresh whenever a rep-title event fires (dispatched by panel on equip)
  useEffect(() => {
    function onTitleChange() {
      setTitle(getActiveTitle())
    }
    window.addEventListener('rep-title-changed', onTitleChange)
    return () => window.removeEventListener('rep-title-changed', onTitleChange)
  }, [])

  if (!title) return null

  const color = RARITY_COLORS[title.rarity]

  return (
    <button
      onClick={() => togglePanel('titles')}
      title="View Titles & Reputation"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(0,0,0,0.55)',
        border: `1px solid ${color}44`,
        borderRadius: 4,
        padding: '2px 7px',
        cursor: 'pointer',
        fontFamily: 'monospace',
        fontSize: 11,
        color,
        letterSpacing: 0.4,
        lineHeight: 1.4,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(0,0,0,0.75)'
        e.currentTarget.style.borderColor = `${color}88`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(0,0,0,0.55)'
        e.currentTarget.style.borderColor = `${color}44`
      }}
    >
      <span>{title.icon}</span>
      <span>{title.name}</span>
    </button>
  )
}
