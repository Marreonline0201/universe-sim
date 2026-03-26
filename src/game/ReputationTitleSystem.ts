// ── ReputationTitleSystem.ts ──────────────────────────────────────────────────
// M50 Track A: Player reputation-based title system.
// Titles are earned from overall rep totals or per-faction rep thresholds.

import { useUiStore } from '../store/uiStore'

export interface ReputationTitle {
  id: string
  name: string
  description: string
  factionId: string | null   // null = generic (earned from overall rep)
  requiredRep: number        // minimum reputation to earn
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary'
  icon: string               // emoji prefix shown in HUD
}

export const REPUTATION_TITLES: ReputationTitle[] = [
  // Generic (overall rep-based)
  { id: 'newcomer',      name: 'Newcomer',          description: 'Just arrived.',                  factionId: null,       requiredRep: 0,    rarity: 'common',    icon: '👤' },
  { id: 'wanderer_t',    name: 'Wanderer',           description: 'Known across settlements.',      factionId: null,       requiredRep: 50,   rarity: 'common',    icon: '🗺' },
  { id: 'pathfinder',    name: 'Pathfinder',         description: 'Respected by many.',             factionId: null,       requiredRep: 150,  rarity: 'uncommon',  icon: '⚡' },
  { id: 'champion',      name: 'Champion',           description: 'A champion of the people.',      factionId: null,       requiredRep: 350,  rarity: 'rare',      icon: '🏆' },
  { id: 'legend',        name: 'Legend',             description: 'Your name is known everywhere.', factionId: null,       requiredRep: 750,  rarity: 'legendary', icon: '⭐' },
  // Faction-specific
  { id: 'plains_ally',   name: 'Ally of the Plains', description: 'Trusted by the Plains faction.', factionId: 'plains',   requiredRep: 100,  rarity: 'uncommon',  icon: '🌿' },
  { id: 'plains_hero',   name: 'Hero of the Plains', description: 'Beloved hero of the Plains.',    factionId: 'plains',   requiredRep: 300,  rarity: 'rare',      icon: '🌾' },
  { id: 'forest_ally',   name: 'Forest Guardian',    description: 'Protector of the forests.',      factionId: 'forest',   requiredRep: 100,  rarity: 'uncommon',  icon: '🌲' },
  { id: 'coastal_ally',  name: 'Coastal Trader',     description: 'Welcomed in coastal towns.',     factionId: 'coastal',  requiredRep: 100,  rarity: 'uncommon',  icon: '⚓' },
  { id: 'mountain_ally', name: 'Mountain Forger',    description: 'Respected by the mountain clans.', factionId: 'mountain', requiredRep: 100, rarity: 'uncommon', icon: '⛏' },
]

// ── In-memory state ────────────────────────────────────────────────────────────

let _activeTitleId: string = 'newcomer'
let _earnedTitleIds: Set<string> = new Set(['newcomer'])

// ── Accessors ──────────────────────────────────────────────────────────────────

export function getActiveTitle(): ReputationTitle | null {
  return REPUTATION_TITLES.find(t => t.id === _activeTitleId) ?? null
}

export function getEarnedTitles(): ReputationTitle[] {
  return REPUTATION_TITLES.filter(t => _earnedTitleIds.has(t.id))
}

/** Set active title. Returns false if the title is not yet earned. */
export function setActiveTitle(titleId: string): boolean {
  if (!_earnedTitleIds.has(titleId)) return false
  _activeTitleId = titleId
  return true
}

/**
 * Check all titles against current rep values, add any newly earned ones,
 * fire toast notifications, and return the names of newly-unlocked titles.
 *
 * @param totalRep   Sum of all settlement reputation points.
 * @param factionReps   Map of factionId -> total rep with that faction.
 */
export function checkAndUpdateTitles(
  totalRep: number,
  factionReps: Record<string, number>,
): string[] {
  const newlyEarned: string[] = []

  for (const title of REPUTATION_TITLES) {
    if (_earnedTitleIds.has(title.id)) continue

    const applicable = title.factionId === null
      ? totalRep >= title.requiredRep
      : (factionReps[title.factionId] ?? 0) >= title.requiredRep

    if (applicable) {
      _earnedTitleIds.add(title.id)
      newlyEarned.push(title.name)

      const rarityLabel =
        title.rarity === 'legendary' ? '★ LEGENDARY' :
        title.rarity === 'rare'      ? '◆ RARE' :
        title.rarity === 'uncommon'  ? '◇ UNCOMMON' : '● COMMON'

      useUiStore.getState().addNotification(
        `Reputation Title Unlocked: [${title.icon} ${title.name}] — ${title.description} (${rarityLabel})`,
        'discovery',
      )
    }
  }

  return newlyEarned
}

// ── Persistence ────────────────────────────────────────────────────────────────

export function serializeRepTitles(): { activeTitleId: string; earnedIds: string[] } {
  return {
    activeTitleId: _activeTitleId,
    earnedIds: Array.from(_earnedTitleIds),
  }
}

export function deserializeRepTitles(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as { activeTitleId?: string; earnedIds?: string[] }
  if (typeof d.activeTitleId === 'string') _activeTitleId = d.activeTitleId
  if (Array.isArray(d.earnedIds)) _earnedTitleIds = new Set(d.earnedIds)
}
