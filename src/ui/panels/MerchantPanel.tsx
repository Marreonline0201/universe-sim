// ── MerchantPanel.tsx ────────────────────────────────────────────────────────
// M27 Track B: NPC merchant trading UI — two tabs: Buy and Sell.
//
// Buy tab:  Lists items from the merchant's sellList. Player clicks to buy.
// Sell tab: Lists player inventory. Player clicks to sell items for gold.
//
// Style: dark translucent panels, monospace, rust-orange accents.

import { useState } from 'react'
import { inventory } from '../../game/GameSingletons'
import { merchantSystem, type MerchantArchetype } from '../../game/MerchantSystem'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'
import { useDialogueStore } from '../../store/dialogueStore'
import { MAT, ITEM } from '../../player/Inventory'

// ── Name lookup maps ──────────────────────────────────────────────────────────

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function capitalize(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

// ── Shared style constants ────────────────────────────────────────────────────

const RUST_ORANGE = '#cd4420'
const GOLD_COLOR  = '#f1c40f'

// ── Buy Tab ───────────────────────────────────────────────────────────────────

function BuyTab({ archetype }: { archetype: MerchantArchetype }) {
  const gold    = usePlayerStore(s => s.gold)
  const addGold = usePlayerStore(s => s.addGold)
  const spendGold = usePlayerStore(s => s.spendGold)
  const addNotification = useUiStore(s => s.addNotification)

  const sellList = merchantSystem.getSellList(archetype)

  function handleBuy(itemId: number, materialId: number, name: string, price: number) {
    if (!spendGold(price)) {
      addNotification(`Not enough gold to buy ${name} (need ${price}💰)`, 'warning')
      return
    }
    const added = inventory.addItem({
      itemId,
      materialId,
      quantity: 1,
      quality: 0.8,
      rarity: 0,
    })
    if (!added) {
      // Refund gold — inventory full
      addGold(price)
      addNotification('Inventory full — cannot buy item', 'warning')
      return
    }
    addNotification(`Bought ${name} for ${price}💰`, 'info')
  }

  return (
    <div>
      {sellList.map((item, idx) => {
        const canAfford = gold >= item.price
        const label = item.itemId === 0
          ? capitalize(MAT_NAMES[item.materialId] ?? item.name)
          : capitalize(ITEM_NAMES[item.itemId] ?? item.name)

        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              marginBottom: 4,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5,
              opacity: canAfford ? 1 : 0.5,
            }}
          >
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#ddd', flex: 1 }}>
              {label}
            </span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: GOLD_COLOR, marginRight: 10, minWidth: 60, textAlign: 'right' }}>
              💰 {item.price}
            </span>
            <button
              disabled={!canAfford}
              onClick={() => handleBuy(item.itemId, item.materialId, label, item.price)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontFamily: 'monospace',
                fontWeight: 700,
                background: canAfford ? `rgba(205,68,32,0.22)` : 'rgba(80,80,80,0.2)',
                border: `1px solid ${canAfford ? RUST_ORANGE : '#444'}`,
                borderRadius: 4,
                color: canAfford ? RUST_ORANGE : '#666',
                cursor: canAfford ? 'pointer' : 'not-allowed',
                letterSpacing: 0.5,
                transition: 'all 0.12s',
              }}
            >
              BUY
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Sell Tab ──────────────────────────────────────────────────────────────────

function SellTab({ archetype }: { archetype: MerchantArchetype }) {
  const gold = usePlayerStore(s => s.gold)
  const addGold = usePlayerStore(s => s.addGold)
  const addNotification = useUiStore(s => s.addNotification)
  const [, forceRefresh] = useState(0)

  const slots = inventory.listItems()

  function handleSell(slotIndex: number) {
    const slot = inventory.getSlot(slotIndex)
    if (!slot) return
    const price = merchantSystem.getBuyPrice(archetype, slot.itemId, slot.materialId)
    if (price <= 0) {
      const name = slot.itemId === 0
        ? capitalize(MAT_NAMES[slot.materialId] ?? `material #${slot.materialId}`)
        : capitalize(ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)
      addNotification(`${name} — merchant not interested`, 'warning')
      return
    }
    const removed = inventory.removeItem(slotIndex, 1)
    if (!removed) return
    addGold(price)
    const name = slot.itemId === 0
      ? capitalize(MAT_NAMES[slot.materialId] ?? `material #${slot.materialId}`)
      : capitalize(ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)
    addNotification(`Sold ${name} for ${price}💰`, 'info')
    forceRefresh(r => r + 1)
  }

  if (slots.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#555', fontSize: 12, fontFamily: 'monospace', padding: '32px 0' }}>
        Your inventory is empty.
      </div>
    )
  }

  return (
    <div>
      {slots.map(({ slot, index: slotIndex }) => {
        const name = slot.itemId === 0
          ? capitalize(MAT_NAMES[slot.materialId] ?? `material #${slot.materialId}`)
          : capitalize(ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)
        const price = merchantSystem.getBuyPrice(archetype, slot.itemId, slot.materialId)
        const interested = price > 0

        return (
          <div
            key={slotIndex}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              marginBottom: 4,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5,
              opacity: interested ? 1 : 0.4,
            }}
          >
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#ddd', flex: 1 }}>
              {name}
              {slot.quantity > 1 && (
                <span style={{ color: GOLD_COLOR, marginLeft: 6 }}>×{slot.quantity}</span>
              )}
            </span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: interested ? GOLD_COLOR : '#555', marginRight: 10, minWidth: 60, textAlign: 'right' }}>
              {interested ? `💰 ${price}` : '—'}
            </span>
            <button
              disabled={!interested}
              onClick={() => handleSell(slotIndex)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontFamily: 'monospace',
                fontWeight: 700,
                background: interested ? 'rgba(17,153,142,0.2)' : 'rgba(80,80,80,0.2)',
                border: `1px solid ${interested ? '#11998e' : '#444'}`,
                borderRadius: 4,
                color: interested ? '#11998e' : '#666',
                cursor: interested ? 'pointer' : 'not-allowed',
                letterSpacing: 0.5,
                transition: 'all 0.12s',
              }}
            >
              SELL
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── MerchantPanel ─────────────────────────────────────────────────────────────

export function MerchantPanel() {
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const gold    = usePlayerStore(s => s.gold)

  // Read archetype from dialogueStore (set in GameLoop when merchant is opened)
  const archetype: MerchantArchetype = useDialogueStore(s => s.merchantArchetype)

  const archetypeLabel = archetype === 'general'
    ? 'General Store'
    : archetype === 'blacksmith'
      ? 'Blacksmith'
      : 'Alchemist'

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace' }}>
      {/* Archetype label */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
        🛍 {archetypeLabel}
      </div>

      {/* Gold balance */}
      <div style={{
        padding: '6px 10px',
        marginBottom: 14,
        background: 'rgba(241,196,15,0.08)',
        border: '1px solid rgba(241,196,15,0.25)',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 700,
        color: GOLD_COLOR,
        letterSpacing: 1,
      }}>
        Your gold: 💰 {gold}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', marginBottom: 12, gap: 6 }}>
        {(['buy', 'sell'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '6px 0',
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              background: tab === t ? `rgba(205,68,32,0.22)` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${tab === t ? RUST_ORANGE : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 5,
              color: tab === t ? RUST_ORANGE : '#777',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {t === 'buy' ? '🛒 Buy' : '📦 Sell'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'buy'
        ? <BuyTab archetype={archetype} />
        : <SellTab archetype={archetype} />
      }
    </div>
  )
}
