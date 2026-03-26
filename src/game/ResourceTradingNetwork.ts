// ── ResourceTradingNetwork.ts ─────────────────────────────────────────────────
// M66 Track C: Settlement-to-settlement trade routes.
// Settlements autonomously trade resources each cycle.
// Players can invest gold in routes to earn passive profit.

import { usePlayerStore } from '../store/playerStore'

export interface TradeRoute {
  id: string
  fromSettlement: string
  toSettlement: string
  resource: string         // material name
  volumePerCycle: number   // units per trade cycle
  pricePerUnit: number     // current price
  basePrice: number        // starting price
  playerInvestment: number // gold invested by player
  cycleSeconds: number     // how often it runs (default 120)
  lastTradedAt: number     // simSeconds
  totalProfit: number      // total gold earned for player
}

// ── Module state ──────────────────────────────────────────────────────────────

let _initialized = false
let _routes: TradeRoute[] = []

// Track recent price direction for UI (routeId → 'up' | 'down' | 'none')
const _priceDirection = new Map<string, 'up' | 'down' | 'none'>()
// When was the direction last set (simSeconds)
const _priceChangedAt = new Map<string, number>()

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_ROUTES: Omit<TradeRoute, 'lastTradedAt' | 'totalProfit' | 'playerInvestment'>[] = [
  {
    id: 'route-ironhold-millhaven-iron',
    fromSettlement: 'Ironhold',
    toSettlement: 'Millhaven',
    resource: 'iron_ore',
    volumePerCycle: 50,
    pricePerUnit: 8,
    basePrice: 8,
    cycleSeconds: 120,
  },
  {
    id: 'route-millhaven-stonegate-wood',
    fromSettlement: 'Millhaven',
    toSettlement: 'Stonegate',
    resource: 'wood',
    volumePerCycle: 80,
    pricePerUnit: 4,
    basePrice: 4,
    cycleSeconds: 120,
  },
  {
    id: 'route-stonegate-ironhold-stone',
    fromSettlement: 'Stonegate',
    toSettlement: 'Ironhold',
    resource: 'stone',
    volumePerCycle: 100,
    pricePerUnit: 3,
    basePrice: 3,
    cycleSeconds: 180,
  },
  {
    id: 'route-millhaven-ironhold-fiber',
    fromSettlement: 'Millhaven',
    toSettlement: 'Ironhold',
    resource: 'fiber',
    volumePerCycle: 60,
    pricePerUnit: 5,
    basePrice: 5,
    cycleSeconds: 90,
  },
  {
    id: 'route-ironhold-stonegate-coal',
    fromSettlement: 'Ironhold',
    toSettlement: 'Stonegate',
    resource: 'coal',
    volumePerCycle: 40,
    pricePerUnit: 12,
    basePrice: 12,
    cycleSeconds: 150,
  },
]

// ── Init ──────────────────────────────────────────────────────────────────────

export function initResourceTradingNetwork(): void {
  if (_initialized) return
  _initialized = true

  _routes = SEED_ROUTES.map(r => ({
    ...r,
    playerInvestment: 0,
    lastTradedAt: 0,
    totalProfit: 0,
  }))

  for (const r of _routes) {
    _priceDirection.set(r.id, 'none')
    _priceChangedAt.set(r.id, 0)
  }
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getTradeRoutes(): TradeRoute[] {
  return _routes
}

export function getPriceDirection(routeId: string): 'up' | 'down' | 'none' {
  return _priceDirection.get(routeId) ?? 'none'
}

export function getPriceChangedAt(routeId: string): number {
  return _priceChangedAt.get(routeId) ?? 0
}

// ── Investment ────────────────────────────────────────────────────────────────

export function investInRoute(routeId: string, goldAmount: number): boolean {
  const route = _routes.find(r => r.id === routeId)
  if (!route) return false
  if (goldAmount <= 0) return false

  const ps = usePlayerStore.getState()
  if (!ps.spendGold(goldAmount)) return false

  route.playerInvestment += goldAmount
  return true
}

export function withdrawFromRoute(routeId: string, goldAmount: number): boolean {
  const route = _routes.find(r => r.id === routeId)
  if (!route) return false
  if (goldAmount <= 0) return false

  const actualAmount = Math.min(goldAmount, route.playerInvestment)
  if (actualAmount <= 0) return false

  route.playerInvestment -= actualAmount
  usePlayerStore.getState().addGold(actualAmount)
  return true
}

// ── Tick ──────────────────────────────────────────────────────────────────────

export function tickTradeNetwork(simSeconds: number): void {
  for (const route of _routes) {
    if (simSeconds - route.lastTradedAt < route.cycleSeconds) continue

    // Mark as traded
    route.lastTradedAt = simSeconds

    // Fluctuate price ±10%
    const oldPrice = route.pricePerUnit
    const fluctuation = (Math.random() * 0.2 - 0.1) // -0.10 to +0.10
    const newPrice = Math.max(1, route.basePrice * (0.8 + Math.random() * 0.4)) // keep within ±20% of base
    route.pricePerUnit = Math.round(newPrice * 10) / 10

    // Track direction
    if (route.pricePerUnit > oldPrice) {
      _priceDirection.set(route.id, 'up')
    } else if (route.pricePerUnit < oldPrice) {
      _priceDirection.set(route.id, 'down')
    } else {
      _priceDirection.set(route.id, 'none')
    }
    _priceChangedAt.set(route.id, simSeconds)

    // Calculate player profit if invested
    if (route.playerInvestment > 0) {
      const profit = (route.playerInvestment / 100) * route.pricePerUnit * 0.15
      const roundedProfit = Math.round(profit * 100) / 100

      if (roundedProfit > 0) {
        route.totalProfit += roundedProfit
        usePlayerStore.getState().addGold(Math.round(roundedProfit))

        window.dispatchEvent(new CustomEvent('trade-route-completed', {
          detail: {
            routeId: route.id,
            profit: roundedProfit,
            resource: route.resource,
            fromSettlement: route.fromSettlement,
            toSettlement: route.toSettlement,
          },
        }))
      }
    } else {
      // Still dispatch even if no profit, so UI can show activity
      window.dispatchEvent(new CustomEvent('trade-route-completed', {
        detail: {
          routeId: route.id,
          profit: 0,
          resource: route.resource,
          fromSettlement: route.fromSettlement,
          toSettlement: route.toSettlement,
        },
      }))
    }
  }
}

// ── Serialize / Deserialize ───────────────────────────────────────────────────

export function serializeTradingNetwork(): unknown {
  return {
    routes: _routes.map(r => ({ ...r })),
  }
}

export function deserializeTradingNetwork(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as { routes?: TradeRoute[] }

  if (Array.isArray(d.routes)) {
    for (const saved of d.routes) {
      const existing = _routes.find(r => r.id === saved.id)
      if (existing) {
        existing.playerInvestment = saved.playerInvestment ?? 0
        existing.totalProfit = saved.totalProfit ?? 0
        existing.lastTradedAt = saved.lastTradedAt ?? 0
        existing.pricePerUnit = saved.pricePerUnit ?? existing.basePrice
      }
    }
  }
}
