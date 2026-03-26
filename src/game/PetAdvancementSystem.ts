// src/game/PetAdvancementSystem.ts
// M58 Track C: Pet advancement system — XP, levels, and skill tree for tamed creatures

import { playerPet } from './PetSystem'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PetSkill {
  id: string
  name: string
  icon: string
  description: string
  bonus: string
  tier: 1 | 2 | 3
  requires: string[]    // prerequisite skill IDs
  unlocked: boolean
  cost: number          // pet skill points
}

export interface PetState {
  name: string
  species: string
  level: number
  xp: number
  xpToNext: number
  skillPoints: number   // unspent skill points (1 per level)
  skills: PetSkill[]
  bond: number          // 0-100, increased by playing/feeding
}

// ── Skill tree definition ─────────────────────────────────────────────────────

const BASE_SKILLS: Omit<PetSkill, 'unlocked'>[] = [
  // Tier 1
  {
    id: 'loyalty',
    name: 'Loyal Bond',
    icon: '❤️',
    description: 'Your pet follows more reliably.',
    bonus: '+20% pet follow range',
    tier: 1,
    requires: [],
    cost: 1,
  },
  {
    id: 'resilience',
    name: 'Tough Hide',
    icon: '🛡️',
    description: 'Your pet takes less damage.',
    bonus: '+25% pet health',
    tier: 1,
    requires: [],
    cost: 1,
  },
  {
    id: 'scavenger',
    name: 'Keen Nose',
    icon: '👃',
    description: 'Pet sniffs out resources.',
    bonus: '+1 random material per gather',
    tier: 1,
    requires: [],
    cost: 1,
  },

  // Tier 2
  {
    id: 'combat_boost',
    name: 'Battle Companion',
    icon: '⚔️',
    description: 'Pet assists in fights.',
    bonus: '+10% bonus damage on attacks when pet is nearby',
    tier: 2,
    requires: ['loyalty', 'resilience'],
    cost: 2,
  },
  {
    id: 'gatherer',
    name: 'Resource Hound',
    icon: '🌿',
    description: 'Pet actively gathers.',
    bonus: '+2 materials per gather node',
    tier: 2,
    requires: ['scavenger', 'loyalty'],
    cost: 2,
  },
  {
    id: 'tracker',
    name: 'Expert Tracker',
    icon: '🗺️',
    description: 'Pet marks enemy positions.',
    bonus: 'Reveals nearby creatures on minimap',
    tier: 2,
    requires: ['scavenger', 'resilience'],
    cost: 2,
  },
  {
    id: 'guardian',
    name: 'Home Guardian',
    icon: '🏠',
    description: 'Pet protects your homestead.',
    bonus: '-30% home raid damage',
    tier: 2,
    requires: ['resilience', 'loyalty'],
    cost: 2,
  },

  // Tier 3
  {
    id: 'war_beast',
    name: 'War Beast',
    icon: '🔱',
    description: 'Deadly combat pet.',
    bonus: '+25% pet attack damage, pet can tank 3 hits',
    tier: 3,
    requires: ['combat_boost', 'guardian'],
    cost: 3,
  },
  {
    id: 'master_gatherer',
    name: 'Master Forager',
    icon: '🌟',
    description: 'Extraordinary resource finder.',
    bonus: '+5 materials per gather, chance to find rare materials',
    tier: 3,
    requires: ['gatherer', 'tracker'],
    cost: 3,
  },
  {
    id: 'legendary_bond',
    name: 'Legendary Bond',
    icon: '💫',
    description: 'Unbreakable connection.',
    bonus: '+50% all pet bonuses, pet never flees from combat',
    tier: 3,
    requires: ['loyalty', 'combat_boost', 'guardian'],
    cost: 4,
  },
  {
    id: 'swift',
    name: 'Swiftness',
    icon: '💨',
    description: 'Your pet is incredibly fast.',
    bonus: '+40% pet movement speed, owner gets +10% speed boost',
    tier: 3,
    requires: ['tracker', 'combat_boost'],
    cost: 3,
  },
  {
    id: 'ancient_bloodline',
    name: 'Ancient Bloodline',
    icon: '🐉',
    description: 'Legendary ancestry awakened.',
    bonus: 'Unlock special pet ability unique to species',
    tier: 3,
    requires: ['war_beast', 'legendary_bond'],
    cost: 5,
  },
]

// ── XP formula ────────────────────────────────────────────────────────────────

function xpToNext(level: number): number {
  return Math.round(100 * level * 1.5)
}

// ── Module state ──────────────────────────────────────────────────────────────

let _petState: PetState | null = null
let _initialized = false

function makeDefaultPetState(): PetState {
  const pet = playerPet
  return {
    name: pet?.name ?? 'Companion',
    species: pet?.type ?? 'unknown',
    level: 1,
    xp: 0,
    xpToNext: xpToNext(1),
    skillPoints: 0,
    skills: BASE_SKILLS.map(s => ({ ...s, unlocked: false })),
    bond: 0,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initPetAdvancement(): void {
  if (_initialized) return
  _initialized = true
  if (playerPet) {
    _petState = makeDefaultPetState()
  }
}

export function getPetState(): PetState | null {
  return _petState
}

export function addPetXp(amount: number): void {
  if (!_petState) {
    // Lazy-init if a pet exists now
    if (playerPet) {
      _petState = makeDefaultPetState()
    } else {
      return
    }
  }

  _petState.xp += amount

  // Handle level-ups (loop in case of multiple levels)
  while (_petState.xp >= _petState.xpToNext) {
    _petState.xp -= _petState.xpToNext
    _petState.level += 1
    _petState.skillPoints += 1
    _petState.xpToNext = xpToNext(_petState.level)

    const { level, skillPoints } = _petState
    window.dispatchEvent(new CustomEvent('pet-levelup', { detail: { level, skillPoints } }))
  }
}

export function unlockSkill(skillId: string): boolean {
  if (!_petState) return false

  const skill = _petState.skills.find(s => s.id === skillId)
  if (!skill) return false
  if (skill.unlocked) return false
  if (_petState.skillPoints < skill.cost) return false

  // Check prerequisites
  for (const reqId of skill.requires) {
    const req = _petState.skills.find(s => s.id === reqId)
    if (!req || !req.unlocked) return false
  }

  skill.unlocked = true
  _petState.skillPoints -= skill.cost

  window.dispatchEvent(new CustomEvent('pet-skill-unlocked', { detail: { skillId } }))
  return true
}

export function feedPet(): void {
  if (!_petState) {
    if (playerPet) {
      _petState = makeDefaultPetState()
    } else {
      return
    }
  }
  _petState.bond = Math.min(100, _petState.bond + 5)
  window.dispatchEvent(new CustomEvent('pet-fed', { detail: { bond: _petState.bond } }))
}

export function serializePet(): string {
  return JSON.stringify(_petState)
}

export function deserializePet(data: string): void {
  try {
    const parsed = JSON.parse(data)
    if (parsed && typeof parsed === 'object') {
      // Merge with defaults so new fields (skills, skillPoints, bond) survive old saves
      _petState = { ...makeDefaultPetState(), ...parsed }
      _initialized = true
    }
  } catch {
    // corrupted save — ignore
  }
}
