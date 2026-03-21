// ── ShopHUD.tsx ─────────────────────────────────────────────────────────────────
// M10 Track C: Settlement shop panel.
// Opens when player talks to a settlement leader NPC (SHOP_OPEN message).
// Shows buy/sell tabs, item list with prices, player's copper_coin balance.

import React, { useState } from 'react'
import { useShopStore } from '../store/shopStore'
import { inventory } from '../game/GameSingletons'
import { MAT } from '../player/Inventory'
import { getWorldSocket } from '../net/useWorldSocket'
import { useUiStore } from '../store/uiStore'

// ── MAT name lookup ────────────────────────────────────────────────────────────
const MAT_NAMES: Record<number, string> = {
  1: 'Stone', 2: 'Flint', 3: 'Wood', 4: 'Bark', 5: 'Leaf',
  6: 'Bone', 7: 'Hide', 8: 'Clay', 9: 'Sand', 10: 'Charcoal',
  11: 'Copper Ore', 12: 'Tin Ore', 13: 'Bronze', 14: 'Iron Ore',
  15: 'Iron', 16: 'Steel', 17: 'Coal', 18: 'Glass', 19: 'Brick',
  20: 'Mortar', 21: 'Fiber', 22: 'Cloth', 23: 'Rope', 24: 'Leather',
  25: 'Copper', 26: 'Silver', 27: 'Gold', 41: 'Cooked Meat',
  42: 'Raw Meat', 43: 'Iron Ingot',
  59: 'Copper Coin', 60: 'Fish', 61: 'Salt', 62: 'Grain',
}

const MAT_COPPER_COIN = 59

function matName(matId: number): string {
  return MAT_NAMES[matId] ?? `Mat #${matId}`
}

const PANEL: React.CSSProperties = {
  position: 'fixed',
  top: '50%', left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 460,
  maxHeight: '70vh',
  background: 'rgba(14,10,6,0.97)',
  border: '1px solid rgba(160,100,40,0.6)',
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Courier New', monospace",
  color: '#e8d8b0',
  zIndex: 3000,
  boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
  overflow: 'hidden',
}

const HEADER: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid rgba(160,100,40,0.4)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'rgba(80,45,10,0.4)',
}

const TAB_ROW: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid rgba(160,100,40,0.3)',
}

const BODY: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 12px',
}

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 4px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  fontSize: 13,
}

const BTN: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 3,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: "'Courier New', monospace",
}

interface ShopItem {
  matId: number
  qty: number
  buyPrice: number    // what settlement pays player
  sellPrice: number   // what settlement charges player
}

export function ShopHUD() {
  const shop = useShopStore()
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = useState<Record<number, number>>({})

  if (!shop.open) return null

  const playerCoins = inventory.countMaterial(MAT_COPPER_COIN)

  const handleBuy = (item: ShopItem) => {
    const amount = qty[item.matId] ?? 1
    if (amount < 1) return
    const cost = item.sellPrice * amount
    if (playerCoins < cost) {
      useUiStore.getState().addNotification(`Not enough copper coins (need ${cost}, have ${playerCoins})`, 'warning')
      return
    }
    // Deduct coins from player inventory
    let remaining = cost
    for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
      const s = inventory.getSlot(i)
      if (s && s.itemId === 0 && s.materialId === MAT_COPPER_COIN) {
        const take = Math.min(s.quantity, remaining)
        inventory.removeItem(i, take)
        remaining -= take
      }
    }
    // Add purchased material
    inventory.addItem({ itemId: 0, materialId: item.matId, quantity: amount, quality: 0.8 })

    // Notify server
    getWorldSocket()?.send({
      type: 'SHOP_BUY',
      settlementId: shop.settlementId,
      matId: item.matId,
      qty: amount,
    })
    useUiStore.getState().addNotification(`Bought ${amount}x ${matName(item.matId)} for ${cost} coins`, 'info')
  }

  const handleSell = (matId: number) => {
    const amount = qty[matId] ?? 1
    if (amount < 1) return
    const have = inventory.countMaterial(matId)
    if (have < amount) {
      useUiStore.getState().addNotification(`You only have ${have}x ${matName(matId)}`, 'warning')
      return
    }
    // Will receive sell price from server; optimistically add coins
    const buyPriceItem = shop.catalog.find(c => c.matId === matId)
    if (!buyPriceItem) return
    const earned = buyPriceItem.buyPrice * amount

    // Remove material from inventory
    let remaining = amount
    for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
      const s = inventory.getSlot(i)
      if (s && s.itemId === 0 && s.materialId === matId) {
        const take = Math.min(s.quantity, remaining)
        inventory.removeItem(i, take)
        remaining -= take
      }
    }
    // Add coins
    inventory.addItem({ itemId: 0, materialId: MAT_COPPER_COIN, quantity: earned, quality: 1.0 })

    // Notify server
    getWorldSocket()?.send({
      type: 'SHOP_SELL',
      settlementId: shop.settlementId,
      matId,
      qty: amount,
    })
    useUiStore.getState().addNotification(`Sold ${amount}x ${matName(matId)} for ${earned} coins`, 'info')
  }

  // For sell tab: show mats player has in inventory
  const playerMats: Array<{ matId: number; qty: number; buyPrice: number }> = []
  if (tab === 'sell') {
    const seen = new Set<number>()
    for (let i = 0; i < inventory.slotCount; i++) {
      const s = inventory.getSlot(i)
      if (!s || s.itemId !== 0 || s.materialId === MAT_COPPER_COIN) continue
      if (seen.has(s.materialId)) continue
      seen.add(s.materialId)
      const catalogItem = shop.catalog.find(c => c.matId === s.materialId)
      playerMats.push({
        matId: s.materialId,
        qty: inventory.countMaterial(s.materialId),
        buyPrice: catalogItem?.buyPrice ?? 1,
      })
    }
  }

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={HEADER}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f5c842' }}>
          {shop.settlementName} — General Store
        </span>
        <span style={{ fontSize: 13, color: '#ffd700' }}>
          {playerCoins} coins
        </span>
        <button
          style={{ ...BTN, background: 'rgba(180,60,40,0.7)', color: '#fff', marginLeft: 8 }}
          onClick={() => shop.closeShop()}
        >
          Close [Esc]
        </button>
      </div>

      {/* Tabs */}
      <div style={TAB_ROW}>
        {(['buy', 'sell'] as const).map(t => (
          <button
            key={t}
            style={{
              flex: 1, padding: '7px 0',
              background: tab === t ? 'rgba(160,100,40,0.3)' : 'transparent',
              border: 'none', borderBottom: tab === t ? '2px solid #f5c842' : '2px solid transparent',
              color: tab === t ? '#f5c842' : '#a08050',
              cursor: 'pointer', fontFamily: "'Courier New', monospace",
              fontSize: 13, textTransform: 'uppercase', letterSpacing: 1,
            }}
            onClick={() => setTab(t)}
          >
            {t === 'buy' ? 'Buy from settlement' : 'Sell to settlement'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={BODY}>
        {tab === 'buy' && (
          shop.catalog.length === 0
            ? <div style={{ padding: 16, color: '#888', textAlign: 'center' }}>No stock available</div>
            : shop.catalog.map(item => (
              <div key={item.matId} style={ROW}>
                <span style={{ minWidth: 120 }}>{matName(item.matId)}</span>
                <span style={{ color: '#aaa', minWidth: 50 }}>x{item.qty}</span>
                <span style={{ color: '#ffd700', minWidth: 60 }}>{item.sellPrice}c ea</span>
                <input
                  type="number" min={1} max={item.qty}
                  value={qty[item.matId] ?? 1}
                  onChange={e => setQty(q => ({ ...q, [item.matId]: Math.max(1, parseInt(e.target.value) || 1) }))}
                  style={{ width: 44, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '2px 4px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 }}
                />
                <button
                  style={{ ...BTN, background: playerCoins >= item.sellPrice * (qty[item.matId] ?? 1) ? 'rgba(40,140,60,0.7)' : 'rgba(80,80,80,0.5)', color: '#fff' }}
                  onClick={() => handleBuy(item)}
                  disabled={playerCoins < item.sellPrice * (qty[item.matId] ?? 1)}
                >
                  Buy
                </button>
              </div>
            ))
        )}

        {tab === 'sell' && (
          playerMats.length === 0
            ? <div style={{ padding: 16, color: '#888', textAlign: 'center' }}>No tradeable materials in inventory</div>
            : playerMats.map(pm => (
              <div key={pm.matId} style={ROW}>
                <span style={{ minWidth: 120 }}>{matName(pm.matId)}</span>
                <span style={{ color: '#aaa', minWidth: 50 }}>x{pm.qty}</span>
                <span style={{ color: '#ffd700', minWidth: 60 }}>{pm.buyPrice}c ea</span>
                <input
                  type="number" min={1} max={pm.qty}
                  value={qty[pm.matId] ?? 1}
                  onChange={e => setQty(q => ({ ...q, [pm.matId]: Math.max(1, parseInt(e.target.value) || 1) }))}
                  style={{ width: 44, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '2px 4px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 }}
                />
                <button
                  style={{ ...BTN, background: 'rgba(40,100,160,0.7)', color: '#fff' }}
                  onClick={() => handleSell(pm.matId)}
                >
                  Sell
                </button>
              </div>
            ))
        )}
      </div>

      {/* Footer hint */}
      <div style={{ padding: '6px 14px', borderTop: '1px solid rgba(160,100,40,0.3)', fontSize: 11, color: '#666' }}>
        Prices vary by supply — sell what they need, buy what they produce.
      </div>
    </div>
  )
}
