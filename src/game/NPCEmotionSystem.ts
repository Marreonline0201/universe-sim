// ── NPCEmotionSystem.ts ───────────────────────────────────────────────────────
// M65 Track C: NPC Emotion System
// Tracks mood states for each NPC, decays toward neutral over time,
// and reacts to game events via window CustomEvents.

import { useGameStore } from '../store/gameStore'

export type EmotionState = 'happy' | 'content' | 'neutral' | 'anxious' | 'angry' | 'scared' | 'grieving'

export interface NPCEmotion {
  npcId: string
  npcName: string
  emotion: EmotionState
  intensity: number   // 0-100
  reason: string      // why they feel this way
  updatedAt: number   // simSeconds
  history: Array<{ emotion: EmotionState; reason: string; at: number }>
}

// ── Seed NPCs ─────────────────────────────────────────────────────────────────

const SEED_NPCS: Array<{ id: string; name: string }> = [
  { id: 'npc-elara-001', name: 'Elara' },
  { id: 'npc-gruff-002', name: 'Gruff' },
  { id: 'npc-varek-003', name: 'Varek' },
  { id: 'npc-mira-004',  name: 'Mira'  },
  { id: 'npc-zara-005',  name: 'Zara'  },
]

// ── Internal state ────────────────────────────────────────────────────────────

let _initialized = false
const _emotions = new Map<string, NPCEmotion>()

function makeDefault(id: string, name: string): NPCEmotion {
  return {
    npcId: id,
    npcName: name,
    emotion: 'neutral',
    intensity: 50,
    reason: 'just going about their day',
    updatedAt: 0,
    history: [],
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getNPCEmotion(npcId: string): NPCEmotion | undefined {
  return _emotions.get(npcId)
}

export function getAllNPCEmotions(): NPCEmotion[] {
  return Array.from(_emotions.values())
}

export function setNPCEmotion(
  npcId: string,
  emotion: EmotionState,
  intensity: number,
  reason: string,
  simSeconds: number,
): void {
  const existing = _emotions.get(npcId)
  if (!existing) return

  // Push current state into history (keep last 10)
  const historyEntry = { emotion: existing.emotion, reason: existing.reason, at: existing.updatedAt }
  const history = [...existing.history, historyEntry].slice(-10)

  _emotions.set(npcId, {
    ...existing,
    emotion,
    intensity: Math.max(0, Math.min(100, intensity)),
    reason,
    updatedAt: simSeconds,
    history,
  })
}

// Decay intensity toward neutral (50) by 2 points per tick
export function tickEmotions(simSeconds: number): void {
  for (const [id, em] of _emotions) {
    if (em.emotion === 'neutral' && em.intensity === 50) continue

    let newIntensity = em.intensity
    let newEmotion = em.emotion

    if (em.intensity > 50) {
      newIntensity = Math.max(50, em.intensity - 2)
    } else if (em.intensity < 50) {
      newIntensity = Math.min(50, em.intensity + 2)
    }

    // Once intensity reaches 50, snap back to neutral
    if (newIntensity === 50) {
      newEmotion = 'neutral'
    }

    if (newIntensity !== em.intensity || newEmotion !== em.emotion) {
      _emotions.set(id, {
        ...em,
        emotion: newEmotion,
        intensity: newIntensity,
        updatedAt: simSeconds,
      })
    }
  }
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeEmotions(): unknown {
  return Array.from(_emotions.entries()).map(([id, em]) => ({ id, em }))
}

export function deserializeEmotions(data: unknown): void {
  if (!Array.isArray(data)) return
  for (const entry of data) {
    if (entry && typeof entry === 'object' && 'id' in entry && 'em' in entry) {
      _emotions.set(entry.id as string, entry.em as NPCEmotion)
    }
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function getSimSeconds(): number {
  try {
    return useGameStore.getState().simSeconds ?? 0
  } catch {
    return 0
  }
}

function onNpcGift(e: Event): void {
  const detail = (e as CustomEvent).detail as { npcId?: string } | undefined
  const npcId = detail?.npcId
  if (!npcId) return
  const t = getSimSeconds()
  setNPCEmotion(npcId, 'happy', 80, 'received a gift', t)
}

function onNpcAttacked(e: Event): void {
  const detail = (e as CustomEvent).detail as { npcId?: string } | undefined
  const npcId = detail?.npcId
  if (!npcId) return
  const t = getSimSeconds()
  // First scared, then angry — set to angry immediately (scared is implied)
  setNPCEmotion(npcId, 'scared', 90, 'was attacked by player', t)
  // After 2s, transition to angry
  setTimeout(() => {
    setNPCEmotion(npcId, 'angry', 90, 'was attacked by player', getSimSeconds())
  }, 2000)
}

function onBossSpawned(): void {
  const t = getSimSeconds()
  for (const id of _emotions.keys()) {
    setNPCEmotion(id, 'anxious', 70, 'a boss appeared nearby', t)
  }
}

function onBossDefeated(): void {
  const t = getSimSeconds()
  for (const id of _emotions.keys()) {
    setNPCEmotion(id, 'happy', 85, 'the boss was defeated', t)
  }
}

function onWeatherEventStarted(e: Event): void {
  const detail = (e as CustomEvent).detail as { type?: string } | undefined
  const weatherType = detail?.type ?? ''
  const t = getSimSeconds()

  const isStorm = weatherType === 'storm' || weatherType === 'blizzard'
  const isFestival = weatherType === 'festival'

  if (isStorm) {
    for (const id of _emotions.keys()) {
      setNPCEmotion(id, 'scared', 60, `a ${weatherType} has arrived`, t)
    }
  } else if (isFestival) {
    for (const id of _emotions.keys()) {
      setNPCEmotion(id, 'happy', 70, 'a festival has begun', t)
    }
  }
}

function onNpcTrade(e: Event): void {
  const detail = (e as CustomEvent).detail as { npcId?: string } | undefined
  const npcId = detail?.npcId
  if (!npcId) return
  const t = getSimSeconds()
  setNPCEmotion(npcId, 'content', 65, 'completed a trade', t)
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initNPCEmotionSystem(): void {
  if (_initialized) return
  _initialized = true

  // Seed default NPCs
  for (const { id, name } of SEED_NPCS) {
    if (!_emotions.has(id)) {
      _emotions.set(id, makeDefault(id, name))
    }
  }

  // Register event listeners
  window.addEventListener('npc-gift', onNpcGift)
  window.addEventListener('npc-attacked', onNpcAttacked)
  window.addEventListener('boss-spawned', onBossSpawned)
  window.addEventListener('boss-defeated', onBossDefeated)
  window.addEventListener('weather-event-started', onWeatherEventStarted)
  window.addEventListener('npc-trade', onNpcTrade)
}
