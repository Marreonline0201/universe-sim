// ── TradePanel.tsx ────────────────────────────────────────────────────────────
// M35 Track A: Player-to-player trade UI + NPC villager barter fallback.
//
// Multiplayer mode:
//   - Opened when player initiates a trade request with another player.
//   - Two columns: "Your Offer" + "Their Request". Both must Confirm.
//   - 30-second timeout if no response.
//
// Single-player / NPC mode (default):
//   - Trade with NPC villagers based on archetype.
//   - Offer items from inventory, receive gold or other materials.
//
// Style: split-pane dark layout, monospace.

import { useState, useEffect, useCallback } from 'react'
import { create } from 'zustand'
import { inventory } from '../../game/GameSingletons'
import { merchantSystem } from '../../game/MerchantSystem'
import { marketSystem } from '../../game/MarketSystem'
import { usePlayerStore } from '../../store/playerStore'
import { useUiStore } from '../../store/uiStore'
import { MAT, ITEM } from '../../player/Inventory'
import type { MerchantArchetype } from '../../game/MerchantSystem'
import type { RemotePlayer } from '../../store/multiplayerStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TradeMode = 'npc' | 'player'

export interface TradeRequest {
  tradeId:       string
  fromId:        string
  toId:          string
  fromUsername:  string
  toUsername:    string
  offeredItems:  number[]   // slot indices from fromId's inventory
  requestedItems: number[]  // slot indices from toId's inventory
}

// ── Trade Store ───────────────────────────────────────────────────────────────

interface TradePanelState {
  isOpen:     boolean
  mode:       TradeMode
  // NPC mode fields
  npcName:    string
  npcArchetype: MerchantArchetype
  settlementId: string
  // Player trade fields
  tradeRequest: TradeRequest | null
  localConfirmed:  boolean
  remoteConfirmed: boolean
  timeoutAt:   number | null

  openNpcTrade: (npcName: string, archetype: MerchantArchetype, settlementId: string) => void
  openPlayerTrade: (request: TradeRequest) => void
  closeTrade: () => void
  setLocalConfirmed: (v: boolean) => void
  setRemoteConfirmed: (v: boolean) => void
}

export const useTradePanelStore = create<TradePanelState>((set) => ({
  isOpen: false,
  mode: 'npc',
  npcName: 'Villager',
  npcArchetype: 'general',
  settlementId: 'default',
  tradeRequest: null,
  localConfirmed:  false,
  remoteConfirmed: false,
  timeoutAt: null,

  openNpcTrade: (npcName, archetype, settlementId) => set({
    isOpen: true,
    mode: 'npc',
    npcName,
    npcArchetype: archetype,
    settlementId,
    tradeRequest: null,
    localConfirmed: false,
    remoteConfirmed: false,
    timeoutAt: null,
  }),

  openPlayerTrade: (request) => set({
    isOpen: true,
    mode: 'player',
    tradeRequest: request,
    localConfirmed: false,
    remoteConfirmed: false,
    timeoutAt: Date.now() + 30_000,
  }),

  closeTrade: () => set({
    isOpen: false,
    tradeRequest: null,
    localConfirmed: false,
    remoteConfirmed: false,
    timeoutAt: null,
  }),

  setLocalConfirmed:  (v) => set({ localConfirmed: v }),
  setRemoteConfirmed: (v) => set({ remoteConfirmed: v }),
}))

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

// ── NPC Barter Panel ──────────────────────────────────────────────────────────
// Player selects items to offer; NPC offers gold in return based on market prices.

function NpcTradePane() {
  const { npcName, npcArchetype, settlementId, closeTrade } = useTradePanelStore()
  const addGold         = usePlayerStore(s => s.addGold)
  const spendGold       = usePlayerStore(s => s.spendGold)
  const addNotification = useUiStore(s => s.addNotification)

  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set())
  const [, refresh] = useState(0)

  const slots = inventory.listItems()

  function toggleSlot(idx: number) {
    setSelectedSlots(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Compute total gold the NPC will pay for selected items
  const totalOffer = Array.from(selectedSlots).reduce((sum, idx) => {
    const slot = inventory.getSlot(idx)
    if (!slot) return sum
    const base = merchantSystem.getBuyPrice(npcArchetype, slot.itemId, slot.materialId)
    if (base <= 0) return sum
    return sum + marketSystem.getPrice(settlementId, slot.materialId, base, slot.itemId)
  }, 0)

  const handleConfirmBarter = useCallback(() => {
    if (selectedSlots.size === 0) {
      addNotification('Select items to offer', 'warning')
      return
    }
    let earnedGold = 0
    const toRemove = Array.from(selectedSlots)
    // Process in reverse order to preserve slot indices
    toRemove.sort((a, b) => b - a)
    for (const idx of toRemove) {
      const slot = inventory.getSlot(idx)
      if (!slot) continue
      const base = merchantSystem.getBuyPrice(npcArchetype, slot.itemId, slot.materialId)
      if (base <= 0) continue
      const price = marketSystem.getPrice(settlementId, slot.materialId, base, slot.itemId)
      const removed = inventory.removeItem(idx, 1)
      if (removed) {
        earnedGold += price
        marketSystem.recordSale(settlementId, slot.materialId, 1, slot.itemId)
      }
    }
    if (earnedGold > 0) {
      addGold(earnedGold)
      addNotification(`Bartered for 💰 ${earnedGold}`, 'info')
    }
    setSelectedSlots(new Set())
    refresh(r => r + 1)
  }, [selectedSlots, npcArchetype, settlementId, addGold, addNotification])

  // NPC also sells: buy selected items from merchant list
  const sellList = merchantSystem.getSellList(npcArchetype)
  const [buyIdx, setBuyIdx] = useState<number | null>(null)
  const gold = usePlayerStore(s => s.gold)

  const handleBuyFromNpc = useCallback((idx: number) => {
    const item = sellList[idx]
    if (!item) return
    const livePrice = marketSystem.getPrice(settlementId, item.materialId, item.price, item.itemId)
    if (!spendGold(livePrice)) {
      addNotification(`Need 💰 ${livePrice}`, 'warning')
      return
    }
    const added = inventory.addItem({ itemId: item.itemId, materialId: item.materialId, quantity: 1, quality: 0.8, rarity: 0 })
    if (!added) {
      addGold(livePrice)
      addNotification('Inventory full', 'warning')
      return
    }
    marketSystem.recordPurchase(settlementId, item.materialId, 1, item.itemId)
    const label = item.itemId === 0
      ? capitalize(MAT_NAMES[item.materialId] ?? item.name)
      : capitalize(ITEM_NAMES[item.itemId] ?? item.name)
    addNotification(`Bought ${label} for 💰 ${livePrice}`, 'info')
    setBuyIdx(null)
  }, [sellList, settlementId, spendGold, addGold, addNotification])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e0d6c8', letterSpacing: 0.5 }}>
          Trading with {npcName}
        </span>
        <button onClick={closeTrade} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>
          ✕
        </button>
      </div>

      {/* Split pane */}
      <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>

        {/* Left: Your offer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 8, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
            YOUR OFFER
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {slots.length === 0 && (
              <div style={{ color: '#444', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', paddingTop: 20 }}>
                Inventory empty
              </div>
            )}
            {slots.map(({ slot, index: idx }) => {
              const name = slot.itemId === 0
                ? capitalize(MAT_NAMES[slot.materialId] ?? `mat #${slot.materialId}`)
                : capitalize(ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)
              const basePrice = merchantSystem.getBuyPrice(npcArchetype, slot.itemId, slot.materialId)
              const livePrice = basePrice > 0 ? marketSystem.getPrice(settlementId, slot.materialId, basePrice, slot.itemId) : 0
              const selected = selectedSlots.has(idx)
              return (
                <div
                  key={idx}
                  onClick={() => toggleSlot(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 7px',
                    marginBottom: 3,
                    background: selected ? 'rgba(46,204,113,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selected ? GREEN_COLOR : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 4,
                    cursor: livePrice > 0 ? 'pointer' : 'default',
                    opacity: livePrice > 0 ? 1 : 0.35,
                  }}
                >
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ccc' }}>{name}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: livePrice > 0 ? GREEN_COLOR : '#444' }}>
                    {livePrice > 0 ? `💰 ${livePrice}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Offer total + confirm */}
          {selectedSlots.size > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 7 }}>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: GOLD_COLOR, marginBottom: 6 }}>
                Total: 💰 {totalOffer}
              </div>
              <button
                onClick={handleConfirmBarter}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(46,204,113,0.18)',
                  border: '1px solid #2ecc71',
                  borderRadius: 4,
                  color: '#2ecc71',
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                }}
              >
                ✓ BARTER
              </button>
            </div>
          )}
        </div>

        {/* Right: NPC offers to sell */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 8, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
            NPC WARES
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sellList.map((item, idx) => {
              const livePrice = marketSystem.getPrice(settlementId, item.materialId, item.price, item.itemId)
              const canAfford = gold >= livePrice
              const label = item.itemId === 0
                ? capitalize(MAT_NAMES[item.materialId] ?? item.name)
                : capitalize(ITEM_NAMES[item.itemId] ?? item.name)
              return (
                <div
                  key={idx}
                  onClick={() => canAfford && handleBuyFromNpc(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 7px',
                    marginBottom: 3,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    cursor: canAfford ? 'pointer' : 'default',
                    opacity: canAfford ? 1 : 0.4,
                  }}
                >
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ccc' }}>{label}</span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: GOLD_COLOR }}>💰 {livePrice}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Player Trade Pane ─────────────────────────────────────────────────────────

function PlayerTradePane() {
  const {
    tradeRequest,
    localConfirmed,
    remoteConfirmed,
    timeoutAt,
    setLocalConfirmed,
    closeTrade,
  } = useTradePanelStore()
  const addNotification = useUiStore(s => s.addNotification)

  const [myOfferSlots, setMyOfferSlots]       = useState<Set<number>>(new Set())
  const [secondsLeft, setSecondsLeft]         = useState(30)
  const [, refresh] = useState(0)

  // Countdown timer
  useEffect(() => {
    if (!timeoutAt) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timeoutAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining <= 0) {
        addNotification('Trade request timed out', 'warning')
        closeTrade()
      }
    }, 500)
    return () => clearInterval(interval)
  }, [timeoutAt, closeTrade, addNotification])

  const slots = inventory.listItems()

  function toggleOffer(idx: number) {
    setMyOfferSlots(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function handleConfirm() {
    setLocalConfirmed(true)
    addNotification('Waiting for other player to confirm...', 'info')
  }

  // If both confirmed, execute trade (single-player: just remove offered items, get gold)
  useEffect(() => {
    if (localConfirmed && remoteConfirmed) {
      // Execute trade
      let totalValue = 0
      const toRemove = Array.from(myOfferSlots).sort((a, b) => b - a)
      for (const idx of toRemove) {
        const slot = inventory.getSlot(idx)
        if (!slot) continue
        // Rough valuation: base item price from general merchant
        const base = merchantSystem.getBuyPrice('general', slot.itemId, slot.materialId)
        if (base <= 0) continue
        inventory.removeItem(idx, 1)
        totalValue += base
      }
      usePlayerStore.getState().addGold(totalValue)
      addNotification(`Trade complete! Received 💰 ${totalValue}`, 'info')
      closeTrade()
    }
  }, [localConfirmed, remoteConfirmed, myOfferSlots, closeTrade, addNotification])

  if (!tradeRequest) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e0d6c8', letterSpacing: 0.5 }}>
          Trade with {tradeRequest.fromId !== tradeRequest.toId
            ? tradeRequest.fromUsername
            : tradeRequest.toUsername}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: secondsLeft < 10 ? '#e74c3c' : '#888' }}>
            ⏱ {secondsLeft}s
          </span>
          <button onClick={closeTrade} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>

        {/* Left: Your offer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 8, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
            YOUR OFFER
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {slots.length === 0 && (
              <div style={{ color: '#444', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', paddingTop: 20 }}>
                Nothing to offer
              </div>
            )}
            {slots.map(({ slot, index: idx }) => {
              const name = slot.itemId === 0
                ? capitalize(MAT_NAMES[slot.materialId] ?? `mat #${slot.materialId}`)
                : capitalize(ITEM_NAMES[slot.itemId] ?? `item #${slot.itemId}`)
              const selected = myOfferSlots.has(idx)
              return (
                <div
                  key={idx}
                  onClick={() => !localConfirmed && toggleOffer(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 7px',
                    marginBottom: 3,
                    background: selected ? 'rgba(205,68,32,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selected ? RUST_ORANGE : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 4,
                    cursor: localConfirmed ? 'default' : 'pointer',
                    opacity: localConfirmed && !selected ? 0.35 : 1,
                  }}
                >
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#ccc' }}>{name}</span>
                  {selected && <span style={{ fontSize: 10, color: RUST_ORANGE }}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Their offer (requested items) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 8, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, marginBottom: 6, fontFamily: 'monospace' }}>
            THEIR OFFER
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#444', textAlign: 'center' }}>
              {remoteConfirmed
                ? <span style={{ color: GREEN_COLOR }}>✓ Confirmed</span>
                : 'Waiting for other player...'}
            </span>
          </div>
        </div>
      </div>

      {/* Status + confirm button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace' }}>
          <span style={{ color: localConfirmed ? GREEN_COLOR : '#555' }}>You: {localConfirmed ? '✓ Ready' : 'pending'}</span>
          <span style={{ color: '#333', margin: '0 8px' }}>|</span>
          <span style={{ color: remoteConfirmed ? GREEN_COLOR : '#555' }}>Them: {remoteConfirmed ? '✓ Ready' : 'pending'}</span>
        </div>
        <button
          onClick={handleConfirm}
          disabled={localConfirmed || myOfferSlots.size === 0}
          style={{
            padding: '6px 16px',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            background: localConfirmed ? 'rgba(80,80,80,0.2)' : 'rgba(46,204,113,0.18)',
            border: `1px solid ${localConfirmed ? '#444' : GREEN_COLOR}`,
            borderRadius: 4,
            color: localConfirmed ? '#555' : GREEN_COLOR,
            cursor: localConfirmed ? 'default' : 'pointer',
            letterSpacing: 0.5,
          }}
        >
          {localConfirmed ? '✓ CONFIRMED' : '✓ CONFIRM'}
        </button>
      </div>
    </div>
  )
}

// ── TradePanel ────────────────────────────────────────────────────────────────

export function TradePanel() {
  const { isOpen, mode, closeTrade } = useTradePanelStore()

  if (!isOpen) return null

  return (
    <div
      onClick={closeTrade}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(10,10,10,0.97)',
          border: '1px solid #1a1a1a',
          borderLeft: '3px solid #cd4420',
          borderRadius: 8,
          padding: '16px 18px',
          width: 480,
          maxWidth: '94vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"Courier New", monospace',
          color: '#e0d6c8',
          boxShadow: '0 12px 48px rgba(0,0,0,0.8)',
        }}
      >
        {/* Panel title */}
        <div style={{ fontSize: 10, color: '#cd4420', letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>
          BARTER & TRADE
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {mode === 'npc'    && <NpcTradePane />}
          {mode === 'player' && <PlayerTradePane />}
        </div>
      </div>
    </div>
  )
}

// ── Helper: open a trade with the nearest NPC ─────────────────────────────────
// Called from InspectPlayerOverlay or other triggers.

export function openNpcTradePanel(npcName: string, archetype: MerchantArchetype, settlementId: string): void {
  useTradePanelStore.getState().openNpcTrade(npcName, archetype, settlementId)
}

export function openPlayerTradePanel(request: TradeRequest): void {
  useTradePanelStore.getState().openPlayerTrade(request)
}

/** Returns true when a player-trade needs the remote player data to initiate. */
export function buildTradeRequest(
  fromId: string,
  fromUsername: string,
  target: RemotePlayer,
): TradeRequest {
  return {
    tradeId: `${fromId}-${target.userId}-${Date.now()}`,
    fromId,
    toId: target.userId,
    fromUsername,
    toUsername: target.username,
    offeredItems: [],
    requestedItems: [],
  }
}
