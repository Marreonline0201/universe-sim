// ── FactionReputationSystem.ts ────────────────────────────────────────────────
// M62 Track A: Reputation & Faction Standing System.
// Tracks player standing with 6 world factions through event-driven actions.

export type FactionTier =
  | 'hated'
  | 'hostile'
  | 'neutral'
  | 'friendly'
  | 'honored'
  | 'exalted'

export interface FactionStanding {
  id: string
  name: string
  icon: string
  description: string
  standing: number   // −1000 to 1000, starts 0
  tier: FactionTier
}

// ── Faction definitions ───────────────────────────────────────────────────────

export const FACTION_IDS = {
  TRADERS_GUILD:    'TRADERS_GUILD',
  FOREST_WARDENS:   'FOREST_WARDENS',
  IRON_ORDER:       'IRON_ORDER',
  SCHOLARS_CIRCLE:  'SCHOLARS_CIRCLE',
  SHADOW_SYNDICATE: 'SHADOW_SYNDICATE',
  VILLAGE_COMMONS:  'VILLAGE_COMMONS',
} as const

export type FactionRepId = typeof FACTION_IDS[keyof typeof FACTION_IDS]

// ── In-memory store ───────────────────────────────────────────────────────────

const _standings = new Map<FactionRepId, FactionStanding>([
  [
    'TRADERS_GUILD',
    {
      id: 'TRADERS_GUILD',
      name: "Traders' Guild",
      icon: '💰',
      description: 'Merchants, traders, and market NPCs who control commerce.',
      standing: 0,
      tier: 'neutral',
    },
  ],
  [
    'FOREST_WARDENS',
    {
      id: 'FOREST_WARDENS',
      name: 'Forest Wardens',
      icon: '🌿',
      description: 'Rangers, druids, and nature NPCs who protect the wilds.',
      standing: 0,
      tier: 'neutral',
    },
  ],
  [
    'IRON_ORDER',
    {
      id: 'IRON_ORDER',
      name: 'Iron Order',
      icon: '⚔️',
      description: 'Blacksmiths, guards, and military NPCs who enforce order.',
      standing: 0,
      tier: 'neutral',
    },
  ],
  [
    'SCHOLARS_CIRCLE',
    {
      id: 'SCHOLARS_CIRCLE',
      name: "Scholars' Circle",
      icon: '📚',
      description: 'Scholars, healers, and artisans who pursue knowledge.',
      standing: 0,
      tier: 'neutral',
    },
  ],
  [
    'SHADOW_SYNDICATE',
    {
      id: 'SHADOW_SYNDICATE',
      name: 'Shadow Syndicate',
      icon: '🗡️',
      description: 'Rogues, smugglers, and shady NPCs who operate in darkness.',
      standing: 0,
      tier: 'neutral',
    },
  ],
  [
    'VILLAGE_COMMONS',
    {
      id: 'VILLAGE_COMMONS',
      name: 'Village Commons',
      icon: '🏡',
      description: 'Innkeepers, villagers, and farmers who make up the heartland.',
      standing: 0,
      tier: 'neutral',
    },
  ],
])

// ── Tier logic ────────────────────────────────────────────────────────────────
// exalted:  >= 750
// honored:  >= 400
// friendly: >= 100
// neutral:  >= -99
// hostile:  >= -399
// hated:    < -400

export function computeFactionTier(standing: number): FactionTier {
  if (standing >= 750)  return 'exalted'
  if (standing >= 400)  return 'honored'
  if (standing >= 100)  return 'friendly'
  if (standing >= -99)  return 'neutral'
  if (standing >= -399) return 'hostile'
  return 'hated'
}

export function getFactionTierColor(tier: FactionTier): string {
  switch (tier) {
    case 'hated':    return '#ef4444'
    case 'hostile':  return '#f97316'
    case 'neutral':  return '#6b7280'
    case 'friendly': return '#4ade80'
    case 'honored':  return '#38bdf8'
    case 'exalted':  return '#a78bfa'
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getFactionStandings(): FactionStanding[] {
  return Array.from(_standings.values())
}

export function getFactionStanding(id: string): FactionStanding | null {
  return _standings.get(id as FactionRepId) ?? null
}

export function addReputation(factionId: string, amount: number, reason?: string): void {
  const faction = _standings.get(factionId as FactionRepId)
  if (!faction) return

  faction.standing = Math.max(-1000, Math.min(1000, faction.standing + amount))
  faction.tier = computeFactionTier(faction.standing)

  window.dispatchEvent(new CustomEvent('faction-standing-changed', {
    detail: { factionId, standing: faction.standing, tier: faction.tier, reason },
  }))
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeFactions(): string {
  const data: Record<string, number> = {}
  for (const [id, faction] of _standings.entries()) {
    data[id] = faction.standing
  }
  return JSON.stringify(data)
}

export function deserializeFactions(raw: string): void {
  try {
    const data = JSON.parse(raw) as Record<string, number>
    for (const [id, standing] of Object.entries(data)) {
      const faction = _standings.get(id as FactionRepId)
      if (faction && typeof standing === 'number') {
        faction.standing = Math.max(-1000, Math.min(1000, standing))
        faction.tier = computeFactionTier(faction.standing)
      }
    }
  } catch {
    // Corrupted data — keep defaults
  }
}

// ── Event-driven wiring ───────────────────────────────────────────────────────

let _initialized = false

export function initFactionReputationSystem(): void {
  if (_initialized) return
  _initialized = true

  // npc-trade → TRADERS_GUILD +10, VILLAGE_COMMONS +3
  window.addEventListener('npc-trade', () => {
    addReputation('TRADERS_GUILD', 10, 'Trade completed')
    addReputation('VILLAGE_COMMONS', 3, 'Trade completed')
  })

  // npc-gift → faction depends on NPC role
  window.addEventListener('npc-gift', (e: Event) => {
    const { npcRole = '' } = (e as CustomEvent).detail ?? {}
    switch (npcRole) {
      case 'merchant':
        addReputation('TRADERS_GUILD', 15, 'Gift given to merchant')
        break
      case 'guard':
        addReputation('IRON_ORDER', 15, 'Gift given to guard')
        break
      case 'healer':
        addReputation('SCHOLARS_CIRCLE', 15, 'Gift given to healer')
        break
      case 'scholar':
        addReputation('SCHOLARS_CIRCLE', 15, 'Gift given to scholar')
        break
      case 'innkeeper':
        addReputation('VILLAGE_COMMONS', 15, 'Gift given to innkeeper')
        break
      case 'blacksmith':
        addReputation('IRON_ORDER', 15, 'Gift given to blacksmith')
        break
      case 'artisan':
        addReputation('SCHOLARS_CIRCLE', 10, 'Gift given to artisan')
        break
      default:
        addReputation('VILLAGE_COMMONS', 10, 'Gift given')
        break
    }
  })

  // npc-attacked → relevant faction -30
  window.addEventListener('npc-attacked', (e: Event) => {
    const { npcRole = '' } = (e as CustomEvent).detail ?? {}
    switch (npcRole) {
      case 'guard':
        addReputation('IRON_ORDER', -30, 'Attacked a guard')
        break
      case 'merchant':
        addReputation('TRADERS_GUILD', -30, 'Attacked a merchant')
        break
      default:
        addReputation('VILLAGE_COMMONS', -30, 'Attacked a villager')
        break
    }
  })

  // boss-defeated → IRON_ORDER +50
  window.addEventListener('boss-defeated', () => {
    addReputation('IRON_ORDER', 50, 'Defeated a boss')
  })

  // item-crafted → TRADERS_GUILD +5, SCHOLARS_CIRCLE +3
  window.addEventListener('item-crafted', () => {
    addReputation('TRADERS_GUILD', 5, 'Crafted an item')
    addReputation('SCHOLARS_CIRCLE', 3, 'Crafted an item')
  })

  // lightning-resource-strike (weather) → FOREST_WARDENS -10
  window.addEventListener('lightning-resource-strike', () => {
    addReputation('FOREST_WARDENS', -10, 'Nature disturbed by lightning strike')
  })

  // harvest-bonus (weather) → FOREST_WARDENS +20
  window.addEventListener('harvest-bonus', () => {
    addReputation('FOREST_WARDENS', 20, 'Bountiful harvest blessed by nature')
  })
}
