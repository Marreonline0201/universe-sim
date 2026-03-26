// ── NPCRelationshipSystem ─────────────────────────────────────────────────────
// M51 Track B: Lightweight relationship/affinity system.
// NPCs remember the player and respond differently based on past interactions.

export type RelationshipTier =
  | 'hostile'
  | 'unfriendly'
  | 'neutral'
  | 'friendly'
  | 'trusted'
  | 'beloved'

export interface NPCRelationship {
  npcId: string
  npcName: string
  npcRole: string       // e.g. 'merchant', 'blacksmith', 'guard'
  affinity: number      // -100 to 100, starts at 0
  tier: RelationshipTier
  interactions: number  // total interaction count
  lastSeen: number      // Date.now() timestamp
  notes: string[]       // up to 5 notable interaction notes
}

// ── In-memory store ───────────────────────────────────────────────────────────
const _relationships = new Map<string, NPCRelationship>()

// ── Tier logic ────────────────────────────────────────────────────────────────
// beloved:    >= 75
// trusted:    >= 45
// friendly:   >= 15
// neutral:    >= -14
// unfriendly: >= -44
// hostile:    < -44

export function computeTier(affinity: number): RelationshipTier {
  if (affinity >= 75)  return 'beloved'
  if (affinity >= 45)  return 'trusted'
  if (affinity >= 15)  return 'friendly'
  if (affinity >= -14) return 'neutral'
  if (affinity >= -44) return 'unfriendly'
  return 'hostile'
}

export function getRelationshipTierColor(tier: RelationshipTier): string {
  switch (tier) {
    case 'hostile':    return '#ef4444'
    case 'unfriendly': return '#f97316'
    case 'neutral':    return '#6b7280'
    case 'friendly':   return '#4ade80'
    case 'trusted':    return '#38bdf8'
    case 'beloved':    return '#a78bfa'
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getRelationship(npcId: string): NPCRelationship | null {
  return _relationships.get(npcId) ?? null
}

export function getOrCreateRelationship(
  npcId: string,
  npcName: string,
  npcRole: string,
): NPCRelationship {
  let rel = _relationships.get(npcId)
  if (!rel) {
    rel = {
      npcId,
      npcName,
      npcRole,
      affinity: 0,
      tier: 'neutral',
      interactions: 0,
      lastSeen: Date.now(),
      notes: [],
    }
    _relationships.set(npcId, rel)
  }
  return rel
}

export function addAffinity(npcId: string, amount: number, note?: string): void {
  const rel = _relationships.get(npcId)
  if (!rel) return

  rel.affinity = Math.max(-100, Math.min(100, rel.affinity + amount))
  rel.tier = computeTier(rel.affinity)
  rel.lastSeen = Date.now()

  if (note) {
    rel.notes.push(note)
    if (rel.notes.length > 5) rel.notes.shift()
  }
}

/** Returns all relationships sorted by absolute affinity descending (most extreme first). */
export function getAllRelationships(): NPCRelationship[] {
  return Array.from(_relationships.values())
    .sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity))
}

// ── Event-driven wiring ───────────────────────────────────────────────────────

let _initialized = false

export function initNPCRelationshipSystem(): void {
  if (_initialized) return
  _initialized = true

  // npc-trade: +5
  window.addEventListener('npc-trade', (e: Event) => {
    const { npcId, npcName = 'Unknown', npcRole = 'merchant' } = (e as CustomEvent).detail ?? {}
    if (!npcId) return
    getOrCreateRelationship(npcId, npcName, npcRole)
    const rel = _relationships.get(npcId)!
    rel.interactions++
    addAffinity(npcId, 5, 'Traded goods')
  })

  // npc-gift: +15
  window.addEventListener('npc-gift', (e: Event) => {
    const { npcId, npcName = 'Unknown', npcRole = 'villager' } = (e as CustomEvent).detail ?? {}
    if (!npcId) return
    getOrCreateRelationship(npcId, npcName, npcRole)
    const rel = _relationships.get(npcId)!
    rel.interactions++
    addAffinity(npcId, 15, 'Received a gift')
  })

  // npc-attacked: -20
  window.addEventListener('npc-attacked', (e: Event) => {
    const { npcId, npcName = 'Unknown', npcRole = 'guard' } = (e as CustomEvent).detail ?? {}
    if (!npcId) return
    getOrCreateRelationship(npcId, npcName, npcRole)
    const rel = _relationships.get(npcId)!
    rel.interactions++
    addAffinity(npcId, -20, 'Was attacked')
  })

  // npc-dialogue: +1, increment interactions, update lastSeen
  window.addEventListener('npc-dialogue', (e: Event) => {
    const { npcId, npcName = 'Unknown', npcRole = 'villager' } = (e as CustomEvent).detail ?? {}
    if (!npcId) return
    getOrCreateRelationship(npcId, npcName, npcRole)
    const rel = _relationships.get(npcId)!
    rel.interactions++
    rel.lastSeen = Date.now()
    addAffinity(npcId, 1)
  })

  // ── Demo data (seed if no relationships exist yet) ────────────────────────
  if (_relationships.size === 0) {
    const seedData: Array<{ id: string; name: string; role: string; affinity: number; notes: string[]; interactions: number; ago: number }> = [
      {
        id: 'npc-elara-001',
        name: 'Elara',
        role: 'merchant',
        affinity: 62,
        notes: ['Traded goods', 'Traded goods', 'Received a gift'],
        interactions: 7,
        ago: 3 * 60_000,
      },
      {
        id: 'npc-gruff-002',
        name: 'Gruff',
        role: 'blacksmith',
        affinity: 22,
        notes: ['Traded goods', 'Traded goods'],
        interactions: 4,
        ago: 12 * 60_000,
      },
      {
        id: 'npc-varek-003',
        name: 'Varek',
        role: 'guard',
        affinity: -55,
        notes: ['Was attacked', 'Was attacked', 'Was attacked'],
        interactions: 3,
        ago: 45 * 60_000,
      },
      {
        id: 'npc-mira-004',
        name: 'Mira',
        role: 'innkeeper',
        affinity: 85,
        notes: ['Received a gift', 'Traded goods', 'Received a gift'],
        interactions: 10,
        ago: 60_000,
      },
    ]

    for (const seed of seedData) {
      const rel: NPCRelationship = {
        npcId: seed.id,
        npcName: seed.name,
        npcRole: seed.role,
        affinity: seed.affinity,
        tier: computeTier(seed.affinity),
        interactions: seed.interactions,
        lastSeen: Date.now() - seed.ago,
        notes: seed.notes,
      }
      _relationships.set(seed.id, rel)
    }
  }
}
