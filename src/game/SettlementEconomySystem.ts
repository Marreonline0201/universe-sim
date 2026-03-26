// src/game/SettlementEconomySystem.ts
// M61 Track B: Settlement Economy System
// Each settlement generates income, has population growth, and can be improved via player investment.

import { usePlayerStore } from '../store/playerStore'

export type ProsperityTier = 'struggling' | 'stable' | 'thriving' | 'booming'

export interface SettlementEconomy {
  settlementId: number
  name: string
  population: number      // 50–2000
  growthRate: number      // per tick (0.001–0.01)
  wealth: number          // 0–1000
  wealthGrowth: number    // per tick
  prosperity: ProsperityTier
  playerInvestment: number // total gold invested by player
  lastTick: number        // simSeconds of last tick
}

// Settlement names — must match TradeRouteSystem SETTLEMENT_NAMES
const SETTLEMENT_NAMES: Record<number, string> = {
  0: 'Ironhold',
  1: 'Millhaven',
  2: 'Coldwater',
  3: 'Ashford',
  4: 'Duskport',
}

// ── Module state ───────────────────────────────────────────────────────────────

let _initialized = false
let _economies: SettlementEconomy[] = []

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function computeProsperity(wealth: number): ProsperityTier {
  if (wealth >= 750) return 'booming'
  if (wealth >= 450) return 'thriving'
  if (wealth >= 150) return 'stable'
  return 'struggling'
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initSettlementEconomy(): void {
  if (_initialized) return
  _initialized = true

  // Seed with 5 settlements, each with varied starting states
  const seeds: Array<Partial<SettlementEconomy>> = [
    // Ironhold — industrial, medium wealth
    { population: 820, growthRate: 0.005, wealth: 480, wealthGrowth: 4.5 },
    // Millhaven — small farming town, struggling
    { population: 210, growthRate: 0.008, wealth: 95, wealthGrowth: 1.8 },
    // Coldwater — remote, poor
    { population: 115, growthRate: 0.003, wealth: 60, wealthGrowth: 0.9 },
    // Ashford — thriving trade hub
    { population: 1240, growthRate: 0.006, wealth: 660, wealthGrowth: 7.2 },
    // Duskport — booming harbour city
    { population: 1780, growthRate: 0.004, wealth: 870, wealthGrowth: 9.5 },
  ]

  _economies = seeds.map((seed, idx) => {
    const wealth = seed.wealth ?? 200
    return {
      settlementId: idx,
      name: SETTLEMENT_NAMES[idx] ?? `Settlement ${idx}`,
      population: seed.population ?? 300,
      growthRate: seed.growthRate ?? 0.005,
      wealth,
      wealthGrowth: seed.wealthGrowth ?? 3,
      prosperity: computeProsperity(wealth),
      playerInvestment: 0,
      lastTick: 0,
    }
  })

  // Listen for completed trade routes — boost involved settlements
  window.addEventListener('trade-route-completed', (e: Event) => {
    const detail = (e as CustomEvent).detail as { route: { fromSettlementId: number; toSettlementId: number } }
    const { fromSettlementId, toSettlementId } = detail.route
    for (const eco of _economies) {
      if (eco.settlementId === fromSettlementId || eco.settlementId === toSettlementId) {
        eco.wealth = clamp(eco.wealth + 10, 0, 1000)
        eco.prosperity = computeProsperity(eco.wealth)
      }
    }
  })
}

export function tickSettlementEconomy(simSeconds: number): void {
  for (const eco of _economies) {
    // Population growth
    const popGain = eco.population * eco.growthRate
    eco.population = clamp(eco.population + popGain, 50, 2000)

    // Wealth growth (boosted by investment)
    const investBonus = eco.playerInvestment > 0
      ? Math.log10(eco.playerInvestment + 1) * 0.5
      : 0
    eco.wealth = clamp(eco.wealth + eco.wealthGrowth + investBonus, 0, 1000)

    // Update prosperity tier
    eco.prosperity = computeProsperity(eco.wealth)

    eco.lastTick = simSeconds
  }
}

export function investInSettlement(settlementId: number, gold: number): boolean {
  const eco = _economies.find(e => e.settlementId === settlementId)
  if (!eco) return false

  const ps = usePlayerStore.getState()
  const spent = ps.spendGold(gold)
  if (!spent) return false

  eco.playerInvestment += gold
  // Immediate boost: wealth +5% of investment, growth rate slightly improved
  eco.wealth = clamp(eco.wealth + gold * 0.05, 0, 1000)
  eco.wealthGrowth = clamp(eco.wealthGrowth + gold * 0.001, 0, 50)
  eco.prosperity = computeProsperity(eco.wealth)

  return true
}

export function getSettlementEconomies(): SettlementEconomy[] {
  return [..._economies]
}

/** Returns a reputation bonus based on prosperity tier (0, 5, 15, 30). */
export function getProsperityBonus(settlementId: number): number {
  const eco = _economies.find(e => e.settlementId === settlementId)
  if (!eco) return 0
  switch (eco.prosperity) {
    case 'booming':   return 30
    case 'thriving':  return 15
    case 'stable':    return 5
    case 'struggling':
    default:          return 0
  }
}

// ── Serialization ──────────────────────────────────────────────────────────────

export function serializeEconomies(): string {
  return JSON.stringify(_economies)
}

export function deserializeEconomies(data: string): void {
  try {
    const parsed = JSON.parse(data) as SettlementEconomy[]
    if (Array.isArray(parsed) && parsed.length > 0) {
      _economies = parsed
      _initialized = true
    }
  } catch {
    // Corrupted data — keep existing state
  }
}
