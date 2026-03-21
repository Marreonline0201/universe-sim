// ── VelarResponsePanel.tsx ────────────────────────────────────────────────────
// M14 Track B: Panel showing the Velar response message (5 symbols) received
// after probing Velar (2.1 AU). Player decodes by assigning each symbol a
// concept from the hint list. When all 5 are correct, gateway coordinates unlock.
//
// Design: dark translucent panel, teal accent color matching FirstContactOverlay.
// Each symbol rendered as SVG. Decoded symbols show their label in teal.

import { useState, useMemo } from 'react'
import {
  generateVelarAlphabet,
  VELAR_RESPONSE_SEQUENCE,
  VELAR_DECODED_MESSAGE,
  CONCEPT_LABELS,
} from '../game/VelarLanguageSystem'
import type { VelarConcept } from '../game/VelarLanguageSystem'
import { useVelarStore } from '../store/velarStore'
import { useUiStore } from '../store/uiStore'
import { getWorldSocket } from '../net/useWorldSocket'

interface VelarResponsePanelProps {
  worldSeed: number
  onClose:   () => void
  onDecoded: () => void
}

export function VelarResponsePanel({ worldSeed, onClose, onDecoded }: VelarResponsePanelProps) {
  const alphabet = useMemo(() => generateVelarAlphabet(worldSeed), [worldSeed])

  // Track player's guess for each symbol position (0–4)
  const [guesses, setGuesses] = useState<(VelarConcept | null)[]>(Array(5).fill(null))
  const [submitted, setSubmitted] = useState(false)
  const [errorPos, setErrorPos]   = useState<number | null>(null)
  const gatewayRevealed = useVelarStore(s => s.gatewayRevealed)

  // Build a lookup: concept → glyph svg
  const conceptToGlyph = useMemo(() => {
    const map = new Map<VelarConcept, string>()
    for (const g of alphabet) map.set(g.concept, g.svgPath)
    return map
  }, [alphabet])

  function setGuess(pos: number, concept: VelarConcept | null) {
    setGuesses(prev => {
      const next = [...prev]
      next[pos] = concept
      return next
    })
    setErrorPos(null)
  }

  function checkDecoded(): boolean {
    return VELAR_RESPONSE_SEQUENCE.every((concept, i) => guesses[i] === concept)
  }

  function handleSubmit() {
    if (guesses.some(g => g === null)) {
      useUiStore.getState().addNotification('Assign a concept to every symbol first.', 'warning')
      return
    }
    setSubmitted(true)

    // Find first wrong position and flash it
    const firstError = VELAR_RESPONSE_SEQUENCE.findIndex((c, i) => guesses[i] !== c)
    if (firstError >= 0) {
      setErrorPos(firstError)
      setTimeout(() => setErrorPos(null), 900)
      setTimeout(() => setSubmitted(false), 1000)
      return
    }

    // All correct — reveal gateway
    useVelarStore.getState().markGatewayRevealed()
    useUiStore.getState().addNotification(
      'Velar message decoded! "WE ARE THE ORIGIN OF LIFE. COME HOME." — Gateway coordinates unlocked.',
      'discovery'
    )
    try {
      const ws = getWorldSocket()
      ws?.send({ type: 'VELAR_RESPONSE_DECODED', message: VELAR_DECODED_MESSAGE })
    } catch {}
    onDecoded()
  }

  const allFilled = guesses.every(g => g !== null)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 180,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'rgba(5,15,20,0.97)',
        border: '1px solid rgba(0,200,180,0.4)',
        borderRadius: 12,
        padding: '28px 32px',
        maxWidth: 680,
        width: '92vw',
        fontFamily: 'monospace',
        color: '#e0f0f0',
        boxShadow: '0 0 60px rgba(0,200,180,0.12)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, color: '#00c8b4', letterSpacing: '0.15em', marginBottom: 4 }}>
              VELAR TRANSMISSION — PRIORITY ALPHA
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>
              Velar Response Received
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 20, padding: 4 }}
          >
            x
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#7a9a9a', marginBottom: 20, lineHeight: 1.6 }}>
          Your orbital probe to Velar (2.1 AU) triggered a response. The Velar communicate
          in a procedural symbol language. Decode each of the 5 symbols below by selecting
          the correct concept. Use the contextual hints to guide your interpretation.
        </div>

        {/* Symbol row */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {VELAR_RESPONSE_SEQUENCE.map((concept, pos) => {
            const glyph     = conceptToGlyph.get(concept)
            const isDecoded = gatewayRevealed
            const guess     = guesses[pos]
            const isError   = errorPos === pos

            return (
              <div key={pos} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                width: 100,
              }}>
                {/* Symbol SVG */}
                <div style={{
                  width: 80, height: 80,
                  border: `2px solid ${isError ? '#ff4444' : isDecoded ? '#00c8b4' : guess ? 'rgba(0,200,180,0.5)' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isError ? 'rgba(255,0,0,0.1)' : isDecoded ? 'rgba(0,200,180,0.08)' : 'rgba(255,255,255,0.04)',
                  transition: 'border-color 0.2s, background 0.2s',
                  overflow: 'hidden',
                }}>
                  {glyph && (
                    <svg width={64} height={64} viewBox="0 0 64 64" fill="none">
                      <path
                        d={glyph}
                        stroke={isDecoded ? '#00c8b4' : '#c0e0e0'}
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  )}
                </div>

                {/* Concept selector */}
                {isDecoded ? (
                  <div style={{ fontSize: 11, color: '#00c8b4', textAlign: 'center', fontWeight: 600 }}>
                    {CONCEPT_LABELS[concept]}
                  </div>
                ) : (
                  <select
                    value={guess ?? ''}
                    onChange={e => setGuess(pos, e.target.value as VelarConcept || null)}
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(0,200,180,0.3)',
                      borderRadius: 4,
                      color: '#c0e0e0',
                      fontSize: 10,
                      padding: '3px 4px',
                      width: 96,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">-- select --</option>
                    {alphabet.map(g => (
                      <option key={g.concept} value={g.concept}>
                        {CONCEPT_LABELS[g.concept]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>

        {/* Hint panel */}
        <div style={{
          background: 'rgba(0,200,180,0.05)',
          border: '1px solid rgba(0,200,180,0.2)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          fontSize: 11,
          color: '#7ac0b8',
          lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 600, color: '#00c8b4', marginBottom: 6, fontSize: 12 }}>
            SYMBOL GUIDE
          </div>
          {alphabet.map(g => (
            <div key={g.concept} style={{ marginBottom: 2 }}>
              <span style={{ color: '#c0e0e0' }}>{CONCEPT_LABELS[g.concept]}</span>
              {' — '}
              {g.hint}
            </div>
          ))}
        </div>

        {/* Decoded message preview */}
        {gatewayRevealed && (
          <div style={{
            background: 'rgba(0,200,180,0.1)',
            border: '1px solid #00c8b4',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            color: '#00c8b4',
            fontWeight: 600,
            textAlign: 'center',
            letterSpacing: '0.05em',
          }}>
            {VELAR_DECODED_MESSAGE}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            color: '#888',
            cursor: 'pointer',
            fontSize: 12,
            padding: '7px 18px',
            fontFamily: 'monospace',
          }}>
            Close
          </button>
          {!gatewayRevealed && (
            <button
              onClick={handleSubmit}
              disabled={!allFilled || submitted}
              style={{
                background: allFilled ? 'rgba(0,200,180,0.2)' : 'rgba(0,0,0,0.3)',
                border: `1px solid ${allFilled ? '#00c8b4' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6,
                color: allFilled ? '#00c8b4' : '#444',
                cursor: allFilled ? 'pointer' : 'not-allowed',
                fontSize: 12,
                padding: '7px 18px',
                fontFamily: 'monospace',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              Decode Transmission
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
