// ── InventoryPanel ─────────────────────────────────────────────────────────────
// 8×5 grid of inventory slots. Reads from GameSingletons.inventory.

import { useState, useEffect } from 'react'
import { inventory } from '../../game/GameSingletons'
import { MAT, ITEM, type InventorySlot } from '../../player/Inventory'
import { usePlayerStore } from '../../store/playerStore'
import { getItemStats, getFoodStats } from '../../player/EquipSystem'
import { Metabolism } from '../../ecs/world'

// Reverse lookup maps for display names
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function SlotCell({ slot, index, selected, equipped, onSelect }: {
  slot: InventorySlot | null
  index: number
  selected: boolean
  equipped: boolean
  onSelect: (i: number) => void
}) {
  return (
    <div
      onClick={() => onSelect(index)}
      title={slot ? `${slot.itemId === 0 ? (MAT_NAMES[slot.materialId] ?? slot.materialId) : (ITEM_NAMES[slot.itemId] ?? slot.itemId)} ×${slot.quantity}` : ''}
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
            {slot.itemId === 0
              ? (MAT_NAMES[slot.materialId]?.split(' ')[0] ?? '?')
              : (ITEM_NAMES[slot.itemId]?.split(' ')[0] ?? MAT_NAMES[slot.itemId]?.split(' ')[0] ?? '?')}
          </div>
          <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
            {slot.itemId === 0 ? 'raw' : (MAT_NAMES[slot.materialId]?.split(' ')[0] ?? '')}
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
  const [dropQty, setDropQty] = useState(1)
  const [, forceRefresh] = useState(0)

  const equippedSlot  = usePlayerStore(s => s.equippedSlot)
  const equipAction   = usePlayerStore(s => s.equip)
  const unequipAction = usePlayerStore(s => s.unequip)
  const updateVitals  = usePlayerStore(s => s.updateVitals)
  const entityId      = usePlayerStore(s => s.entityId)

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
    inventory.dropItem(selected, qty)  // always removes, even in god mode
    // If we just emptied the equipped slot, unequip it
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
      {/* 8-column grid — dynamically sized to match actual inventory (god mode can exceed 40 slots) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 52px)', gap: 4 }}>
        {Array.from({ length: inventory.slotCount }, (_, i) => (
          <SlotCell
            key={i}
            index={i}
            slot={inventory.getSlot(i)}
            selected={selected === i}
            equipped={equippedSlot === i}
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
            {selectedSlot.itemId === 0
              ? (MAT_NAMES[selectedSlot.materialId] ?? `material #${selectedSlot.materialId}`)
              : (ITEM_NAMES[selectedSlot.itemId] ?? `item #${selectedSlot.itemId}`)}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>
            Material: {selectedSlot.materialId === 0 ? '—' : (MAT_NAMES[selectedSlot.materialId] ?? selectedSlot.materialId)}
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
                // Update ECS Metabolism directly — GameLoop overwrites playerStore from ECS every frame,
                // so writing only to playerStore would be discarded on the next tick.
                if (entityId !== null) {
                  Metabolism.hunger[entityId] = Math.max(0, Metabolism.hunger[entityId] - foodStats.hungerRestore)
                  Metabolism.thirst[entityId] = Math.max(0, Metabolism.thirst[entityId] - foodStats.thirstRestore)
                } else {
                  // Fallback: no entity yet, write to store only
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
                {n}×
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
