// ── TradePostPanel.tsx ────────────────────────────────────────────────────────
// M42 Track A: Player-to-player trade post UI.
// Tab 1 BROWSE: scroll all listings, filter by name, sort by price/time, BUY.
// Tab 2 SELL: pick from inventory, set qty/price, LIST or CANCEL listings.

import { useState, useCallback, useMemo } from 'react'
import { useTradePostStore, type TradePostListing } from '../../store/tradePostStore'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'
import { inventory } from '../../game/GameSingletons'
import { getWorldSocket } from '../../net/useWorldSocket'
import { getLocalUsername } from '../../net/useWorldSocket'
import { MAT, ITEM } from '../../player/Inventory'

// ── Name lookup maps ──────────────────────────────────────────────────────────

const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

function getDisplayName(materialId: number, itemId: number): string {
  if (itemId !== 0) {
    const n = ITEM_NAMES[itemId]
    return n ? n.replace(/\b\w/g, c => c.toUpperCase()) : `Item #${itemId}`
  }
  const n = MAT_NAMES[materialId]
  return n ? n.replace(/\b\w/g, c => c.toUpperCase()) : `Mat #${materialId}`
}

// ── Style constants ────────────────────────────────────────────────────────────

const RUST  = '#cd4420'
const GOLD  = '#f1c40f'
const GREEN = '#2ecc71'
const DIM   = '#555'
const BG    = 'rgba(20,20,20,0.95)'
const BORDER = '1px solid #2a2a2a'
const FONT  = 'monospace'

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 0',
        background: active ? 'rgba(205,68,32,0.18)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? RUST : 'transparent'}`,
        color: active ? RUST : DIM,
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  )
}

// ── Browse Tab ────────────────────────────────────────────────────────────────

type SortKey = 'price_asc' | 'price_desc' | 'time_asc' | 'time_desc'

function BrowseTab() {
  const listings      = useTradePostStore(s => s.listings)
  const gold          = usePlayerStore(s => s.gold)
  const addNotification = useCallback((msg: string, type?: 'info' | 'discovery' | 'warning' | 'error') => {
    useUiStore.getState().addNotification(msg, type)
  }, [])

  const [filter, setFilter] = useState('')
  const [sort, setSort]     = useState<SortKey>('time_desc')

  const filtered = useMemo(() => {
    let items = [...listings]
    if (filter.trim()) {
      const q = filter.trim().toLowerCase()
      items = items.filter(l => getDisplayName(l.materialId, l.itemId).toLowerCase().includes(q))
    }
    switch (sort) {
      case 'price_asc':  items.sort((a, b) => a.pricePerUnit - b.pricePerUnit); break
      case 'price_desc': items.sort((a, b) => b.pricePerUnit - a.pricePerUnit); break
      case 'time_asc':   items.sort((a, b) => a.listedAt - b.listedAt); break
      case 'time_desc':  items.sort((a, b) => b.listedAt - a.listedAt); break
    }
    return items
  }, [listings, filter, sort])

  const handleBuy = useCallback((listing: TradePostListing) => {
    const totalCost = listing.pricePerUnit * listing.quantity
    const result = useTradePostStore.getState().buyListing(listing.id, gold)
    if (!result.success) {
      addNotification(result.message, 'warning')
      return
    }
    // Deduct gold
    usePlayerStore.getState().spendGold(totalCost)
    // Add item/material to inventory
    inventory.addItem({
      itemId:     listing.itemId,
      materialId: listing.materialId,
      quantity:   listing.quantity,
      quality:    0.8,
    })
    addNotification(`Purchased ${getDisplayName(listing.materialId, listing.itemId)} x${listing.quantity} for ${totalCost} gold!`, 'discovery')
    // Broadcast to other players
    getWorldSocket()?.send({ type: 'TRADE_POST_BUY', listingId: listing.id })
  }, [gold, addNotification])

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button
        onClick={() => setSort(k)}
        style={{
          padding: '3px 8px',
          background: sort === k ? 'rgba(205,68,32,0.2)' : 'transparent',
          border: `1px solid ${sort === k ? RUST : '#333'}`,
          color: sort === k ? RUST : DIM,
          fontFamily: FONT,
          fontSize: 9,
          cursor: 'pointer',
          borderRadius: 3,
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Filter */}
      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name..."
        style={{
          background: '#0e0e0e',
          border: BORDER,
          borderRadius: 4,
          color: '#ccc',
          fontFamily: FONT,
          fontSize: 11,
          padding: '6px 10px',
          outline: 'none',
        }}
      />

      {/* Sort buttons */}
      <div style={{ display: 'flex', gap: 4 }}>
        <span style={{ color: DIM, fontSize: 9, fontFamily: FONT, alignSelf: 'center' }}>SORT:</span>
        <SortBtn k="price_asc"  label="Price ↑" />
        <SortBtn k="price_desc" label="Price ↓" />
        <SortBtn k="time_asc"   label="Time ↑" />
        <SortBtn k="time_desc"  label="Time ↓" />
      </div>

      {/* Listing rows */}
      {filtered.length === 0 ? (
        <div style={{ color: DIM, fontFamily: FONT, fontSize: 11, textAlign: 'center', padding: '24px 0' }}>
          No listings available.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 44px 60px 60px 56px',
            gap: 4,
            padding: '4px 8px',
            color: DIM,
            fontFamily: FONT,
            fontSize: 9,
            letterSpacing: 0.5,
            borderBottom: BORDER,
          }}>
            <span>ITEM</span>
            <span style={{ textAlign: 'right' }}>QTY</span>
            <span style={{ textAlign: 'right' }}>EACH</span>
            <span style={{ textAlign: 'right' }}>TOTAL</span>
            <span />
          </div>
          {filtered.map(listing => {
            const total    = listing.pricePerUnit * listing.quantity
            const canAfford = gold >= total
            const name     = getDisplayName(listing.materialId, listing.itemId)
            return (
              <div key={listing.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 44px 60px 60px 56px',
                gap: 4,
                alignItems: 'center',
                padding: '5px 8px',
                background: BG,
                border: BORDER,
                borderRadius: 4,
              }}>
                <div>
                  <div style={{ color: '#ccc', fontFamily: FONT, fontSize: 11 }}>{name}</div>
                  <div style={{ color: DIM, fontFamily: FONT, fontSize: 9 }}>{listing.sellerName}</div>
                </div>
                <span style={{ color: '#aaa', fontFamily: FONT, fontSize: 11, textAlign: 'right' }}>
                  {listing.quantity}
                </span>
                <span style={{ color: GOLD, fontFamily: FONT, fontSize: 11, textAlign: 'right' }}>
                  {listing.pricePerUnit}g
                </span>
                <span style={{ color: canAfford ? GOLD : '#e74c3c', fontFamily: FONT, fontSize: 11, textAlign: 'right', fontWeight: 700 }}>
                  {total}g
                </span>
                <button
                  onClick={() => handleBuy(listing)}
                  disabled={!canAfford}
                  style={{
                    padding: '4px 6px',
                    background: canAfford ? 'rgba(205,68,32,0.2)' : 'rgba(60,60,60,0.3)',
                    border: `1px solid ${canAfford ? RUST : '#333'}`,
                    color: canAfford ? RUST : DIM,
                    fontFamily: FONT,
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    borderRadius: 3,
                    letterSpacing: 0.5,
                  }}
                >
                  BUY
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Sell Tab ──────────────────────────────────────────────────────────────────

function SellTab() {
  const listings    = useTradePostStore(s => s.listings)
  const myListings  = useTradePostStore(s => s.myListings)
  const addNotification = useCallback((msg: string, type?: 'info' | 'discovery' | 'warning' | 'error') => {
    useUiStore.getState().addNotification(msg, type)
  }, [])

  // Build list of player's inventory items with qty > 0
  const invItems = useMemo(() => {
    const items: Array<{ slotIndex: number; materialId: number; itemId: number; quantity: number; name: string }> = []
    for (let i = 0; i < inventory.slotCount; i++) {
      const slot = inventory.getSlot(i)
      if (slot && slot.quantity > 0) {
        items.push({
          slotIndex: i,
          materialId: slot.materialId,
          itemId: slot.itemId,
          quantity: slot.quantity,
          name: getDisplayName(slot.materialId, slot.itemId),
        })
      }
    }
    return items
  }, [listings]) // re-derive whenever listings change (proxy for inventory changes)

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [qty, setQty]                   = useState(1)
  const [price, setPrice]               = useState(1)

  const selectedItem = selectedSlot !== null ? invItems.find(i => i.slotIndex === selectedSlot) ?? null : null
  const maxQty       = selectedItem?.quantity ?? 1

  const handleList = useCallback(() => {
    if (!selectedItem) return
    if (qty < 1 || price < 1) {
      addNotification('Invalid quantity or price.', 'warning')
      return
    }
    const username = getLocalUsername()
    const id = `${username}_${Date.now()}`
    const listing: TradePostListing = {
      id,
      sellerName:   username,
      materialId:   selectedItem.materialId,
      itemId:       selectedItem.itemId,
      quantity:     qty,
      pricePerUnit: price,
      listedAt:     Date.now(),
    }
    useTradePostStore.getState().addListing(listing)
    // Track as my listing
    useTradePostStore.setState(s => ({ myListings: [...s.myListings, id] }))
    getWorldSocket()?.send({ type: 'TRADE_POST_LIST', listing })
    addNotification(`Listed ${selectedItem.name} x${qty} for ${price}g each.`, 'info')
    setSelectedSlot(null)
    setQty(1)
    setPrice(1)
  }, [selectedItem, qty, price, addNotification])

  const handleCancel = useCallback((id: string) => {
    useTradePostStore.getState().removeListing(id)
    getWorldSocket()?.send({ type: 'TRADE_POST_BUY', listingId: id }) // treated as remove on peers
    addNotification('Listing cancelled.', 'info')
  }, [addNotification])

  const myListingData = listings.filter(l => myListings.includes(l.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* New listing form */}
      <div style={{
        background: BG,
        border: BORDER,
        borderRadius: 6,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ color: '#aaa', fontFamily: FONT, fontSize: 11, letterSpacing: 1 }}>NEW LISTING</div>

        {/* Item picker */}
        <div>
          <label style={{ color: DIM, fontFamily: FONT, fontSize: 9, display: 'block', marginBottom: 4 }}>ITEM</label>
          <select
            value={selectedSlot ?? ''}
            onChange={e => {
              const val = e.target.value
              setSelectedSlot(val === '' ? null : Number(val))
              setQty(1)
            }}
            style={{
              width: '100%',
              background: '#0e0e0e',
              border: BORDER,
              borderRadius: 4,
              color: '#ccc',
              fontFamily: FONT,
              fontSize: 11,
              padding: '6px 8px',
            }}
          >
            <option value="">-- Select item --</option>
            {invItems.map(item => (
              <option key={item.slotIndex} value={item.slotIndex}>
                {item.name} (x{item.quantity})
              </option>
            ))}
          </select>
        </div>

        {/* Quantity */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ color: DIM, fontFamily: FONT, fontSize: 9, display: 'block', marginBottom: 4 }}>QUANTITY</label>
            <input
              type="number"
              min={1}
              max={maxQty}
              value={qty}
              onChange={e => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value))))}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: '#0e0e0e',
                border: BORDER,
                borderRadius: 4,
                color: '#ccc',
                fontFamily: FONT,
                fontSize: 11,
                padding: '6px 8px',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ color: DIM, fontFamily: FONT, fontSize: 9, display: 'block', marginBottom: 4 }}>PRICE PER UNIT (GOLD)</label>
            <input
              type="number"
              min={1}
              value={price}
              onChange={e => setPrice(Math.max(1, Number(e.target.value)))}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: '#0e0e0e',
                border: BORDER,
                borderRadius: 4,
                color: '#ccc',
                fontFamily: FONT,
                fontSize: 11,
                padding: '6px 8px',
              }}
            />
          </div>
        </div>

        {/* Preview total */}
        {selectedItem && (
          <div style={{ color: GOLD, fontFamily: FONT, fontSize: 11 }}>
            Total listing value: {qty * price}g
          </div>
        )}

        <button
          onClick={handleList}
          disabled={!selectedItem}
          style={{
            padding: '8px 0',
            background: selectedItem ? 'rgba(205,68,32,0.22)' : 'rgba(40,40,40,0.5)',
            border: `1px solid ${selectedItem ? RUST : '#333'}`,
            color: selectedItem ? RUST : DIM,
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            cursor: selectedItem ? 'pointer' : 'not-allowed',
            borderRadius: 4,
          }}
        >
          LIST ITEM
        </button>
      </div>

      {/* My active listings */}
      <div>
        <div style={{ color: DIM, fontFamily: FONT, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
          YOUR ACTIVE LISTINGS ({myListingData.length})
        </div>
        {myListingData.length === 0 ? (
          <div style={{ color: DIM, fontFamily: FONT, fontSize: 11, padding: '12px 0' }}>
            No active listings.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {myListingData.map(listing => (
              <div key={listing.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: BG,
                border: BORDER,
                borderRadius: 4,
              }}>
                <div>
                  <div style={{ color: '#ccc', fontFamily: FONT, fontSize: 11 }}>
                    {getDisplayName(listing.materialId, listing.itemId)} x{listing.quantity}
                  </div>
                  <div style={{ color: GOLD, fontFamily: FONT, fontSize: 9 }}>
                    {listing.pricePerUnit}g each — {listing.pricePerUnit * listing.quantity}g total
                  </div>
                </div>
                <button
                  onClick={() => handleCancel(listing.id)}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid #e74c3c',
                    color: '#e74c3c',
                    fontFamily: FONT,
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderRadius: 3,
                  }}
                >
                  CANCEL
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TradePostPanel ─────────────────────────────────────────────────────────────

export function TradePostPanel() {
  const [tab, setTab] = useState<'browse' | 'sell'>('browse')
  const gold = usePlayerStore(s => s.gold)

  return (
    <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Gold bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 0 10px 0',
        gap: 6,
      }}>
        <span style={{ color: DIM, fontSize: 9, letterSpacing: 0.5 }}>YOUR GOLD</span>
        <span style={{ color: GOLD, fontSize: 13, fontWeight: 700 }}>{gold}g</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: BORDER, marginBottom: 12 }}>
        <TabBtn label="BROWSE" active={tab === 'browse'} onClick={() => setTab('browse')} />
        <TabBtn label="SELL"   active={tab === 'sell'}   onClick={() => setTab('sell')} />
      </div>

      {tab === 'browse' ? <BrowseTab /> : <SellTab />}
    </div>
  )
}
