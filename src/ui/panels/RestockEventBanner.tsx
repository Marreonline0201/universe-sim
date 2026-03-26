// ── RestockEventBanner.tsx ────────────────────────────────────────────────────
// M48 Track B: NPC Merchant Restocking Events — HUD Banner
//
// Fixed bottom-center banner shown when a pendingRestockEvent is active.
// Polls every 500ms for time remaining and hides when expired or claimed.

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  pendingRestockEvent,
  claimRestockDeal,
  getRestockTimeRemaining,
  getRestockPoolEntry,
  type RestockEvent,
} from '../../game/MerchantRestockSystem'

function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

export function RestockEventBanner() {
  const [event, setEvent] = useState<RestockEvent | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [lastClaimed, setLastClaimed] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start/stop polling when an event is active
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(() => {
      const remaining = getRestockTimeRemaining()
      setTimeRemaining(remaining)
      if (remaining <= 0 || (pendingRestockEvent?.claimedIds.size === pendingRestockEvent?.stockedItemIds.length)) {
        setEvent(null)
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      } else {
        // Sync event reference (claimed flag may have changed)
        setEvent(pendingRestockEvent ? { ...pendingRestockEvent } : null)
      }
    }, 500)
  }, [])

  useEffect(() => {
    function onRestockEvent(e: Event) {
      const detail = (e as CustomEvent).detail as RestockEvent
      setEvent({ ...detail })
      setTimeRemaining(getRestockTimeRemaining())
      startPolling()
    }

    function onRestockClaimed() {
      setEvent(null)
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    window.addEventListener('restock-event', onRestockEvent)
    window.addEventListener('restock-claimed', onRestockClaimed)

    return () => {
      window.removeEventListener('restock-event', onRestockEvent)
      window.removeEventListener('restock-claimed', onRestockClaimed)
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [startPolling])

  if (!event) return null

  const handleBuy = (matId: number, qty: number) => {
    const ok = claimRestockDeal(matId, qty)
    if (ok) {
      setLastClaimed(matId)
      setTimeout(() => setLastClaimed(null), 1200)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1200,
      background: '#064e3b',
      border: '1.5px solid #34d399',
      borderRadius: 10,
      padding: '10px 18px',
      minWidth: 300,
      maxWidth: 420,
      boxShadow: '0 4px 24px rgba(52,211,153,0.18)',
      color: '#e6fff6',
      fontFamily: 'monospace',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
      }}>
        <span style={{ color: '#34d399', fontWeight: 'bold', fontSize: 13 }}>
          🛒 {event.merchantName} — Bulk Restock
        </span>
        <span style={{
          fontSize: 12,
          color: timeRemaining < 20_000 ? '#fca5a5' : '#6ee7b7',
          fontWeight: 'bold',
        }}>
          ⏱ {formatMs(timeRemaining)}
        </span>
      </div>

      {/* Discount badge */}
      <div style={{
        fontSize: 11,
        color: '#a7f3d0',
        marginBottom: 8,
      }}>
        Save <span style={{ color: '#34d399', fontWeight: 'bold' }}>{event.discountPct}%</span> on all items — limited time!
      </div>

      {/* Item rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {event.stockedItemIds.map((matId) => {
          const entry = getRestockPoolEntry(matId)
          if (!entry) return null
          const discounted = Math.max(1, Math.round(entry.basePrice * (1 - event.discountPct / 100)))
          const justBought = lastClaimed === matId
          return (
            <div key={matId} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(52,211,153,0.06)',
              borderRadius: 6,
              padding: '4px 8px',
              gap: 8,
            }}>
              {/* Item name + price */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: '#d1fae5' }}>{entry.name}</span>
                <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6, textDecoration: 'line-through' }}>
                  {entry.basePrice}g
                </span>
                <span style={{ fontSize: 12, color: '#34d399', marginLeft: 4, fontWeight: 'bold' }}>
                  {discounted}g
                </span>
              </div>

              {/* Buy buttons */}
              {!event.claimedIds.has(matId) ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleBuy(matId, 1)}
                    style={{
                      background: justBought ? '#065f46' : '#047857',
                      color: '#d1fae5',
                      border: 'none',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    Buy ×1
                  </button>
                  <button
                    onClick={() => handleBuy(matId, 5)}
                    style={{
                      background: justBought ? '#065f46' : '#047857',
                      color: '#d1fae5',
                      border: 'none',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    Buy ×5
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: '#6ee7b7', fontStyle: 'italic' }}>Claimed</span>
              )}
            </div>
          )
        })}
      </div>

      {event.claimedIds.size === event.stockedItemIds.length && (
        <div style={{
          marginTop: 8,
          textAlign: 'center',
          fontSize: 12,
          color: '#6ee7b7',
          fontStyle: 'italic',
        }}>
          All items purchased!
        </div>
      )}
    </div>
  )
}
