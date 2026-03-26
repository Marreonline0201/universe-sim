// ── FlockingSystem.ts ──────────────────────────────────────────────────────────
// M25 Track B: Boid flocking rules engine — pure logic, no Three.js imports.
//
// Implements the three classic Reynolds boid rules:
//   1. Separation  — steer away from close neighbours (weight 1.5)
//   2. Alignment   — match average heading of neighbours (weight 1.0)
//   3. Cohesion    — steer toward centre of mass of neighbours (weight 0.8)
//
// Usage:
//   const delta = applyBoidRules(agent, neighbours)
//   agent.vx += delta.dvx * dt
//   agent.vz += delta.dvz * dt

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal interface required by boid calculations — position + velocity. */
export interface BoidAgent {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface VelocityDelta {
  dvx: number
  dvy: number
  dvz: number
}

// ── Weights ───────────────────────────────────────────────────────────────────

const WEIGHT_SEPARATION = 1.5
const WEIGHT_ALIGNMENT  = 1.0
const WEIGHT_COHESION   = 0.8

// ── Rule implementations ──────────────────────────────────────────────────────

/**
 * Separation: steer away from neighbours closer than `radius`.
 * Returns a velocity delta pointing away from crowded neighbours.
 */
export function separation(
  agent: BoidAgent,
  neighbours: BoidAgent[],
  radius = 3,
): VelocityDelta {
  let dvx = 0, dvy = 0, dvz = 0
  let count = 0

  for (const n of neighbours) {
    const dx = agent.x - n.x
    const dy = agent.y - n.y
    const dz = agent.z - n.z
    const distSq = dx * dx + dy * dy + dz * dz

    if (distSq < radius * radius && distSq > 0.0001) {
      // Weight by inverse distance — closer neighbours push harder
      const dist = Math.sqrt(distSq)
      const invDist = 1 / dist
      dvx += (dx * invDist) / dist
      dvy += (dy * invDist) / dist
      dvz += (dz * invDist) / dist
      count++
    }
  }

  if (count === 0) return { dvx: 0, dvy: 0, dvz: 0 }

  return {
    dvx: (dvx / count) * WEIGHT_SEPARATION,
    dvy: (dvy / count) * WEIGHT_SEPARATION,
    dvz: (dvz / count) * WEIGHT_SEPARATION,
  }
}

/**
 * Alignment: match the average heading (velocity direction) of neighbours
 * within `radius`. Returns a velocity delta toward the average heading.
 */
export function alignment(
  agent: BoidAgent,
  neighbours: BoidAgent[],
  radius = 8,
): VelocityDelta {
  let avgVx = 0, avgVy = 0, avgVz = 0
  let count = 0

  for (const n of neighbours) {
    const dx = n.x - agent.x
    const dy = n.y - agent.y
    const dz = n.z - agent.z
    const distSq = dx * dx + dy * dy + dz * dz

    if (distSq < radius * radius) {
      avgVx += n.vx
      avgVy += n.vy
      avgVz += n.vz
      count++
    }
  }

  if (count === 0) return { dvx: 0, dvy: 0, dvz: 0 }

  // Steer toward average velocity (difference from current velocity)
  return {
    dvx: ((avgVx / count) - agent.vx) * WEIGHT_ALIGNMENT,
    dvy: ((avgVy / count) - agent.vy) * WEIGHT_ALIGNMENT,
    dvz: ((avgVz / count) - agent.vz) * WEIGHT_ALIGNMENT,
  }
}

/**
 * Cohesion: steer toward the centre of mass of neighbours within `radius`.
 * Returns a velocity delta pointing toward that centre.
 */
export function cohesion(
  agent: BoidAgent,
  neighbours: BoidAgent[],
  radius = 10,
): VelocityDelta {
  let cx = 0, cy = 0, cz = 0
  let count = 0

  for (const n of neighbours) {
    const dx = n.x - agent.x
    const dy = n.y - agent.y
    const dz = n.z - agent.z
    const distSq = dx * dx + dy * dy + dz * dz

    if (distSq < radius * radius) {
      cx += n.x
      cy += n.y
      cz += n.z
      count++
    }
  }

  if (count === 0) return { dvx: 0, dvy: 0, dvz: 0 }

  // Direction toward centroid
  const targetX = cx / count - agent.x
  const targetY = cy / count - agent.y
  const targetZ = cz / count - agent.z
  const dist = Math.sqrt(targetX * targetX + targetY * targetY + targetZ * targetZ)

  if (dist < 0.001) return { dvx: 0, dvy: 0, dvz: 0 }

  return {
    dvx: (targetX / dist) * WEIGHT_COHESION,
    dvy: (targetY / dist) * WEIGHT_COHESION,
    dvz: (targetZ / dist) * WEIGHT_COHESION,
  }
}

/**
 * Combine all three boid rules into a single velocity delta.
 * Call each frame and add result × dt to the agent's velocity.
 *
 * @param agent      - the boid being updated
 * @param neighbours - all other boids in the group (may include agent; it is skipped)
 * @returns combined velocity delta from separation + alignment + cohesion
 */
export function applyBoidRules(
  agent: BoidAgent,
  neighbours: BoidAgent[],
): VelocityDelta {
  // Filter self out once here so individual rules don't need to
  const others = neighbours.filter(n => n !== agent)

  if (others.length === 0) return { dvx: 0, dvy: 0, dvz: 0 }

  const sep = separation(agent, others, 3)
  const ali = alignment(agent, others, 8)
  const coh = cohesion(agent, others, 10)

  return {
    dvx: sep.dvx + ali.dvx + coh.dvx,
    dvy: sep.dvy + ali.dvy + coh.dvy,
    dvz: sep.dvz + ali.dvz + coh.dvz,
  }
}
