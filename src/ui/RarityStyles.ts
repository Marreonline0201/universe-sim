// ── RarityStyles.ts ──────────────────────────────────────────────────────────
// M51 Track C: Shared rarity style utilities used across inventory, crafting,
// and merchant UI panels.

import type React from 'react'

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export const RARITY_COLOR: Record<ItemRarity, string> = {
  common:    '#9ca3af',   // gray
  uncommon:  '#4ade80',   // green
  rare:      '#60a5fa',   // blue
  epic:      '#a78bfa',   // purple
  legendary: '#fbbf24',   // gold
}

export const RARITY_LABEL: Record<ItemRarity, string> = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  epic:      'Epic',
  legendary: 'Legendary',
}

export const RARITY_GLOW: Record<ItemRarity, string> = {
  common:    'none',
  uncommon:  '0 0 6px rgba(74,222,128,0.4)',
  rare:      '0 0 8px rgba(96,165,250,0.5)',
  epic:      '0 0 10px rgba(167,139,250,0.6)',
  legendary: '0 0 14px rgba(251,191,36,0.7)',
}

/** Returns border color for a rarity */
export function rarityBorder(rarity: ItemRarity): string {
  return RARITY_COLOR[rarity]
}

/** Returns a small badge element style for inline rarity display */
export function rarityBadgeStyle(rarity: ItemRarity): React.CSSProperties {
  const color = RARITY_COLOR[rarity]
  return {
    display: 'inline-block',
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 0.8,
    color,
    border: `1px solid ${color}`,
    borderRadius: 3,
    padding: '0 3px',
    lineHeight: '14px',
    opacity: 0.95,
    textTransform: 'uppercase' as const,
    fontFamily: 'monospace',
  }
}

/** Infers rarity from a numeric rarity value (0=common, 1=uncommon, 2=rare, 3=epic, 4=legendary) */
export function rarityFromLevel(level: number): ItemRarity {
  if (level <= 0) return 'common'
  if (level === 1) return 'uncommon'
  if (level === 2) return 'rare'
  if (level === 3) return 'epic'
  return 'legendary'
}
