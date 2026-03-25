// ── AgentControlCenter ──────────────────────────────────────────────────────────
// Visualizes Claude subagent activity on the companion status site.
// Shows 6 domain agent cards (active/idle/blocked) + a live message feed.

import React, { useEffect, useRef } from 'react'
import type { AgentState, AgentMessage } from '../hooks/useStatusSocket'

const AGENT_META: Record<string, { icon: string; label: string; color: string }> = {
  chemistry:    { icon: '⚗',  label: 'CHEMISTRY',    color: '#ff9b3c' },
  biology:      { icon: '🧬', label: 'BIOLOGY',       color: '#4cdd88' },
  physics:      { icon: '⚡', label: 'PHYSICS',        color: '#3bbfff' },
  civilization: { icon: '🏛', label: 'CIVILIZATION',  color: '#c084fc' },
  ai:           { icon: '🤖', label: 'AI',             color: '#f472b6' },
  world:        { icon: '🌍', label: 'WORLD',          color: '#60cdcc' },
}

const STATUS_COLOR: Record<string, string> = {
  active:  '#00ff88',
  idle:    '#334466',
  blocked: '#ffb830',
  done:    '#4466aa',
}

const STATUS_LABEL: Record<string, string> = {
  active:  '● ACTIVE',
  idle:    '○ IDLE',
  blocked: '⚠ BLOCKED',
  done:    '✓ DONE',
}

function timeAgo(ts: number): string {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5)  return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

interface Props {
  agentState: AgentState
}

export function AgentControlCenter({ agentState }: Props) {
  const feedRef = useRef<HTMLDivElement>(null)

  // Keep feed scrolled to top (newest messages first)
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0
  }, [agentState.messages.length])

  const agentIds = Object.keys(AGENT_META)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      padding: '8px 12px 8px',
    }}>

      {/* Header */}
      <div style={{
        fontSize: 9,
        letterSpacing: 3,
        color: 'rgba(0,180,255,0.45)',
        marginBottom: 8,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        AGENT CONTROL CENTER
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: agentIds.some(id => agentState.agents[id]?.status === 'active') ? '#00ff88' : '#334466',
          display: 'inline-block',
          boxShadow: agentIds.some(id => agentState.agents[id]?.status === 'active')
            ? '0 0 6px #00ff88' : 'none',
        }} />
      </div>

      <div style={{ display: 'flex', gap: 8, minHeight: 0, flex: 1 }}>

        {/* Agent cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 6,
          flex: '0 0 auto',
          alignContent: 'start',
        }}>
          {agentIds.map(id => {
            const meta    = AGENT_META[id]
            const entry   = agentState.agents[id] ?? { status: 'idle', task: '', lastSeen: 0 }
            const isActive = entry.status === 'active'
            const color    = meta.color
            const sBorder  = isActive ? color : 'rgba(0,180,255,0.1)'
            const sBg      = isActive ? `${color}14` : 'rgba(4,8,20,0.7)'

            return (
              <div key={id} style={{
                background: sBg,
                border: `1px solid ${sBorder}`,
                borderRadius: 6,
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                minWidth: 100,
                transition: 'border-color 0.3s, background 0.3s',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* Active glow pulse */}
                {isActive && (
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 6,
                    background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${color}18 0%, transparent 70%)`,
                    pointerEvents: 'none',
                  }} />
                )}

                {/* Icon + label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13 }}>{meta.icon}</span>
                  <span style={{
                    fontSize: 8,
                    letterSpacing: 1.5,
                    color: isActive ? color : 'rgba(100,140,180,0.5)',
                    fontWeight: 600,
                    transition: 'color 0.3s',
                  }}>{meta.label}</span>
                </div>

                {/* Status badge */}
                <div style={{
                  fontSize: 8,
                  color: STATUS_COLOR[entry.status] ?? STATUS_COLOR.idle,
                  letterSpacing: 0.5,
                }}>
                  {STATUS_LABEL[entry.status] ?? entry.status.toUpperCase()}
                </div>

                {/* Task text */}
                <div style={{
                  fontSize: 9,
                  color: isActive ? 'rgba(200,220,255,0.75)' : 'rgba(80,110,150,0.5)',
                  lineHeight: 1.4,
                  maxHeight: 36,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as any,
                  transition: 'color 0.3s',
                }}>
                  {entry.task || (entry.status === 'idle' ? '—' : '')}
                </div>

                {/* Last seen */}
                {entry.lastSeen > 0 && (
                  <div style={{ fontSize: 8, color: 'rgba(80,110,150,0.4)', marginTop: 1 }}>
                    {timeAgo(entry.lastSeen)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Message feed */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(2,5,14,0.6)',
          border: '1px solid rgba(0,180,255,0.08)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          <div style={{
            fontSize: 8,
            letterSpacing: 2,
            color: 'rgba(0,180,255,0.3)',
            padding: '5px 10px 4px',
            borderBottom: '1px solid rgba(0,180,255,0.06)',
            flexShrink: 0,
          }}>
            MESSAGE FEED
          </div>
          <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {agentState.messages.length === 0 ? (
              <div style={{
                fontSize: 9,
                color: 'rgba(80,110,150,0.35)',
                padding: '8px 10px',
                fontStyle: 'italic',
              }}>
                No messages yet.
              </div>
            ) : agentState.messages.map((msg: AgentMessage, i: number) => {
              const fromMeta = AGENT_META[msg.from]
              const toMeta   = msg.to ? AGENT_META[msg.to] : null
              const isDirected = !!msg.to
              const fromColor = fromMeta?.color ?? '#aaa'
              const toColor   = toMeta?.color   ?? '#aaa'

              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '3px 10px',
                  borderBottom: '1px solid rgba(0,180,255,0.04)',
                  opacity: 1 - (i * 0.04),
                }}>
                  {/* From → To label */}
                  <div style={{
                    fontSize: 8,
                    flexShrink: 0,
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                    color: isDirected ? '#ffb830' : 'rgba(130,165,200,0.55)',
                    minWidth: 120,
                  }}>
                    <span style={{ color: fromColor }}>{msg.from.toUpperCase()}</span>
                    {isDirected && (
                      <>
                        <span style={{ color: 'rgba(130,165,200,0.4)' }}> → </span>
                        <span style={{ color: toColor }}>{msg.to!.toUpperCase()}</span>
                      </>
                    )}
                  </div>

                  {/* Message text */}
                  <div style={{
                    fontSize: 9,
                    color: isDirected ? 'rgba(255,200,100,0.85)' : 'rgba(180,210,240,0.7)',
                    flex: 1,
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}>
                    {msg.text}
                  </div>

                  {/* Timestamp */}
                  <div style={{
                    fontSize: 8,
                    color: 'rgba(80,110,150,0.4)',
                    flexShrink: 0,
                  }}>
                    {timeAgo(msg.ts)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
