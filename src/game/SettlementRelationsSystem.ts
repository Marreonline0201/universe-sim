// src/game/SettlementRelationsSystem.ts
// M67 Track C: Settlement Relations System
// Tracks diplomatic relations between settlements, alliance/rivalry states,
// trade agreements, and lets the player act as a diplomat.

import { usePlayerStore } from '../store/playerStore'

// ── Types ──────────────────────────────────────────────────────────────────────

export type RelationState = 'war' | 'hostile' | 'neutral' | 'friendly' | 'allied'

export type DiplomacyAction =
  | 'broker_peace'     // costs 500g, adds +30 to a hostile pair
  | 'trade_agreement'  // costs 200g, adds +15 and generates 5g/min for player
  | 'incite_rivalry'   // costs 300g, subtracts -25 from a friendly pair
  | 'gift_delegation'  // costs 100g, adds +10 to any pair involving a settlement

export interface Settlement {
  id: string
  name: string
  icon: string
}

export interface SettlementRelation {
  a: string    // settlement id
  b: string    // settlement id
  relation: number  // -100 to +100
}

export interface TradeAgreement {
  id: string
  settlementA: string
  settlementB: string
  startTime: number  // simSeconds
  goldPerMin: number
}

export interface RelationsSaveData {
  relations: SettlementRelation[]
  tradeAgreements: TradeAgreement[]
}

// ── Settlement definitions ─────────────────────────────────────────────────────

export const SETTLEMENTS: Settlement[] = [
  { id: 'ironhold',   name: 'Ironhold',   icon: '⚒️' },
  { id: 'silverdale', name: 'Silverdale', icon: '🏘️' },
  { id: 'stormwatch', name: 'Stormwatch', icon: '⚡' },
  { id: 'greenfield', name: 'Greenfield', icon: '🌿' },
  { id: 'ashford',    name: 'Ashford',    icon: '🔥' },
]

// ── Module state ───────────────────────────────────────────────────────────────

let _initialized = false
// Relation map key: sorted pair "a:b" where a < b lexicographically
const _relations = new Map<string, SettlementRelation>()
let _tradeAgreements: TradeAgreement[] = []
let _agreementIdCounter = 1
let _lastDriftTick = 0

// ── Helpers ────────────────────────────────────────────────────────────────────

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function modifyRelation(a: string, b: string, delta: number): void {
  const key = pairKey(a, b)
  const rel = _relations.get(key)
  if (!rel) return
  rel.relation = clamp(rel.relation + delta, -100, 100)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initSettlementRelations(): void {
  if (_initialized) return
  _initialized = true

  // Initialize all pairs with random values in (-40, 40)
  const ids = SETTLEMENTS.map(s => s.id)
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]
      const b = ids[j]
      const key = pairKey(a, b)
      const relation = randomFloat(-40, 40)
      _relations.set(key, { a: a < b ? a : b, b: a < b ? b : a, relation })
    }
  }

  // Ironhold and Silverdale start as friendly (+45)
  const ih_sd = pairKey('ironhold', 'silverdale')
  const rel_ih_sd = _relations.get(ih_sd)
  if (rel_ih_sd) rel_ih_sd.relation = 45

  // Stormwatch and Ashford start as hostile (-35)
  const sw_af = pairKey('stormwatch', 'ashford')
  const rel_sw_af = _relations.get(sw_af)
  if (rel_sw_af) rel_sw_af.relation = -35

  // ── Event wiring ──────────────────────────────────────────────────────────

  // boss-defeated → +10 to all relations (shared victory)
  window.addEventListener('boss-defeated', () => {
    for (const rel of _relations.values()) {
      rel.relation = clamp(rel.relation + 10, -100, 100)
    }
  })

  // weather-event-started → -5 to 2 random settlement pair
  window.addEventListener('weather-event-started', () => {
    const ids2 = SETTLEMENTS.map(s => s.id)
    const a = ids2[Math.floor(Math.random() * ids2.length)]
    let b = a
    while (b === a) b = ids2[Math.floor(Math.random() * ids2.length)]
    modifyRelation(a, b, -5)
  })

  // scheduled-event-triggered → if invasion type, -15 to all Stormwatch relations
  window.addEventListener('scheduled-event-triggered', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    if (detail.type === 'invasion' || String(detail.eventType ?? '').toLowerCase().includes('invasion')) {
      for (const rel of _relations.values()) {
        if (rel.a === 'stormwatch' || rel.b === 'stormwatch') {
          rel.relation = clamp(rel.relation - 15, -100, 100)
        }
      }
    }
  })

  // faction-standing-changed → +5 if player befriended their faction
  window.addEventListener('faction-standing-changed', (e: Event) => {
    const detail = (e as CustomEvent).detail ?? {}
    if (detail.tier === 'friendly' || detail.tier === 'honored' || detail.tier === 'exalted') {
      // Give a small boost to two random settlement pairs to simulate goodwill
      const ids3 = SETTLEMENTS.map(s => s.id)
      const a = ids3[Math.floor(Math.random() * ids3.length)]
      let b = a
      while (b === a) b = ids3[Math.floor(Math.random() * ids3.length)]
      modifyRelation(a, b, 5)
    }
  })
}

export function getSettlements(): Settlement[] {
  return [...SETTLEMENTS]
}

export function getRelation(a: string, b: string): number {
  if (a === b) return 0
  const key = pairKey(a, b)
  return _relations.get(key)?.relation ?? 0
}

export function getRelationState(a: string, b: string): RelationState {
  const rel = getRelation(a, b)
  if (rel < -50) return 'war'
  if (rel < -20) return 'hostile'
  if (rel <= 20)  return 'neutral'
  if (rel <= 60)  return 'friendly'
  return 'allied'
}

export function getAllRelations(): SettlementRelation[] {
  return Array.from(_relations.values())
}

export function getTradeAgreements(): TradeAgreement[] {
  return [..._tradeAgreements]
}

export function performDiplomacy(
  action: DiplomacyAction,
  settlementA: string,
  settlementB: string,
): boolean {
  const ps = usePlayerStore.getState()

  switch (action) {
    case 'broker_peace': {
      if (!ps.spendGold(500)) return false
      modifyRelation(settlementA, settlementB, 30)
      window.dispatchEvent(new CustomEvent('settlement-relations-changed', {
        detail: { action, settlementA, settlementB, delta: 30 },
      }))
      return true
    }

    case 'trade_agreement': {
      if (!ps.spendGold(200)) return false
      modifyRelation(settlementA, settlementB, 15)
      const agreement: TradeAgreement = {
        id: `agreement-${_agreementIdCounter++}`,
        settlementA,
        settlementB,
        startTime: 0,  // will be set to current simSeconds on next tick
        goldPerMin: 5,
      }
      _tradeAgreements.push(agreement)
      window.dispatchEvent(new CustomEvent('settlement-relations-changed', {
        detail: { action, settlementA, settlementB, delta: 15 },
      }))
      return true
    }

    case 'incite_rivalry': {
      if (!ps.spendGold(300)) return false
      modifyRelation(settlementA, settlementB, -25)
      window.dispatchEvent(new CustomEvent('settlement-relations-changed', {
        detail: { action, settlementA, settlementB, delta: -25 },
      }))
      return true
    }

    case 'gift_delegation': {
      if (!ps.spendGold(100)) return false
      modifyRelation(settlementA, settlementB, 10)
      window.dispatchEvent(new CustomEvent('settlement-relations-changed', {
        detail: { action, settlementA, settlementB, delta: 10 },
      }))
      return true
    }

    default:
      return false
  }
}

export function tickRelations(simSeconds: number, delta: number): void {
  // Drift toward neutral every 60 sim-seconds (+0.5 per 60 simSeconds)
  const DRIFT_INTERVAL = 60
  if (simSeconds - _lastDriftTick >= DRIFT_INTERVAL) {
    _lastDriftTick = simSeconds
    for (const rel of _relations.values()) {
      if (rel.relation > 0) {
        rel.relation = Math.max(0, rel.relation - 0.5)
      } else if (rel.relation < 0) {
        rel.relation = Math.min(0, rel.relation + 0.5)
      }
    }
  }

  // Drip gold from active trade agreements (gold/min → per frame using delta in seconds)
  const ps = usePlayerStore.getState()
  for (const agreement of _tradeAgreements) {
    // Update startTime on first tick if not set
    if (agreement.startTime === 0) {
      agreement.startTime = simSeconds
    }
    // Gold drip: goldPerMin / 60 * delta (delta is seconds)
    const goldGain = (agreement.goldPerMin / 60) * delta
    ps.addGold(goldGain)
  }
}

// ── Serialization ──────────────────────────────────────────────────────────────

export function serializeRelations(): RelationsSaveData {
  return {
    relations: Array.from(_relations.values()).map(r => ({ ...r })),
    tradeAgreements: _tradeAgreements.map(a => ({ ...a })),
  }
}

export function deserializeRelations(data: RelationsSaveData): void {
  try {
    if (!data || !Array.isArray(data.relations)) return
    _relations.clear()
    for (const rel of data.relations) {
      if (rel.a && rel.b && typeof rel.relation === 'number') {
        const key = pairKey(rel.a, rel.b)
        _relations.set(key, { ...rel })
      }
    }
    if (Array.isArray(data.tradeAgreements)) {
      _tradeAgreements = data.tradeAgreements.map(a => ({ ...a }))
      if (_tradeAgreements.length > 0) {
        _agreementIdCounter = Math.max(..._tradeAgreements.map(a => {
          const n = parseInt(a.id.replace('agreement-', ''), 10)
          return isNaN(n) ? 0 : n
        })) + 1
      }
    }
    _initialized = true
  } catch {
    // Corrupted data — keep existing state
  }
}
