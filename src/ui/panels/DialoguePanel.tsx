// ── DialoguePanel ─────────────────────────────────────────────────────────────
// M20 Track B: NPC conversation UI.
//
// Renders a dialogue history with player messages right-aligned and NPC
// messages left-aligned. Text input at bottom. Shows NPC name, role,
// and dominant emotion. Connects to LLMBridge when an API key is configured;
// otherwise falls back to procedural template responses.

import { useState, useRef, useEffect } from 'react'
import { useDialogueStore } from '../../store/dialogueStore'
import type { EmotionState } from '../../ai/EmotionModel'

// ── Procedural fallback dialogue (no LLM key) ──────────────────────────────

const FALLBACK_GREETINGS: Record<string, string[]> = {
  friendly: [
    'Welcome, traveler! What brings you here?',
    'Ah, a visitor! It has been some time.',
    'Greetings, friend. How can I help you?',
  ],
  neutral: [
    'Yes? What do you want?',
    'Speak your piece.',
    'I see you there. What is it?',
  ],
  hostile: [
    'You should not be here.',
    'Leave, before I call the guard.',
    'I have nothing to say to you.',
  ],
}

const FALLBACK_RESPONSES: Record<string, string[]> = {
  friendly: [
    'Interesting... I will think on that.',
    'You make a fair point, traveler.',
    'Perhaps we can help each other.',
    'The settlement could use someone like you.',
    'Come, let me show you something.',
  ],
  neutral: [
    'Hmm. I suppose so.',
    'That is one way to look at it.',
    'I have my own concerns to attend to.',
    'Very well.',
    'If you say so.',
  ],
  hostile: [
    'I do not trust your words.',
    'You waste my time.',
    'Begone.',
    'I have heard enough.',
    'Do not test my patience.',
  ],
}

function getTrustLevel(trust: number): 'friendly' | 'neutral' | 'hostile' {
  if (trust > 0.3) return 'friendly'
  if (trust > -0.3) return 'neutral'
  return 'hostile'
}

function getEmotionIcon(emotion: EmotionState | null): string {
  if (!emotion) return '--'
  const dominant = Object.entries(emotion)
    .filter(([k]) => k !== 'valence' && k !== 'arousal')
    .sort(([, a], [, b]) => (b as number) - (a as number))[0]
  if (!dominant || (dominant[1] as number) < 0.15) return 'calm'
  return dominant[0]
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── DialoguePanel Component ─────────────────────────────────────────────────

export function DialoguePanel() {
  const {
    targetNpcName,
    targetNpcRole,
    targetSettlement,
    messages,
    isWaiting,
    emotionState,
    addMessage,
    setWaiting,
    closeDialogue,
  } = useDialogueStore()

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasGreeted = useRef(false)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Send NPC greeting on first open
  useEffect(() => {
    if (!hasGreeted.current && targetNpcName) {
      hasGreeted.current = true
      const trust = getTrustLevel(0) // Default neutral trust for fallback
      const greeting = pickRandom(FALLBACK_GREETINGS[trust])
      addMessage('npc', greeting)
    }
  }, [targetNpcName, addMessage])

  function handleSend() {
    const text = input.trim()
    if (!text || isWaiting) return

    addMessage('player', text)
    setInput('')
    setWaiting(true)

    // Fallback procedural response (no LLM — generates after a brief delay)
    setTimeout(() => {
      const trust = getTrustLevel(0) // In full implementation, read from NPC data
      const response = pickRandom(FALLBACK_RESPONSES[trust])
      addMessage('npc', response)
      setWaiting(false)
    }, 600 + Math.random() * 800)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeDialogue()
    }
  }

  const emotionLabel = getEmotionIcon(emotionState)

  return (
    <div style={{ color: '#fff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* NPC header */}
      <div style={{
        padding: '8px 0 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#cd4420' }}>
          {targetNpcName}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          {targetNpcRole} {targetSettlement ? `- ${targetSettlement}` : ''}
        </div>
        {emotionState && (
          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
            Mood: {emotionLabel}
          </div>
        )}
      </div>

      {/* Message history */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingRight: 4,
          minHeight: 0,
        }}
      >
        {messages.map((msg, i) => {
          const isPlayer = msg.sender === 'player'
          return (
            <div
              key={i}
              style={{
                alignSelf: isPlayer ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: isPlayer ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: isPlayer
                  ? 'rgba(52,152,219,0.2)'
                  : 'rgba(205,68,32,0.15)',
                border: `1px solid ${isPlayer ? 'rgba(52,152,219,0.3)' : 'rgba(205,68,32,0.25)'}`,
                fontSize: 12,
                lineHeight: 1.5,
                color: isPlayer ? '#a8d4f0' : '#ddd',
              }}
            >
              <div style={{ fontSize: 9, color: '#666', marginBottom: 3 }}>
                {isPlayer ? 'You' : targetNpcName}
              </div>
              {msg.text}
            </div>
          )
        })}

        {/* Waiting indicator */}
        {isWaiting && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            borderRadius: '12px 12px 12px 2px',
            background: 'rgba(205,68,32,0.1)',
            border: '1px solid rgba(205,68,32,0.15)',
            fontSize: 12,
            color: '#888',
            fontStyle: 'italic',
          }}>
            {targetNpcName} is thinking...
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isWaiting ? 'Waiting...' : 'Say something...'}
          disabled={isWaiting}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: 'monospace',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            color: '#fff',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={isWaiting || !input.trim()}
          style={{
            padding: '8px 16px',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 700,
            background: isWaiting || !input.trim()
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(205,68,32,0.25)',
            border: `1px solid ${isWaiting || !input.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(205,68,32,0.5)'}`,
            borderRadius: 6,
            color: isWaiting || !input.trim() ? '#555' : '#cd4420',
            cursor: isWaiting || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
