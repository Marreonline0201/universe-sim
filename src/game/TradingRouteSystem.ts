// ── TradingRouteSystem.ts ──────────────────────────────────────────────────────
// M49 Track B: Settlement trading routes — passive gold + reputation income.

import { usePlayerStore } from '../store/playerStore'
import { useFactionStore } from '../store/factionStore'

export interface TradingRoute {
  id: string
  fromSettlementId: number
  toSettlementId: number
  fromName: string
  toName: string
  establishedAt: number     // Date.now()
  goldPerTick: number       // gold earned per tick (every 10s)
  reputationPerTick: number // rep earned per tick
  active: boolean
  totalGoldEarned: number
}

export const MAX_ROUTES = 5
const TICK_INTERVAL_MS = 10_000  // 10 seconds

let routes: TradingRoute[] = []
let _routeIdCounter = 1
let _accumulatedMs = 0

export function canEstablishRoute(fromId: number, toId: number): boolean {
  if (fromId === toId) return false
  if (routes.filter(r => r.active).length >= MAX_ROUTES) return false
  const alreadyExists = routes.some(
    r => r.active &&
      ((r.fromSettlementId === fromId && r.toSettlementId === toId) ||
       (r.fromSettlementId === toId && r.toSettlementId === fromId))
  )
  if (alreadyExists) return false
  return true
}

export function establishRoute(
  fromId: number,
  fromName: string,
  toId: number,
  toName: string,
): TradingRoute | null {
  if (!canEstablishRoute(fromId, toId)) return null

  const goldPerTick = 2 + Math.floor(Math.abs(fromId - toId) / 2)

  const route: TradingRoute = {
    id: `route_${_routeIdCounter++}`,
    fromSettlementId: fromId,
    toSettlementId: toId,
    fromName,
    toName,
    establishedAt: Date.now(),
    goldPerTick,
    reputationPerTick: 1,
    active: true,
    totalGoldEarned: 0,
  }

  routes = [...routes, route]
  window.dispatchEvent(new CustomEvent('trade-route-established', { detail: route }))
  return route
}

export function removeRoute(routeId: string): void {
  routes = routes.filter(r => r.id !== routeId)
}

export function getRoutes(): TradingRoute[] {
  return routes
}

export function tickRoutes(dtMs: number): void {
  _accumulatedMs += dtMs
  if (_accumulatedMs < TICK_INTERVAL_MS) return
  _accumulatedMs -= TICK_INTERVAL_MS

  const activeRoutes = routes.filter(r => r.active)
  if (activeRoutes.length === 0) return

  let totalGold = 0
  let totalRep = 0

  routes = routes.map(r => {
    if (!r.active) return r
    totalGold += r.goldPerTick
    totalRep += r.reputationPerTick
    return { ...r, totalGoldEarned: r.totalGoldEarned + r.goldPerTick }
  })

  if (totalGold > 0) {
    usePlayerStore.getState().addGold(totalGold)
  }
  if (totalRep > 0) {
    useFactionStore.getState().addFactionXp(totalRep)
  }
}

export function serializeRoutes(): object {
  return { routes, counter: _routeIdCounter }
}

export function deserializeRoutes(data: any): void {
  if (!data) return
  if (Array.isArray(data.routes)) {
    routes = data.routes as TradingRoute[]
  }
  if (typeof data.counter === 'number') {
    _routeIdCounter = data.counter
  }
}
