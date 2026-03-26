// ── MarketSystem.ts ───────────────────────────────────────────────────────────
// M35 Track A: Dynamic market prices per settlement.
// M43 Track B: Supply/demand model, restock tick, bulk pricing, rep discounts.
//
// Price multipliers (0.5–2.0) per item/material at each settlement.
// - Player buys item X → demand up → price * 1.05 per unit (max 2.0)
// - Player sells item X → supply up → price * 0.95 per unit (min 0.5)
// - Rebalances 5% toward 1.0 every 60 seconds
// - Supply/demand shift effective price via: base * mult * (1 + (demand-supply)/100)
// - restockTick(dt) called from GameLoop every frame — fires restock every 120s
//
// Accessed via marketSystem singleton.

import { MAT } from '../player/Inventory'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketState {
  settlementId:    string
  priceMultipliers: Record<number, number>  // matId/itemId → multiplier (0.5–2.0)
  stockLevels:     Record<number, number>   // matId/itemId → stock (0–100)
  lastUpdated:     number
}

// M43 Track B: Supply/demand per material at a settlement
export interface SupplyDemand {
  materialId: number
  supply: number      // 0–100: how much the settlement has (high supply → lower price)
  demand: number      // 0–100: how much they want it  (high demand → higher price)
  lastRestockTime: number
}

// Initial supply/demand values for common goods
// Food items: abundant (supply 80, demand 20)
const FOOD_MAT_IDS = new Set([MAT.COOKED_MEAT, MAT.BERRY])
// Metal ingots: scarce (supply 30, demand 70)
const METAL_MAT_IDS = new Set([MAT.IRON_INGOT, MAT.STEEL_INGOT])
// Coal: balanced (supply 50, demand 50)
const BALANCED_MAT_IDS = new Set([MAT.COAL])

function _defaultSupplyDemand(materialId: number): SupplyDemand {
  if (FOOD_MAT_IDS.has(materialId)) {
    return { materialId, supply: 80, demand: 20, lastRestockTime: Date.now() }
  }
  if (METAL_MAT_IDS.has(materialId)) {
    return { materialId, supply: 30, demand: 70, lastRestockTime: Date.now() }
  }
  if (BALANCED_MAT_IDS.has(materialId)) {
    return { materialId, supply: 50, demand: 50, lastRestockTime: Date.now() }
  }
  // Generic default: balanced
  return { materialId, supply: 50, demand: 50, lastRestockTime: Date.now() }
}

// ── MarketSystem ──────────────────────────────────────────────────────────────

class MarketSystem {
  private markets = new Map<string, MarketState>()
  private rebalanceTimer: ReturnType<typeof setInterval> | null = null

  // M43 Track B: Supply/demand map — keyed by `${settlementId}:${matId}`
  private supplyDemand = new Map<string, SupplyDemand>()
  // Accumulator for restock tick (seconds)
  private restockAccumulator = 0
  private readonly RESTOCK_INTERVAL = 120  // 2 real minutes

  constructor() {
    // Rebalance prices toward 1.0 every 60 seconds
    this.rebalanceTimer = setInterval(() => this._rebalanceAll(), 60_000)
  }

  private _getOrCreate(settlementId: string): MarketState {
    let state = this.markets.get(settlementId)
    if (!state) {
      state = {
        settlementId,
        priceMultipliers: {},
        stockLevels: {},
        lastUpdated: Date.now(),
      }
      this.markets.set(settlementId, state)
    }
    return state
  }

  /** Returns the key used internally (we use a combined key for item vs material). */
  private _key(matId: number, itemId: number): number {
    // items have itemId != 0, materials have materialId != 0
    // Use negative for items to avoid collision with material IDs
    return itemId !== 0 ? -itemId : matId
  }

  // ── M43 Track B: Supply/demand helpers ─────────────────────────────────────

  private _sdKey(settlementId: string, matId: number): string {
    return `${settlementId}:${matId}`
  }

  /** Get (or initialise) the supply/demand record for a material at a settlement. */
  getSupplyDemand(settlementId: string, matId: number): SupplyDemand {
    const key = this._sdKey(settlementId, matId)
    if (!this.supplyDemand.has(key)) {
      this.supplyDemand.set(key, _defaultSupplyDemand(matId))
    }
    return this.supplyDemand.get(key)!
  }

  /**
   * M43 Track B: restockTick — call every frame with delta seconds.
   * Fires a restock event every RESTOCK_INTERVAL seconds.
   */
  restockTick(dt: number): void {
    this.restockAccumulator += dt
    if (this.restockAccumulator < this.RESTOCK_INTERVAL) return
    this.restockAccumulator = 0

    const now = Date.now()
    for (const sd of this.supplyDemand.values()) {
      sd.lastRestockTime = now
      // Food/common items restock supply by 5 (cap 100)
      if (FOOD_MAT_IDS.has(sd.materialId) || BALANCED_MAT_IDS.has(sd.materialId)) {
        sd.supply = Math.min(100, sd.supply + 5)
      }
      // Decrease demand by 2 for all items (simulates consumption saturation)
      sd.demand = Math.max(0, sd.demand - 2)
    }

    window.dispatchEvent(new CustomEvent('market-restock'))
  }

  // ── Existing purchase/sale recording ───────────────────────────────────────

  /**
   * Record that the player purchased qty units at this settlement.
   * Increases price multiplier; also shifts supply/demand.
   */
  recordPurchase(settlementId: string, matId: number, qty: number, itemId = 0): void {
    const state = this._getOrCreate(settlementId)
    const k = this._key(matId, itemId)
    const current = state.priceMultipliers[k] ?? 1.0
    // Each unit bought multiplies price by 1.05, capped at 2.0
    const next = Math.min(2.0, current * Math.pow(1.05, qty))
    state.priceMultipliers[k] = Math.round(next * 1000) / 1000
    state.lastUpdated = Date.now()

    // M43: buying reduces supply and increases demand
    if (itemId === 0 && matId !== 0) {
      const sd = this.getSupplyDemand(settlementId, matId)
      sd.supply = Math.max(0,   sd.supply - qty * 3)
      sd.demand = Math.min(100, sd.demand + qty * 2)
    }
  }

  /**
   * Record that the player sold qty units at this settlement.
   * Decreases price multiplier; also shifts supply/demand.
   */
  recordSale(settlementId: string, matId: number, qty: number, itemId = 0): void {
    const state = this._getOrCreate(settlementId)
    const k = this._key(matId, itemId)
    const current = state.priceMultipliers[k] ?? 1.0
    // Each unit sold multiplies price by 0.95, floored at 0.5
    const next = Math.max(0.5, current * Math.pow(0.95, qty))
    state.priceMultipliers[k] = Math.round(next * 1000) / 1000
    state.lastUpdated = Date.now()

    // M43: selling increases supply, reduces demand
    if (itemId === 0 && matId !== 0) {
      const sd = this.getSupplyDemand(settlementId, matId)
      sd.supply = Math.min(100, sd.supply + qty * 3)
      sd.demand = Math.max(0,   sd.demand - qty * 2)
    }
  }

  /**
   * Get the current effective price for an item at a settlement.
   * M43: factors in supply/demand and optional reputation discount.
   * @param basePrice The base catalog price
   * @param reputationDiscount Fractional discount (0–1), e.g. 0.10 = 10% off
   * @returns Adjusted price (always at least 1)
   */
  getPrice(
    settlementId: string,
    matId: number,
    basePrice: number,
    itemId = 0,
    reputationDiscount = 0,
  ): number {
    const state = this.markets.get(settlementId)
    const mult  = state ? (state.priceMultipliers[this._key(matId, itemId)] ?? 1.0) : 1.0

    // M43: supply/demand multiplier — ranges 0.0–2.0 centered on 1.0
    let sdMult = 1.0
    if (itemId === 0 && matId !== 0) {
      const sd = this.getSupplyDemand(settlementId, matId)
      sdMult = 1 + (sd.demand - sd.supply) / 100
      sdMult = Math.max(0.1, Math.min(2.0, sdMult))
    }

    // M43: reputation discount
    const repFactor = Math.max(0, 1 - reputationDiscount)

    return Math.max(1, Math.round(basePrice * mult * sdMult * repFactor))
  }

  /**
   * Get the price multiplier for a specific item/material.
   * Returns 1.0 if no market data exists.
   */
  getMultiplier(settlementId: string, matId: number, itemId = 0): number {
    const state = this.markets.get(settlementId)
    if (!state) return 1.0
    const k = this._key(matId, itemId)
    return state.priceMultipliers[k] ?? 1.0
  }

  /**
   * Returns trend: 'up' if price is significantly above base (>1.05),
   * 'down' if below base (<0.95), or 'flat' if near normal.
   */
  getTrend(settlementId: string, matId: number, itemId = 0): 'up' | 'down' | 'flat' {
    const mult = this.getMultiplier(settlementId, matId, itemId)
    if (mult > 1.05) return 'up'
    if (mult < 0.95) return 'down'
    return 'flat'
  }

  /**
   * Get all multipliers for a settlement, for displaying market trends.
   */
  getMarketState(settlementId: string): MarketState | null {
    return this.markets.get(settlementId) ?? null
  }

  /** Rebalance all market states 5% toward 1.0 */
  private _rebalanceAll(): void {
    for (const state of this.markets.values()) {
      for (const key of Object.keys(state.priceMultipliers)) {
        const k = Number(key)
        const current = state.priceMultipliers[k]
        // Move 5% toward 1.0
        const next = current + (1.0 - current) * 0.05
        state.priceMultipliers[k] = Math.round(next * 1000) / 1000
        // Clean up if essentially 1.0
        if (Math.abs(state.priceMultipliers[k] - 1.0) < 0.005) {
          delete state.priceMultipliers[k]
        }
      }
    }
  }

  destroy(): void {
    if (this.rebalanceTimer !== null) {
      clearInterval(this.rebalanceTimer)
      this.rebalanceTimer = null
    }
  }
}

export const marketSystem = new MarketSystem()
