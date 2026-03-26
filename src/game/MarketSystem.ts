// ── MarketSystem.ts ───────────────────────────────────────────────────────────
// M35 Track A: Dynamic market prices per settlement.
//
// Price multipliers (0.5–2.0) per item/material at each settlement.
// - Player buys item X → demand up → price * 1.05 per unit (max 2.0)
// - Player sells item X → supply up → price * 0.95 per unit (min 0.5)
// - Rebalances 5% toward 1.0 every 60 seconds
//
// Accessed via marketSystem singleton.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketState {
  settlementId:    string
  priceMultipliers: Record<number, number>  // matId/itemId → multiplier (0.5–2.0)
  stockLevels:     Record<number, number>   // matId/itemId → stock (0–100)
  lastUpdated:     number
}

// ── MarketSystem ──────────────────────────────────────────────────────────────

class MarketSystem {
  private markets = new Map<string, MarketState>()
  private rebalanceTimer: ReturnType<typeof setInterval> | null = null

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

  /**
   * Record that the player purchased qty units at this settlement.
   * Increases price multiplier.
   */
  recordPurchase(settlementId: string, matId: number, qty: number, itemId = 0): void {
    const state = this._getOrCreate(settlementId)
    const k = this._key(matId, itemId)
    const current = state.priceMultipliers[k] ?? 1.0
    // Each unit bought multiplies price by 1.05, capped at 2.0
    const next = Math.min(2.0, current * Math.pow(1.05, qty))
    state.priceMultipliers[k] = Math.round(next * 1000) / 1000
    state.lastUpdated = Date.now()
  }

  /**
   * Record that the player sold qty units at this settlement.
   * Decreases price multiplier.
   */
  recordSale(settlementId: string, matId: number, qty: number, itemId = 0): void {
    const state = this._getOrCreate(settlementId)
    const k = this._key(matId, itemId)
    const current = state.priceMultipliers[k] ?? 1.0
    // Each unit sold multiplies price by 0.95, floored at 0.5
    const next = Math.max(0.5, current * Math.pow(0.95, qty))
    state.priceMultipliers[k] = Math.round(next * 1000) / 1000
    state.lastUpdated = Date.now()
  }

  /**
   * Get the current effective price for an item at a settlement.
   * @param basePrice The base catalog price
   * @returns Adjusted price (always at least 1)
   */
  getPrice(settlementId: string, matId: number, basePrice: number, itemId = 0): number {
    const state = this.markets.get(settlementId)
    if (!state) return basePrice
    const k = this._key(matId, itemId)
    const mult = state.priceMultipliers[k] ?? 1.0
    return Math.max(1, Math.round(basePrice * mult))
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
