/**
 * BehaviorTree.ts
 *
 * Hierarchical behaviour tree implementation for Level 1-2 creatures.
 * Implements Selector, Sequence, Inverter, Cooldown, Condition, and Action nodes.
 *
 * Factory functions produce real, reusable trees:
 *   createForagerBT()  — herbivores / omnivores
 *   createPredatorBT() — carnivores
 *   createPreyBT()     — prey animals
 *   createSocialBT()   — social animals (pack, herd, hive)
 */

import type { SensoryInput, MotorOutput } from './NeuralArchitecture'
import type { EmotionState }              from './EmotionModel'
import type { EpisodicEvent }             from './MemorySystem'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BTStatus = 'SUCCESS' | 'FAILURE' | 'RUNNING'

export interface BTContext {
  entity:   number          // ECS entity ID
  sensory:  SensoryInput
  emotions: EmotionState
  memory:   EpisodicEvent[]
  dt:       number
  /** Motor output accumulator — leaf actions write into this object. */
  motor:    MotorOutput
}

// ─── Base node ─────────────────────────────────────────────────────────────────

export abstract class BTNode {
  abstract tick(ctx: BTContext): BTStatus
}

// ─── Composite nodes ───────────────────────────────────────────────────────────

/**
 * Selector ("fallback"): tries children left to right.
 * Returns SUCCESS on the first child that succeeds.
 * Returns FAILURE only if all children fail.
 * Returns RUNNING if a child returns RUNNING.
 */
export class Selector extends BTNode {
  constructor(private children: BTNode[]) { super() }

  tick(ctx: BTContext): BTStatus {
    for (const child of this.children) {
      const status = child.tick(ctx)
      if (status !== 'FAILURE') return status
    }
    return 'FAILURE'
  }
}

/**
 * Sequence: runs all children in order.
 * Returns FAILURE on the first child that fails.
 * Returns SUCCESS only if all children succeed.
 * Returns RUNNING if a child returns RUNNING.
 */
export class Sequence extends BTNode {
  constructor(private children: BTNode[]) { super() }

  tick(ctx: BTContext): BTStatus {
    for (const child of this.children) {
      const status = child.tick(ctx)
      if (status !== 'SUCCESS') return status
    }
    return 'SUCCESS'
  }
}

// ─── Decorator nodes ───────────────────────────────────────────────────────────

/**
 * Inverter: flips SUCCESS ↔ FAILURE; RUNNING passes through.
 */
export class Inverter extends BTNode {
  constructor(private child: BTNode) { super() }

  tick(ctx: BTContext): BTStatus {
    const r = this.child.tick(ctx)
    if (r === 'SUCCESS') return 'FAILURE'
    if (r === 'FAILURE') return 'SUCCESS'
    return 'RUNNING'
  }
}

/**
 * Cooldown: the child may only execute once every `cooldownMs` milliseconds.
 * While cooling down, returns FAILURE so the tree can try alternatives.
 */
export class Cooldown extends BTNode {
  private lastSuccessTime = -Infinity

  constructor(private child: BTNode, private cooldownMs: number) { super() }

  tick(ctx: BTContext): BTStatus {
    const now = Date.now()
    if (now - this.lastSuccessTime < this.cooldownMs) return 'FAILURE'

    const status = this.child.tick(ctx)
    if (status === 'SUCCESS') this.lastSuccessTime = now
    return status
  }
}

/**
 * Repeater: runs child N times (or indefinitely if n = -1).
 * Returns RUNNING until done, then SUCCESS.
 */
export class Repeater extends BTNode {
  private count = 0

  constructor(private child: BTNode, private n: number) { super() }

  tick(ctx: BTContext): BTStatus {
    if (this.n !== -1 && this.count >= this.n) {
      this.count = 0
      return 'SUCCESS'
    }
    const status = this.child.tick(ctx)
    if (status === 'SUCCESS') this.count++
    return 'RUNNING'
  }
}

// ─── Leaf nodes ────────────────────────────────────────────────────────────────

/**
 * Condition: tests a predicate; returns SUCCESS or FAILURE.
 */
export class Condition extends BTNode {
  constructor(private test: (ctx: BTContext) => boolean) { super() }
  tick(ctx: BTContext): BTStatus { return this.test(ctx) ? 'SUCCESS' : 'FAILURE' }
}

/**
 * Action: executes a function that may return any BTStatus.
 * The function is expected to write into ctx.motor as needed.
 */
export class Action extends BTNode {
  constructor(private fn: (ctx: BTContext) => BTStatus) { super() }
  tick(ctx: BTContext): BTStatus { return this.fn(ctx) }
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  if (len === 0) return [0, 0, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function randomDir(): [number, number, number] {
  const a = Math.random() * Math.PI * 2
  return [Math.cos(a), 0, Math.sin(a)]
}

// ─── Factory: Forager BT ───────────────────────────────────────────────────────

/**
 * Forager behaviour tree (herbivores & omnivores).
 *
 * Root Selector
 *  ├─ Flee subtree          (highest priority — life before food)
 *  ├─ Rest subtree          (sleep when exhausted)
 *  ├─ Drink subtree         (thirst before hunger)
 *  ├─ Eat subtree
 *  │   ├─ Eat food in range
 *  │   └─ Move toward food / gradient
 *  ├─ Mate subtree
 *  └─ Explore subtree       (default fallback)
 */
export function createForagerBT(): BTNode {
  // ── Flee ──────────────────────────────────────────────────────────────────
  const fleeSubtree = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestPredator !== null &&
      ctx.sensory.nearestPredator.distance < 20,
    ),
    new Action(ctx => {
      const pred = ctx.sensory.nearestPredator!
      ctx.motor.flee          = true
      ctx.motor.moveSpeed     = 1.0
      ctx.motor.moveDirection = normalize3([
        -pred.direction[0],
        -pred.direction[1],
        -pred.direction[2],
      ])
      ctx.motor.communicate = 'alarm'
      return 'SUCCESS'
    }),
  ])

  // ── Rest ──────────────────────────────────────────────────────────────────
  const restSubtree = new Sequence([
    new Condition(ctx => ctx.sensory.fatigue > 0.75),
    new Action(ctx => {
      ctx.motor.sleep     = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  // ── Drink ─────────────────────────────────────────────────────────────────
  const drinkSubtree = new Sequence([
    new Condition(ctx => ctx.sensory.thirst > 0.6),
    new Action(ctx => {
      // Heuristic: water is downhill — move in negative Y.
      ctx.motor.moveDirection = [0, -1, 0]
      ctx.motor.moveSpeed     = 0.5
      return 'SUCCESS'
    }),
  ])

  // ── Eat ───────────────────────────────────────────────────────────────────
  const eatInRange = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestFood !== null &&
      ctx.sensory.nearestFood.distance < 0.8,
    ),
    new Action(ctx => {
      ctx.motor.eat       = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  const moveToFood = new Sequence([
    new Condition(ctx => ctx.sensory.hunger > 0.3),
    new Action(ctx => {
      if (ctx.sensory.nearestFood) {
        ctx.motor.moveDirection = normalize3(ctx.sensory.nearestFood.direction)
        ctx.motor.moveSpeed     = 0.6 + ctx.sensory.hunger * 0.4
      } else {
        ctx.motor.moveDirection = normalize3(ctx.sensory.foodGradient)
        ctx.motor.moveSpeed     = 0.5
      }
      return 'SUCCESS'
    }),
  ])

  const eatSubtree = new Selector([eatInRange, moveToFood])

  // ── Mate ──────────────────────────────────────────────────────────────────
  const mateSubtree = new Cooldown(
    new Sequence([
      new Condition(ctx =>
        ctx.sensory.mateChemical > 0.4 &&
        ctx.sensory.hunger < 0.7 &&
        ctx.sensory.nearestConspecific !== null,
      ),
      new Action(ctx => {
        const c = ctx.sensory.nearestConspecific!
        ctx.motor.moveDirection = normalize3(c.direction)
        ctx.motor.moveSpeed     = 0.4
        ctx.motor.communicate  = 'mate_call'
        return 'SUCCESS'
      }),
    ]),
    5000, // 5 s cooldown
  )

  // ── Explore ───────────────────────────────────────────────────────────────
  const exploreSubtree = new Action(ctx => {
    ctx.motor.moveDirection = randomDir()
    ctx.motor.moveSpeed     = 0.35
    return 'SUCCESS'
  })

  return new Selector([
    fleeSubtree,
    restSubtree,
    drinkSubtree,
    eatSubtree,
    mateSubtree,
    exploreSubtree,
  ])
}

// ─── Factory: Predator BT ─────────────────────────────────────────────────────

/**
 * Predator behaviour tree (carnivores).
 *
 * Root Selector
 *  ├─ Flee (from larger threats)
 *  ├─ Rest
 *  ├─ Eat cached kill (food in range)
 *  ├─ Chase → Attack subtree
 *  │   ├─ Stalk (slow approach when far)
 *  │   ├─ Chase (fast when in range)
 *  │   └─ Attack (lunge when very close)
 *  └─ Patrol / explore
 */
export function createPredatorBT(): BTNode {
  // ── Flee from apex predators ──────────────────────────────────────────────
  const fleeSubtree = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestPredator !== null &&
      ctx.sensory.nearestPredator.distance < 15 &&
      ctx.emotions.fear > 0.6,
    ),
    new Action(ctx => {
      const pred = ctx.sensory.nearestPredator!
      ctx.motor.flee          = true
      ctx.motor.moveSpeed     = 1
      ctx.motor.moveDirection = normalize3([
        -pred.direction[0],
        -pred.direction[1],
        -pred.direction[2],
      ])
      return 'SUCCESS'
    }),
  ])

  // ── Rest ─────────────────────────────────────────────────────────────────
  const restSubtree = new Sequence([
    new Condition(ctx => ctx.sensory.fatigue > 0.8),
    new Action(ctx => {
      ctx.motor.sleep     = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  // ── Eat cached kill ───────────────────────────────────────────────────────
  const eatKill = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestFood !== null &&
      ctx.sensory.nearestFood.distance < 0.8 &&
      ctx.sensory.nearestFood.type === 'meat',
    ),
    new Action(ctx => {
      ctx.motor.eat       = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  // ── Hunt: stalk → chase → attack ─────────────────────────────────────────
  const stalk = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestPrey !== null &&
      ctx.sensory.nearestPrey.distance > 8 &&
      ctx.sensory.nearestPrey.distance < 30,
    ),
    new Action(ctx => {
      const prey = ctx.sensory.nearestPrey!
      ctx.motor.moveDirection = normalize3(prey.direction)
      ctx.motor.moveSpeed     = 0.3   // slow stalk
      return 'SUCCESS'
    }),
  ])

  const chase = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestPrey !== null &&
      ctx.sensory.nearestPrey.distance <= 8 &&
      ctx.sensory.nearestPrey.distance > 1.5,
    ),
    new Action(ctx => {
      const prey = ctx.sensory.nearestPrey!
      ctx.motor.moveDirection = normalize3(prey.direction)
      ctx.motor.moveSpeed     = 1.0
      return 'SUCCESS'
    }),
  ])

  const attackPrey = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestPrey !== null &&
      ctx.sensory.nearestPrey.distance <= 1.5 &&
      ctx.sensory.hunger > 0.25,
    ),
    new Action(ctx => {
      ctx.motor.attack    = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  const huntSubtree = new Selector([stalk, chase, attackPrey])

  // ── Patrol ───────────────────────────────────────────────────────────────
  const patrolSubtree = new Action(ctx => {
    ctx.motor.moveDirection = randomDir()
    ctx.motor.moveSpeed     = 0.25
    return 'SUCCESS'
  })

  return new Selector([
    fleeSubtree,
    restSubtree,
    eatKill,
    huntSubtree,
    patrolSubtree,
  ])
}

// ─── Factory: Prey BT ─────────────────────────────────────────────────────────

/**
 * Prey behaviour tree (deer, rabbits, small herbivores).
 *
 * Root Selector
 *  ├─ Detect danger → Flee → Hide
 *  ├─ Rest (if safe enough)
 *  ├─ Resume foraging
 *  └─ Socialise (herd cohesion)
 */
export function createPreyBT(): BTNode {
  // ── Detect danger + alarm pheromones ─────────────────────────────────────
  const detectDanger = new Condition(ctx =>
    (ctx.sensory.nearestPredator !== null && ctx.sensory.nearestPredator.distance < 25) ||
    ctx.sensory.dangerChemical > 0.2 ||
    ctx.emotions.fear > 0.4,
  )

  const fleeAction = new Action(ctx => {
    ctx.motor.flee      = true
    ctx.motor.moveSpeed = 1.0
    if (ctx.sensory.nearestPredator) {
      ctx.motor.moveDirection = normalize3([
        -ctx.sensory.nearestPredator.direction[0],
        -ctx.sensory.nearestPredator.direction[1],
        -ctx.sensory.nearestPredator.direction[2],
      ])
    } else {
      ctx.motor.moveDirection = randomDir()
    }
    ctx.motor.communicate = 'alarm'
    return 'RUNNING' // keep fleeing until safe
  })

  const hideAction = new Sequence([
    new Condition(ctx => ctx.emotions.fear > 0.3),
    new Action(ctx => {
      // Hide: stop moving, go to ground.
      ctx.motor.moveSpeed = 0
      ctx.motor.sleep     = false
      return 'SUCCESS'
    }),
  ])

  const fleeAndHide = new Sequence([
    detectDanger,
    new Selector([fleeAction, hideAction]),
  ])

  // ── Rest ─────────────────────────────────────────────────────────────────
  const restSubtree = new Sequence([
    new Condition(ctx => ctx.sensory.fatigue > 0.7 && ctx.emotions.fear < 0.2),
    new Action(ctx => {
      ctx.motor.sleep     = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  // ── Forage ───────────────────────────────────────────────────────────────
  const eatInRange = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestFood !== null && ctx.sensory.nearestFood.distance < 0.8,
    ),
    new Action(ctx => {
      ctx.motor.eat       = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  const moveToGrass = new Action(ctx => {
    if (ctx.sensory.nearestFood) {
      ctx.motor.moveDirection = normalize3(ctx.sensory.nearestFood.direction)
    } else {
      ctx.motor.moveDirection = normalize3(ctx.sensory.foodGradient)
    }
    ctx.motor.moveSpeed = 0.5
    return 'SUCCESS'
  })

  const forageSubtree = new Sequence([
    new Condition(ctx => ctx.sensory.hunger > 0.2 && ctx.emotions.fear < 0.3),
    new Selector([eatInRange, moveToGrass]),
  ])

  // ── Herd cohesion ─────────────────────────────────────────────────────────
  const socialSubtree = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestConspecific !== null &&
      ctx.sensory.nearestConspecific.distance > 5,
    ),
    new Action(ctx => {
      const c = ctx.sensory.nearestConspecific!
      ctx.motor.moveDirection = normalize3(c.direction)
      ctx.motor.moveSpeed     = 0.3
      return 'SUCCESS'
    }),
  ])

  return new Selector([
    fleeAndHide,
    restSubtree,
    forageSubtree,
    socialSubtree,
  ])
}

// ─── Factory: Social BT ───────────────────────────────────────────────────────

/**
 * Social behaviour tree (pack hunters, primates, social insects).
 * Maintains group cohesion alongside individual needs.
 *
 * Root Selector
 *  ├─ Emergency: respond to group alarm
 *  ├─ Individual needs (sleep, eat, drink)
 *  ├─ Group cohesion (stay near conspecifics)
 *  ├─ Social bonding (groom, play)
 *  ├─ Cooperative hunt
 *  └─ Explore
 */
export function createSocialBT(): BTNode {
  // ── Group alarm response ──────────────────────────────────────────────────
  const groupAlarm = new Sequence([
    new Condition(ctx => ctx.sensory.dangerChemical > 0.3 || ctx.emotions.fear > 0.5),
    new Action(ctx => {
      ctx.motor.flee      = true
      ctx.motor.moveSpeed = 1.0
      if (ctx.sensory.nearestPredator) {
        ctx.motor.moveDirection = normalize3([
          -ctx.sensory.nearestPredator.direction[0],
          -ctx.sensory.nearestPredator.direction[1],
          -ctx.sensory.nearestPredator.direction[2],
        ])
      } else {
        ctx.motor.moveDirection = randomDir()
      }
      ctx.motor.communicate = 'alarm'
      return 'SUCCESS'
    }),
  ])

  // ── Individual needs ──────────────────────────────────────────────────────
  const sleepNode = new Sequence([
    new Condition(ctx => ctx.sensory.fatigue > 0.8),
    new Action(ctx => {
      ctx.motor.sleep     = true
      ctx.motor.moveSpeed = 0
      return 'SUCCESS'
    }),
  ])

  const eatNode = new Sequence([
    new Condition(ctx => ctx.sensory.hunger > 0.55),
    new Action(ctx => {
      if (ctx.sensory.nearestFood && ctx.sensory.nearestFood.distance < 0.8) {
        ctx.motor.eat = true
      } else if (ctx.sensory.nearestFood) {
        ctx.motor.moveDirection = normalize3(ctx.sensory.nearestFood.direction)
        ctx.motor.moveSpeed     = 0.6
      } else {
        ctx.motor.moveDirection = normalize3(ctx.sensory.foodGradient)
        ctx.motor.moveSpeed     = 0.5
      }
      return 'SUCCESS'
    }),
  ])

  const drinkNode = new Sequence([
    new Condition(ctx => ctx.sensory.thirst > 0.65),
    new Action(ctx => {
      ctx.motor.moveDirection = [0, -1, 0]
      ctx.motor.moveSpeed     = 0.5
      return 'SUCCESS'
    }),
  ])

  const individualNeeds = new Selector([sleepNode, eatNode, drinkNode])

  // ── Group cohesion ────────────────────────────────────────────────────────
  const groupCohesion = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestConspecific !== null &&
      ctx.sensory.nearestConspecific.distance > 8,
    ),
    new Action(ctx => {
      const c = ctx.sensory.nearestConspecific!
      ctx.motor.moveDirection = normalize3(c.direction)
      ctx.motor.moveSpeed     = 0.4
      return 'SUCCESS'
    }),
  ])

  // ── Social bonding: grooming / play ───────────────────────────────────────
  const bondingNode = new Cooldown(
    new Sequence([
      new Condition(ctx =>
        ctx.sensory.nearestConspecific !== null &&
        ctx.sensory.nearestConspecific.distance < 2 &&
        ctx.sensory.hunger < 0.5 &&
        ctx.emotions.joy > 0.3,
      ),
      new Action(ctx => {
        ctx.motor.moveSpeed  = 0
        ctx.motor.communicate = 'groom'
        return 'SUCCESS'
      }),
    ]),
    8000, // 8 s cooldown
  )

  // ── Cooperative hunt ──────────────────────────────────────────────────────
  const cooperativeHunt = new Sequence([
    new Condition(ctx =>
      ctx.sensory.nearestPrey !== null &&
      ctx.sensory.hunger > 0.4 &&
      ctx.sensory.nearestConspecific !== null,
    ),
    new Action(ctx => {
      const prey = ctx.sensory.nearestPrey!
      if (prey.distance < 1.5) {
        ctx.motor.attack    = true
        ctx.motor.moveSpeed = 0
      } else {
        ctx.motor.moveDirection = normalize3(prey.direction)
        ctx.motor.moveSpeed     = 0.9
        ctx.motor.communicate  = 'hunt_signal'
      }
      return 'SUCCESS'
    }),
  ])

  // ── Explore ───────────────────────────────────────────────────────────────
  const exploreNode = new Action(ctx => {
    ctx.motor.moveDirection = randomDir()
    ctx.motor.moveSpeed     = 0.3
    return 'SUCCESS'
  })

  return new Selector([
    groupAlarm,
    individualNeeds,
    groupCohesion,
    bondingNode,
    cooperativeHunt,
    exploreNode,
  ])
}
