// ── FactionSystem.ts ──────────────────────────────────────────────────────────
// M35 Track C: Faction data definitions and player allegiance.
// Settlements belong to factions; players can pledge allegiance;
// factions can be at war causing settlement raids.

export type FactionId = 'rangers' | 'merchants' | 'scholars' | 'outlaws'

export interface Faction {
  id: FactionId
  name: string
  icon: string
  color: string
  description: string
  bonuses: {
    combatXpMult?: number
    tradeDiscount?: number
    craftXpMult?: number
    movespeedBonus?: number
  }
  relationship: Record<FactionId, 'ally' | 'neutral' | 'war'>
}

export const FACTIONS: Record<FactionId, Faction> = {
  rangers: {
    id: 'rangers',
    name: 'Frontier Rangers',
    icon: '🏹',
    color: '#44aa44',
    description: 'Hunters and explorers who roam the wilderness.',
    bonuses: { combatXpMult: 1.3, movespeedBonus: 0.1 },
    relationship: { rangers: 'ally', merchants: 'ally', scholars: 'neutral', outlaws: 'war' },
  },
  merchants: {
    id: 'merchants',
    name: 'Trade Guild',
    icon: '💰',
    color: '#ddaa00',
    description: 'Masters of commerce who control the trade routes.',
    bonuses: { tradeDiscount: 0.2 },
    relationship: { rangers: 'ally', merchants: 'ally', scholars: 'neutral', outlaws: 'neutral' },
  },
  scholars: {
    id: 'scholars',
    name: 'Arcane Society',
    icon: '📚',
    color: '#8844ff',
    description: 'Seekers of forbidden knowledge and ancient lore.',
    bonuses: { craftXpMult: 1.5 },
    relationship: { rangers: 'neutral', merchants: 'neutral', scholars: 'ally', outlaws: 'war' },
  },
  outlaws: {
    id: 'outlaws',
    name: 'Iron Brotherhood',
    icon: '⚔',
    color: '#cc3333',
    description: 'Strength above all — might makes right.',
    bonuses: { combatXpMult: 1.5 },
    relationship: { rangers: 'war', merchants: 'neutral', scholars: 'war', outlaws: 'ally' },
  },
}

export const FACTION_IDS: FactionId[] = ['rangers', 'merchants', 'scholars', 'outlaws']

/** Assign a faction to a settlement by its index in the settlements array. */
export function getFactionForSettlementIndex(index: number): FactionId {
  // 0-2 = rangers, 3-4 = merchants, 5-6 = scholars, 7+ = outlaws cycling
  if (index < 3) return 'rangers'
  if (index < 5) return 'merchants'
  if (index < 7) return 'scholars'
  return FACTION_IDS[index % FACTION_IDS.length]
}

/** Get the diplomatic relationship between two factions. */
export function getFactionRelationship(a: FactionId, b: FactionId): 'ally' | 'neutral' | 'war' {
  if (a === b) return 'ally'
  return FACTIONS[a].relationship[b]
}

/** Get the relationship label for UI display. */
export function getRelationshipLabel(rel: 'ally' | 'neutral' | 'war'): string {
  switch (rel) {
    case 'ally': return 'Allied'
    case 'war': return 'At War'
    default: return 'Neutral'
  }
}

/** Get the relationship color for UI display. */
export function getRelationshipColor(rel: 'ally' | 'neutral' | 'war'): string {
  switch (rel) {
    case 'ally': return '#44cc88'
    case 'war': return '#cc3333'
    default: return '#aaaaaa'
  }
}
