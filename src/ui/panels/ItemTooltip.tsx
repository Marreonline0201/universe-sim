// ── ItemTooltip ───────────────────────────────────────────────────────────────
// M20 Track C: Rich hover tooltip for inventory and crafting items.
//
// Shows item name (colored by quality), type badge, quantity, quality bar,
// and stats (damage/speed for tools, hunger/thirst restore for food).
// Positioned above the hovered element via React portal to avoid overflow issues.

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { InventorySlot, RarityTier } from '../../player/Inventory'
import { MAT, ITEM, RARITY_COLORS, RARITY_NAMES } from '../../player/Inventory'
import { getItemStats, getFoodStats } from '../../player/EquipSystem'

// ── Name lookups ────────────────────────────────────────────────────────────
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

// ── Quality-based color ─────────────────────────────────────────────────────
function qualityColor(q: number): string {
  if (q >= 0.9) return '#e5c07b'  // legendary gold
  if (q >= 0.7) return '#c678dd'  // epic purple
  if (q >= 0.5) return '#61afef'  // rare blue
  if (q >= 0.3) return '#98c379'  // uncommon green
  return '#abb2bf'                 // common grey
}

function qualityLabel(q: number): string {
  if (q >= 0.9) return 'Legendary'
  if (q >= 0.7) return 'Epic'
  if (q >= 0.5) return 'Rare'
  if (q >= 0.3) return 'Uncommon'
  return 'Common'
}

// ── Category detection ──────────────────────────────────────────────────────
export type ItemCategory = 'tool' | 'food' | 'metal' | 'building' | 'organic' | 'misc'

export function getItemCategory(slot: InventorySlot): ItemCategory {
  if (slot.itemId > 0) return 'tool'
  const matId = slot.materialId
  // Food items
  if (matId === MAT.BERRY || matId === MAT.COOKED_MEAT || matId === MAT.RAW_MEAT ||
      matId === MAT.FISH || matId === MAT.COOKED_FISH) return 'food'
  // Metals
  if (matId === MAT.IRON_ORE || matId === MAT.IRON_INGOT || matId === MAT.COPPER_ORE ||
      matId === MAT.COPPER_INGOT || matId === MAT.TIN_ORE || matId === MAT.TIN_INGOT ||
      matId === MAT.BRONZE_INGOT || matId === MAT.GOLD_ORE || matId === MAT.GOLD_INGOT ||
      matId === MAT.STEEL_INGOT || matId === MAT.CAST_IRON) return 'metal'
  // Building materials
  if (matId === MAT.STONE || matId === MAT.CLAY || matId === MAT.BRICK ||
      matId === MAT.SAND || matId === MAT.GLASS) return 'building'
  // Organic
  if (matId === MAT.WOOD || matId === MAT.FIBER || matId === MAT.LEATHER ||
      matId === MAT.CHARCOAL) return 'organic'
  return 'misc'
}

export const CATEGORY_COLORS: Record<ItemCategory, string> = {
  tool: '#61afef',
  food: '#98c379',
  metal: '#e5c07b',
  building: '#888',
  organic: '#56b6c2',
  misc: '#666',
}

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  tool: 'TL',
  food: 'FD',
  metal: 'MT',
  building: 'BL',
  organic: 'OR',
  misc: '--',
}

// ── Tooltip content ─────────────────────────────────────────────────────────

interface TooltipProps {
  slot: InventorySlot
  anchorRect: DOMRect
}

function TooltipContent({ slot, anchorRect }: TooltipProps) {
  const name = slot.itemId === 0
    ? (MAT_NAMES[slot.materialId] ?? `material #${slot.materialId}`)
    : (ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)

  const category = getItemCategory(slot)
  const color = qualityColor(slot.quality)
  const label = qualityLabel(slot.quality)
  const itemStats = slot.itemId > 0 ? getItemStats(slot.itemId) : null
  const foodStats = getFoodStats(slot.materialId)

  // Position tooltip above the anchor, clamped to viewport
  const tooltipWidth = 200
  const tooltipHeight = 140 // approximate
  let left = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2
  let top = anchorRect.top - tooltipHeight - 8

  // Clamp to viewport
  if (left < 8) left = 8
  if (left + tooltipWidth > window.innerWidth - 8) left = window.innerWidth - tooltipWidth - 8
  if (top < 8) top = anchorRect.bottom + 8 // flip below if no room above

  return (
    <div style={{
      position: 'fixed',
      left,
      top,
      width: tooltipWidth,
      padding: '10px 12px',
      background: 'rgba(20,20,20,0.96)',
      border: `1px solid ${color}44`,
      borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      zIndex: 300,
      pointerEvents: 'none',
      fontFamily: 'monospace',
      color: '#ccc',
    }}>
      {/* M23: Rarity badge at the top of the tooltip */}
      {(slot.rarity ?? 0) > 0 && (
        <div style={{
          fontSize: 10, fontWeight: 700,
          color: RARITY_COLORS[(slot.rarity ?? 0) as RarityTier],
          marginBottom: 4, letterSpacing: 1,
        }}>
          {RARITY_NAMES[(slot.rarity ?? 0) as RarityTier].toUpperCase()}
        </div>
      )}

      {/* Name */}
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4, textTransform: 'capitalize' }}>
        {name}
      </div>

      {/* Category + quality */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 6 }}>
        <span style={{ color: CATEGORY_COLORS[category] }}>
          {category}
        </span>
        <span style={{ color }}>
          {label} ({Math.round(slot.quality * 100)}%)
        </span>
      </div>

      {/* Quality bar */}
      <div style={{
        height: 3,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginBottom: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${slot.quality * 100}%`,
          background: color,
          borderRadius: 2,
        }} />
      </div>

      {/* Quantity */}
      {slot.quantity > 1 && (
        <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
          Quantity: {slot.quantity}
        </div>
      )}

      {/* Tool stats */}
      {itemStats && itemStats.damage > 0 && (
        <div style={{ fontSize: 10, color: '#e06c75', marginBottom: 2 }}>
          Damage: {itemStats.damage} | Speed: {itemStats.speed.toFixed(1)} | Range: {itemStats.range.toFixed(1)}m
        </div>
      )}

      {/* Food stats */}
      {foodStats && (
        <div style={{ fontSize: 10, color: '#98c379', marginBottom: 2 }}>
          Restores: {foodStats.hungerRestore > 0 ? `Hunger -${Math.round(foodStats.hungerRestore * 100)}%` : ''}
          {foodStats.thirstRestore > 0 ? ` Thirst -${Math.round(foodStats.thirstRestore * 100)}%` : ''}
        </div>
      )}

      {/* Material info */}
      {slot.itemId === 0 && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
          Raw material
        </div>
      )}
    </div>
  )
}

// ── Hook: useItemTooltip ────────────────────────────────────────────────────
// Returns { onMouseEnter, onMouseLeave, tooltipPortal }
// Attach the handlers to the slot element; render tooltipPortal in the component.

export function useItemTooltip() {
  const [tooltip, setTooltip] = useState<{ slot: InventorySlot; rect: DOMRect } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onMouseEnter = useCallback((slot: InventorySlot, e: React.MouseEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setTooltip({ slot, rect })
    }, 150) // 150ms delay to avoid flicker
  }, [])

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setTooltip(null)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const tooltipPortal = tooltip
    ? createPortal(
        <TooltipContent slot={tooltip.slot} anchorRect={tooltip.rect} />,
        document.body,
      )
    : null

  return { onMouseEnter, onMouseLeave, tooltipPortal }
}
