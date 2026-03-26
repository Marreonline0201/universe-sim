// ── HousingUpgradeSystem.ts ───────────────────────────────────────────────────
// M58 Track A: Structured housing upgrade tree — rooms, facilities, and passive bonuses

import { usePlayerStore } from '../store/playerStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HousingUpgrade {
  id: string
  name: string
  icon: string
  description: string
  tier: 1 | 2 | 3          // 1=basic, 2=expanded, 3=master
  requires: string[]        // prerequisite upgrade IDs
  cost: { gold: number; materials?: Array<{ matId: number; qty: number }> }
  bonus: string             // human-readable bonus description
  purchased: boolean
}

// ── Upgrade catalogue ─────────────────────────────────────────────────────────

const UPGRADE_DEFS: HousingUpgrade[] = [
  // ── Tier 1 (no prerequisites) ─────────────────────────────────────────────
  {
    id: 'foundation',
    name: 'Reinforced Foundation',
    icon: '🏗',
    description: 'Your home feels sturdy.',
    tier: 1,
    requires: [],
    cost: { gold: 100 },
    bonus: '+10 max health while at home',
    purchased: false,
  },
  {
    id: 'hearth',
    name: 'Stone Hearth',
    icon: '🔥',
    description: 'A warm fireplace to rest by.',
    tier: 1,
    requires: [],
    cost: { gold: 80 },
    bonus: '+20% health regen rate',
    purchased: false,
  },
  {
    id: 'storage',
    name: 'Basic Storage',
    icon: '📦',
    description: 'Extra shelving and chests.',
    tier: 1,
    requires: [],
    cost: { gold: 60 },
    bonus: '+5 inventory slots',
    purchased: false,
  },

  // ── Tier 2 ────────────────────────────────────────────────────────────────
  {
    id: 'workshop',
    name: 'Crafting Workshop',
    icon: '⚒️',
    description: 'A dedicated workspace.',
    tier: 2,
    requires: ['foundation', 'storage'],
    cost: { gold: 200 },
    bonus: '+15% crafting speed',
    purchased: false,
  },
  {
    id: 'garden',
    name: 'Herb Garden',
    icon: '🌿',
    description: 'Grow herbs passively.',
    tier: 2,
    requires: ['hearth'],
    cost: { gold: 150 },
    bonus: 'Spawns 1 herb every 5 min',
    purchased: false,
  },
  {
    id: 'vault',
    name: 'Secure Vault',
    icon: '🔒',
    description: 'Protect your most valuable items.',
    tier: 2,
    requires: ['storage', 'foundation'],
    cost: { gold: 250 },
    bonus: '+10 inventory slots, protected storage',
    purchased: false,
  },
  {
    id: 'study',
    name: 'Personal Study',
    icon: '📚',
    description: 'Books and research materials.',
    tier: 2,
    requires: ['hearth', 'storage'],
    cost: { gold: 180 },
    bonus: '+10% XP gain from all sources',
    purchased: false,
  },

  // ── Tier 3 ────────────────────────────────────────────────────────────────
  {
    id: 'forge_room',
    name: 'Dedicated Forge',
    icon: '⚙️',
    description: 'A full smithing station in your home.',
    tier: 3,
    requires: ['workshop', 'vault'],
    cost: { gold: 500 },
    bonus: '-20% smithing material cost',
    purchased: false,
  },
  {
    id: 'greenhouse',
    name: 'Glass Greenhouse',
    icon: '🌱',
    description: 'Year-round growing conditions.',
    tier: 3,
    requires: ['garden', 'workshop'],
    cost: { gold: 400 },
    bonus: '+50% herb yield, herbs from all seasons',
    purchased: false,
  },
  {
    id: 'library',
    name: 'Grand Library',
    icon: '🏛️',
    description: 'Vast knowledge repository.',
    tier: 3,
    requires: ['study', 'workshop'],
    cost: { gold: 600 },
    bonus: '+20% XP gain, unlock rare recipes',
    purchased: false,
  },
  {
    id: 'treasury',
    name: 'Personal Treasury',
    icon: '💰',
    description: 'A full bank in your home.',
    tier: 3,
    requires: ['vault', 'study'],
    cost: { gold: 700 },
    bonus: 'Earn 1% gold interest per game-day',
    purchased: false,
  },
  {
    id: 'barracks',
    name: 'Home Barracks',
    icon: '⚔️',
    description: 'Training grounds at home.',
    tier: 3,
    requires: ['forge_room', 'workshop'],
    cost: { gold: 800 },
    bonus: '+15% combat damage at all times',
    purchased: false,
  },
  {
    id: 'observatory',
    name: 'Star Observatory',
    icon: '🔭',
    description: 'Track celestial events.',
    tier: 3,
    requires: ['library', 'greenhouse'],
    cost: { gold: 900 },
    bonus: '+25% XP during seasonal events',
    purchased: false,
  },
  {
    id: 'great_hall',
    name: 'Great Hall',
    icon: '🏰',
    description: 'Impress visitors and host feasts.',
    tier: 3,
    requires: ['library', 'treasury'],
    cost: { gold: 1200 },
    bonus: '+20 reputation with all factions',
    purchased: false,
  },
  {
    id: 'sanctum',
    name: 'Arcane Sanctum',
    icon: '🔮',
    description: 'Channel magical energies.',
    tier: 3,
    requires: ['observatory', 'great_hall'],
    cost: { gold: 2000 },
    bonus: 'Unlock Arcane crafting tier',
    purchased: false,
  },
]

// ── Module state ──────────────────────────────────────────────────────────────

let _upgrades: HousingUpgrade[] = []
let _initialized = false

// ── API ───────────────────────────────────────────────────────────────────────

export function initHousingUpgrades(): void {
  if (_initialized) return
  _initialized = true
  _upgrades = UPGRADE_DEFS.map(u => ({ ...u, requires: [...u.requires] }))
}

export function getUpgrades(): HousingUpgrade[] {
  return _upgrades.map(u => ({ ...u, requires: [...u.requires] }))
}

/**
 * Returns true if all prerequisites are purchased, the upgrade is not yet
 * purchased, and the player has enough gold.
 */
export function canPurchase(id: string): boolean {
  const upgrade = _upgrades.find(u => u.id === id)
  if (!upgrade || upgrade.purchased) return false

  // Check prerequisites
  for (const reqId of upgrade.requires) {
    const req = _upgrades.find(u => u.id === reqId)
    if (!req || !req.purchased) return false
  }

  // Check gold
  const playerGold = usePlayerStore.getState().gold
  return playerGold >= upgrade.cost.gold
}

/**
 * Purchase an upgrade. Returns true on success.
 * Spends gold, marks purchased, and dispatches 'housing-upgrade' event.
 */
export function purchaseUpgrade(id: string): boolean {
  if (!canPurchase(id)) return false

  const upgrade = _upgrades.find(u => u.id === id)!
  const spent = usePlayerStore.getState().spendGold(upgrade.cost.gold)
  if (!spent) return false

  upgrade.purchased = true

  window.dispatchEvent(
    new CustomEvent('housing-upgrade', {
      detail: { upgradeId: id, upgradeName: upgrade.name },
    })
  )

  return true
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function serializeUpgrades(): string {
  return JSON.stringify(_upgrades.map(u => ({ id: u.id, purchased: u.purchased })))
}

export function deserializeUpgrades(data: string): void {
  try {
    const parsed: Array<{ id: string; purchased: boolean }> = JSON.parse(data)
    for (const saved of parsed) {
      const upgrade = _upgrades.find(u => u.id === saved.id)
      if (upgrade) {
        upgrade.purchased = saved.purchased ?? false
      }
    }
  } catch {
    // Corrupted data — keep defaults
  }
}
