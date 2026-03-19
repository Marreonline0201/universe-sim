// ── InventoryPanel ─────────────────────────────────────────────────────────────
// 8×5 grid of inventory slots. Reads from GameSingletons.inventory.

import { useState } from 'react'
import { inventory } from '../../game/GameSingletons'
import { MAT, ITEM, type InventorySlot } from '../../player/Inventory'

// Reverse lookup maps for display names
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function SlotCell({ slot, index, selected, onSelect }: {
  slot: InventorySlot | null
  index: number
  selected: boolean
  onSelect: (i: number) => void
}) {
  return (
    <div
      onClick={() => onSelect(index)}
      title={slot ? `${ITEM_NAMES[slot.itemId] ?? slot.itemId} (${MAT_NAMES[slot.materialId] ?? slot.materialId}) ×${slot.quantity}` : ''}
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
          : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        cursor: slot ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        transition: 'all 0.1s',
      }}
    >
      {slot && (
        <>
          <div style={{ fontSize: 11, color: '#ccc', textAlign: 'center', lineHeight: 1.2, padding: '0 2px' }}>
            {ITEM_NAMES[slot.itemId]?.split(' ')[0] ?? '?'}
          </div>
          <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
            {MAT_NAMES[slot.materialId]?.split(' ')[0] ?? ''}
          </div>
          {slot.quantity > 1 && (
            <div style={{
              position: 'absolute', bottom: 2, right: 4,
              fontSize: 9, color: '#f1c40f', fontFamily: 'monospace',
            }}>
              ×{slot.quantity}
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
  const [, forceRefresh] = useState(0)

  function handleSelect(i: number) {
    setSelected(prev => prev === i ? null : i)
  }

  function handleDrop() {
    if (selected === null) return
    inventory.removeItem(selected, 1)
    setSelected(null)
    forceRefresh(r => r + 1)
  }

  const selectedSlot = selected !== null ? inventory.getSlot(selected) : null

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace' }}>
      {/* 8×5 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 52px)', gap: 4 }}>
        {Array.from({ length: 40 }, (_, i) => (
          <SlotCell
            key={i}
            index={i}
            slot={inventory.getSlot(i)}
            selected={selected === i}
            onSelect={handleSelect}
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
            {ITEM_NAMES[selectedSlot.itemId] ?? `item #${selectedSlot.itemId}`}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>
            Material: {MAT_NAMES[selectedSlot.materialId] ?? selectedSlot.materialId}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>
            Quantity: {selectedSlot.quantity}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 10 }}>
            Quality: {Math.round(selectedSlot.quality * 100)}%
          </div>
          <button
            onClick={handleDrop}
            style={{
              background: 'rgba(231,76,60,0.2)',
              border: '1px solid rgba(231,76,60,0.5)',
              borderRadius: 4,
              color: '#e74c3c',
              cursor: 'pointer',
              padding: '4px 12px',
              fontSize: 11,
            }}
          >
            Drop 1
          </button>
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
