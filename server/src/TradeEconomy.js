// ── TradeEconomy.js ─────────────────────────────────────────────────────────────
// M10 Track C: Advanced NPC trade economy.
//
// Currency: copper_coin (MAT ID 59) — universal exchange medium.
// Each settlement has a `stockpile` (tracked in Neon DB).
// Supply and demand: if stockpile of item X is low, settlement pays more (shortage factor).
// Settlement specialization: each settlement produces a surplus of its biome resources.
// Trade routes: NPC caravans walk between settlements carrying goods.
// Player arbitrage: buy low, transport, sell high.

import { neon } from '@neondatabase/serverless'

// ── MAT IDs (must match client Inventory.ts MAT enum) ──────────────────────────
// Existing IDs used for trade:
const MAT_WOOD = 3, MAT_STONE = 1, MAT_FIBER = 21, MAT_LEATHER = 24
const MAT_COPPER = 25, MAT_IRON = 15, MAT_ROPE = 23, MAT_HIDE = 7
const MAT_IRON_INGOT = 43, MAT_COAL = 17
// M10 new MAT IDs (continue from 58):
export const MAT_COPPER_COIN = 59
export const MAT_FISH = 60
export const MAT_SALT = 61
export const MAT_GRAIN = 62

// ── Base prices (copper coins per unit) ───────────────────────────────────────
const BASE_PRICES = {
  [MAT_WOOD]:       2,
  [MAT_STONE]:      1,
  [MAT_FIBER]:      1,
  [MAT_LEATHER]:    5,
  [MAT_COPPER]:     8,
  [MAT_IRON]:       12,
  [MAT_ROPE]:       3,
  [MAT_HIDE]:       4,
  [MAT_IRON_INGOT]: 15,
  [MAT_COAL]:       3,
  [MAT_COPPER_COIN]:1,
  [MAT_FISH]:       4,
  [MAT_SALT]:       6,
  [MAT_GRAIN]:      3,
}

// ── Settlement specializations ─────────────────────────────────────────────────
// Each settlement produces surplus of specific mats (adds to stockpile every 60s)
// and has baseline demand for other mats.
const SETTLEMENT_SPECIALIZATIONS = {
  'Ashford':    { surplus: { [MAT_WOOD]: 15, [MAT_LEATHER]: 5, [MAT_HIDE]: 8 },       demand: { [MAT_IRON]: 2, [MAT_COAL]: 3 } },
  'Ironhaven':  { surplus: { [MAT_IRON]: 8, [MAT_COPPER]: 10, [MAT_IRON_INGOT]: 5 }, demand: { [MAT_WOOD]: 5, [MAT_GRAIN]: 4 } },
  'Saltmere':   { surplus: { [MAT_FISH]: 20, [MAT_SALT]: 15, [MAT_ROPE]: 10 },        demand: { [MAT_IRON]: 3, [MAT_GRAIN]: 5 } },
  'Thornwall':  { surplus: { [MAT_STONE]: 20, [MAT_IRON]: 6, [MAT_COAL]: 8 },         demand: { [MAT_WOOD]: 4, [MAT_FIBER]: 6 } },
  'Ridgepost':  { surplus: { [MAT_GRAIN]: 25, [MAT_FIBER]: 12, [MAT_LEATHER]: 6 },    demand: { [MAT_COPPER]: 2, [MAT_IRON]: 2 } },
}

// Shortage factor: if stockpile < SHORTAGE_THRESHOLD, price multiplier kicks in
const SHORTAGE_THRESHOLD = 10   // units
const MAX_SHORTAGE_MULT  = 2.5  // price up to 2.5× base when scarce
const SURPLUS_MULT       = 0.6  // price 0.6× base when abundant
const SURPLUS_THRESHOLD  = 50   // units

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

export class TradeEconomy {
  constructor() {
    // Map: settlement_id → { [matId]: qty }  (stockpile)
    this._stockpiles = new Map()
    // Map: settlement_id → settlement name (loaded from SettlementManager)
    this._names = new Map()
    // Caravan state: { id, fromSettlementId, toSettlementId, goods, progress 0-1 }
    this._caravans = []
    this._caravanIdCounter = 0
    this._surplusTick = 0   // real seconds since last surplus production
    this._caravanTick = 0   // real seconds since last caravan spawn
  }

  // ── Schema + load ────────────────────────────────────────────────────────────

  async migrateSchema() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        CREATE TABLE IF NOT EXISTS settlement_stockpiles (
          settlement_id   INT PRIMARY KEY,
          stockpile       TEXT NOT NULL DEFAULT '{}',
          copper_coins    INT NOT NULL DEFAULT 100,
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    } catch (err) {
      console.warn('[TradeEconomy] migrateSchema:', err.message)
    }
  }

  async load(settlements) {
    // settlements: array of { id, name } from SettlementManager.getAll()
    for (const s of settlements) {
      this._names.set(s.id, s.name)
      const spec = SETTLEMENT_SPECIALIZATIONS[s.name]
      const defaultStockpile = spec
        ? { ...spec.surplus, [MAT_COPPER_COIN]: 100 }
        : { [MAT_COPPER_COIN]: 100 }
      this._stockpiles.set(s.id, { ...defaultStockpile })
    }

    if (!process.env.DATABASE_URL) return

    try {
      const db = sql()
      const rows = await db`SELECT settlement_id, stockpile, copper_coins FROM settlement_stockpiles`
      for (const row of rows) {
        const existing = this._stockpiles.get(row.settlement_id) ?? {}
        const loaded = JSON.parse(row.stockpile ?? '{}')
        this._stockpiles.set(row.settlement_id, {
          ...existing,
          ...loaded,
          [MAT_COPPER_COIN]: row.copper_coins,
        })
      }
      console.log(`[TradeEconomy] Loaded stockpiles for ${rows.length} settlements`)
    } catch (err) {
      console.error('[TradeEconomy] load error:', err.message)
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Get the current buy price (settlement pays player) for a material.
   * Higher when settlement stockpile is low (shortage).
   */
  getBuyPrice(settlementId, matId) {
    const base = BASE_PRICES[matId] ?? 5
    const stockpile = this._stockpiles.get(settlementId) ?? {}
    const qty = stockpile[matId] ?? 0
    const mult = this._priceMult(qty)
    return Math.max(1, Math.round(base * mult))
  }

  /**
   * Get the current sell price (settlement sells to player) for a material.
   * Lower when settlement stockpile is high.
   */
  getSellPrice(settlementId, matId) {
    // Sell price is slightly above buy price (spread = profit for settlement)
    return Math.round(this.getBuyPrice(settlementId, matId) * 1.2)
  }

  /**
   * Player sells `qty` units of `matId` to `settlementId` for copper coins.
   * Returns { ok: bool, coinsEarned: number, reason?: string }
   */
  playerSellToSettlement(settlementId, matId, qty) {
    const priceEach = this.getBuyPrice(settlementId, matId)
    const coinsEarned = priceEach * qty
    const stockpile = this._stockpiles.get(settlementId)
    if (!stockpile) return { ok: false, reason: 'no_settlement' }

    // Add material to stockpile, deduct coins
    stockpile[matId] = (stockpile[matId] ?? 0) + qty
    stockpile[MAT_COPPER_COIN] = Math.max(0, (stockpile[MAT_COPPER_COIN] ?? 0) - coinsEarned)

    this._persistStockpile(settlementId).catch(() => {})
    return { ok: true, coinsEarned }
  }

  /**
   * Player buys `qty` units of `matId` from `settlementId`.
   * Returns { ok: bool, coinsSpent: number, reason?: string }
   */
  playerBuyFromSettlement(settlementId, matId, qty) {
    const stockpile = this._stockpiles.get(settlementId)
    if (!stockpile) return { ok: false, reason: 'no_settlement' }

    const available = stockpile[matId] ?? 0
    if (available < qty) return { ok: false, reason: 'insufficient_stock' }

    const priceEach = this.getSellPrice(settlementId, matId)
    const coinsSpent = priceEach * qty

    // Remove material from stockpile, add coins
    stockpile[matId] = available - qty
    if (stockpile[matId] <= 0) delete stockpile[matId]
    stockpile[MAT_COPPER_COIN] = (stockpile[MAT_COPPER_COIN] ?? 0) + coinsSpent

    this._persistStockpile(settlementId).catch(() => {})
    return { ok: true, coinsSpent }
  }

  /** Returns full shop catalog for a settlement: array of { matId, qty, buyPrice, sellPrice } */
  getShopCatalog(settlementId) {
    const stockpile = this._stockpiles.get(settlementId) ?? {}
    const catalog = []
    for (const [matIdStr, qty] of Object.entries(stockpile)) {
      const matId = parseInt(matIdStr)
      if (matId === MAT_COPPER_COIN) continue  // coins not traded directly in shop
      if (qty <= 0) continue
      catalog.push({
        matId,
        qty,
        buyPrice:  this.getBuyPrice(settlementId, matId),
        sellPrice: this.getSellPrice(settlementId, matId),
      })
    }
    // Sort by matId for consistent UI ordering
    catalog.sort((a, b) => a.matId - b.matId)
    return catalog
  }

  /** Get stockpile snapshot for a settlement (for WORLD_SNAPSHOT join) */
  getStockpileSnapshot(settlementId) {
    return { ...this._stockpiles.get(settlementId) }
  }

  /** Get all active caravans (for client rendering) */
  getCaravans() {
    return this._caravans.map(c => ({ ...c }))
  }

  /** Settlement coins balance */
  getCoinBalance(settlementId) {
    return this._stockpiles.get(settlementId)?.[MAT_COPPER_COIN] ?? 0
  }

  // ── Tick ─────────────────────────────────────────────────────────────────────

  tick(dtRealSec) {
    // Every 60 real seconds: add surplus production to each settlement
    this._surplusTick += dtRealSec
    if (this._surplusTick >= 60) {
      this._surplusTick = 0
      this._produceSurplus()
    }

    // Every 5 real minutes: spawn a caravan between random settlements
    this._caravanTick += dtRealSec
    if (this._caravanTick >= 300) {
      this._caravanTick = 0
      this._spawnCaravan()
    }

    // Advance active caravans
    for (const caravan of this._caravans) {
      caravan.progress = Math.min(1, caravan.progress + dtRealSec / 180)  // 3 min one-way
      if (caravan.progress >= 1) {
        // Caravan arrived — deposit goods into destination stockpile
        this._caravanArrived(caravan)
      }
    }
    // Remove completed caravans
    this._caravans = this._caravans.filter(c => c.progress < 1)
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _priceMult(qty) {
    if (qty < SHORTAGE_THRESHOLD) {
      const shortage = 1 - qty / SHORTAGE_THRESHOLD
      return 1 + shortage * (MAX_SHORTAGE_MULT - 1)
    }
    if (qty > SURPLUS_THRESHOLD) {
      return SURPLUS_MULT
    }
    return 1.0
  }

  _produceSurplus() {
    for (const [settlementId, stockpile] of this._stockpiles) {
      const name = this._names.get(settlementId)
      const spec = SETTLEMENT_SPECIALIZATIONS[name]
      if (!spec) continue
      for (const [matIdStr, qty] of Object.entries(spec.surplus)) {
        const matId = parseInt(matIdStr)
        stockpile[matId] = Math.min(200, (stockpile[matId] ?? 0) + qty)
      }
      this._persistStockpile(settlementId).catch(() => {})
    }
  }

  _spawnCaravan() {
    const ids = Array.from(this._stockpiles.keys())
    if (ids.length < 2) return
    const fromId = ids[Math.floor(Math.random() * ids.length)]
    let toId = fromId
    while (toId === fromId) toId = ids[Math.floor(Math.random() * ids.length)]

    const fromName = this._names.get(fromId)
    const fromSpec = SETTLEMENT_SPECIALIZATIONS[fromName]
    if (!fromSpec) return

    // Caravan carries surplus goods
    const goods = {}
    for (const [matIdStr, qty] of Object.entries(fromSpec.surplus)) {
      const matId = parseInt(matIdStr)
      const available = this._stockpiles.get(fromId)?.[matId] ?? 0
      const carry = Math.min(Math.floor(available * 0.3), 15)  // 30% of surplus, max 15
      if (carry > 0) {
        goods[matId] = carry
        const stock = this._stockpiles.get(fromId)
        if (stock) stock[matId] = Math.max(0, (stock[matId] ?? 0) - carry)
      }
    }

    if (Object.keys(goods).length === 0) return

    this._caravans.push({
      id: ++this._caravanIdCounter,
      fromSettlementId: fromId,
      toSettlementId: toId,
      goods,
      progress: 0,
    })
    console.log(`[TradeEconomy] Caravan ${this._caravanIdCounter} departs ${fromName} → ${this._names.get(toId)}`)
  }

  _caravanArrived(caravan) {
    const destStockpile = this._stockpiles.get(caravan.toSettlementId)
    if (!destStockpile) return
    for (const [matIdStr, qty] of Object.entries(caravan.goods)) {
      const matId = parseInt(matIdStr)
      destStockpile[matId] = Math.min(200, (destStockpile[matId] ?? 0) + qty)
    }
    const fromName = this._names.get(caravan.fromSettlementId)
    const toName   = this._names.get(caravan.toSettlementId)
    console.log(`[TradeEconomy] Caravan arrived at ${toName} from ${fromName}`)
    this._persistStockpile(caravan.toSettlementId).catch(() => {})
  }

  async _persistStockpile(settlementId) {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      const stockpile = this._stockpiles.get(settlementId) ?? {}
      const coins = stockpile[MAT_COPPER_COIN] ?? 0
      const stockpileJson = JSON.stringify(stockpile)
      await db`
        INSERT INTO settlement_stockpiles (settlement_id, stockpile, copper_coins, updated_at)
        VALUES (${settlementId}, ${stockpileJson}, ${coins}, NOW())
        ON CONFLICT (settlement_id) DO UPDATE SET
          stockpile    = EXCLUDED.stockpile,
          copper_coins = EXCLUDED.copper_coins,
          updated_at   = NOW()
      `
    } catch (err) {
      console.error('[TradeEconomy] persist error:', err.message)
    }
  }
}
