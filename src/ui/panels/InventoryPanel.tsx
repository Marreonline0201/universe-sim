// ── InventoryPanel ─────────────────────────────────────────────────────────────
// M20: 8×5 grid with rich tooltips, category badges, and quality indicators.

import { useState, useEffect } from 'react'
import { inventory } from '../../game/GameSingletons'
import { MAT, ITEM, type InventorySlot, RARITY_COLORS, RARITY_NAMES, type RarityTier } from '../../player/Inventory'
import { usePlayerStore } from '../../store/playerStore'
import { getItemStats, getFoodStats } from '../../player/EquipSystem'
import { Metabolism } from '../../ecs/world'
import { useItemTooltip, getItemCategory, CATEGORY_COLORS, CATEGORY_LABELS } from './ItemTooltip'

// Reverse lookup maps for display names
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function SlotCell({ slot, index, selected, equipped, onSelect, onHoverEnter, onHoverLeave }: {
  slot: InventorySlot | null
  index: number
  selected: boolean
  equipped: boolean
  onSelect: (i: number) => void
  onHoverEnter: (slot: InventorySlot, e: React.MouseEvent, slotIndex?: number) => void
  onHoverLeave: () => void
}) {
  const category = slot ? getItemCategory(slot) : null
  const categoryColor = category ? CATEGORY_COLORS[category] : '#666'
  const categoryLabel = category ? CATEGORY_LABELS[category] : ''
  const rarity = (slot?.rarity ?? 0) as RarityTier
  const rarityColor = rarity > 0 ? RARITY_COLORS[rarity] : null

  return (
    <div
      onClick={() => onSelect(index)}
      onMouseEnter={slot ? (e) => onHoverEnter(slot, e, index) : undefined}
      onMouseLeave={slot ? onHoverLeave : undefined}
      style={{
        width: 52,
        height: 52,
        background: selected
          ? 'rgba(52,152,219,0.3)'
          : slot
            ? 'rgba(255,255,255,0.07)'
            : 'rgba(255,255,255,0.03)',
        border: selected
          ? '1px solid rgba(52,152,219,0.8)'
          : equipped
            ? '2px solid #22c55e'
            : rarityColor
              ? `1px solid ${rarityColor}`
              : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        cursor: slot ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        transition: 'all 0.1s',
        boxShadow: rarityColor ? `0 0 6px ${rarityColor}40` : undefined,
        animation: rarity === 4 ? 'legendary-pulse 2s ease-in-out infinite' : undefined,
      }}
    >
      {slot && (
        <>
          {/* Category badge (top-left) */}
          <div style={{
            position: 'absolute', top: 2, left: 3,
            fontSize: 7, fontWeight: 700,
            color: categoryColor,
            opacity: 0.8,
            letterSpacing: 0.5,
          }}>
            {categoryLabel}
          </div>

          <div style={{ fontSize: 10, color: '#ccc', textAlign: 'center', lineHeight: 1.2, padding: '0 2px', wordBreak: 'break-word', marginTop: 4 }}>
            {slot.itemId === 0
              ? (MAT_NAMES[slot.materialId] ?? '?')
              : (ITEM_NAMES[slot.itemId] ?? MAT_NAMES[slot.itemId] ?? '?')}
          </div>
          {slot.quantity > 1 && (
            <div style={{
              position: 'absolute', bottom: 2, right: 4,
              fontSize: 9, color: '#f1c40f', fontFamily: 'monospace',
            }}>
              x{slot.quantity}
            </div>
          )}
          {/* Quality bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
            background: `hsl(${slot.quality * 120}, 70%, 50%)`,
            borderRadius: '0 0 6px 6px',
          }} />
        </>
      )}
    </div>
  )
}

export function InventoryPanel() {
  const [selected, setSelected] = useState<number | null>(null)
  const [dropQty, setDropQty] = useState(1)
  const [, forceRefresh] = useState(0)

  const equippedSlot  = usePlayerStore(s => s.equippedSlot)
  const equipAction   = usePlayerStore(s => s.equip)
  const unequipAction = usePlayerStore(s => s.unequip)
  const updateVitals  = usePlayerStore(s => s.updateVitals)
  const entityId      = usePlayerStore(s => s.entityId)
  const gold          = usePlayerStore(s => s.gold)

  const { onMouseEnter, onMouseLeave, tooltipPortal } = useItemTooltip()

  // Poll inventory every 200ms so newly gathered items appear immediately
  useEffect(() => {
    const id = setInterval(() => forceRefresh(r => r + 1), 200)
    return () => clearInterval(id)
  }, [])

  function handleSelect(i: number) {
    setSelected(prev => {
      if (prev !== i) setDropQty(1)
      return prev === i ? null : i
    })
  }

  function handleDrop() {
    if (selected === null) return
    const slot = inventory.getSlot(selected)
    if (!slot) return
    const qty = Math.min(dropQty, slot.quantity)
    inventory.dropItem(selected, qty)
    if (selected === equippedSlot && qty >= slot.quantity) unequipAction()
    setSelected(null)
    setDropQty(1)
    forceRefresh(r => r + 1)
  }

  const selectedSlot = selected !== null ? inventory.getSlot(selected) : null
  const isEquippable = selectedSlot !== null && selectedSlot.itemId > 0
  const isEquipped   = selected !== null && equippedSlot === selected
  const foodStats    = selectedSlot ? getFoodStats(selectedSlot.materialId) : null

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace' }}>
      {/* M23: Legendary slot pulse animation */}
      <style>{`
        @keyframes legendary-pulse {
          0%, 100% { box-shadow: 0 0 6px #ff800040; }
          50% { box-shadow: 0 0 14px #ff8000aa, 0 0 4px #ff800066; }
        }
      `}</style>

      {/* M27: Gold balance header */}
      <div style={{
        marginBottom: 12,
        padding: '6px 10px',
        background: 'rgba(205,68,32,0.1)',
        border: '1px solid rgba(205,68,32,0.3)',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 700,
        color: '#f1c40f',
        letterSpacing: 1,
      }}>
        💰 {gold} Gold
      </div>

      {/* Tooltip portal — renders outside grid to avoid overflow */}
      {tooltipPortal}

      {/* 8-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 52px)', gap: 4 }}>
        {Array.from({ length: inventory.slotCount }, (_, i) => (
          <SlotCell
            key={i}
            index={i}
            slot={inventory.getSlot(i)}
            selected={selected === i}
            equipped={equippedSlot === i}
            onSelect={handleSelect}
            onHoverEnter={onMouseEnter}
            onHoverLeave={onMouseLeave}
          />
        ))}
      </div>

      {/* Selected item detail */}
      {selectedSlot && selected !== null && (
        <div style={{
          marginTop: 16,
          padding: 12,
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {selectedSlot.itemId === 0
              ? (MAT_NAMES[selectedSlot.materialId] ?? `material #${selectedSlot.materialId}`)
              : (ITEM_NAMES[selectedSlot.itemId] ?? `item #${selectedSlot.itemId}`)}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>
            Material: {selectedSlot.materialId === 0 ? '--' : (MAT_NAMES[selectedSlot.materialId] ?? selectedSlot.materialId)}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>
            Quantity: {selectedSlot.quantity}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>
            Quality: {Math.round(selectedSlot.quality * 100)}%
          </div>
          {isEquippable && (
            <button
              onClick={() => isEquipped ? unequipAction() : equipAction(selected!)}
              style={{
                padding: '4px 12px',
                marginRight: 8,
                background: isEquipped ? '#22c55e' : '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {isEquipped ? 'Unequip' : 'Equip'}
            </button>
          )}
          {foodStats && (
            <button
              onClick={() => {
                if (selected === null || !foodStats) return
                if (entityId !== null) {
                  Metabolism.hunger[entityId] = Math.max(0, Metabolism.hunger[entityId] - foodStats.hungerRestore)
                  Metabolism.thirst[entityId] = Math.max(0, Metabolism.thirst[entityId] - foodStats.thirstRestore)
                } else {
                  const current = usePlayerStore.getState()
                  updateVitals({
                    hunger: Math.max(0, current.hunger - foodStats.hungerRestore),
                    thirst: Math.max(0, current.thirst - foodStats.thirstRestore),
                  })
                }
                inventory.removeItem(selected, 1)
                setSelected(null)
              }}
              style={{
                padding: '4px 12px',
                marginRight: 8,
                background: '#f59e0b',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Eat
            </button>
          )}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {[1, 10, 100].map(n => (
              <button
                key={n}
                onClick={() => setDropQty(Math.min(n, selectedSlot.quantity))}
                style={{
                  padding: '3px 7px',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  background: dropQty === n ? 'rgba(231,76,60,0.35)' : 'rgba(231,76,60,0.1)',
                  border: dropQty === n ? '1px solid rgba(231,76,60,0.8)' : '1px solid rgba(231,76,60,0.3)',
                  borderRadius: 4,
                  color: '#e74c3c',
                  cursor: 'pointer',
                }}
              >
                {n}x
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={selectedSlot.quantity}
              value={dropQty}
              onChange={e => {
                const v = Math.max(1, Math.min(parseInt(e.target.value) || 1, selectedSlot.quantity))
                setDropQty(v)
              }}
              style={{
                width: 46,
                padding: '3px 5px',
                fontSize: 11,
                fontFamily: 'monospace',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                color: '#fff',
                textAlign: 'center',
              }}
            />
            <button
              onClick={handleDrop}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                background: 'rgba(231,76,60,0.2)',
                border: '1px solid rgba(231,76,60,0.5)',
                borderRadius: 4,
                color: '#e74c3c',
                cursor: 'pointer',
              }}
            >
              Drop
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {inventory.listItems().length === 0 && (
        <div style={{ marginTop: 32, textAlign: 'center', color: '#555', fontSize: 12 }}>
          Your inventory is empty.<br />Explore the world to gather materials.
        </div>
      )}
    </div>
  )
}
