// ── MarketPriceSystem.ts ───────────────────────────────────────────────────────
// M59 Track C: Resource Market Price System
// Dynamic prices for 15+ resources with supply/demand, event-driven fluctuations,
// and gentle mean-reversion each tick.

export interface MarketItem {
  id: string
  name: string
  icon: string
  basePrice: number
  currentPrice: number
  minPrice: number
  maxPrice: number
  trend: 'rising' | 'falling' | 'stable'
  trendStrength: number   // 0-1
  supplyLevel: number     // 0-1 (0=scarce, 1=abundant)
  demandLevel: number     // 0-1
  lastUpdated: number     // simSeconds
}

// ── Initial data ───────────────────────────────────────────────────────────────

const BASE_ITEMS: Omit<MarketItem, 'currentPrice' | 'trend' | 'trendStrength' | 'supplyLevel' | 'demandLevel' | 'lastUpdated'>[] = [
  { id: 'wood',         name: 'Wood',         icon: '🪵', basePrice: 5,   minPrice: 2,   maxPrice: 15  },
  { id: 'iron_ore',     name: 'Iron Ore',     icon: '⛏',  basePrice: 12,  minPrice: 5,   maxPrice: 35  },
  { id: 'copper_ore',   name: 'Copper Ore',   icon: '🟠', basePrice: 10,  minPrice: 4,   maxPrice: 30  },
  { id: 'cloth',        name: 'Cloth',        icon: '🧵', basePrice: 8,   minPrice: 3,   maxPrice: 25  },
  { id: 'grain',        name: 'Grain',        icon: '🌾', basePrice: 6,   minPrice: 2,   maxPrice: 20  },
  { id: 'herbs',        name: 'Herbs',        icon: '🌿', basePrice: 15,  minPrice: 6,   maxPrice: 45  },
  { id: 'stone',        name: 'Stone',        icon: '🪨', basePrice: 4,   minPrice: 1,   maxPrice: 12  },
  { id: 'leather',      name: 'Leather',      icon: '🟫', basePrice: 14,  minPrice: 5,   maxPrice: 40  },
  { id: 'coal',         name: 'Coal',         icon: '⬛', basePrice: 9,   minPrice: 3,   maxPrice: 28  },
  { id: 'gold_ore',     name: 'Gold Ore',     icon: '✨', basePrice: 50,  minPrice: 20,  maxPrice: 150 },
  { id: 'fish',         name: 'Fish',         icon: '🐟', basePrice: 7,   minPrice: 2,   maxPrice: 22  },
  { id: 'mushroom',     name: 'Mushroom',     icon: '🍄', basePrice: 11,  minPrice: 4,   maxPrice: 32  },
  { id: 'ancient_wood', name: 'Ancient Wood', icon: '🌳', basePrice: 35,  minPrice: 15,  maxPrice: 100 },
  { id: 'silk',         name: 'Silk',         icon: '🕸', basePrice: 40,  minPrice: 15,  maxPrice: 120 },
  { id: 'gemstone',     name: 'Gemstone',     icon: '💎', basePrice: 80,  minPrice: 30,  maxPrice: 250 },
]

let _items: MarketItem[] = []
let _initialized = false

// ── Init ───────────────────────────────────────────────────────────────────────

export function initMarketPriceSystem(): void {
  if (_initialized) return
  _initialized = true

  _items = BASE_ITEMS.map(b => ({
    ...b,
    currentPrice: b.basePrice,
    trend: 'stable' as const,
    trendStrength: 0,
    supplyLevel: 0.5,
    demandLevel: 0.5,
    lastUpdated: 0,
  }))

  // ── Event listeners ─────────────────────────────────────────────────────────

  // trade-route-completed: increase demand for cargo type
  window.addEventListener('trade-route-completed', (e: Event) => {
    const detail = (e as CustomEvent<{ cargoType?: string }>).detail
    if (!detail?.cargoType) return
    const cargoType = detail.cargoType
    const cargoLower = cargoType.toLowerCase().replace(/\s+/g, '_')
    const item = _items.find(i => i.id === cargoLower || i.name.toLowerCase() === cargoType.toLowerCase())
    if (item) {
      item.demandLevel = Math.min(1, item.demandLevel + 0.15)
      item.currentPrice = Math.min(item.maxPrice, item.currentPrice * 1.1)
      _updateTrend(item)
    }
  })

  // seasonal-change: adjust seasonal items
  window.addEventListener('seasonal-change', (e: Event) => {
    const detail = (e as CustomEvent<{ season?: string }>).detail
    if (!detail?.season) return
    const season = detail.season.toLowerCase()

    if (season === 'autumn' || season === 'fall') {
      // Grain cheaper in Autumn (harvest)
      _shiftPrice('grain', 0.75)
      _shiftPrice('mushroom', 0.8)
    } else if (season === 'summer') {
      // Herbs cheaper in Summer (peak growth)
      _shiftPrice('herbs', 0.75)
      _shiftPrice('fish', 0.85)
    } else if (season === 'winter') {
      // Grain and food more expensive in Winter
      _shiftPrice('grain', 1.3)
      _shiftPrice('fish', 1.25)
      _shiftPrice('coal', 1.4)
      _shiftPrice('wood', 1.2)
    } else if (season === 'spring') {
      // Building materials cheaper in Spring
      _shiftPrice('stone', 0.85)
      _shiftPrice('wood', 0.9)
    }
  })

  // faction-war-started: spike iron/weapon material prices
  window.addEventListener('faction-war-started', () => {
    _shiftPrice('iron_ore', 1.5)
    _shiftPrice('leather', 1.35)
    _shiftPrice('coal', 1.25)
    _shiftPrice('cloth', 1.2)
  })

  // siege-started: spike grain/food prices
  window.addEventListener('siege-started', () => {
    _shiftPrice('grain', 1.6)
    _shiftPrice('herbs', 1.4)
    _shiftPrice('fish', 1.35)
    _shiftPrice('mushroom', 1.3)
    _shiftPrice('wood', 1.2)
    _shiftPrice('stone', 1.3)
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _shiftPrice(id: string, multiplier: number): void {
  const item = _items.find(i => i.id === id)
  if (!item) return
  const shifted = item.currentPrice * multiplier
  item.currentPrice = Math.max(item.minPrice, Math.min(item.maxPrice, shifted))
  _updateTrend(item)
}

function _updateTrend(item: MarketItem): void {
  const delta = item.currentPrice - item.basePrice
  const ratio = item.basePrice > 0 ? Math.abs(delta) / item.basePrice : 0
  item.trendStrength = Math.min(1, ratio)
  if (delta > item.basePrice * 0.03) {
    item.trend = 'rising'
  } else if (delta < -item.basePrice * 0.03) {
    item.trend = 'falling'
  } else {
    item.trend = 'stable'
  }
}

// ── Tick ───────────────────────────────────────────────────────────────────────

export function tickMarketPrices(simSeconds: number): void {
  for (const item of _items) {
    // Mean reversion + noise
    item.currentPrice += (item.basePrice - item.currentPrice) * 0.05
      + (Math.random() - 0.5) * item.basePrice * 0.02

    // Supply/demand influence
    const sdInfluence = (item.demandLevel - item.supplyLevel) * item.basePrice * 0.05
    item.currentPrice += sdInfluence

    // Clamp to min/max
    item.currentPrice = Math.max(item.minPrice, Math.min(item.maxPrice, item.currentPrice))

    // Gently drift supply/demand back to 0.5
    item.supplyLevel += (0.5 - item.supplyLevel) * 0.03
    item.demandLevel += (0.5 - item.demandLevel) * 0.03

    item.lastUpdated = simSeconds
    _updateTrend(item)
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function getMarketItems(): MarketItem[] {
  return _items
}

export function getItemPrice(id: string): number {
  const item = _items.find(i => i.id === id)
  if (item) return item.currentPrice
  // Fallback: check BASE_ITEMS for basePrice
  const base = BASE_ITEMS.find(b => b.id === id)
  return base?.basePrice ?? 0
}

/** Player selling drives price down (supply up) */
export function recordPlayerSell(id: string, qty: number): void {
  const item = _items.find(i => i.id === id)
  if (!item) return
  const impact = Math.min(0.3, qty * 0.01)
  item.supplyLevel = Math.min(1, item.supplyLevel + impact)
  item.currentPrice = Math.max(item.minPrice, item.currentPrice * (1 - impact * 0.5))
  _updateTrend(item)
}

/** Player buying drives price up (demand up) */
export function recordPlayerBuy(id: string, qty: number): void {
  const item = _items.find(i => i.id === id)
  if (!item) return
  const impact = Math.min(0.3, qty * 0.01)
  item.demandLevel = Math.min(1, item.demandLevel + impact)
  item.currentPrice = Math.min(item.maxPrice, item.currentPrice * (1 + impact * 0.5))
  _updateTrend(item)
}
