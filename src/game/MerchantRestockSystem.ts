// ── MerchantRestockSystem.ts ──────────────────────────────────────────────────
// M48 Track B: NPC Merchant Restocking Events
//
// Periodically triggers a visible bulk-restock event for a named merchant.
// Players can purchase discounted items before the event expires.

import { MAT } from '../player/Inventory'
import { inventory } from './GameSingletons'
import { usePlayerStore } from '../store/playerStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RestockEvent {
  settlementId: number
  merchantName: string
  stockedItemIds: number[]     // MAT ids that will be restocked
  discountPct: number          // e.g. 15 = 15% off
  expiresAt: number            // Date.now() + duration
  claimedIds: Set<number>      // per-item claimed tracking
}

// ── Curated item pool + base prices ──────────────────────────────────────────

const RESTOCK_POOL: { matId: number; name: string; basePrice: number }[] = [
  { matId: MAT.IRON_INGOT,   name: 'Iron Ingot',   basePrice: 18 },
  { matId: MAT.WOOD,         name: 'Wood',          basePrice: 2  },
  { matId: MAT.STONE,        name: 'Stone',         basePrice: 3  },
  { matId: MAT.COOKED_MEAT,  name: 'Cooked Meat',   basePrice: 8  },
  { matId: MAT.MUSHROOM,     name: 'Mushroom',      basePrice: 4  },
  { matId: MAT.ROPE,         name: 'Rope',          basePrice: 5  },
  { matId: MAT.LEATHER,      name: 'Leather',       basePrice: 10 },
  { matId: MAT.COAL,         name: 'Coal',          basePrice: 6  },
]

export function getRestockPoolEntry(matId: number) {
  return RESTOCK_POOL.find(e => e.matId === matId) ?? null
}

// ── State ─────────────────────────────────────────────────────────────────────

export let pendingRestockEvent: RestockEvent | null = null

// ── triggerRestockEvent ───────────────────────────────────────────────────────

export function triggerRestockEvent(settlementId: number, merchantName: string): void {
  // Only trigger if no active event
  if (pendingRestockEvent !== null) return

  // Pick 3-5 random distinct MAT items
  const poolCopy = [...RESTOCK_POOL]
  const count = 3 + Math.floor(Math.random() * 3)  // 3, 4, or 5
  const chosen: number[] = []
  for (let i = 0; i < count && poolCopy.length > 0; i++) {
    const idx = Math.floor(Math.random() * poolCopy.length)
    chosen.push(poolCopy[idx].matId)
    poolCopy.splice(idx, 1)
  }

  // 10-25% discount
  const discountPct = 10 + Math.floor(Math.random() * 16)  // 10–25

  pendingRestockEvent = {
    settlementId,
    merchantName,
    stockedItemIds: chosen,
    discountPct,
    expiresAt: Date.now() + 120_000,  // 120 seconds
    claimedIds: new Set(),
  }

  window.dispatchEvent(new CustomEvent('restock-event', { detail: pendingRestockEvent }))
}

// ── claimRestockDeal ──────────────────────────────────────────────────────────

export function claimRestockDeal(matId: number, qty: number): boolean {
  if (!pendingRestockEvent) return false
  if (pendingRestockEvent.claimedIds.has(matId)) return false
  if (Date.now() >= pendingRestockEvent.expiresAt) return false
  if (!pendingRestockEvent.stockedItemIds.includes(matId)) return false

  const entry = getRestockPoolEntry(matId)
  if (!entry) return false

  const discountedPrice = Math.max(1, Math.round(entry.basePrice * (1 - pendingRestockEvent.discountPct / 100)))
  const totalCost = discountedPrice * qty

  const ps = usePlayerStore.getState()
  if (ps.gold < totalCost) return false

  const spent = ps.spendGold(totalCost)
  if (!spent) return false

  // Add items to inventory
  inventory.addItem({ itemId: 0, materialId: matId, quantity: qty, quality: 1 })

  pendingRestockEvent.claimedIds.add(matId)
  window.dispatchEvent(new CustomEvent('restock-claimed', { detail: { matId, qty } }))
  return true
}

// ── tickRestockEvent ──────────────────────────────────────────────────────────

export function tickRestockEvent(): void {
  if (!pendingRestockEvent) return
  if (Date.now() >= pendingRestockEvent.expiresAt) {
    pendingRestockEvent = null
  }
}

// ── getRestockTimeRemaining ───────────────────────────────────────────────────

export function getRestockTimeRemaining(): number {
  if (!pendingRestockEvent) return 0
  return Math.max(0, pendingRestockEvent.expiresAt - Date.now())
}
