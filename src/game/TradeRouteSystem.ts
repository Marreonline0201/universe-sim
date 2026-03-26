// src/game/TradeRouteSystem.ts
// M56 Track A: Dynamic NPC Trade Routes between settlements

export type RouteStatus = 'active' | 'disrupted' | 'completed'

export interface TradeRoute {
  id: string
  fromSettlementId: number
  toSettlementId: number
  fromName: string
  toName: string
  cargoType: string       // e.g. "Grain", "Iron Ore", "Cloth", "Lumber", "Gold"
  cargoIcon: string       // emoji
  status: RouteStatus
  progressPct: number     // 0-100, how far along the route
  departedAt: number      // simSeconds
  estimatedArrival: number // simSeconds (departedAt + duration)
  disrupted: boolean
  disruptionReason?: string
}

const CARGO_TYPES = [
  { type: 'Grain',    icon: '🌾' },
  { type: 'Iron Ore', icon: '⛏' },
  { type: 'Cloth',    icon: '🧵' },
  { type: 'Lumber',   icon: '🪵' },
  { type: 'Gold',     icon: '🪙' },
  { type: 'Fish',     icon: '🐟' },
  { type: 'Herbs',    icon: '🌿' },
  { type: 'Stone',    icon: '🪨' },
]

const SETTLEMENT_NAMES: Record<number, string> = {
  0: 'Ironhold',
  1: 'Millhaven',
  2: 'Coldwater',
  3: 'Ashford',
  4: 'Duskport',
}

let _routes: TradeRoute[] = []
const MAX_ROUTES = 8
let _initialized = false
let _idCounter = 1

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomCargo(): { type: string; icon: string } {
  return CARGO_TYPES[Math.floor(Math.random() * CARGO_TYPES.length)]
}

function randomSettlementId(exclude?: number): number {
  const ids = [0, 1, 2, 3, 4]
  const pool = exclude !== undefined ? ids.filter(id => id !== exclude) : ids
  return pool[Math.floor(Math.random() * pool.length)]
}

function spawnRoute(simSeconds: number): TradeRoute {
  const fromId = randomSettlementId()
  const toId = randomSettlementId(fromId)
  const cargo = randomCargo()
  const duration = randomInt(120, 600)

  return {
    id: `npc-route-${_idCounter++}`,
    fromSettlementId: fromId,
    toSettlementId: toId,
    fromName: SETTLEMENT_NAMES[fromId] ?? `Settlement ${fromId}`,
    toName: SETTLEMENT_NAMES[toId] ?? `Settlement ${toId}`,
    cargoType: cargo.type,
    cargoIcon: cargo.icon,
    status: 'active',
    progressPct: 0,
    departedAt: simSeconds,
    estimatedArrival: simSeconds + duration,
    disrupted: false,
  }
}

export function getTradeRoutes(): TradeRoute[] {
  return [..._routes].sort((a, b) => b.departedAt - a.departedAt)
}

export function initTradeRouteSystem(): void {
  if (_initialized) return
  _initialized = true

  // Seed with 2-3 initial routes (simSeconds = 0 for seeds)
  const seedCount = randomInt(2, 3)
  for (let i = 0; i < seedCount; i++) {
    _routes.push(spawnRoute(0))
  }

  // Listen for siege events
  window.addEventListener('siege-started', (e: Event) => {
    const detail = (e as CustomEvent).detail as { settlementId: number }
    for (const route of _routes) {
      if (
        (route.fromSettlementId === detail.settlementId || route.toSettlementId === detail.settlementId)
        && route.status === 'active'
      ) {
        route.status = 'disrupted'
        route.disrupted = true
        route.disruptionReason = 'Siege underway'
      }
    }
  })

  window.addEventListener('siege-resolved', (e: Event) => {
    const detail = (e as CustomEvent).detail as { settlementId: number }
    for (const route of _routes) {
      if (
        (route.fromSettlementId === detail.settlementId || route.toSettlementId === detail.settlementId)
        && route.status === 'disrupted'
      ) {
        route.status = 'active'
        route.disrupted = false
        route.disruptionReason = undefined
      }
    }
  })

  window.addEventListener('faction-war-started', () => {
    const activeRoutes = _routes.filter(r => r.status === 'active')
    if (activeRoutes.length === 0) return
    const target = activeRoutes[Math.floor(Math.random() * activeRoutes.length)]
    target.status = 'disrupted'
    target.disrupted = true
    target.disruptionReason = 'Faction war disrupts trade'
  })
}

export function tickTradeRoutes(simSeconds: number): void {
  const completed: TradeRoute[] = []
  const surviving: TradeRoute[] = []

  for (const route of _routes) {
    if (route.status === 'active') {
      const duration = route.estimatedArrival - route.departedAt
      if (duration > 0) {
        route.progressPct = Math.min(100, ((simSeconds - route.departedAt) / duration) * 100)
      }
      if (route.progressPct >= 100) {
        route.status = 'completed'
        completed.push(route)
      } else {
        surviving.push(route)
      }
    } else {
      surviving.push(route)
    }
  }

  // Dispatch completed events and drop completed routes
  for (const route of completed) {
    window.dispatchEvent(new CustomEvent('trade-route-completed', { detail: { route } }))
  }
  _routes = surviving

  // 8% chance to spawn a new route
  if (_routes.length < MAX_ROUTES && Math.random() < 0.08) {
    _routes.push(spawnRoute(simSeconds))
  }

  // 3% chance to disrupt a random active route
  if (Math.random() < 0.03) {
    const activeRoutes = _routes.filter(r => r.status === 'active')
    if (activeRoutes.length > 0) {
      const target = activeRoutes[Math.floor(Math.random() * activeRoutes.length)]
      target.status = 'disrupted'
      target.disrupted = true
      target.disruptionReason = 'Bandits on the road'
    }
  }

  // 2% chance to restore a disrupted route to active
  if (Math.random() < 0.02) {
    const disruptedRoutes = _routes.filter(r => r.status === 'disrupted')
    if (disruptedRoutes.length > 0) {
      const target = disruptedRoutes[Math.floor(Math.random() * disruptedRoutes.length)]
      target.status = 'active'
      target.disrupted = false
      target.disruptionReason = undefined
    }
  }
}
