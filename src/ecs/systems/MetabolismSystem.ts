import { defineQuery, defineSystem, addComponent } from 'bitecs'
import { Metabolism, Health, IsDead } from '../world'
import { BIOLOGY } from '../../engine/constants'

const metabolismQuery = defineQuery([Metabolism, Health])

/**
 * Metabolic tick:
 * - Consume energy at metabolic rate
 * - Increase hunger/thirst over time
 * - Damage health when starving or severely dehydrated
 * Uses real biology constants: base metabolic rate scales with mass^0.75 (Kleiber's law).
 * ATP_energy = 30,500 J/mol; we normalise to a 0-1 energy fraction per tick.
 */
let _dt = 1 / 60

export function setMetabolismDt(dt: number): void {
  _dt = dt
}

const HUNGER_RATE  = 0.00037
const THIRST_RATE  = 0.00056
const FATIGUE_RATE = 0.00001

export const MetabolismSystem = defineSystem((w) => {
  const entities = metabolismQuery(w)
  // Collect entities to mark dead after the loop — mutating components
  // (addComponent) inside a bitecs query loop can invalidate the iterator.
  const dying: number[] = []

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]
    const rate = Metabolism.metabolicRate[eid]  // J/s

    // Convert J/s → fractional ATP depletion per tick.
    // Assume creature stores ~1 mol ATP equivalent → 30,500 J at full energy.
    const dtEnergy = (rate * _dt) / BIOLOGY.ATP_energy
    Metabolism.energy[eid] = Math.max(0, Metabolism.energy[eid] - dtEnergy * 0.001)

    // Hunger: complete starvation in ~45 minutes real time at 1× speed
    Metabolism.hunger[eid] = Math.min(1, Metabolism.hunger[eid] + _dt * HUNGER_RATE)

    // Thirst: dehydration in ~30 minutes real time at 1× speed
    Metabolism.thirst[eid] = Math.min(1, Metabolism.thirst[eid] + _dt * THIRST_RATE)

    // Fatigue: max tiredness in ~27.8 hours without rest
    Metabolism.fatigue[eid] = Math.min(1, Metabolism.fatigue[eid] + _dt * FATIGUE_RATE)

    // Starvation damage: >95% hungry → 2 HP/s
    if (Metabolism.hunger[eid] > 0.95) {
      Health.current[eid] -= _dt * 2
    }

    // Severe dehydration damage: >98% thirsty → 5 HP/s (dehydration kills faster)
    if (Metabolism.thirst[eid] > 0.98) {
      Health.current[eid] -= _dt * 5
    }

    // Natural health regeneration when energy available and not starving
    if (Metabolism.energy[eid] > 0.3 && Metabolism.hunger[eid] < 0.7) {
      const regen = Health.regenRate[eid]
      Health.current[eid] = Math.min(Health.max[eid], Health.current[eid] + regen * _dt)
    }

    if (Health.current[eid] <= 0) {
      Health.current[eid] = 0
      dying.push(eid)
    }
  }

  // Apply structural changes (addComponent) after the iteration is complete
  for (let i = 0; i < dying.length; i++) {
    addComponent(w, IsDead, dying[i])
  }

  return w
})
