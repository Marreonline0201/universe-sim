// ── SciencePanel ────────────────────────────────────────────────────────────────
// Science Companion — asks /api/science about the game's physical laws.
// Uses the Anthropic Claude API server-side (with static fallback when key absent).

import React, { useState, useRef, useEffect } from 'react'
import { setForecastAccuracy, forecastState, type ForecastAccuracy } from '../../game/WeatherForecastSystem'

interface Message {
  role: 'user' | 'assistant'
  text: string
  source?: 'claude' | 'static'
}

const RUST = '#cd4420'
const ACCENT = '#2ecc71'

const SUGGESTED_TOPICS = [
  { label: 'How does fire work?', query: 'How does fire work in the simulation?' },
  { label: 'Copper smelting science', query: 'Explain the chemistry behind copper smelting in the furnace.' },
  { label: 'Wound infection', query: 'How does bacterial infection in wounds work?' },
  { label: 'Why does food cook?', query: 'Why does food need to be cooked and what happens physically?' },
  { label: 'Ore placement geology', query: 'Why is copper found at high elevation and coal at low elevation?' },
  { label: 'NPC behavior', query: 'How do NPCs decide what to do?' },
  { label: 'Sleep & fatigue', query: 'How does sleep restore energy in this universe?' },
  { label: 'Wind & atmosphere', query: 'How is wind and weather simulated?' },
]

async function askScience(query: string): Promise<{ answer: string; source: 'claude' | 'static' }> {
  const res = await fetch('/api/science', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function SciencePanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'I explain the physical laws running this universe. Ask me about fire, copper smelting, bacterial infections, geology, sleep, weather, or NPC behavior — or pick a topic below.',
      source: 'static',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function submit(query: string) {
    if (!query.trim() || loading) return
    const q = query.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    try {
      const { answer, source } = await askScience(q)
      setMessages(prev => [...prev, { role: 'assistant', text: answer, source }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Could not reach the science companion. Check your connection.',
        source: 'static',
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Header tag */}
      <div style={{
        fontSize: 10,
        color: '#555',
        fontFamily: 'monospace',
        letterSpacing: 1.5,
        marginBottom: 12,
        textTransform: 'uppercase',
      }}>
        Physics Engine Explainer
      </div>

      {/* Meteorology Research Section */}
      <MeteorologyResearch />

      {/* Message thread */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        paddingRight: 4,
        minHeight: 0,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '90%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
              background: msg.role === 'user'
                ? 'rgba(205, 68, 32, 0.18)'
                : 'rgba(255,255,255,0.05)',
              border: msg.role === 'user'
                ? `1px solid rgba(205,68,32,0.35)`
                : '1px solid rgba(255,255,255,0.08)',
              fontSize: 12,
              lineHeight: 1.65,
              color: msg.role === 'user' ? '#e8c4b8' : '#ccc',
              fontFamily: msg.role === 'user' ? 'monospace' : 'sans-serif',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.text}
            </div>
            {msg.role === 'assistant' && msg.source && (
              <span style={{
                fontSize: 9,
                color: msg.source === 'claude' ? ACCENT : '#444',
                fontFamily: 'monospace',
                marginTop: 3,
                marginLeft: 4,
              }}>
                {msg.source === 'claude' ? 'Claude AI' : 'Static knowledge base'}
              </span>
            )}
          </div>
        ))}

        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
          }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '2px 12px 12px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <LoadingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested topics */}
      {messages.length <= 2 && !loading && (
        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', marginBottom: 6, letterSpacing: 1 }}>
            SUGGESTED TOPICS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGGESTED_TOPICS.map(t => (
              <button
                key={t.label}
                onClick={() => submit(t.query)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid #333',
                  borderRadius: 6,
                  color: '#999',
                  fontSize: 10,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = RUST
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#333'
                  e.currentTarget.style.color = '#999'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        marginTop: 12,
        display: 'flex',
        gap: 8,
        flexShrink: 0,
        paddingTop: 12,
        borderTop: '1px solid #1e1e1e',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input) } }}
          placeholder="Ask about any game system..."
          disabled={loading}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '9px 12px',
            color: '#ccc',
            fontSize: 12,
            fontFamily: 'monospace',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = RUST)}
          onBlur={e => (e.currentTarget.style.borderColor = '#333')}
        />
        <button
          onClick={() => submit(input)}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? '#1e1e1e' : RUST,
            border: 'none',
            borderRadius: 8,
            color: loading || !input.trim() ? '#444' : '#fff',
            fontSize: 13,
            padding: '9px 14px',
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          {loading ? '...' : 'Ask'}
        </button>
      </div>
    </div>
  )
}

// ── Meteorology Research ─────────────────────────────────────────────────────
// M50 Track B: Inline research card that upgrades WeatherForecast accuracy.

const METEO_TIERS: Array<{ accuracy: ForecastAccuracy; label: string; desc: string; color: string }> = [
  { accuracy: 'approximate', label: 'Meteorology I',  desc: 'Unlock approximate forecasts (70% accuracy). Time shown as ±1h.', color: '#e6b93a' },
  { accuracy: 'accurate',    label: 'Meteorology II', desc: 'Unlock accurate forecasts (95% accuracy). Exact weather and timing.', color: '#2ecc71' },
]

const ACCURACY_ORDER: Record<ForecastAccuracy, number> = { vague: 0, approximate: 1, accurate: 2 }

function MeteorologyResearch() {
  const [, forceUpdate] = useState(0)
  const currentAccuracy = forecastState.accuracy
  const currentOrder = ACCURACY_ORDER[currentAccuracy]

  return (
    <div style={{
      marginBottom: 12,
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid #2a2a2a',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
        Meteorology Research
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {METEO_TIERS.map(tier => {
          const tierOrder = ACCURACY_ORDER[tier.accuracy]
          const isUnlocked = currentOrder >= tierOrder
          const canUnlock = currentOrder === tierOrder - 1

          return (
            <div
              key={tier.accuracy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                background: isUnlocked ? `${tier.color}11` : 'transparent',
                border: `1px solid ${isUnlocked ? tier.color + '44' : '#222'}`,
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>{isUnlocked ? '✅' : '🔒'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: isUnlocked ? tier.color : '#666', fontFamily: 'monospace', fontWeight: 700, marginBottom: 2 }}>
                  {tier.label}
                </div>
                <div style={{ fontSize: 10, color: '#555', fontFamily: 'sans-serif', lineHeight: 1.4 }}>
                  {tier.desc}
                </div>
              </div>
              {!isUnlocked && (
                <button
                  onClick={() => {
                    if (canUnlock) {
                      setForecastAccuracy(tier.accuracy)
                      forceUpdate(n => n + 1)
                    }
                  }}
                  disabled={!canUnlock}
                  style={{
                    background: canUnlock ? `${tier.color}22` : 'transparent',
                    border: `1px solid ${canUnlock ? tier.color + '66' : '#333'}`,
                    borderRadius: 6,
                    color: canUnlock ? tier.color : '#444',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    padding: '5px 10px',
                    cursor: canUnlock ? 'pointer' : 'default',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                    letterSpacing: 0.5,
                  }}
                >
                  Unlock
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LoadingDots() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 4), 350)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 12 }}>
      {'...'.slice(0, frame === 0 ? 1 : frame === 1 ? 2 : 3)}
    </span>
  )
}
