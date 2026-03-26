// ── ReputationToast.tsx ───────────────────────────────────────────────────────
// M42 Track C: Toast notification for reputation tier changes.
// Listens for reputation-tier-up / reputation-tier-down events and shows a
// brief overlay at bottom-right.

import { useState, useEffect, useCallback } from 'react'
import type { ReputationTier } from '../store/reputationStore'

interface ToastEntry {
  id: number
  settlementName: string
  tier: ReputationTier
  direction: 'up' | 'down'
}

const TIER_LABELS: Record<ReputationTier, string> = {
  hostile:  'HOSTILE',
  neutral:  'NEUTRAL',
  friendly: 'FRIENDLY',
  honored:  'HONORED',
  revered:  'REVERED',
}

let _nextId = 1

export function ReputationToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])

  const addToast = useCallback((entry: Omit<ToastEntry, 'id'>) => {
    const id = _nextId++
    setToasts(prev => [...prev, { ...entry, id }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    function onTierUp(e: Event) {
      const { settlementName, tier } = (e as CustomEvent).detail as { settlementName: string; tier: ReputationTier }
      addToast({ settlementName, tier, direction: 'up' })
    }
    function onTierDown(e: Event) {
      const { settlementName, tier } = (e as CustomEvent).detail as { settlementName: string; tier: ReputationTier }
      addToast({ settlementName, tier, direction: 'down' })
    }
    window.addEventListener('reputation-tier-up',   onTierUp)
    window.addEventListener('reputation-tier-down', onTierDown)
    return () => {
      window.removeEventListener('reputation-tier-up',   onTierUp)
      window.removeEventListener('reputation-tier-down', onTierDown)
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 200,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            background: t.direction === 'up' ? 'rgba(30,120,50,0.92)' : 'rgba(150,30,30,0.92)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'monospace',
            fontWeight: 700,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            border: t.direction === 'up' ? '1px solid #4caf50' : '1px solid #e53935',
          }}
        >
          {t.direction === 'up' ? '⬆' : '⬇'} {t.settlementName}: {TIER_LABELS[t.tier]}
        </div>
      ))}
    </div>
  )
}
