// ── MerchantGuildSystem.ts ────────────────────────────────────────────────────
// M54 Track A: Merchant Guild System
// Players join the guild, complete trade contracts, and earn guild rank +
// exclusive sell/buy bonuses.

import { inventory } from './GameSingletons'
import { usePlayerStore } from '../store/playerStore'
import { MAT } from '../player/Inventory'

// ── Types ─────────────────────────────────────────────────────────────────────

export type GuildRank = 'initiate' | 'journeyman' | 'trader' | 'merchant' | 'guildmaster'

export interface GuildContract {
  id: string
  name: string
  description: string
  icon: string
  targetMatId?: number      // material to deliver
  targetItemId?: number     // item to deliver
  quantity: number
  reward: { gold: number; guildXp: number }
  completed: boolean
  expiresAt: number         // sim seconds
  acceptedAt: number | null
}

export interface GuildState {
  joined: boolean
  rank: GuildRank
  guildXp: number
  totalTrades: number
  activeContracts: GuildContract[]
  completedContracts: GuildContract[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const RANK_THRESHOLDS: Record<GuildRank, number> = {
  initiate: 0,
  journeyman: 100,
  trader: 300,
  merchant: 700,
  guildmaster: 1500,
}

export const RANK_BONUSES: Record<GuildRank, string[]> = {
  initiate:    ['Access to guild contracts', '+5% sell price'],
  journeyman:  ['+10% sell price', 'Unlock rare contracts'],
  trader:      ['+15% sell price', '+10% buy price discount'],
  merchant:    ['+20% sell price', 'Exclusive merchant items'],
  guildmaster: ['+25% sell price', 'Guild headquarters access', 'Passive 5g/min income'],
}

const RANK_ORDER: GuildRank[] = ['initiate', 'journeyman', 'trader', 'merchant', 'guildmaster']

const CONTRACT_EXPIRY_SECS = 600  // 10 sim-minutes

// Curated materials available as contract targets
const CONTRACT_MATERIALS: Array<{ matId: number; name: string; icon: string }> = [
  { matId: MAT.WOOD,        name: 'Wood',         icon: '🪵' },
  { matId: MAT.STONE,       name: 'Stone',        icon: '🪨' },
  { matId: MAT.IRON_ORE,    name: 'Iron Ore',     icon: '⛏️' },
  { matId: MAT.COAL,        name: 'Coal',         icon: '🖤' },
  { matId: MAT.GRAIN,       name: 'Grain',        icon: '🌾' },
  { matId: MAT.FISH,        name: 'Fish',         icon: '🐟' },
  { matId: MAT.HIDE,        name: 'Hide',         icon: '🐄' },
  { matId: MAT.CLOTH,       name: 'Cloth',        icon: '🧵' },
  { matId: MAT.IRON_INGOT,  name: 'Iron Ingot',   icon: '🔩' },
  { matId: MAT.COPPER,      name: 'Copper',       icon: '🟤' },
  { matId: MAT.SALT,        name: 'Salt',         icon: '🧂' },
  { matId: MAT.BERRY,       name: 'Berries',      icon: '🍇' },
  { matId: MAT.COOKED_MEAT, name: 'Cooked Meat',  icon: '🥩' },
  { matId: MAT.LEATHER,     name: 'Leather',      icon: '🪶' },
  { matId: MAT.GLASS,       name: 'Glass',        icon: '💎' },
]

// ── Module-level state ────────────────────────────────────────────────────────

let _state: GuildState = {
  joined: false,
  rank: 'initiate',
  guildXp: 0,
  totalTrades: 0,
  activeContracts: [],
  completedContracts: [],
}

let _contractIdCounter = 1

// ── Internal helpers ──────────────────────────────────────────────────────────

function _rankFromXp(xp: number): GuildRank {
  let result: GuildRank = 'initiate'
  for (const rank of RANK_ORDER) {
    if (xp >= RANK_THRESHOLDS[rank]) result = rank
  }
  return result
}

function _generateContract(simSeconds: number): GuildContract {
  const mat = CONTRACT_MATERIALS[Math.floor(Math.random() * CONTRACT_MATERIALS.length)]
  const quantity = Math.floor(Math.random() * 46) + 5  // 5–50
  const goldReward = Math.round(quantity * (2 + Math.random() * 3))
  const xpReward  = Math.round(quantity * 0.5 + Math.random() * 10)

  return {
    id: `contract_${_contractIdCounter++}`,
    name: `Deliver ${mat.name}`,
    description: `The guild needs ${quantity}x ${mat.name}. Deliver to earn your reward.`,
    icon: mat.icon,
    targetMatId: mat.matId,
    targetItemId: undefined,
    quantity,
    reward: { gold: goldReward, guildXp: xpReward },
    completed: false,
    expiresAt: simSeconds + CONTRACT_EXPIRY_SECS,
    acceptedAt: simSeconds,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getGuildState(): GuildState {
  return _state
}

export function joinGuild(): void {
  if (_state.joined) return
  _state = { ..._state, joined: true }
  window.dispatchEvent(new CustomEvent('guild-joined'))
}

export function addGuildXp(amount: number): void {
  if (!_state.joined) return
  const prevRank = _state.rank
  const newXp = _state.guildXp + amount
  const newRank = _rankFromXp(newXp)
  _state = { ..._state, guildXp: newXp, rank: newRank }
  if (newRank !== prevRank) {
    window.dispatchEvent(new CustomEvent('guild-rank-up', { detail: { rank: newRank, prevRank } }))
  }
}

export function getCurrentRankBonuses(): string[] {
  return RANK_BONUSES[_state.rank]
}

export function getNextRank(): GuildRank | null {
  const idx = RANK_ORDER.indexOf(_state.rank)
  if (idx < 0 || idx >= RANK_ORDER.length - 1) return null
  return RANK_ORDER[idx + 1]
}

export function getXpToNextRank(): number | null {
  const next = getNextRank()
  if (!next) return null
  return RANK_THRESHOLDS[next] - _state.guildXp
}

export function refreshContracts(simSeconds: number): void {
  // Remove expired or completed contracts, then pad up to 3
  const active = _state.activeContracts.filter(
    c => !c.completed && c.expiresAt > simSeconds,
  )
  while (active.length < 3) {
    active.push(_generateContract(simSeconds))
  }
  _state = { ..._state, activeContracts: active }
}

export function completeContract(contractId: string): boolean {
  const contract = _state.activeContracts.find(c => c.id === contractId)
  if (!contract || contract.completed) return false

  // Check player has required materials/items
  if (contract.targetMatId !== undefined) {
    if (inventory.countMaterial(contract.targetMatId) < contract.quantity) return false
    // Deduct materials from all slots
    let remaining = contract.quantity
    for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
      const slot = inventory.getSlot(i)
      if (slot && slot.itemId === 0 && slot.materialId === contract.targetMatId) {
        const take = Math.min(slot.quantity, remaining)
        inventory.removeItem(i, take)
        remaining -= take
      }
    }
  } else if (contract.targetItemId !== undefined) {
    if (!inventory.hasItemById(contract.targetItemId)) return false
    for (let i = 0; i < inventory.slotCount; i++) {
      const slot = inventory.getSlot(i)
      if (slot && slot.itemId === contract.targetItemId) {
        inventory.removeItem(i, Math.min(slot.quantity, contract.quantity))
        break
      }
    }
  }

  // Pay reward
  usePlayerStore.getState().addGold(contract.reward.gold)
  addGuildXp(contract.reward.guildXp)

  // Update state
  const updatedActive = _state.activeContracts.filter(c => c.id !== contractId)
  const completedContract = { ...contract, completed: true }
  _state = {
    ..._state,
    activeContracts: updatedActive,
    completedContracts: [..._state.completedContracts, completedContract],
  }

  window.dispatchEvent(new CustomEvent('contract-completed', {
    detail: {
      contractId,
      contractName: contract.name,
      reward: contract.reward,
    },
  }))
  return true
}

export function onTrade(): void {
  _state = { ..._state, totalTrades: _state.totalTrades + 1 }
}

// ── Initialization ────────────────────────────────────────────────────────────

let _initialized = false

export function initMerchantGuildSystem(): void {
  if (_initialized) return
  _initialized = true

  window.addEventListener('npc-trade', () => {
    onTrade()
    addGuildXp(5)
  })
}
