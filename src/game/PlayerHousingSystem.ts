// PlayerHousingSystem.ts - M64 Track B: Player Housing System
// 5 tiers, 10 upgrades, home base panel

import { usePlayerStore } from '../store/playerStore'

export type HouseTier = 'tent' | 'cabin' | 'cottage' | 'manor' | 'castle'

export interface HouseUpgrade {
  id: string
  name: string
  icon: string
  description: string
  effect: string
  cost: number
  requires: HouseTier
  purchased: boolean
}

export interface PlayerHouse {
  tier: HouseTier
  name: string
  upgrades: string[]
  storageBonus: number
  xpBonus: number
  goldBonus: number
  comfortLevel: number
}

export const TIER_ORDER: HouseTier[] = ['tent', 'cabin', 'cottage', 'manor', 'castle']

export const TIER_UPGRADE_COST: Record<HouseTier, number> = {
  tent: 0, cabin: 500, cottage: 2000, manor: 8000, castle: 25000,
}

export const UPGRADE_CATALOGUE: Omit<HouseUpgrade, 'purchased'>[] = [
  { id: 'storage_chest',  name: 'Extra Chest',    icon: '📦', description: 'A sturdy chest for extra storage.',       effect: '+10 storage slots',      cost: 200,   requires: 'tent'    },
  { id: 'crafting_table', name: 'Crafting Table', icon: '🪚', description: 'A dedicated crafting surface.',            effect: '-10% crafting cost',     cost: 400,   requires: 'tent'    },
  { id: 'garden',         name: 'Garden',         icon: '🌿', description: 'A lush garden behind the house.',          effect: '+15% harvest yield',     cost: 600,   requires: 'cabin'   },
  { id: 'forge',          name: 'Home Forge',     icon: '⚒',    description: 'Your own personal forge.',                 effect: '+20% smithing XP',       cost: 800,   requires: 'cabin'   },
  { id: 'library',        name: 'Library',        icon: '📚', description: 'Shelves of ancient tomes.',                effect: '+25% all XP gain',       cost: 1500,  requires: 'cottage' },
  { id: 'alchemy_lab',    name: 'Alchemy Lab',    icon: '⚗',    description: 'Distillation vats and exotic reagents.',   effect: '+30% potion potency',    cost: 1200,  requires: 'cottage' },
  { id: 'guard_tower',    name: 'Guard Tower',    icon: '🗼', description: 'A watchtower that alerts you to threats.', effect: 'Alerts on boss spawn',   cost: 2000,  requires: 'manor'   },
  { id: 'market_stall',   name: 'Market Stall',   icon: '🏪', description: 'Sell goods directly from home.',           effect: '+15% sell prices',       cost: 3000,  requires: 'manor'   },
  { id: 'throne_room',    name: 'Throne Room',    icon: '👑', description: 'A grand throne to receive emissaries.',    effect: '+50% faction rep gains', cost: 8000,  requires: 'castle'  },
  { id: 'dragon_perch',   name: 'Dragon Perch',   icon: '🐉', description: 'A massive stone perch for your dragon.',   effect: 'Pet gains +100% XP',     cost: 10000, requires: 'castle'  },
]

let _house: PlayerHouse | null = null
let _upgrades: HouseUpgrade[] = []
let _initialized = false

function tierIndex(tier: HouseTier): number { return TIER_ORDER.indexOf(tier) }

function rebuildBonuses(): void {
  if (!_house) return
  let storage = 0, xp = 0, gold = 0, comfort = 0
  for (const u of _upgrades) {
    if (!u.purchased) continue
    switch (u.id) {
      case 'storage_chest':  storage += 10; comfort += 5;  break
      case 'crafting_table':               comfort += 8;  break
      case 'garden':                       comfort += 10; break
      case 'forge':                        comfort += 6;  break
      case 'library':        xp += 25;     comfort += 12; break
      case 'alchemy_lab':                  comfort += 8;  break
      case 'guard_tower':                  comfort += 5;  break
      case 'market_stall':   gold += 15;   comfort += 7;  break
      case 'throne_room':                  comfort += 15; break
      case 'dragon_perch':                 comfort += 20; break
    }
  }
  const tierBonus: Record<HouseTier, number> = { tent: 0, cabin: 10, cottage: 20, manor: 30, castle: 45 }
  comfort = Math.min(100, comfort + tierBonus[_house.tier])
  _house.storageBonus = storage; _house.xpBonus = xp; _house.goldBonus = gold; _house.comfortLevel = comfort
  _house.upgrades = _upgrades.filter(u => u.purchased).map(u => u.id)
}

export function initPlayerHousing(): void {
  if (_initialized) return
  _initialized = true
  _house = { tier: 'tent', name: 'My Home', upgrades: [], storageBonus: 0, xpBonus: 0, goldBonus: 0, comfortLevel: 0 }
  _upgrades = UPGRADE_CATALOGUE.map(u => ({ ...u, purchased: false }))
  rebuildBonuses()
}

export function getPlayerHouse(): PlayerHouse {
  if (!_house) initPlayerHousing()
  return { ..._house!, upgrades: [..._house!.upgrades] }
}

export function upgradeHouseTier(): boolean {
  if (!_house) return false
  const idx = tierIndex(_house.tier)
  if (idx >= TIER_ORDER.length - 1) return false
  const nextTier = TIER_ORDER[idx + 1]
  if (!usePlayerStore.getState().spendGold(TIER_UPGRADE_COST[nextTier])) return false
  _house.tier = nextTier
  rebuildBonuses()
  window.dispatchEvent(new CustomEvent('player-housing-tier', { detail: { tier: nextTier } }))
  return true
}

export function purchaseHousingUpgrade(upgradeId: string): boolean {
  if (!_house) return false
  const upgrade = _upgrades.find(u => u.id === upgradeId)
  if (!upgrade || upgrade.purchased) return false
  if (tierIndex(_house.tier) < tierIndex(upgrade.requires)) return false
  if (!usePlayerStore.getState().spendGold(upgrade.cost)) return false
  upgrade.purchased = true
  rebuildBonuses()
  window.dispatchEvent(new CustomEvent('player-housing-upgrade', { detail: { upgradeId, upgradeName: upgrade.name } }))
  return true
}

export function getAvailableUpgrades(): HouseUpgrade[] {
  if (!_house) return []
  const gold = usePlayerStore.getState().gold
  return _upgrades.filter(u => !u.purchased && tierIndex(_house!.tier) >= tierIndex(u.requires) && gold >= u.cost)
}

export function getAllUpgrades(): HouseUpgrade[] { return _upgrades.map(u => ({ ...u })) }

export function getTierInfo(): { current: HouseTier; next: HouseTier | null; nextCost: number } {
  const tier = _house?.tier ?? 'tent'
  const idx = tierIndex(tier)
  const next = idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null
  return { current: tier, next, nextCost: next ? TIER_UPGRADE_COST[next] : 0 }
}

export function renameHouse(name: string): void {
  if (!_house) return
  _house.name = name.trim().slice(0, 32) || 'My Home'
}

export function getHouseBonus(type: 'xp' | 'gold' | 'storage' | 'comfort'): number {
  if (!_house) return 0
  switch (type) {
    case 'xp':      return _house.xpBonus
    case 'gold':    return _house.goldBonus
    case 'storage': return _house.storageBonus
    case 'comfort': return _house.comfortLevel
  }
}

export interface PlayerHousingSave {
  tier: HouseTier
  name: string
  purchasedIds: string[]
}

export function serializeHousing(): string {
  return JSON.stringify({
    tier: _house?.tier ?? 'tent',
    name: _house?.name ?? 'My Home',
    purchasedIds: _upgrades.filter(u => u.purchased).map(u => u.id),
  })
}

export function deserializeHousing(data: string): void {
  try {
    const saved: PlayerHousingSave = JSON.parse(data)
    if (!_house) initPlayerHousing()
    const TIERS: HouseTier[] = ['tent', 'cabin', 'cottage', 'manor', 'castle']
    if (TIERS.includes(saved.tier)) _house!.tier = saved.tier
    if (saved.name && typeof saved.name === 'string') _house!.name = saved.name
    if (Array.isArray(saved.purchasedIds)) {
      for (const id of saved.purchasedIds) {
        const u = _upgrades.find(u => u.id === id)
        if (u) u.purchased = true
      }
    }
    rebuildBonuses()
  } catch {
    // Corrupted data -- keep defaults
  }
}