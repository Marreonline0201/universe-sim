// ── InspectPlayerOverlay ────────────────────────────────────────────────────────
// M29 Track C4: Shows a small "Inspect Player" modal when F is pressed near a
// remote player (within 3m). Closes on Escape or clicking outside.

import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { RemotePlayer } from '../store/multiplayerStore'

// ── Store ──────────────────────────────────────────────────────────────────────
interface InspectPlayerState {
  inspectedPlayer: RemotePlayer | null
  openInspect:     (p: RemotePlayer) => void
  closeInspect:    () => void
}

export const useInspectPlayerStore = create<InspectPlayerState>((set) => ({
  inspectedPlayer: null,
  openInspect:    (p) => set({ inspectedPlayer: p }),
  closeInspect:   ()  => set({ inspectedPlayer: null }),
}))

// ── Overlay component ─────────────────────────────────────────────────────────
export function InspectPlayerOverlay() {
  const { inspectedPlayer, closeInspect } = useInspectPlayerStore()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!inspectedPlayer) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); closeInspect() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [inspectedPlayer, closeInspect])

  if (!inspectedPlayer) return null

  const p = inspectedPlayer
  const hpPct     = Math.round(p.health * 100)
  const warmthPct = p.warmth !== undefined ? Math.round(p.warmth * 100) : null

  function hpColor(pct: number) {
    if (pct > 50) return '#2ecc71'
    if (pct > 25) return '#f39c12'
    return '#e74c3c'
  }

  return (
    /* Backdrop — click outside to close */
    <div
      onClick={closeInspect}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'auto',
      }}
    >
      {/* Panel — stop propagation so click inside doesn't close */}
      <div
        ref={overlayRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(12,12,12,0.97)',
          border: '1px solid #2a2a2a',
          borderLeft: '3px solid #cd4420',
          borderRadius: 6,
          padding: '20px 24px',
          minWidth: 280,
          maxWidth: 340,
          fontFamily: '"Courier New", monospace',
          color: '#e0d6c8',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          borderBottom: '1px solid #2a2a2a',
          paddingBottom: 10,
        }}>
          <span style={{
            fontSize: 11,
            letterSpacing: 2,
            color: '#cd4420',
            fontWeight: 700,
          }}>
            INSPECT PLAYER
          </span>
          <button
            onClick={closeInspect}
            style={{
              background: 'none',
              border: 'none',
              color: '#555',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: 2,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ccc')}
            onMouseLeave={e => (e.currentTarget.style.color = '#555')}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Username */}
        <div style={{
          fontSize: 18,
          fontWeight: 700,
          color: '#ffffff',
          marginBottom: 14,
          letterSpacing: 0.5,
        }}>
          {p.username}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* HP */}
          <StatRow
            label="HP"
            value={hpPct}
            color={hpColor(hpPct)}
          />

          {/* Warmth */}
          {warmthPct !== null && (
            <StatRow
              label="WARMTH"
              value={warmthPct}
              color={warmthPct > 50 ? '#3498db' : warmthPct > 25 ? '#f39c12' : '#e74c3c'}
            />
          )}

          {/* Equipped weapon */}
          {p.equippedWeapon && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
            }}>
              <span style={{ fontSize: 10, color: '#555', width: 70, flexShrink: 0, letterSpacing: 1 }}>
                WEAPON
              </span>
              <span style={{
                fontSize: 11,
                color: '#cd4420',
                fontWeight: 700,
                letterSpacing: 0.5,
              }}>
                {p.equippedWeapon}
              </span>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          marginTop: 16,
          fontSize: 9,
          color: '#333',
          textAlign: 'center',
          letterSpacing: 1,
        }}>
          ESC OR CLICK OUTSIDE TO CLOSE
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        fontSize: 10,
        color: '#555',
        width: 70,
        flexShrink: 0,
        letterSpacing: 1,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 5,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s, background 0.3s',
        }} />
      </div>
      <span style={{
        fontSize: 10,
        color,
        fontFamily: 'monospace',
        width: 32,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {value}%
      </span>
    </div>
  )
}
