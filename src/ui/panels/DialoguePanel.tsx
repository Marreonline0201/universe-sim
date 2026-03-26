// ── DialoguePanel ─────────────────────────────────────────────────────────────
// M20 Track B: NPC conversation UI.
// M30 Track A: Role-aware NPC dialogue — distinct pools per role.
//
// Renders a dialogue history with player messages right-aligned and NPC
// messages left-aligned. Text input at bottom. Shows NPC name, role,
// and dominant emotion. Connects to LLMBridge when an API key is configured;
// otherwise falls back to procedural template responses.

import { useState, useRef, useEffect } from 'react'
import { useDialogueStore } from '../../store/dialogueStore'
import type { EmotionState } from '../../ai/EmotionModel'

// ── Procedural fallback dialogue (no LLM key) ──────────────────────────────

// Trust-keyed generic pools (used when role is unknown)
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

// ── Role-specific dialogue pools ────────────────────────────────────────────

interface RoleDialogue {
  greetings: string[]
  responses: string[]
  farewells: string[]
}

const ROLE_DIALOGUE: Record<string, RoleDialogue> = {
  elder: {
    greetings: [
      'Ah... the winds brought you here. Sit, if you have time for old words.',
      'I have watched many come and go. You have the look of someone seeking answers.',
      'The stars remember what we forget. Welcome, child.',
    ],
    responses: [
      'Long before your kind arrived, this land breathed differently.',
      'The stars remember what we forget. Perhaps you should too.',
      'There is wisdom in patience. Not everything must be understood at once.',
      'I have seen this pattern before, in the old cycles. It does not end well for the hasty.',
      'The cosmos does not care for our urgency. Ask your question slowly.',
      'Even the mountains were once dust. Keep that in mind.',
      'You remind me of someone I knew, a very long time ago. They also asked too many questions.',
      'There are things older than names in these lands. Be careful what you wake.',
    ],
    farewells: [
      'Go carefully. The path ahead is not what it appears.',
      'May the old stars light your way.',
    ],
  },
  guard: {
    greetings: [
      'Keep moving, citizen. This area is under watch.',
      'State your business. Quickly.',
      'I have my eye on you. What do you want?',
    ],
    responses: [
      'Keep moving, citizen.',
      "Trouble's been brewing at the eastern ridge. Don't add to it.",
      'I am not paid to chat. What is it?',
      'Move along. Nothing to see here.',
      'That is above my authority. Take it up with the commander.',
      'I will pretend I did not hear that.',
      'Stay out of the restricted zone. I mean it.',
      "One more word like that and you'll be spending the night in the stockade.",
    ],
    farewells: [
      'Keep your nose clean.',
      'Move on. Do not make me come find you.',
    ],
  },
  scout: {
    greetings: [
      'Oh, hey! Just got back from the northern ridge. You picked a good time to talk.',
      'Good timing — I was about to head out again. What do you need?',
      "Found a cave entrance north of the river. Hadn't seen that before. You explore much?",
    ],
    responses: [
      'Found a cave entrance north of the river — hadn\'t seen that before.',
      'Watch your footing near the cliffs. The eastern face crumbles after rain.',
      'I mapped three new trails last week. The forest is shifting — it does that sometimes.',
      'The river crossing at the old mill is safe again. Floods receded.',
      'Something big is moving through the western woods. Tracks too wide for a boar.',
      'Pro tip: the high ground north of the settlement gives you sight lines for miles.',
      'I travel light — that is the key. Never carry what you cannot run with.',
      'There is a shortcut through the ravine if you know where to look. I can sketch it.',
    ],
    farewells: [
      'Stay sharp out there. The terrain changes fast.',
      'Watch your back on the roads — it is not just wildlife you need to worry about.',
    ],
  },
  villager: {
    greetings: [
      'Oh, hello there! I was just heading to the market. Busy day.',
      'Good to see a friendly face. Things have been a bit strange lately.',
      'Welcome! Can I help you with something? I was just finishing up here.',
    ],
    responses: [
      "My neighbor's goat got into the grain stores again. Third time this month.",
      'The harvest was better than expected this season. Everyone is in good spirits.',
      'I heard the smith is taking on apprentices again. Good news for the young ones.',
      'It is the small things that get you through the hard days, is it not?',
      "My mother always said the weather here has a personality. I'm starting to believe her.",
      'We had a wonderful gathering last night. The whole village came out.',
      "I don't know much about that sort of thing, but old Marta by the well might.",
      'Times are strange. But people look out for each other here. That counts for something.',
    ],
    farewells: [
      'Take care of yourself now. Stop by anytime!',
      'Safe travels. And try the bread from the south stall — it is excellent.',
    ],
  },
  artisan: {
    greetings: [
      'Hmm? Oh, sorry — I was deep in the work. What brings you to my shop?',
      'Welcome. Mind the bench, the glaze is still wet on that side.',
      'Not many visitors this time of day. Something specific you are after?',
    ],
    responses: [
      'Took me three days to get the alloy ratio right. Worth every hour.',
      'Not many people appreciate fine metalwork anymore. It is a dying art.',
      'I will not rush a commission. Quality takes the time it takes.',
      'See that seam? Invisible. That is what separates craft from production.',
      'The tools matter as much as the skill. I have been using this hammer for twelve years.',
      'I am working on something new — a lamination technique I read about in an old manuscript.',
      'Most people only notice when something breaks. Real craft goes unnoticed because it never does.',
      'Every piece I make, I sign. If I would not sign it, I would not sell it.',
    ],
    farewells: [
      'Come back when I have finished the new batch. You will not be disappointed.',
      'Farewell. And tell your friends — word of mouth is everything in this trade.',
    ],
  },
  trader: {
    greetings: [
      'Ah, a potential customer! Or a seller? Either way, you have my attention.',
      'Welcome. Everything here has a price — the question is whether you can afford it.',
      'Good timing. I just got in a fresh shipment. Looking for anything in particular?',
    ],
    responses: [
      'Everything has a price, friend. Everything.',
      "Supply's been thin since the storm. Prices reflect that — nothing personal.",
      'I could let that go for the right offer. Make me one.',
      'I have contacts in four settlements. Whatever you need, I can probably find it.',
      "Barter is fine, but coin is better. You know how it is.",
      'That item? Rare. Very rare. Which is why the price is what it is.',
      'I heard a rumor worth more than gold, but rumors are not free either.',
      'The market is unpredictable right now. I would move fast if I were you.',
    ],
    farewells: [
      'Come back when you have coin. Or something worth trading.',
      'Safe roads. And remember — I give the best rates in the region.',
    ],
  },
}

// ── Dialogue helpers ─────────────────────────────────────────────────────────

function getTrustLevel(trust: number): 'friendly' | 'neutral' | 'hostile' {
  if (trust > 0.3) return 'friendly'
  if (trust > -0.3) return 'neutral'
  return 'hostile'
}

/** Normalise a raw role string to a key we have dialogue for, or null. */
function normaliseRole(role: string): string | null {
  const key = role.trim().toLowerCase()
  return ROLE_DIALOGUE[key] ? key : null
}

/** Pick a random entry from arr, avoiding lastLine if the pool has >1 item. */
function pickAvoidingRepeat(arr: string[], lastLine: string): string {
  if (arr.length <= 1) return arr[0]
  const candidates = arr.filter((l) => l !== lastLine)
  return candidates[Math.floor(Math.random() * candidates.length)]
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
      const roleKey = normaliseRole(targetNpcRole)
      let greeting: string
      if (roleKey) {
        greeting = pickRandom(ROLE_DIALOGUE[roleKey].greetings)
      } else {
        const trust = getTrustLevel(0)
        greeting = pickRandom(FALLBACK_GREETINGS[trust])
      }
      addMessage('npc', greeting)
    }
  }, [targetNpcName, targetNpcRole, addMessage])

  function handleSend() {
    const text = input.trim()
    if (!text || isWaiting) return

    addMessage('player', text)
    setInput('')
    setWaiting(true)

    // Snapshot the last NPC line before the new player message is added
    const lastNpcLine = [...messages].reverse().find((m) => m.sender === 'npc')?.text ?? ''

    // Fallback procedural response (no LLM — generates after a brief delay)
    setTimeout(() => {
      const roleKey = normaliseRole(targetNpcRole)
      let response: string
      if (roleKey) {
        response = pickAvoidingRepeat(ROLE_DIALOGUE[roleKey].responses, lastNpcLine)
      } else {
        const trust = getTrustLevel(0) // In full implementation, read from NPC data
        const pool = FALLBACK_RESPONSES[trust]
        response = pickAvoidingRepeat(pool, lastNpcLine)
      }
      addMessage('npc', response)
      setWaiting(false)
    }, 600 + Math.random() * 800)
  }

  /** Show a role-appropriate farewell then close the panel after a beat. */
  function handleClose() {
    const roleKey = normaliseRole(targetNpcRole)
    if (roleKey && messages.length > 1) {
      // Only say goodbye if there was an actual exchange (not just the greeting)
      const farewell = pickRandom(ROLE_DIALOGUE[roleKey].farewells)
      addMessage('npc', farewell)
      setTimeout(closeDialogue, 900)
    } else {
      closeDialogue()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
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
