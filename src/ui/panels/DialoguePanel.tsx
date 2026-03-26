// ── DialoguePanel ─────────────────────────────────────────────────────────────
// M20 Track B: NPC conversation UI.
// M30 Track A: Role-aware NPC dialogue — distinct pools per role.
// M38 Track A: NPC memory, daily schedule awareness, seeded names.
//
// Renders a dialogue history with player messages right-aligned and NPC
// messages left-aligned. Text input at bottom. Shows NPC name, role,
// and dominant emotion. Connects to LLMBridge when an API key is configured;
// otherwise falls back to procedural template responses.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDialogueStore } from '../../store/dialogueStore'
import type { EmotionState } from '../../ai/EmotionModel'
import { useFactionStore } from '../../store/factionStore'
import { useSettlementStore } from '../../store/settlementStore'
import { FACTIONS, getFactionRelationship } from '../../game/FactionSystem'
// M36 Track C: Building donation via NPC dialogue
import { useBuildingStore } from '../../store/buildingStore'
import { BUILDING_DEFS, ALL_BUILDING_TYPES } from '../../game/BuildingSystem'
import { usePlayerStore } from '../../store/playerStore'
import { inventory } from '../../game/GameSingletons'
import { skillSystem } from '../../game/SkillSystem'
// M38 Track A: NPC memory + schedule
import { useNPCMemoryStore } from '../../store/npcMemoryStore'
import { getCurrentActivity, getActivityDescription, isNighttime } from '../../game/NPCScheduleSystem'
import { useGameStore } from '../../store/gameStore'

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

  // M36 Track C: Building donation state
  const [showBuildingMenu, setShowBuildingMenu] = useState(false)
  const [buildingFeedback, setBuildingFeedback] = useState<string | null>(null)

  // M38 Track A: NPC memory + schedule
  const dayAngle = useGameStore(s => s.dayAngle)
  const npcMemoryStore = useNPCMemoryStore()
  const npcId = useDialogueStore(s => s.targetNpcId) ?? 0
  const npcMemory = npcMemoryStore.getMemory(npcId)
  const currentActivity = getCurrentActivity(targetNpcRole, dayAngle)
  const isSleeping = currentActivity.activity === 'sleeping'
  const [knockDelay, setKnockDelay] = useState(false)
  const [showKnockPrompt, setShowKnockPrompt] = useState(isSleeping)

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

  // Derive faction relationship for greeting override
  const playerFaction = useFactionStore(s => s.playerFaction)
  const settlements   = useSettlementStore(s => s.settlements)

  // M36 Track C: Resolve the settlement object for building panel
  const currentSettlement = useSettlementStore(s => {
    for (const settlement of s.settlements.values()) {
      if (settlement.name === targetSettlement) return settlement
    }
    return null
  })
  const donateToBuilding    = useBuildingStore(s => s.donateToBuilding)
  const getBuildingProgress = useBuildingStore(s => s.getBuildingProgress)
  const isBldgComplete      = useBuildingStore(s => s.isBuildingComplete)
  const getAvailableBuildings = useBuildingStore(s => s.getAvailableBuildings)
  const buildingsMap        = useBuildingStore(s => s.buildings)  // subscribe for reactivity
  const getBuilding         = useBuildingStore(s => s.getBuilding)

  const availableBuildings = currentSettlement
    ? getAvailableBuildings(currentSettlement.civLevel).filter(
        t => !isBldgComplete(currentSettlement.id, t)
      )
    : []

  const handleDonateQuick = useCallback((matId: number, qty: number, buildingType: string, matLabel: string) => {
    if (!currentSettlement) return
    const imported = ALL_BUILDING_TYPES.find(t => t === buildingType)
    if (!imported) return
    const donated = donateToBuilding(
      currentSettlement.id,
      currentSettlement.name,
      imported,
      matId,
      qty,
    )
    if (donated) {
      setBuildingFeedback(`Donated ${qty}x ${matLabel}!`)
      addMessage('npc', `Thank you, traveler. Your donation brings us closer to completing our ${BUILDING_DEFS[imported].name}!`)
    } else {
      const inInv = inventory.countMaterial(matId)
      if (inInv === 0) {
        setBuildingFeedback(`You have no ${matLabel}.`)
        addMessage('npc', `It seems you don't have any ${matLabel}. Come back when you've gathered some.`)
      } else {
        setBuildingFeedback('Nothing more needed for that material.')
      }
    }
    setTimeout(() => setBuildingFeedback(null), 3000)
  }, [currentSettlement, donateToBuilding, addMessage])

  function getFactionGreeting(): string | null {
    if (!playerFaction || !targetSettlement) return null
    // Find the settlement that matches this NPC's settlement name
    for (const s of settlements.values()) {
      if (s.name === targetSettlement && s.factionId) {
        const npcFaction = s.factionId
        const rel = getFactionRelationship(playerFaction, npcFaction)
        if (rel === 'ally' && npcFaction !== playerFaction) {
          return `A friend of our allies. What can I do for you?`
        }
        if (rel === 'war') {
          return `I don't trust your kind. State your business.`
        }
        if (npcFaction === playerFaction) {
          return `Welcome, fellow ${FACTIONS[playerFaction].name}! What brings you here?`
        }
      }
    }
    return null
  }

  // Send NPC greeting on first open
  useEffect(() => {
    if (!hasGreeted.current && targetNpcName) {
      hasGreeted.current = true

      // M38: If sleeping, show knock prompt rather than immediate greeting
      if (isSleeping) {
        setShowKnockPrompt(true)
        return
      }

      // M38: Record greeting in memory
      npcMemoryStore.recordGreeting(npcId)

      // M35: Faction-aware greeting override
      const factionGreeting = getFactionGreeting()
      if (factionGreeting) {
        addMessage('npc', factionGreeting)
        return
      }

      // M38: Memory-aware greeting
      const mem = npcMemoryStore.getMemory(npcId)
      const roleKey = normaliseRole(targetNpcRole)

      // Activity-context prefix
      const actDesc = getActivityDescription(currentActivity.activity, targetNpcName, targetNpcRole)
      let greeting: string

      if (mem.timesSpokenTo > 1) {
        // Returning player
        if (currentActivity.activity === 'eating') {
          greeting = `(Eating) "I'm on break, but I suppose I can spare a moment... Good to see you again, traveler."`
        } else if (currentActivity.activity === 'patrolling') {
          greeting = `"Good to see you again, traveler. Keep it brief — I'm on patrol."`
        } else if (mem.reputationScore > 50) {
          greeting = `"Ah, good to see you again, my friend. I have a tip for you..."`
        } else if (mem.reputationScore < -20) {
          greeting = `"You again. Make it quick."`
        } else {
          greeting = `"Good to see you again, traveler. What brings you here?"`
        }
      } else if (mem.timesSpokenTo === 1) {
        // Second meeting
        if (roleKey) {
          greeting = pickRandom(ROLE_DIALOGUE[roleKey].greetings)
        } else {
          greeting = pickRandom(FALLBACK_GREETINGS['neutral'])
        }
      } else {
        // First meeting — introduce by name
        if (currentActivity.activity === 'eating') {
          greeting = `(Eating) "I'm on break, but I suppose I can spare a moment. I'm ${targetNpcName}."`
        } else if (roleKey) {
          greeting = pickRandom(ROLE_DIALOGUE[roleKey].greetings)
        } else {
          const trust = getTrustLevel(0)
          greeting = pickRandom(FALLBACK_GREETINGS[trust])
        }
        // Show activity status on first meeting
        addMessage('npc', actDesc)
      }

      addMessage('npc', greeting)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNpcName, targetNpcRole, addMessage])

  function handleSend() {
    const text = input.trim()
    if (!text || isWaiting || knockDelay) return

    addMessage('player', text)
    setInput('')
    setWaiting(true)

    // M38: Record player message in NPC memory
    npcMemoryStore.recordMessage(npcId, text.slice(0, 60))
    // Slight reputation boost for engaging in conversation
    if (messages.length > 2) {
      npcMemoryStore.adjustReputation(npcId, 1)
    }

    // Snapshot the last NPC line before the new player message is added
    const lastNpcLine = [...messages].reverse().find((m) => m.sender === 'npc')?.text ?? ''

    // M38: Response delay is longer if NPC is sleeping (woken up)
    const baseDelay = isSleeping ? 2000 : 600
    const jitter = Math.random() * 800

    // Fallback procedural response (no LLM — generates after a brief delay)
    setTimeout(() => {
      const roleKey = normaliseRole(targetNpcRole)
      const mem = npcMemoryStore.getMemory(npcId)
      let response: string

      // M38: High reputation → special dialogue
      if (mem.reputationScore > 50 && Math.random() < 0.3) {
        response = `"I have a tip for you, friend. Watch the roads north of here — there's been unusual activity."`
      } else if (mem.reputationScore < -20) {
        response = `"..."`
      } else if (roleKey) {
        response = pickAvoidingRepeat(ROLE_DIALOGUE[roleKey].responses, lastNpcLine)
      } else {
        const trust = getTrustLevel(0)
        const pool = FALLBACK_RESPONSES[trust]
        response = pickAvoidingRepeat(pool, lastNpcLine)
      }
      addMessage('npc', response)
      setWaiting(false)
    }, baseDelay + jitter)
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

  // M38: Handle knock prompt for sleeping NPCs
  function handleKnock() {
    setShowKnockPrompt(false)
    setKnockDelay(true)
    npcMemoryStore.recordGreeting(npcId)
    addMessage('npc', `*knock knock* ... *muffled grumbling* ... *door creaks open*`)
    setTimeout(() => {
      setKnockDelay(false)
      const isCurt = npcMemory.reputationScore < -20
      const greeting = isCurt
        ? `"What?! Do you know what hour this is? Make it quick."`
        : `"...Who's there? This had better be important. I was sleeping."`
      addMessage('npc', greeting)
    }, 3000)
  }

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
        {/* M38: Activity status */}
        <div style={{ fontSize: 10, color: '#556b8a', marginTop: 2, fontStyle: 'italic' }}>
          {getActivityDescription(currentActivity.activity, targetNpcName, targetNpcRole)}
        </div>
        {/* M38: Memory indicator */}
        {npcMemory.timesSpokenTo > 0 && (
          <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>
            Spoken {npcMemory.timesSpokenTo}x · rep: {npcMemory.reputationScore}
          </div>
        )}
        {emotionState && (
          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
            Mood: {emotionLabel}
          </div>
        )}
      </div>

      {/* M38: Knock on door prompt for sleeping NPCs */}
      {showKnockPrompt && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 16,
        }}>
          <div style={{ fontSize: 12, color: '#888', textAlign: 'center', fontStyle: 'italic' }}>
            {targetNpcName} is asleep.
          </div>
          <button
            onClick={handleKnock}
            style={{
              padding: '8px 20px',
              fontSize: 12,
              fontFamily: 'monospace',
              background: 'rgba(205,68,32,0.2)',
              border: '1px solid rgba(205,68,32,0.4)',
              borderRadius: 6,
              color: '#cd4420',
              cursor: 'pointer',
            }}
          >
            [Knock on door]
          </button>
          <button
            onClick={closeDialogue}
            style={{
              padding: '4px 12px',
              fontSize: 10,
              fontFamily: 'monospace',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: '#555',
              cursor: 'pointer',
            }}
          >
            Leave them to sleep
          </button>
        </div>
      )}

      {/* Regular dialogue content — only shown when not in knock prompt mode */}
      {!showKnockPrompt && (<>

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

      {/* M36 Track C: Service NPC actions (when completed buildings exist) */}
      {currentSettlement && (() => {
        const sid = currentSettlement.id
        const role = targetNpcRole.toLowerCase()
        const gold = usePlayerStore.getState().gold
        const spendGold = usePlayerStore.getState().spendGold
        const addGold = usePlayerStore.getState().addGold
        const skillSys = skillSystem

        // Healer action
        if (role === 'healer' && isBldgComplete(sid, 'healer_hut')) {
          return (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              <button
                onClick={() => {
                  if (gold < 5) {
                    addMessage('npc', "You don't have enough gold. Healing costs 5 gold.")
                    return
                  }
                  if (spendGold(5)) {
                    usePlayerStore.getState().updateVitals({ health: 1 })
                    addMessage('npc', 'There you go — good as new! Come back if you need me.')
                  }
                }}
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: gold >= 5 ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${gold >= 5 ? 'rgba(76,175,80,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 4,
                  color: gold >= 5 ? '#4caf50' : '#555',
                  cursor: gold >= 5 ? 'pointer' : 'not-allowed',
                }}
              >
                💉 Heal for 5 gold (you have: {gold}g)
              </button>
            </div>
          )
        }

        // Blacksmith / Forge action
        if ((role === 'blacksmith' || role === 'smith') && isBldgComplete(sid, 'forge')) {
          const ironCount = inventory.countMaterial(15 /* MAT.IRON */)
          const canUpgrade = gold >= 20 && ironCount >= 10
          return (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              <button
                onClick={() => {
                  if (!canUpgrade) {
                    addMessage('npc', 'You need 10 Iron and 20 gold for an upgrade. Come back when ready.')
                    return
                  }
                  if (spendGold(20)) {
                    // Consume 10 iron
                    let remaining = 10
                    for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
                      const s = inventory.getSlot(i)
                      if (s && s.itemId === 0 && s.materialId === 15) {
                        const take = Math.min(s.quantity, remaining)
                        inventory.removeItemForce(i, take)
                        remaining -= take
                      }
                    }
                    // Grant combat XP as proxy for weapon upgrade
                    if (skillSys?.addXp) skillSys.addXp('combat', 50)
                    addMessage('npc', "There — your weapon has been sharpened and reinforced. It'll serve you well.")
                  }
                }}
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: canUpgrade ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${canUpgrade ? 'rgba(255,140,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 4,
                  color: canUpgrade ? '#ff8c00' : '#555',
                  cursor: canUpgrade ? 'pointer' : 'not-allowed',
                }}
              >
                🔥 Upgrade weapon — 10 Iron + 20 gold (iron: {ironCount}, gold: {gold}g)
              </button>
            </div>
          )
        }

        // Guard Captain / Barracks action
        if ((role === 'guard captain' || role === 'captain') && isBldgComplete(sid, 'barracks')) {
          return (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              <button
                onClick={() => {
                  if (gold < 50) {
                    addMessage('npc', 'Training costs 50 gold, soldier. Come back when your coin purse is heavier.')
                    return
                  }
                  if (spendGold(50)) {
                    if (skillSys?.addXp) skillSys.addXp('combat', 100)
                    addMessage('npc', 'Good. Now hit the yard — those 100 points of experience should sharpen your edge.')
                  }
                }}
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: gold >= 50 ? 'rgba(205,68,32,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${gold >= 50 ? 'rgba(205,68,32,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 4,
                  color: gold >= 50 ? '#cd4420' : '#555',
                  cursor: gold >= 50 ? 'pointer' : 'not-allowed',
                }}
              >
                ⚔ Buy Combat Training — 50 gold → +100 Combat XP (you have: {gold}g)
              </button>
            </div>
          )
        }

        // Scholar / Library action
        if ((role === 'scholar' || role === 'librarian') && isBldgComplete(sid, 'library')) {
          return (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
              <button
                onClick={() => {
                  if (gold < 40) {
                    addMessage('npc', 'Knowledge has a price: 40 gold. Return when you can afford to learn.')
                    return
                  }
                  if (spendGold(40)) {
                    if (skillSys?.addXp) skillSys.addXp('crafting', 80)
                    addMessage('npc', 'Excellent. I have shared all I can for now. Come back when the knowledge settles.')
                  }
                }}
                style={{
                  padding: '5px 12px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: gold >= 40 ? 'rgba(52,152,219,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${gold >= 40 ? 'rgba(52,152,219,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 4,
                  color: gold >= 40 ? '#3498db' : '#555',
                  cursor: gold >= 40 ? 'pointer' : 'not-allowed',
                }}
              >
                📚 Study Crafting — 40 gold → +80 Crafting XP (you have: {gold}g)
              </button>
            </div>
          )
        }

        return null
      })()}

      {/* M36 Track C: Building donation quick-actions */}
      {availableBuildings.length > 0 && (
        <div style={{
          marginTop: 8,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 8,
        }}>
          <button
            onClick={() => setShowBuildingMenu(v => !v)}
            style={{
              padding: '4px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              background: showBuildingMenu ? 'rgba(205,136,32,0.3)' : 'rgba(205,136,32,0.12)',
              border: '1px solid rgba(205,136,32,0.4)',
              borderRadius: 4,
              color: '#cd8820',
              cursor: 'pointer',
            }}
          >
            🏗 Help build the settlement {showBuildingMenu ? '▲' : '▼'}
          </button>

          {buildingFeedback && (
            <div style={{ fontSize: 10, color: '#cd8820', marginTop: 4 }}>
              {buildingFeedback}
            </div>
          )}

          {showBuildingMenu && currentSettlement && (
            <div style={{
              marginTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 160,
              overflowY: 'auto',
            }}>
              {availableBuildings.map(type => {
                const def = BUILDING_DEFS[type]
                const pct = getBuildingProgress(currentSettlement.id, type)
                return (
                  <div key={type} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 4,
                    padding: '6px 8px',
                  }}>
                    <div style={{ fontSize: 11, color: '#ddd', marginBottom: 3 }}>
                      {def.icon} {def.name} — {pct}%
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {def.donationRequirements.map(req => {
                        const donated = getBuilding(currentSettlement.id, type)?.donated[req.matId] ?? 0
                        const stillNeeded = Math.max(0, req.qty - donated)
                        const inInv = inventory.countMaterial(req.matId)
                        const canGive = Math.min(inInv, stillNeeded)
                        if (stillNeeded === 0) return null
                        return (
                          <button
                            key={req.matId}
                            onClick={() => handleDonateQuick(req.matId, Math.min(canGive, req.qty), type, req.label)}
                            disabled={canGive === 0}
                            style={{
                              padding: '2px 7px',
                              fontSize: 9,
                              fontFamily: 'monospace',
                              background: canGive > 0 ? 'rgba(205,136,32,0.18)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${canGive > 0 ? 'rgba(205,136,32,0.4)' : 'rgba(255,255,255,0.08)'}`,
                              borderRadius: 3,
                              color: canGive > 0 ? '#cd8820' : '#444',
                              cursor: canGive > 0 ? 'pointer' : 'not-allowed',
                            }}
                          >
                            Give {req.label} ({donated}/{req.qty}, have: {inInv})
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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
          placeholder={knockDelay ? 'Waiting for answer...' : isWaiting ? 'Waiting...' : 'Say something...'}
          disabled={isWaiting || knockDelay}
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
          disabled={isWaiting || knockDelay || !input.trim()}
          style={{
            padding: '8px 16px',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 700,
            background: isWaiting || knockDelay || !input.trim()
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(205,68,32,0.25)',
            border: `1px solid ${isWaiting || knockDelay || !input.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(205,68,32,0.5)'}`,
            borderRadius: 6,
            color: isWaiting || knockDelay || !input.trim() ? '#555' : '#cd4420',
            cursor: isWaiting || knockDelay || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>
      </>)}
    </div>
  )
}
