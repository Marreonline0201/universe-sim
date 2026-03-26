// ── NPCGiftSystem ──────────────────────────────────────────────────────────────
// M58 Track B: NPC Gift System — give items to NPCs to boost relationships

import { MAT } from '../player/Inventory'
import { inventory } from './GameSingletons'
import { getOrCreateRelationship } from './NPCRelationshipSystem'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GiftableItem {
  matId: number
  name: string
  icon: string
  baseAffection: number  // relationship points gained
}

export interface GiftRecord {
  npcId: string
  npcName: string
  matId: number
  itemName: string
  timestamp: number    // Date.now()
  affectionGained: number
}

// ── Giftable items catalog ────────────────────────────────────────────────────

export const GIFTABLE_ITEMS: GiftableItem[] = [
  { matId: MAT.BERRY,      name: 'Berries',    icon: '🫐', baseAffection: 5  },
  { matId: MAT.MUSHROOM,   name: 'Mushroom',   icon: '🍄', baseAffection: 8  },
  { matId: MAT.FIBER,      name: 'Fiber',      icon: '🌾', baseAffection: 4  },
  { matId: MAT.GOLD,       name: 'Gold Ore',   icon: '🪙', baseAffection: 20 },
  { matId: MAT.FISH,       name: 'Fish',       icon: '🐟', baseAffection: 15 },
  { matId: MAT.WOOD,       name: 'Wood',       icon: '🪵', baseAffection: 3  },
  { matId: MAT.IRON_ORE,   name: 'Iron Ore',   icon: '⛏',  baseAffection: 12 },
  { matId: MAT.COPPER_ORE, name: 'Copper Ore', icon: '🔸', baseAffection: 10 },
  { matId: MAT.LEAF,       name: 'Leaves',     icon: '🍃', baseAffection: 3  },
  { matId: MAT.CLAY,       name: 'Clay',       icon: '🏺', baseAffection: 6  },
  { matId: MAT.STONE,      name: 'Stone',      icon: '🪨', baseAffection: 2  },
  { matId: MAT.SALT,       name: 'Salt',       icon: '🧂', baseAffection: 7  },
]

// ── NPC gift preferences (preferred matIds give 1.5x affection) ──────────────

export const NPC_GIFT_PREFERENCES: Record<string, number[]> = {
  merchant:    [MAT.GOLD, MAT.IRON_ORE, MAT.COPPER_ORE],
  trader:      [MAT.GOLD, MAT.IRON_ORE, MAT.COPPER_ORE],
  healer:      [MAT.FIBER, MAT.MUSHROOM, MAT.BERRY],
  guard:       [MAT.IRON_ORE, MAT.COPPER_ORE, MAT.STONE],
  villager:    [MAT.BERRY, MAT.MUSHROOM, MAT.LEAF],
  elder:       [MAT.GOLD, MAT.FIBER],
  blacksmith:  [MAT.IRON_ORE, MAT.COPPER_ORE, MAT.STONE],
  artisan:     [MAT.CLAY, MAT.WOOD, MAT.FIBER],
  scholar:     [MAT.MUSHROOM, MAT.FIBER, MAT.LEAF],
  scout:       [MAT.WOOD, MAT.FIBER, MAT.STONE],
  innkeeper:   [MAT.FISH, MAT.SALT, MAT.MUSHROOM],
}

// ── Module state ──────────────────────────────────────────────────────────────

let _giftHistory: GiftRecord[] = []
const _cooldowns: Map<string, number> = new Map()
const GIFT_COOLDOWN_MS = 5 * 60 * 1000  // 5 minutes

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns giftable items that the player currently has in inventory (qty > 0).
 */
export function getGiftableItems(): GiftableItem[] {
  return GIFTABLE_ITEMS.filter(item => inventory.countMaterial(item.matId) > 0)
}

/**
 * Returns true if the NPC is not on cooldown.
 */
export function canGift(npcId: string): boolean {
  const lastGift = _cooldowns.get(npcId)
  if (!lastGift) return true
  return Date.now() - lastGift >= GIFT_COOLDOWN_MS
}

/**
 * Returns milliseconds remaining on cooldown, or 0 if not in cooldown.
 */
export function getRemainingCooldown(npcId: string): number {
  const lastGift = _cooldowns.get(npcId)
  if (!lastGift) return 0
  const remaining = GIFT_COOLDOWN_MS - (Date.now() - lastGift)
  return remaining > 0 ? remaining : 0
}

/**
 * Give a giftable item to an NPC.
 * - Checks player has the item in inventory
 * - Checks cooldown
 * - Removes 1 from inventory
 * - Computes affection (1.5x if preferred)
 * - Calls addAffinity on the NPC
 * - Dispatches 'npc-gift' event
 * Returns true if the gift was given successfully.
 */
export function giveGift(
  npcId: string,
  npcName: string,
  npcRole: string,
  matId: number,
): boolean {
  // Find the giftable item definition
  const giftItem = GIFTABLE_ITEMS.find(g => g.matId === matId)
  if (!giftItem) return false

  // Check player has the item
  if (inventory.countMaterial(matId) < 1) return false

  // Check cooldown
  if (!canGift(npcId)) return false

  // Remove 1 of the item from inventory
  const slotIdx = inventory.findItem(matId)
  if (slotIdx === -1) return false
  const removed = inventory.removeItem(slotIdx, 1)
  if (!removed) return false

  // Compute affection (preferred gift = 1.5x)
  const rolePrefs = NPC_GIFT_PREFERENCES[npcRole] ?? []
  const isPreferred = rolePrefs.includes(matId)
  const affectionGained = Math.round(giftItem.baseAffection * (isPreferred ? 1.5 : 1.0))

  // Ensure relationship exists (affinity is applied by NPCRelationshipSystem's npc-gift listener)
  getOrCreateRelationship(npcId, npcName, npcRole)

  // Set cooldown
  _cooldowns.set(npcId, Date.now())

  // Add to history (max 50)
  const record: GiftRecord = {
    npcId,
    npcName,
    matId,
    itemName: giftItem.name,
    timestamp: Date.now(),
    affectionGained,
  }
  _giftHistory.push(record)
  if (_giftHistory.length > 50) _giftHistory.shift()

  // Dispatch event
  window.dispatchEvent(new CustomEvent('npc-gift', {
    detail: { npcId, npcName, npcRole, matId, affectionGained },
  }))

  return true
}

/**
 * Returns the last 20 gift records.
 */
export function getGiftHistory(): GiftRecord[] {
  return _giftHistory.slice(-20)
}

export function serializeGiftCooldowns(): string {
  return JSON.stringify(Object.fromEntries(_cooldowns))
}

export function deserializeGiftCooldowns(data: string): void {
  try {
    const parsed: Record<string, number> = JSON.parse(data)
    for (const [npcId, ts] of Object.entries(parsed)) {
      _cooldowns.set(npcId, ts)
    }
  } catch {
    // corrupted — ignore
  }
}
