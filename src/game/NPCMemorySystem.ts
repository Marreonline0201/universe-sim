// ── NPCMemorySystem ────────────────────────────────────────────────────────────
// M63 Track B: NPC Memory & Contextual Dialogue System.
// NPCs remember specific things the player has done and reference them in
// dialogue. Extends NPCRelationshipSystem with rich episodic memory.

import { getRelationship, getAllRelationships, computeTier } from './NPCRelationshipSystem'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryType =
  | 'gifted'       // player gave this NPC a gift
  | 'traded'       // player traded with this NPC
  | 'attacked'     // player attacked this NPC
  | 'helped'       // player helped this NPC (quest/task)
  | 'met_famous'   // player has killed a boss — NPCs remember you as "boss slayer"
  | 'seen_storm'   // both player and NPC were in a storm together
  | 'saw_crime'    // NPC witnessed player do something bad

export interface NPCMemory {
  npcId: string
  type: MemoryType
  detail: string       // e.g. "gave Gold Ore on Day 3"
  simSeconds: number   // when it happened
  weight: number       // how strongly this memory influences dialogue (1-10)
}

// ── Module-level state ────────────────────────────────────────────────────────

const _memories = new Map<string, NPCMemory[]>()
const MAX_MEMORIES_PER_NPC = 5

// ── Public API ────────────────────────────────────────────────────────────────

export function addMemory(npcId: string, memory: NPCMemory): void {
  const existing = _memories.get(npcId) ?? []
  existing.push(memory)
  // Evict oldest if over cap (preserve highest-weight memories)
  while (existing.length > MAX_MEMORIES_PER_NPC) {
    // Remove the earliest-added (index 0 = oldest)
    existing.shift()
  }
  _memories.set(npcId, existing)
}

export function getNPCMemories(npcId: string): NPCMemory[] {
  return _memories.get(npcId) ?? []
}

export function getAllMemories(): Map<string, NPCMemory[]> {
  return _memories
}

export function clearNPCMemories(npcId: string): void {
  _memories.delete(npcId)
}

// ── Contextual dialogue ───────────────────────────────────────────────────────

export function getContextualGreeting(
  npcId: string,
  npcName: string,
  _npcRole: string,
): string {
  const memories = getNPCMemories(npcId)
  const rel = getRelationship(npcId)
  const tier = rel ? rel.tier : computeTier(0)

  if (memories.length === 0) {
    return `Greetings, traveler. What can I do for you?`
  }

  // Sort memories by weight descending to pick most impactful first
  const sorted = [...memories].sort((a, b) => b.weight - a.weight)
  const top = sorted[0]

  // Check for specific memory types in priority order

  // Attacked is highest priority (weight=9)
  const attackMemory = memories.find(m => m.type === 'attacked')
  if (attackMemory) {
    return `Stay away from me, traveler. I haven't forgotten what you did.`
  }

  // met_famous (weight=7)
  const fameMemory = memories.find(m => m.type === 'met_famous')
  if (fameMemory) {
    // Extract boss name from detail if present
    const bossMatch = fameMemory.detail.match(/defeat (.+)$/)
    const bossId = bossMatch ? bossMatch[1] : 'that beast'
    return `I heard you defeated the ${bossId}. Word travels fast around here.`
  }

  // gifted + beloved tier
  if (top.type === 'gifted' && tier === 'beloved') {
    return `Ah, my favorite adventurer! Still thinking of that wonderful gift you gave me.`
  }

  // traded + friendly/trusted/beloved
  if (top.type === 'traded' && (tier === 'friendly' || tier === 'trusted' || tier === 'beloved')) {
    return `Good to see a reliable trading partner! What brings you here?`
  }

  // seen_storm — check if recent (within last 5 sim-minutes = 300s)
  const stormMemory = memories.find(m => m.type === 'seen_storm')
  if (stormMemory) {
    const stormType = stormMemory.detail.match(/Survived (.+?) together/)?.[1] ?? 'that storm'
    return `Quite a ${stormType} we weathered together, wasn't it?`
  }

  // helped
  const helpMemory = memories.find(m => m.type === 'helped')
  if (helpMemory) {
    return `Always good to see a friend who's helped me out. How can I repay the favor?`
  }

  // gifted any tier
  if (top.type === 'gifted') {
    return `Ah, you again! I still remember that gift you gave me.`
  }

  // traded neutral/unfriendly
  if (top.type === 'traded') {
    return `We've done business before, haven't we? What do you need?`
  }

  // Default
  return `Greetings, traveler. What can I do for you?`
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeMemories(): string {
  const obj: Record<string, NPCMemory[]> = {}
  for (const [npcId, mems] of _memories.entries()) {
    obj[npcId] = mems
  }
  return JSON.stringify(obj)
}

export function deserializeMemories(data: string): void {
  try {
    const parsed: Record<string, NPCMemory[]> = JSON.parse(data)
    for (const [npcId, mems] of Object.entries(parsed)) {
      if (Array.isArray(mems)) {
        _memories.set(npcId, mems)
      }
    }
  } catch {
    // corrupted save — ignore
  }
}

// ── Event-driven wiring ───────────────────────────────────────────────────────

let _initialized = false

export function initNPCMemorySystem(): void {
  if (_initialized) return
  _initialized = true

  // npc-gift → record gifted memory weight=6
  window.addEventListener('npc-gift', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const { npcId, itemName = 'a gift' } = detail
    if (!npcId) return
    addMemory(npcId, {
      npcId,
      type: 'gifted',
      detail: `Gave ${itemName}`,
      simSeconds: Date.now() / 1000,
      weight: 6,
    })
  })

  // npc-trade → record traded memory weight=4
  window.addEventListener('npc-trade', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const { npcId } = detail
    if (!npcId) return
    addMemory(npcId, {
      npcId,
      type: 'traded',
      detail: 'Traded goods',
      simSeconds: Date.now() / 1000,
      weight: 4,
    })
  })

  // npc-attacked → record attacked memory weight=9
  window.addEventListener('npc-attacked', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const { npcId } = detail
    if (!npcId) return
    addMemory(npcId, {
      npcId,
      type: 'attacked',
      detail: 'Was attacked by player',
      simSeconds: Date.now() / 1000,
      weight: 9,
    })
  })

  // boss-defeated → record met_famous for ALL existing NPCs weight=7
  window.addEventListener('boss-defeated', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const { bossId = 'unknown' } = detail
    const allRels = getAllRelationships()
    const now = Date.now() / 1000
    for (const rel of allRels) {
      addMemory(rel.npcId, {
        npcId: rel.npcId,
        type: 'met_famous',
        detail: `Witnessed player defeat ${bossId}`,
        simSeconds: now,
        weight: 7,
      })
    }
  })

  // weather-event-started (storm/tornado/blizzard) → seen_storm for all NPCs weight=3
  window.addEventListener('weather-event-started', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    const { event: weatherEvent = '' } = detail
    const stormTypes = ['storm', 'tornado', 'blizzard']
    const isStorm = stormTypes.some((s: string) => String(weatherEvent).toLowerCase().includes(s))
    if (!isStorm) return

    const allRels = getAllRelationships()
    const now = Date.now() / 1000
    for (const rel of allRels) {
      addMemory(rel.npcId, {
        npcId: rel.npcId,
        type: 'seen_storm',
        detail: `Survived ${weatherEvent} together`,
        simSeconds: now,
        weight: 3,
      })
    }
  })

  // ── Seed demo memories for existing seed NPCs ─────────────────────────────
  if (_memories.size === 0) {
    const now = Date.now() / 1000
    // Elara: gifted
    addMemory('npc-elara-001', {
      npcId: 'npc-elara-001', type: 'gifted',
      detail: 'Gave Gold Ore', simSeconds: now - 180, weight: 6,
    })
    addMemory('npc-elara-001', {
      npcId: 'npc-elara-001', type: 'traded',
      detail: 'Traded goods', simSeconds: now - 360, weight: 4,
    })
    // Gruff: traded
    addMemory('npc-gruff-002', {
      npcId: 'npc-gruff-002', type: 'traded',
      detail: 'Traded goods', simSeconds: now - 720, weight: 4,
    })
    // Varek: attacked
    addMemory('npc-varek-003', {
      npcId: 'npc-varek-003', type: 'attacked',
      detail: 'Was attacked by player', simSeconds: now - 2700, weight: 9,
    })
    // Mira: gifted + helped
    addMemory('npc-mira-004', {
      npcId: 'npc-mira-004', type: 'gifted',
      detail: 'Gave Fish', simSeconds: now - 60, weight: 6,
    })
    addMemory('npc-mira-004', {
      npcId: 'npc-mira-004', type: 'helped',
      detail: 'Helped with supply run', simSeconds: now - 120, weight: 8,
    })
  }
}
