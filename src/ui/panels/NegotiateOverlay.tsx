// ── NegotiateOverlay.tsx ──────────────────────────────────────────────────────
// M43 Track B: Price negotiation overlay for NPC merchant purchases.
//
// Shows offer input pre-filled with market price. Merchant acceptance logic:
//   >= 100%: instant accept
//   75–99%:  30% accept / 70% reject
//   < 75%:   "That's insulting." instant reject
//
// Style: dark translucent, monospace, rust-orange accents (consistent with MerchantPanel).

import { useState, useCallback } from 'react'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface NegotiateItem {
  name: string
  matId: number
  qty: number
  marketPrice: number
}

export interface NegotiateOverlayProps {
  item: NegotiateItem
  onConfirm: (paidPrice: number) => void
  onCancel: () => void
}

// ── Style constants ───────────────────────────────────────────────────────────

const RUST_ORANGE = '#cd4420'
const GOLD_COLOR  = '#f1c40f'
const GREEN_COLOR = '#2ecc71'
const RED_COLOR   = '#e74c3c'
const GRAY_COLOR  = '#888'

// ── Merchant responses ────────────────────────────────────────────────────────

const ACCEPT_RESPONSES = [
  'Deal! Thank you.',
  'Agreed — pleasure doing business.',
  'You drive a hard bargain. Deal.',
]

const REJECT_RESPONSES = [
  "I can't go that low. Try again.",
  "Not enough. I have a family to feed.",
  "That won't cover my costs. No deal.",
]

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── NegotiateOverlay ──────────────────────────────────────────────────────────

export function NegotiateOverlay({ item, onConfirm, onCancel }: NegotiateOverlayProps) {
  const totalMarketPrice = item.marketPrice * item.qty
  const [offerValue, setOfferValue] = useState(totalMarketPrice)
  const [merchantText, setMerchantText] = useState<string | null>(null)
  const [result, setResult] = useState<'pending' | 'accepted' | 'rejected'>('pending')

  const handleOffer = useCallback(() => {
    const offer = Math.max(0, Math.round(offerValue))
    const ratio = offer / totalMarketPrice

    if (ratio >= 1.0) {
      // Full price or above — instant accept
      setMerchantText('Deal! Thank you.')
      setResult('accepted')
      setTimeout(() => onConfirm(offer), 800)
    } else if (ratio >= 0.75) {
      // 30% chance to accept
      if (Math.random() < 0.3) {
        const text = randomPick(ACCEPT_RESPONSES)
        setMerchantText(text)
        setResult('accepted')
        setTimeout(() => onConfirm(offer), 800)
      } else {
        const text = randomPick(REJECT_RESPONSES)
        setMerchantText(text)
        setResult('rejected')
      }
    } else {
      // Below 75% — insult rejection
      setMerchantText("That's insulting. Come back when you're serious.")
      setResult('rejected')
    }
  }, [offerValue, totalMarketPrice, onConfirm])

  const isSettled = result !== 'pending'

  return (
    // Backdrop
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSettled) onCancel()
      }}
    >
      {/* Panel */}
      <div
        style={{
          background: 'rgba(20,18,14,0.97)',
          border: `1px solid ${RUST_ORANGE}`,
          borderRadius: 10,
          padding: '22px 28px',
          minWidth: 320,
          maxWidth: 400,
          fontFamily: 'monospace',
          color: '#ddd',
          boxShadow: `0 0 32px rgba(205,68,32,0.22)`,
        }}
      >
        {/* Header */}
        <div style={{ fontSize: 11, color: RUST_ORANGE, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
          NEGOTIATE PRICE
        </div>

        {/* Item summary */}
        <div style={{
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
        }}>
          <span style={{ color: '#aaa' }}>Buying: </span>
          <span style={{ color: '#fff', fontWeight: 700 }}>{item.qty}× {item.name}</span>
          <div style={{ marginTop: 4, fontSize: 11, color: GRAY_COLOR }}>
            Market price:{' '}
            <span style={{ color: GOLD_COLOR }}>💰 {totalMarketPrice}</span>
          </div>
        </div>

        {/* Offer input — only show when still negotiating */}
        {!isSettled && (
          <>
            <label style={{ fontSize: 11, color: GRAY_COLOR, letterSpacing: 0.5 }}>
              YOUR OFFER
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 16 }}>
              <span style={{ color: GOLD_COLOR, fontSize: 14 }}>💰</span>
              <input
                type="number"
                min={1}
                max={totalMarketPrice * 3}
                value={offerValue}
                onChange={(e) => setOfferValue(Number(e.target.value))}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.07)',
                  border: `1px solid rgba(205,68,32,0.5)`,
                  borderRadius: 5,
                  color: GOLD_COLOR,
                  fontFamily: 'monospace',
                  fontSize: 16,
                  padding: '5px 10px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Hint text */}
            <div style={{ fontSize: 10, color: '#555', marginBottom: 14, letterSpacing: 0.3 }}>
              Hint: offer ≥ 75% of market price to have a chance.
            </div>
          </>
        )}

        {/* Merchant response */}
        {merchantText && (
          <div style={{
            padding: '8px 12px',
            background: result === 'accepted'
              ? 'rgba(46,204,113,0.10)'
              : 'rgba(231,76,60,0.10)',
            border: `1px solid ${result === 'accepted' ? GREEN_COLOR : RED_COLOR}`,
            borderRadius: 6,
            marginBottom: 14,
            fontSize: 12,
            color: result === 'accepted' ? GREEN_COLOR : RED_COLOR,
            fontStyle: 'italic',
          }}>
            "{merchantText}"
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!isSettled && (
            <button
              onClick={handleOffer}
              style={{
                flex: 1,
                padding: '8px 0',
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.5,
                background: `rgba(205,68,32,0.22)`,
                border: `1px solid ${RUST_ORANGE}`,
                borderRadius: 5,
                color: RUST_ORANGE,
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              MAKE OFFER
            </button>
          )}

          {result === 'rejected' && (
            <button
              onClick={handleOffer}
              style={{
                flex: 1,
                padding: '8px 0',
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 5,
                color: '#aaa',
                cursor: 'pointer',
              }}
            >
              TRY AGAIN
            </button>
          )}

          <button
            onClick={onCancel}
            disabled={result === 'accepted'}
            style={{
              padding: '8px 16px',
              fontFamily: 'monospace',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 5,
              color: result === 'accepted' ? '#444' : '#777',
              cursor: result === 'accepted' ? 'not-allowed' : 'pointer',
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}
