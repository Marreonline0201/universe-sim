// ── BountyBoardSystem.ts ──────────────────────────────────────────────────────
// M54 Track B: Enemy Bounty Board
// NPCs post bounties for killing specific enemy types.
// Players claim bounties after meeting kill requirements.

import { usePlayerStore } from '../store/playerStore'
import { useReputationStore } from '../store/reputationStore'
import { useSettlementStore } from '../store/settlementStore'
import { useUiStore } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'

export type BountyDifficulty = 'easy' | 'medium' | 'hard' | 'legendary'

export interface Bounty {
  id: string
  targetSpecies: string    // matches enemy species name (e.g. 'Wolf', 'Goblin', 'Dragon')
  targetCount: number      // kills required
  currentKills: number     // player's progress
  poster: string           // NPC name who posted it
  reward: { gold: number; reputationBonus: number }
  difficulty: BountyDifficulty
  icon: string
  description: string
  claimed: boolean
  expiresAt: number        // sim seconds
}

// ── Bounty pool ───────────────────────────────────────────────────────────────

interface BountyTemplate {
  targetSpecies: string
  targetCount: number
  poster: string
  difficulty: BountyDifficulty
  icon: string
  description: string
  reward: { gold: number; reputationBonus: number }
}

const BOUNTY_POOL: BountyTemplate[] = [
  { targetSpecies: 'Wolf',    targetCount: 5,  poster: 'Old Miller',    difficulty: 'easy',      icon: '🐺', description: 'Wolves are attacking my sheep.',        reward: { gold: 40,  reputationBonus: 10 } },
  { targetSpecies: 'Goblin',  targetCount: 10, poster: 'Guard Captain', difficulty: 'medium',    icon: '👺', description: 'Clear the goblin camp to the east.',    reward: { gold: 80,  reputationBonus: 20 } },
  { targetSpecies: 'Bandit',  targetCount: 3,  poster: 'Merchant Yara', difficulty: 'easy',      icon: '🗡', description: 'Bandits robbed my caravan.',             reward: { gold: 60,  reputationBonus: 15 } },
  { targetSpecies: 'Bear',    targetCount: 2,  poster: 'Trapper John',  difficulty: 'medium',    icon: '🐻', description: 'Two bears near the northern trail.',    reward: { gold: 90,  reputationBonus: 18 } },
  { targetSpecies: 'Spider',  targetCount: 8,  poster: 'Lady Avara',    difficulty: 'easy',      icon: '🕷', description: 'Giant spiders in the old ruins.',        reward: { gold: 50,  reputationBonus: 12 } },
  { targetSpecies: 'Dragon',  targetCount: 1,  poster: 'High Council',  difficulty: 'legendary', icon: '🐉', description: 'Slay the dragon terrorizing the valley.', reward: { gold: 500, reputationBonus: 100 } },
  { targetSpecies: 'Zombie',  targetCount: 15, poster: 'Priest Orin',   difficulty: 'medium',    icon: '🧟', description: 'Undead are rising from the cemetery.',   reward: { gold: 100, reputationBonus: 25 } },
  { targetSpecies: 'Troll',   targetCount: 2,  poster: 'Bridge Keeper', difficulty: 'hard',      icon: '👹', description: 'Trolls block the mountain pass.',        reward: { gold: 150, reputationBonus: 35 } },
]

// ── State ─────────────────────────────────────────────────────────────────────

let activeBounties: Bounty[] = []
let completedBounties: Bounty[] = []  // last 10
let _initialized = false
let _bountyIdCounter = 0

function generateId(): string {
  return `bounty_${++_bountyIdCounter}_${Date.now()}`
}

function makeBounty(template: BountyTemplate, expiresAt: number): Bounty {
  return {
    id: generateId(),
    targetSpecies: template.targetSpecies,
    targetCount: template.targetCount,
    currentKills: 0,
    poster: template.poster,
    reward: { ...template.reward },
    difficulty: template.difficulty,
    icon: template.icon,
    description: template.description,
    claimed: false,
    expiresAt,
  }
}

function pickRandomBounties(count: number, simSeconds: number): Bounty[] {
  // Exclude species already in active bounties to avoid duplicates
  const activeSpecies = new Set(activeBounties.map(b => b.targetSpecies))
  const available = BOUNTY_POOL.filter(t => !activeSpecies.has(t.targetSpecies))
  if (available.length === 0) return []

  const shuffled = [...available].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map(t => makeBounty(t, simSeconds + 900))
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getActiveBounties(): Bounty[] {
  return activeBounties
}

export function getCompletedBounties(): Bounty[] {
  return completedBounties
}

/** Init: pick 3 random bounties from BOUNTY_POOL, set expiresAt = simSeconds + 900 */
export function initBountyBoard(simSeconds: number): void {
  if (_initialized) return
  _initialized = true
  activeBounties = pickRandomBounties(3, simSeconds)
}

/** On enemy kill — check active bounties for matching species */
export function onKill(species: string): void {
  if (!species) return
  // Normalise to Title Case to match species names like 'Wolf', 'Goblin'
  const normalised = species.charAt(0).toUpperCase() + species.slice(1).toLowerCase()

  for (const bounty of activeBounties) {
    if (bounty.claimed) continue
    if (bounty.targetSpecies.toLowerCase() === normalised.toLowerCase()) {
      bounty.currentKills = Math.min(bounty.currentKills + 1, bounty.targetCount)
      if (bounty.currentKills >= bounty.targetCount) {
        useUiStore.getState().addNotification(
          `Bounty ready to claim: ${bounty.icon} ${bounty.targetSpecies} (${bounty.poster})`,
          'discovery'
        )
      }
    }
  }
}

/** Player explicitly claims a completed bounty */
export function claimBounty(bountyId: string): boolean {
  const idx = activeBounties.findIndex(b => b.id === bountyId)
  if (idx === -1) return false

  const bounty = activeBounties[idx]
  if (bounty.claimed) return false
  if (bounty.currentKills < bounty.targetCount) return false

  // Check expiry
  const currentSim = useGameStore.getState().simSeconds
  if (currentSim > bounty.expiresAt) return false

  // Pay gold
  usePlayerStore.getState().addGold(bounty.reward.gold)

  // Add reputation to nearest settlement
  const nearId = useSettlementStore.getState().nearSettlementId
  if (nearId !== null) {
    const sName = useSettlementStore.getState().settlements.get(nearId)?.name ?? 'Unknown Settlement'
    useReputationStore.getState().addPoints(nearId, sName, bounty.reward.reputationBonus)
  }

  // Mark claimed
  bounty.claimed = true

  // Fire event
  window.dispatchEvent(new CustomEvent('bounty-claimed', {
    detail: {
      bountyId: bounty.id,
      targetSpecies: bounty.targetSpecies,
      poster: bounty.poster,
      reward: bounty.reward,
    },
  }))

  // Move to completed (keep last 10)
  completedBounties = [bounty, ...completedBounties].slice(0, 10)
  activeBounties = activeBounties.filter((_, i) => i !== idx)

  useUiStore.getState().addNotification(
    `Bounty claimed! ${bounty.icon} ${bounty.targetSpecies} — +${bounty.reward.gold} gold, +${bounty.reward.reputationBonus} rep`,
    'discovery'
  )

  return true
}

/** Rotate expired bounties out and add fresh ones (call on 60s timer) */
export function tickBountyBoard(simSeconds: number): void {
  // Remove expired unclaimed bounties
  activeBounties = activeBounties.filter(b => b.expiresAt > simSeconds || b.claimed)

  // Fill back up to 3
  const needed = 3 - activeBounties.length
  if (needed > 0) {
    const fresh = pickRandomBounties(needed, simSeconds)
    activeBounties = [...activeBounties, ...fresh]
  }
}
