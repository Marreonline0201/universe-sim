// ── MerchantPanel.tsx ────────────────────────────────────────────────────────
// M27 Track B: NPC merchant trading UI — Buy, Sell, and Market Trends tabs.
// M35 Track A: Dynamic prices via MarketSystem + trend arrows per item.
// M43 Track B: Bulk buying (qty 1–10), reputation discounts, negotiation overlay.
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
import { MAT, ITEM, RARITY_COLORS, type RarityTier } from '../../player/Inventory'
import { getReputationBonus } from '../../store/reputationStore'
import { NegotiateOverlay, type NegotiateItem } from './NegotiateOverlay'
import { rarityFromLevel, rarityBadgeStyle, RARITY_LABEL, RARITY_GLOW } from '../RarityStyles'

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

function BuyTab({ archetype, settlementId, settlementNumId }: {
  archetype: MerchantArchetype
  settlementId: string
  settlementNumId: number
}) {
  const gold      = usePlayerStore(s => s.gold)
  const addGold   = usePlayerStore(s => s.addGold)
  const spendGold = usePlayerStore(s => s.spendGold)
  const addNotification = useUiStore(s => s.addNotification)

  // M43: per-row quantity selectors (itemIdx → qty)
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  // M43: active negotiation overlay state
  const [negotiating, setNegotiating] = useState<NegotiateItem | null>(null)
  // Keep a ref to the pending buy info when negotiation opens
  const [pendingBuy, setPendingBuy] = useState<{
    itemId: number; materialId: number; name: string; basePrice: number; qty: number
  } | null>(null)

  const sellList = merchantSystem.getSellList(archetype)

  // M43: reputation discount for this settlement
  const repBonus = getReputationBonus(settlementNumId)
  const repDiscount = repBonus.tradeDiscount

  const executeBuy = useCallback((
    itemId: number, materialId: number, name: string,
    paidPrice: number, qty: number,
  ) => {
    if (!spendGold(paidPrice)) {
      addNotification(`Not enough gold to buy ${name} (need ${paidPrice}💰)`, 'warning')
      return
    }
    let unitsAdded = 0
    for (let i = 0; i < qty; i++) {
      const added = inventory.addItem({ itemId, materialId, quantity: 1, quality: 0.8, rarity: 0 })
      if (!added) {
        // Refund remaining units
        addGold(paidPrice - Math.round((paidPrice / qty) * unitsAdded))
        addNotification('Inventory full — purchase stopped', 'warning')
        break
      }
      unitsAdded++
    }
    if (unitsAdded > 0) {
      // Always record purchase for however many units were actually received
      marketSystem.recordPurchase(settlementId, materialId, unitsAdded, itemId)
      addNotification(
        `Bought ${unitsAdded > 1 ? `${unitsAdded}× ` : ''}${name} for ${Math.round((paidPrice / qty) * unitsAdded)}💰`,
        'info',
      )
      window.dispatchEvent(new CustomEvent('npc-trade', { detail: { npcId: `${settlementId}_${archetype}`, npcName: archetype, npcRole: 'merchant' } }))
    }
  }, [settlementId, archetype, spendGold, addGold, addNotification])

  const handleBuyClick = useCallback((
    itemId: number, materialId: number, name: string, basePrice: number, idx: number,
  ) => {
    const qty = quantities[idx] ?? 1
    const livePrice = marketSystem.getPrice(settlementId, materialId, basePrice, itemId, repDiscount)
    const totalPrice = livePrice * qty
    // Open negotiation overlay
    setPendingBuy({ itemId, materialId, name, basePrice, qty })
    setNegotiating({ name, matId: materialId, qty, marketPrice: livePrice })
  }, [settlementId, quantities, repDiscount])

  const handleNegotiateConfirm = useCallback((paidPrice: number) => {
    if (!pendingBuy) return
    executeBuy(pendingBuy.itemId, pendingBuy.materialId, pendingBuy.name, paidPrice, pendingBuy.qty)
    setNegotiating(null)
    setPendingBuy(null)
  }, [pendingBuy, executeBuy])

  const handleNegotiateCancel = useCallback(() => {
    setNegotiating(null)
    setPendingBuy(null)
  }, [])

  return (
    <>
      {/* M43: Reputation discount banner */}
      {repDiscount > 0 && (
        <div style={{
          padding: '4px 10px',
          marginBottom: 10,
          background: 'rgba(46,204,113,0.10)',
          border: '1px solid rgba(46,204,113,0.3)',
          borderRadius: 5,
          fontSize: 10,
          color: GREEN_COLOR,
          fontFamily: 'monospace',
          letterSpacing: 0.5,
        }}>
          ★ Reputation discount: -{Math.round(repDiscount * 100)}% on all prices
        </div>
      )}

      <div>
        {sellList.map((item, idx) => {
          const qty       = quantities[idx] ?? 1
          const unitPrice = marketSystem.getPrice(settlementId, item.materialId, item.price, item.itemId, repDiscount)
          const totalPrice = unitPrice * qty
          const trend      = marketSystem.getTrend(settlementId, item.materialId, item.itemId)
          const canAfford  = gold >= totalPrice
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
                gap: 6,
              }}
            >
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#ddd', flex: 1 }}>
                {label}
              </span>

              {/* M43: Quantity selector */}
              <select
                value={qty}
                onChange={(e) => setQuantities(prev => ({ ...prev, [idx]: Number(e.target.value) }))}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 4,
                  color: '#ccc',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  padding: '2px 4px',
                  cursor: 'pointer',
                }}
              >
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>

              <span style={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: priceColor(trend),
                marginRight: 2,
                minWidth: 72,
                textAlign: 'right',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}>
                💰 {totalPrice}
                <TrendArrow trend={trend} />
              </span>
              <button
                disabled={!canAfford}
                onClick={() => handleBuyClick(item.itemId, item.materialId, label, item.price, idx)}
                style={{
                  padding: '3px 8px',
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
                  whiteSpace: 'nowrap',
                }}
              >
                BUY ×{qty}
              </button>
            </div>
          )
        })}
      </div>

      {/* M43: Negotiation overlay */}
      {negotiating && (
        <NegotiateOverlay
          item={negotiating}
          onConfirm={handleNegotiateConfirm}
          onCancel={handleNegotiateCancel}
        />
      )}
    </>
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
    window.dispatchEvent(new CustomEvent('npc-trade', { detail: { npcId: `${settlementId}_${archetype}`, npcName: archetype, npcRole: 'merchant' } }))
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
        // M51: Rarity visuals for sell tab
        const slotRarity = (slot.rarity ?? 0) as RarityTier
        const rarityKey = rarityFromLevel(slotRarity)
        const slotRarityColor = slotRarity > 0 ? RARITY_COLORS[slotRarity] : null
        const slotRarityGlow  = slotRarity > 0 ? RARITY_GLOW[rarityKey] : undefined

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
              border: slotRarityColor
                ? `1px solid ${slotRarityColor}60`
                : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5,
              opacity: interested ? 1 : 0.4,
              boxShadow: slotRarityGlow !== 'none' ? slotRarityGlow : undefined,
            }}
          >
            <span style={{ fontSize: 12, fontFamily: 'monospace', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: slotRarityColor ?? '#ddd' }}>
                {name}
              </span>
              {slotRarity > 0 && (
                <span style={rarityBadgeStyle(rarityKey)}>
                  {RARITY_LABEL[rarityKey]}
                </span>
              )}
              {slot.quantity > 1 && (
                <span style={{ color: GOLD_COLOR, marginLeft: 2 }}>×{slot.quantity}</span>
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

  // M43: numeric ID for reputation lookup (settlement IDs may be "12" or "default")
  const settlementNumId = parseInt(settlementId, 10) || 0

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
      {tab === 'buy'    && (
        <BuyTab
          archetype={archetype}
          settlementId={settlementId}
          settlementNumId={settlementNumId}
        />
      )}
      {tab === 'sell'   && <SellTab   archetype={archetype} settlementId={settlementId} />}
      {tab === 'trends' && <TrendsTab archetype={archetype} settlementId={settlementId} />}
    </div>
  )
}
