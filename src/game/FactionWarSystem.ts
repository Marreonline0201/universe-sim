// ── FactionWarSystem.ts ────────────────────────────────────────────────────────
// M52 Track A: Dynamic faction war events that periodically break out between
// factions, affecting settlements, reputation, and creating combat opportunities.

import { useReputationStore } from '../store/reputationStore'
import { useSettlementStore } from '../store/settlementStore'
import { useFactionStore } from '../store/factionStore'

export type WarPhase = 'skirmish' | 'conflict' | 'full_war' | 'ceasefire'

export interface FactionWar {
  id: string                    // `war_${Date.now()}`
  attackingFactionId: string
  defendingFactionId: string
  phase: WarPhase
  startedAt: number             // sim seconds
  intensity: number             // 0-100
  attackerWins: number
  defenderWins: number
  resolved: boolean
  resolvedAt?: number
  victor?: string               // factionId or 'ceasefire'
}

const MAX_WAR_HISTORY = 10
let activeWars: FactionWar[] = []
let warHistory: FactionWar[] = []

export function getActiveWars(): FactionWar[] {
  return activeWars
}

export function getWarHistory(): FactionWar[] {
  return warHistory
}

function phaseFromIntensity(intensity: number): WarPhase {
  if (intensity < 20) return 'ceasefire'
  if (intensity < 50) return 'skirmish'
  if (intensity < 75) return 'conflict'
  return 'full_war'
}

// Call from GameLoop every ~120 sim-seconds
export function tickFactionWars(simSeconds: number, factionIds: string[]): void {
  // Attempt to start a new war (2% chance, max 3 active)
  if (activeWars.length < 3 && Math.random() < 0.02) {
    if (factionIds.length >= 2) {
      const shuffled = [...factionIds].sort(() => Math.random() - 0.5)
      const attackingFactionId = shuffled[0]
      const defendingFactionId = shuffled[1]

      const newWar: FactionWar = {
        id: `war_${Date.now()}`,
        attackingFactionId,
        defendingFactionId,
        phase: 'skirmish',
        startedAt: simSeconds,
        intensity: 30 + Math.random() * 30, // start between 30-60
        attackerWins: 0,
        defenderWins: 0,
        resolved: false,
      }

      activeWars = [...activeWars, newWar]

      window.dispatchEvent(new CustomEvent('faction-war-started', {
        detail: { war: newWar },
      }))
    }
  }

  // Tick each active war
  const updatedWars: FactionWar[] = []
  const newlyResolved: FactionWar[] = []

  for (const war of activeWars) {
    // Intensity drifts ±5 randomly
    const drift = (Math.random() - 0.5) * 10
    const newIntensity = Math.max(0, Math.min(100, war.intensity + drift))
    const newPhase = phaseFromIntensity(newIntensity)

    // Randomly award wins each tick
    const attackerWins = war.attackerWins + (Math.random() < 0.4 ? 1 : 0)
    const defenderWins = war.defenderWins + (Math.random() < 0.4 ? 1 : 0)

    // Resolve chance: 5% normally, 15% if intensity < 30
    const resolveChance = newIntensity < 30 ? 0.15 : 0.05
    if (Math.random() < resolveChance) {
      // 50/50 victor
      const victor = Math.random() < 0.5 ? war.attackingFactionId : 'ceasefire'
      const resolved: FactionWar = {
        ...war,
        intensity: newIntensity,
        phase: newPhase,
        attackerWins,
        defenderWins,
        resolved: true,
        resolvedAt: simSeconds,
        victor,
      }
      newlyResolved.push(resolved)

      window.dispatchEvent(new CustomEvent('faction-war-resolved', {
        detail: { war: resolved },
      }))
    } else {
      const updated: FactionWar = {
        ...war,
        intensity: newIntensity,
        phase: newPhase,
        attackerWins,
        defenderWins,
      }
      updatedWars.push(updated)

      window.dispatchEvent(new CustomEvent('faction-war-updated', {
        detail: { war: updated },
      }))
    }
  }

  activeWars = updatedWars

  // Push resolved wars to history (capped at MAX_WAR_HISTORY)
  if (newlyResolved.length > 0) {
    warHistory = [...newlyResolved, ...warHistory].slice(0, MAX_WAR_HISTORY)
  }
}

export function playerJoinWar(warId: string, side: 'attacker' | 'defender'): void {
  const war = activeWars.find(w => w.id === warId)
  if (!war) return

  const repStore = useReputationStore.getState()
  const settlementStore = useSettlementStore.getState()
  const factionStore = useFactionStore.getState()

  const alliedFactionId   = side === 'attacker' ? war.attackingFactionId : war.defendingFactionId
  const enemyFactionId    = side === 'attacker' ? war.defendingFactionId : war.attackingFactionId

  // Add +15 rep to allied settlements, -10 to enemy settlements
  for (const [, settlement] of settlementStore.settlements) {
    const settlementFaction = factionStore.getSettlementFaction(settlement.id)
    if (!settlementFaction) continue

    if (settlementFaction === alliedFactionId) {
      repStore.addPoints(settlement.id, settlement.name, 15)
    } else if (settlementFaction === enemyFactionId) {
      repStore.addPoints(settlement.id, settlement.name, -10)
      // Fire npc-attacked event for enemy settlement
      window.dispatchEvent(new CustomEvent('npc-attacked', {
        detail: { settlementId: settlement.id, settlementName: settlement.name },
      }))
    }
  }
}
