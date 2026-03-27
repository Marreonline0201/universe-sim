/**
 * ChatBox — M39 Track B: In-Game Chat
 *
 * Fixed bottom-left panel (200x160px), above the vitals panel.
 * - Shows last 10 messages; auto-scrolls to newest.
 * - Press Enter to focus input; Enter again to send.
 * - Messages fade after 15 seconds.
 * - /p prefix sends to party channel only.
 * - Dev/single-player mode shows system messages.
 * - WebSocket: sends CHAT_MESSAGE, receives CHAT_MESSAGE.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { getWorldSocket, getLocalUserId, getLocalUsername } from '../net/useWorldSocket'
// partyStore removed (RPG cleanup) — party is always null in simulation mode
const usePartyStore = (_sel: (s: { party: null }) => null) => null

export interface ChatMessage {
  id: number
  playerId: string
  username: string
  title?: string
  titleColor?: string
  text: string
  channel: 'global' | 'party' | 'system'
  timestamp: number
}

let _msgId = 0

// Module-level message store so HUD and ChatBox share the same list
const _messages: ChatMessage[] = []
const _listeners = new Set<() => void>()

function notifyListeners() {
  for (const fn of _listeners) fn()
}

/** Called by WorldSocket dispatcher when a CHAT_MESSAGE arrives from server. */
export function receiveChatMessage(msg: Omit<ChatMessage, 'id'>): void {
  const cm: ChatMessage = { ...msg, id: ++_msgId }
  _messages.push(cm)
  if (_messages.length > 100) _messages.splice(0, _messages.length - 100)
  notifyListeners()
}

/** Push a local system message (world events, join/leave, etc.) */
export function pushSystemMessage(text: string): void {
  receiveChatMessage({
    playerId: 'system',
    username: 'System',
    text,
    channel: 'system',
    timestamp: Date.now(),
  })
}

/** Send a chat message from the local player. */
function sendChat(text: string, channel: 'global' | 'party' = 'global'): void {
  const trimmed = text.trim()
  if (!trimmed) return

  // Optimistically show locally
  receiveChatMessage({
    playerId: getLocalUserId(),
    username: getLocalUsername(),
    text: trimmed,
    channel,
    timestamp: Date.now(),
  })

  // Broadcast via WS
  try {
    getWorldSocket()?.send({
      type: 'CHAT_MESSAGE',
      text: trimmed,
      channel,
    } as any)
  } catch { /* offline */ }
}

function useMessages(): ChatMessage[] {
  const [, setTick] = useState(0)
  useEffect(() => {
    const fn = () => setTick(t => t + 1)
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  }, [])
  return _messages
}

// -- Dev: inject system messages on mount (single-player mode) --
let _devInited = false
function initDevMessages() {
  if (_devInited) return
  _devInited = true
  if (!import.meta.env.DEV) return
  setTimeout(() => pushSystemMessage('Game started. Welcome to the world!'), 600)
  setTimeout(() => pushSystemMessage('Tip: Press Enter to chat. /p to talk to party.'), 3000)
}

// -- Listen for world events and push to chat --
let _worldEventListenerAdded = false
function ensureWorldEventListener() {
  if (_worldEventListenerAdded) return
  _worldEventListenerAdded = true
  const EVENT_LABELS: Record<string, string> = {
    treasure_hunt:  'World Event: Treasure Hunt has begun!',
    meteor_impact:  'World Event: Meteor Impact detected!',
    faction_war:    'World Event: Faction War is raging!',
    migration:      'World Event: Animal Migration underway!',
    ancient_ruins:  'World Event: Ancient Ruins discovered!',
  }
  window.addEventListener('world-event-start', (e: Event) => {
    const detail = (e as CustomEvent).detail as { type: string }
    const label = EVENT_LABELS[detail?.type] ?? `World Event: ${detail?.type ?? 'Unknown'}`
    pushSystemMessage(label)
  })
  window.addEventListener('world-boss-spawned', (e: Event) => {
    const detail = (e as CustomEvent).detail as { name: string; distance: number }
    pushSystemMessage(`World Boss spawned: ${detail?.name ?? 'Boss'} ${detail?.distance ? `(${detail.distance}m away)` : ''}`)
  })
}

const CHANNEL_COLORS: Record<ChatMessage['channel'], string> = {
  global:  '#e0d6c8',
  party:   '#6abf6a',
  system:  '#88aacc',
}

const FADE_AFTER_MS = 15_000

export function ChatBox() {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const [, setTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messages = useMessages()
  const party = usePartyStore(s => s.party)

  // Init dev messages + world event listener once
  useEffect(() => {
    initDevMessages()
    ensureWorldEventListener()
  }, [])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Force re-render every second so fade-out works
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Enter key to focus/send
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept if already in another input/textarea
      if ((e.target as HTMLElement).tagName === 'INPUT' && e.target !== inputRef.current) return
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return

      if (e.code === 'Enter' && !focused) {
        e.preventDefault()
        setFocused(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focused])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = input.trim()
    if (trimmed) {
      let text = trimmed
      let channel: 'global' | 'party' = 'global'
      if (trimmed.startsWith('/p ') || trimmed.startsWith('/party ')) {
        if (party) {
          text = trimmed.replace(/^\/p(arty)? /, '')
          channel = 'party'
        } else {
          pushSystemMessage('You are not in a party. Use /p to send party messages.')
          setInput('')
          return
        }
      }
      sendChat(text, channel)
    }
    setInput('')
    setFocused(false)
    inputRef.current?.blur()
  }, [input, party])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      setInput('')
      setFocused(false)
      inputRef.current?.blur()
    }
  }, [handleSubmit])

  const now = Date.now()
  // Last 10 messages, faded out after 15s
  const shown = messages.slice(-10)

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 260,   // above vitals panel (which is at bottom: 80)
        left: 20,
        width: 200,
        height: 160,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        fontFamily: 'monospace',
        pointerEvents: focused ? 'auto' : 'none',
      }}
    >
      {/* Message list */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 1,
          paddingBottom: 4,
          // Hide scrollbar
          scrollbarWidth: 'none',
        }}
      >
        {shown.map(msg => {
          const age = now - msg.timestamp
          const alpha = age > FADE_AFTER_MS ? 0 : age > FADE_AFTER_MS - 2000
            ? (1 - (age - (FADE_AFTER_MS - 2000)) / 2000) * (focused ? 1 : 0.9)
            : focused ? 1 : 0.9

          if (alpha <= 0) return null

          const channelColor = CHANNEL_COLORS[msg.channel]
          const isSystem = msg.channel === 'system'

          return (
            <div
              key={msg.id}
              style={{
                fontSize: 10,
                lineHeight: 1.35,
                opacity: alpha,
                transition: 'opacity 0.5s',
                background: focused ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)',
                borderRadius: 2,
                padding: '1px 5px',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {isSystem ? (
                <span style={{ color: '#88aacc', fontStyle: 'italic' }}>
                  {msg.text}
                </span>
              ) : (
                <>
                  {msg.channel === 'party' && (
                    <span style={{ color: '#6abf6a', fontSize: 9 }}>[Party] </span>
                  )}
                  {msg.title && (
                    <span style={{ color: msg.titleColor ?? '#aaa', fontSize: 9 }}>
                      [{msg.title}]{' '}
                    </span>
                  )}
                  <span style={{ color: channelColor, fontWeight: 700 }}>
                    {msg.username}:
                  </span>{' '}
                  <span style={{ color: '#d0ccc5' }}>{msg.text}</span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Input */}
      {focused && (
        <form
          onSubmit={handleSubmit}
          style={{ marginTop: 2, pointerEvents: 'auto' }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (!input) setFocused(false) }}
            placeholder="Type a message... (/p party)"
            maxLength={200}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.75)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 2,
              color: '#e0d6c8',
              fontSize: 10,
              fontFamily: 'monospace',
              padding: '3px 6px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
        </form>
      )}

      {!focused && (
        <div style={{
          fontSize: 8,
          color: 'rgba(255,255,255,0.25)',
          fontFamily: 'monospace',
          marginTop: 2,
          pointerEvents: 'none',
        }}>
          [Enter] to chat
        </div>
      )}
    </div>
  )
}
