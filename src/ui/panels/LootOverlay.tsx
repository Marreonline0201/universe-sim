// ── LootOverlay.tsx ────────────────────────────────────────────────────────────
// M44 Track A: Full-screen loot popup that appears on 'loot-drop' custom events.
//
// Listens for: window.dispatchEvent(new CustomEvent('loot-drop', {
//   detail: { drops: string[], source: string }
// }))
//
// Auto-dismisses after 4 seconds or on click.

import React, { useEffect, useState } from 'react'

interface LootDropDetail {
  drops: string[]
  source: string
}

export function LootOverlay() {
  const [visible, setVisible] = useState(false)
  const [drops, setDrops] = useState<string[]>([])
  const [source, setSource] = useState('')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function onLootDrop(e: Event) {
      const detail = (e as CustomEvent<LootDropDetail>).detail
      setDrops(detail.drops)
      setSource(detail.source)
      setVisible(true)

      clearTimeout(timer)
      timer = setTimeout(() => setVisible(false), 4000)
    }

    window.addEventListener('loot-drop', onLootDrop)
    return () => {
      window.removeEventListener('loot-drop', onLootDrop)
      clearTimeout(timer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      onClick={() => setVisible(false)}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2500,
        pointerEvents: 'auto',
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        style={{
          background: 'rgba(8,12,8,0.97)',
          border: '1px solid #4a7c2f',
          borderTop: '3px solid #d4a017',
          borderRadius: 6,
          padding: '24px 36px',
          minWidth: 280,
          maxWidth: 420,
          fontFamily: '"Courier New", monospace',
          textAlign: 'center',
          boxShadow: '0 0 40px rgba(212,160,23,0.25), 0 8px 32px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{
          color: '#d4a017',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 3,
          marginBottom: 6,
        }}>
          [ LOOT DROPPED ]
        </div>

        {/* Source label */}
        <div style={{
          color: '#7fc87f',
          fontSize: 11,
          letterSpacing: 1.5,
          marginBottom: 16,
          textTransform: 'uppercase',
          opacity: 0.85,
        }}>
          {source}
        </div>

        {/* Drop list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {drops.map((label, i) => (
            <div
              key={i}
              style={{
                color: '#b8e6a8',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: 0.5,
                padding: '4px 0',
                borderBottom: i < drops.length - 1 ? '1px solid rgba(74,124,47,0.3)' : 'none',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Dismiss hint */}
        <div style={{
          marginTop: 16,
          color: 'rgba(255,255,255,0.25)',
          fontSize: 9,
          letterSpacing: 1,
        }}>
          CLICK TO DISMISS
        </div>
      </div>
    </div>
  )
}
