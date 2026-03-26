// ── SiegeSystem.ts ─────────────────────────────────────────────────────────────
// M46 Track B: Settlement Siege Events
// Hostile factions can launch siege events against settlements.
// The player can help defend by calling contributeToCiege().

import { useFactionStore } from '../store/factionStore'
import { usePlayerStore } from '../store/playerStore'

export interface SiegeEvent {
  id: string
  settlementId: number
  attackingFactionId: string
  startTime: number
  durationMs: number
  intensity: 1 | 2 | 3
  settlementDamage: number
  playerContributed: boolean
  /** ms remaining — decremented by tickSiege */
  remainingMs: number
}

export let activeSiege: SiegeEvent | null = null

let _siegeIdCounter = 1

/**
 * Start a siege against a settlement.
 * @param settlementId  Numeric settlement ID from settlementStore
 * @param attackingFactionId  FactionId string of the attacking faction
 * @param intensity  1 = minor, 2 = moderate, 3 = overwhelming
 */
export function startSiege(
  settlementId: number,
  attackingFactionId: string,
  intensity: 1 | 2 | 3
): void {
  if (activeSiege !== null) return  // Only one siege at a time

  const durationMs = intensity * 120_000  // 2/4/6 minutes

  activeSiege = {
    id: `siege_${_siegeIdCounter++}`,
    settlementId,
    attackingFactionId,
    startTime: Date.now(),
    durationMs,
    intensity,
    settlementDamage: 0,
    playerContributed: false,
    remainingMs: durationMs,
  }

  window.dispatchEvent(new CustomEvent('siege-started', {
    detail: { settlementId, attackingFactionId, intensity },
  }))
}

/**
 * Player contributes to the ongoing siege defense.
 * Marks contribution, awards +20 rep with defending faction, dispatches event.
 */
export function contributeToCiege(): void {
  if (!activeSiege) return
  if (activeSiege.playerContributed) return  // Already contributed

  activeSiege.playerContributed = true

  // Award reputation with the settlement's owning faction
  const factionStore = useFactionStore.getState()
  const defendingFactionId = factionStore.getSettlementFaction(activeSiege.settlementId)
  if (defendingFactionId) {
    factionStore.addFactionXp(20)
  }
  // Also award some gold as incentive
  usePlayerStore.getState().addGold(25)

  window.dispatchEvent(new CustomEvent('siege-contribution', {
    detail: { siegeId: activeSiege.id, settlementId: activeSiege.settlementId },
  }))
}

/**
 * Called every frame from GameLoop with elapsed ms.
 * Accumulates damage and resolves the siege when time runs out.
 */
export function tickSiege(dtMs: number): void {
  if (!activeSiege) return

  const siege = activeSiege

  // Accumulate damage: 0.5 * intensity per second
  const dmgPerSec = 0.5 * siege.intensity
  siege.settlementDamage += dmgPerSec * (dtMs / 1000)

  // Decrement remaining time
  siege.remainingMs -= dtMs

  if (siege.remainingMs <= 0) {
    // Siege resolved
    if (siege.playerContributed) {
      // Player helped — siege repelled, no damage
      window.dispatchEvent(new CustomEvent('siege-resolved', {
        detail: {
          siegeId: siege.id,
          settlementId: siege.settlementId,
          repelled: true,
          damage: 0,
        },
      }))

      // Bonus reward for repelling
      usePlayerStore.getState().addGold(50)
      useFactionStore.getState().addFactionXp(150)
    } else {
      // Siege succeeded — deal full damage
      const fStore = useFactionStore.getState()
      if (typeof fStore.damageSettlement === 'function') {
        fStore.damageSettlement(siege.settlementId, siege.settlementDamage)
      }

      window.dispatchEvent(new CustomEvent('siege-resolved', {
        detail: {
          siegeId: siege.id,
          settlementId: siege.settlementId,
          repelled: false,
          damage: siege.settlementDamage,
        },
      }))
    }

    activeSiege = null
  }
}

/**
 * Returns siege progress 0–1 (0 = just started, 1 = about to resolve),
 * or null if no siege is active.
 */
export function getSiegeProgress(): number | null {
  if (!activeSiege) return null
  const elapsed = activeSiege.durationMs - activeSiege.remainingMs
  return Math.min(1, Math.max(0, elapsed / activeSiege.durationMs))
}
