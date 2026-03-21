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

export const MetabolismSystem = defineSystem((w) => {
  const entities = metabolismQuery(w)
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]
    const rate = Metabolism.metabolicRate[eid]  // J/s

    // Convert J/s → fractional ATP depletion per tick.
    // Assume creature stores ~1 mol ATP equivalent → 30,500 J at full energy.
    const dtEnergy = (rate * _dt) / BIOLOGY.ATP_energy
    Metabolism.energy[eid] = Math.max(0, Metabolism.energy[eid] - dtEnergy * 0.001)

    // Hunger: complete starvation in ~45 minutes real time at 1× speed
    // 1 / (0.00037 * 60) = ~45 minutes
    Metabolism.hunger[eid] = Math.min(1, Metabolism.hunger[eid] + _dt * 0.00037)

    // Thirst: dehydration in ~30 minutes real time at 1× speed
    // 1 / (0.00056 * 60) = ~29.8 minutes
    Metabolism.thirst[eid] = Math.min(1, Metabolism.thirst[eid] + _dt * 0.00056)

    // Fatigue: max tiredness in ~27.8 hours without rest
    Metabolism.fatigue[eid] = Math.min(1, Metabolism.fatigue[eid] + _dt * 0.00001)

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

    // Mark dead
    if (Health.current[eid] <= 0) {
      Health.current[eid] = 0
      addComponent(w, IsDead, eid)
    }
  }
  return w
})
