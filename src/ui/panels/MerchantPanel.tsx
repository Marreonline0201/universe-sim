// ── MerchantPanel.tsx ────────────────────────────────────────────────────────
// M27 Track B: NPC merchant trading UI — Buy, Sell, and Market Trends tabs.
// M35 Track A: Dynamic prices via MarketSystem + trend arrows per item.
//
// Buy tab:    Lists items from the merchant's sellList with live market prices.
// Sell tab:   Lists player inventory. Player clicks to sell items for gold.
// Trends tab: Top 3 cheapest and top 3 most expensive at current settlement.
//
// Style: dark translucent panels, monospace, rust-orange accents.

import { useState, useCallback } from 'react'
import { inventory } from '../../game/GameSingletons'
import { merchantSystem, type MerchantArchetype } from '../../game/MerchantSystem'
import { marketSystem } from '../../game/MarketSystem'
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
const GREEN_COLOR = '#2ecc71'
const RED_COLOR   = '#e74c3c'

// ── Price trend indicator ─────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up')   return <span style={{ color: RED_COLOR,   fontSize: 11, marginLeft: 4 }}>↑</span>
  if (trend === 'down') return <span style={{ color: GREEN_COLOR, fontSize: 11, marginLeft: 4 }}>↓</span>
  return <span style={{ color: '#555', fontSize: 11, marginLeft: 4 }}>=</span>
}

function priceColor(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up')   return RED_COLOR
  if (trend === 'down') return GREEN_COLOR
  return GOLD_COLOR
}

// ── Buy Tab ───────────────────────────────────────────────────────────────────

function BuyTab({ archetype, settlementId }: { archetype: MerchantArchetype; settlementId: string }) {
  const gold      = usePlayerStore(s => s.gold)
  const addGold   = usePlayerStore(s => s.addGold)
  const spendGold = usePlayerStore(s => s.spendGold)
  const addNotification = useUiStore(s => s.addNotification)

  const sellList = merchantSystem.getSellList(archetype)

  const handleBuy = useCallback((itemId: number, materialId: number, name: string, basePrice: number) => {
    const livePrice = marketSystem.getPrice(settlementId, materialId, basePrice, itemId)
    if (!spendGold(livePrice)) {
      addNotification(`Not enough gold to buy ${name} (need ${livePrice}💰)`, 'warning')
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
      addGold(livePrice)
      addNotification('Inventory full — cannot buy item', 'warning')
      return
    }
    // Record purchase — demand rises → price up
    marketSystem.recordPurchase(settlementId, materialId, 1, itemId)
    addNotification(`Bought ${name} for ${livePrice}💰`, 'info')
  }, [settlementId, spendGold, addGold, addNotification])

  return (
    <div>
      {sellList.map((item, idx) => {
        const livePrice = marketSystem.getPrice(settlementId, item.materialId, item.price, item.itemId)
        const trend     = marketSystem.getTrend(settlementId, item.materialId, item.itemId)
        const canAfford = gold >= livePrice
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
            <span style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: priceColor(trend),
              marginRight: 6,
              minWidth: 65,
              textAlign: 'right',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}>
              💰 {livePrice}
              <TrendArrow trend={trend} />
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

function SellTab({ archetype, settlementId }: { archetype: MerchantArchetype; settlementId: string }) {
  const addGold = usePlayerStore(s => s.addGold)
  const addNotification = useUiStore(s => s.addNotification)
  const [, forceRefresh] = useState(0)

  const slots = inventory.listItems()

  const handleSell = useCallback((slotIndex: number) => {
    const slot = inventory.getSlot(slotIndex)
    if (!slot) return
    const basePrice = merchantSystem.getBuyPrice(archetype, slot.itemId, slot.materialId)
    if (basePrice <= 0) {
      const name = slot.itemId === 0
        ? capitalize(MAT_NAMES[slot.materialId] ?? `material #${slot.materialId}`)
        : capitalize(ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)
      addNotification(`${name} — merchant not interested`, 'warning')
      return
    }
    // When selling, player gets market price (supply up = price drops after)
    const livePrice = marketSystem.getPrice(settlementId, slot.materialId, basePrice, slot.itemId)
    const removed = inventory.removeItem(slotIndex, 1)
    if (!removed) return
    addGold(livePrice)
    // Record sale — supply rises → price down
    marketSystem.recordSale(settlementId, slot.materialId, 1, slot.itemId)
    const name = slot.itemId === 0
      ? capitalize(MAT_NAMES[slot.materialId] ?? `material #${slot.materialId}`)
      : capitalize(ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)
    addNotification(`Sold ${name} for ${livePrice}💰`, 'info')
    forceRefresh(r => r + 1)
  }, [archetype, settlementId, addGold, addNotification])

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
        const basePrice = merchantSystem.getBuyPrice(archetype, slot.itemId, slot.materialId)
        const livePrice = basePrice > 0
          ? marketSystem.getPrice(settlementId, slot.materialId, basePrice, slot.itemId)
          : 0
        const trend    = basePrice > 0
          ? marketSystem.getTrend(settlementId, slot.materialId, slot.itemId)
          : 'flat' as const
        const interested = livePrice > 0

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
            <span style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: interested ? priceColor(trend) : '#555',
              marginRight: 6,
              minWidth: 65,
              textAlign: 'right',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}>
              {interested ? (
                <>💰 {livePrice}<TrendArrow trend={trend} /></>
              ) : '—'}
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

// ── Market Trends Tab ─────────────────────────────────────────────────────────

function TrendsTab({ archetype, settlementId }: { archetype: MerchantArchetype; settlementId: string }) {
  const sellList = merchantSystem.getSellList(archetype)

  // Compute live multiplier for each item in sell list
  const itemsWithMult = sellList.map(item => {
    const mult = marketSystem.getMultiplier(settlementId, item.materialId, item.itemId)
    const livePrice = marketSystem.getPrice(settlementId, item.materialId, item.price, item.itemId)
    const label = item.itemId === 0
      ? capitalize(MAT_NAMES[item.materialId] ?? item.name)
      : capitalize(ITEM_NAMES[item.itemId] ?? item.name)
    return { label, mult, livePrice, basePrice: item.price }
  })

  // Sort ascending for cheapest (mult below 1.0 = good deals)
  const sorted = [...itemsWithMult].sort((a, b) => a.mult - b.mult)
  const cheapest    = sorted.slice(0, 3)
  const mostExpensive = [...sorted].reverse().slice(0, 3)

  function TrendRow({ label, livePrice, basePrice, mult }: { label: string; livePrice: number; basePrice: number; mult: number }) {
    const trend = mult > 1.05 ? 'up' : mult < 0.95 ? 'down' : 'flat'
    const pctChange = Math.round((mult - 1) * 100)
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        marginBottom: 3,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 5,
      }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ccc', flex: 1 }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: priceColor(trend), marginRight: 8 }}>
          💰 {livePrice}
          <TrendArrow trend={trend} />
        </span>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: priceColor(trend), minWidth: 40, textAlign: 'right' }}>
          {pctChange === 0 ? '' : pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`}
        </span>
      </div>
    )
  }

  const allFlat = itemsWithMult.every(i => Math.abs(i.mult - 1.0) < 0.05)

  if (allFlat) {
    return (
      <div style={{ textAlign: 'center', color: '#555', fontSize: 12, fontFamily: 'monospace', padding: '28px 0' }}>
        Market prices are stable.<br />
        <span style={{ fontSize: 10, color: '#444' }}>Buy and sell to shift prices.</span>
      </div>
    )
  }

  return (
    <div>
      {/* Cheapest section */}
      <div style={{ fontSize: 10, color: GREEN_COLOR, letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
        ↓ BEST DEALS
      </div>
      {cheapest.map((item, i) => (
        <TrendRow key={`cheap-${i}`} {...item} />
      ))}

      <div style={{ height: 12 }} />

      {/* Most expensive section */}
      <div style={{ fontSize: 10, color: RED_COLOR, letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
        ↑ HIGH DEMAND
      </div>
      {mostExpensive.map((item, i) => (
        <TrendRow key={`exp-${i}`} {...item} />
      ))}

      <div style={{ marginTop: 12, fontSize: 9, color: '#333', fontFamily: 'monospace', textAlign: 'center', letterSpacing: 0.5 }}>
        Prices rebalance toward normal over time.
      </div>
    </div>
  )
}

// ── MerchantPanel ─────────────────────────────────────────────────────────────

export function MerchantPanel() {
  const [tab, setTab] = useState<'buy' | 'sell' | 'trends'>('buy')
  const gold = usePlayerStore(s => s.gold)

  const archetype: MerchantArchetype = useDialogueStore(s => s.merchantArchetype)
  const settlementId = useDialogueStore(s => s.merchantSettlementId)

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
      <div style={{ display: 'flex', marginBottom: 12, gap: 4 }}>
        {(['buy', 'sell', 'trends'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '6px 0',
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              background: tab === t ? `rgba(205,68,32,0.22)` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${tab === t ? RUST_ORANGE : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 5,
              color: tab === t ? RUST_ORANGE : '#777',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {t === 'buy' ? '🛒 Buy' : t === 'sell' ? '📦 Sell' : '📈 Trends'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'buy'    && <BuyTab    archetype={archetype} settlementId={settlementId} />}
      {tab === 'sell'   && <SellTab   archetype={archetype} settlementId={settlementId} />}
      {tab === 'trends' && <TrendsTab archetype={archetype} settlementId={settlementId} />}
    </div>
  )
}
