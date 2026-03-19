import { defineQuery, defineSystem } from 'bitecs'
import { Position, Velocity } from '../world'

const movingQuery = defineQuery([Position, Velocity])

/**
 * Integrates velocity into position each frame.
 * dt is passed via a closure updated by the engine each tick.
 */
let _dt = 1 / 60

export function setMovementDt(dt: number): void {
  _dt = dt
}

export const MovementSystem = defineSystem((w) => {
  const entities = movingQuery(w)
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i]
    Position.x[eid] += Velocity.x[eid] * _dt
    Position.y[eid] += Velocity.y[eid] * _dt
    Position.z[eid] += Velocity.z[eid] * _dt
  }
  return w
})
