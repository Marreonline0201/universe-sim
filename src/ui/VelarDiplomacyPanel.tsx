// ── VelarDiplomacyPanel.tsx ───────────────────────────────────────────────────
// M15 Track B: Diplomatic exchange UI — opened by proximity to a Velar NPC.
//
// Three interaction modes:
//   Trade — exchange Earth materials for Velar exotic components
//   Learn — Velar teaches the 'velar_fabrication' knowledge branch (one-time)
//   Ask   — reveals Velar lore and purpose (journal entry)
//
// Visual: dark teal panel, procedural Velar NPC portrait, animated scan lines.

import { useState } from 'react'
import {
  VELAR_TRADES,
  attemptVelarTrade,
  attemptLearnVelarFabrication,
  revealVelarPurpose,
} from '../game/VelarDiplomacySystem'

const TEAL = '#00e8d0'
const DARK = '#021a18'

interface Props {
  npcIndex: number    // 0–7, used to seed the portrait
  onClose:  () => void
}

// ── Procedural Velar portrait ─────────────────────────────────────────────────
// Concentric ring face generated from seed — SVG, deterministic.

function VelarPortrait({ seed }: { seed: number }) {
  let s = (seed * 1664525 + 1013904223) >>> 0
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff }

  const cx = 40, cy = 40, r = 28
  const rings = Array.from({ length: 5 }, (_, i) => ({
    r:    r - i * 5.5,
    dash: `${3 + rand() * 4} ${1 + rand() * 3}`,
    rot:  rand() * 360,
    opac: 0.3 + i * 0.14,
  }))

  const eyes = [[-8, -4], [8, -4]] as [number, number][]
  const eyeR = 2 + rand() * 1.5

  return (
    <svg width={80} height={80} viewBox="0 0 80 80">
      {/* Background */}
      <circle cx={cx} cy={cy} r={r + 4} fill="#010e0c" />

      {/* Concentric rings */}
      {rings.map((ring, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={ring.r}
          fill="none"
          stroke={TEAL}
          strokeWidth={1.2}
          strokeDasharray={ring.dash}
          strokeDashoffset={ring.rot}
          opacity={ring.opac}
        />
      ))}

      {/* Eyes — two glowing dots */}
      {eyes.map(([ex, ey], i) => (
        <g key={i}>
          <circle cx={cx + ex} cy={cy + ey} r={eyeR + 2} fill={TEAL} opacity={0.15} />
          <circle cx={cx + ex} cy={cy + ey} r={eyeR} fill={TEAL} opacity={0.9} />
        </g>
      ))}

      {/* Chin line */}
      <line x1={cx - 6} y1={cy + 12} x2={cx + 6} y2={cy + 12}
        stroke={TEAL} strokeWidth={1} opacity={0.5} />

      {/* Outer glow ring */}
      <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke={TEAL} strokeWidth={0.6} opacity={0.2} />
    </svg>
  )
}

type Tab = 'trade' | 'learn' | 'ask'

const NPC_NAMES = [
  'Vel-Ka', 'Aleth-Sor', 'Quen-Dal', 'Yx-Arin', 'Thal-EM',
  'Soph-Iru', 'Ore-Nal', 'Velan-Ku',
]

export function VelarDiplomacyPanel({ npcIndex, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('trade')
  const [lastTrade, setLastTrade] = useState<string | null>(null)

  const npcName = NPC_NAMES[npcIndex % NPC_NAMES.length]

  function handleTrade(tradeId: string) {
    const trade = VELAR_TRADES.find(t => t.id === tradeId)
    if (!trade) return
    const success = attemptVelarTrade(trade)
    if (success) setLastTrade(tradeId)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: 480,
        maxHeight: '85vh',
        overflowY: 'auto',
        background: DARK,
        border: `1px solid rgba(0,232,208,0.3)`,
        borderRadius: 8,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        position: 'relative',
      }}>
        {/* Scan-line effect overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 8,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,232,208,0.012) 2px, rgba(0,232,208,0.012) 4px)',
          zIndex: 1,
        }} />

        {/* Header */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: `1px solid rgba(0,232,208,0.15)`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          position: 'relative', zIndex: 2,
        }}>
          <VelarPortrait seed={npcIndex * 31337 + 0x7e1a} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: 'rgba(0,232,208,0.55)', marginBottom: 4 }}>
              VELAR CITIZEN — LATTICE NODE
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
              {npcName}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
              One of the ancient ones. Their civilization seeded life across the galaxy
              through gateways they call the Lattice. They have noticed you.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
              fontSize: 18, padding: 4, alignSelf: 'flex-start',
            }}
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid rgba(0,232,208,0.1)`,
          position: 'relative', zIndex: 2,
        }}>
          {(['trade', 'learn', 'ask'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '10px 0',
                background: tab === t ? 'rgba(0,232,208,0.08)' : 'transparent',
                border: 'none',
                borderBottom: tab === t ? `2px solid ${TEAL}` : '2px solid transparent',
                color: tab === t ? TEAL : 'rgba(255,255,255,0.35)',
                fontSize: 9,
                letterSpacing: 2,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >
              {t === 'trade' ? 'Trade' : t === 'learn' ? 'Learn' : 'Ask'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '16px 20px', position: 'relative', zIndex: 2 }}>

          {/* ── TRADE TAB ─────────────────────────────────────────────────── */}
          {tab === 'trade' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: 4 }}>
                The Velar find your primitive materials curious. They will transmute them
                into forms beyond your current manufacturing capability.
              </div>
              {VELAR_TRADES.map(trade => (
                <div
                  key={trade.id}
                  style={{
                    background: lastTrade === trade.id ? 'rgba(0,232,208,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${lastTrade === trade.id ? 'rgba(0,232,208,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 6,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#e8e8e8', marginBottom: 4 }}>
                    {trade.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginBottom: 10 }}>
                    {trade.description}
                  </div>
                  <button
                    onClick={() => handleTrade(trade.id)}
                    style={{
                      background: `rgba(0,232,208,0.12)`,
                      border: `1px solid rgba(0,232,208,0.3)`,
                      borderRadius: 4,
                      padding: '5px 14px',
                      color: TEAL,
                      fontSize: 10,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      letterSpacing: 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    TRADE
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── LEARN TAB ─────────────────────────────────────────────────── */}
          {tab === 'learn' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
                The Velar can share the foundational principles of Velar Fabrication —
                the knowledge required to build a <span style={{ color: TEAL }}>Velar Fabricator</span>.
                Once you have one, you can synthesize Velar Alloy, Quantum Cores, and Beacons
                without trading.
              </div>

              <div style={{
                background: 'rgba(0,232,208,0.04)',
                border: '1px solid rgba(0,232,208,0.15)',
                borderRadius: 6,
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: 11, color: TEAL, marginBottom: 8 }}>
                  Velar Fabrication Knowledge
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: 12 }}>
                  Unlocks Recipes 106–110:<br />
                  • Velar Fabricator (Recipe 106)<br />
                  • Gravity Lens (Recipe 107)<br />
                  • Quantum Core synthesis (Recipe 108)<br />
                  • Velar Alloy synthesis (Recipe 109)<br />
                  • Velar Beacon (Recipe 110)
                </div>
                <button
                  onClick={() => { attemptLearnVelarFabrication(); setTab('trade') }}
                  style={{
                    background: TEAL,
                    border: 'none',
                    borderRadius: 4,
                    padding: '7px 18px',
                    color: '#000',
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    letterSpacing: 1,
                  }}
                >
                  LEARN FROM THE VELAR
                </button>
              </div>
            </div>
          )}

          {/* ── ASK TAB ───────────────────────────────────────────────────── */}
          {tab === 'ask' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
                You may ask {npcName} about the purpose of the Velar — why they seeded life
                across the galaxy, and what the gateway network truly is. This knowledge
                will be recorded in your Discovery Journal.
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: 11, color: '#e8e8e8', marginBottom: 8 }}>
                  "Why did you seed our world?"
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 12 }}>
                  A question that has no short answer. {npcName} will explain the Lattice
                  and the purpose of the Velar civilization. This is a one-time lore event
                  that adds a journal entry and notifies all connected players.
                </div>
                <button
                  onClick={() => { revealVelarPurpose(); onClose() }}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 4,
                    padding: '6px 14px',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 10,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    letterSpacing: 1,
                  }}
                >
                  ASK THE QUESTION
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
