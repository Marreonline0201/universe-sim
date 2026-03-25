/**
 * GOAP.ts
 *
 * Goal-Oriented Action Planning for Level 3-4 creatures.
 *
 * The planner uses A* over a discrete state-space of WorldState keys.
 * Each node in the search graph is a partial world state.  The heuristic is
 * the number of goal conditions not yet satisfied by the current state.
 *
 * Heavily influenced by Jeff Orkin's original F.E.A.R. GOAP implementation.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface WorldState {
  [key: string]: boolean | number | string
}

export interface Action {
  name:           string
  /** Conditions that must be true in WorldState before this action may run. */
  preconditions:  WorldState
  /** Changes this action applies to WorldState on completion. */
  effects:        WorldState
  /** A* cost — lower values are preferred. */
  cost:           number
  /** Real-time execution function called each tick while this action is active. */
  execute:        (entityId: number, dt: number) => void
}

export interface Goal {
  name:        string
  priority:    number           // higher = more urgent
  desiredState: WorldState      // the desired world-state to reach
  isAchieved:  (state: WorldState) => boolean
}

// ─── A* node ────────────────────────────────────────────────────────────────────

interface AStarNode {
  state:    WorldState
  /** Parent pointer for path reconstruction — avoids O(depth²) array copies. */
  parent:   AStarNode | null
  action:   Action | null   // action taken to reach this node (null for start)
  g:        number     // cost so far
  h:        number     // heuristic
  f:        number     // g + h
}

/** Reconstruct the action sequence by walking parent pointers. */
function reconstructPath(node: AStarNode): Action[] {
  const path: Action[] = []
  let cur: AStarNode | null = node
  while (cur !== null && cur.action !== null) {
    path.push(cur.action)
    cur = cur.parent
  }
  path.reverse()
  return path
}

// ─── GOAPPlanner ──────────────────────────────────────────────────────────────

/** Walk parent pointers to count the depth of a node in the search tree. */
function _nodeDepth(node: AStarNode): number {
  let depth = 0
  let cur: AStarNode | null = node.parent
  while (cur !== null) { depth++; cur = cur.parent }
  return depth
}

export class GOAPPlanner {
  /** Maximum search depth to prevent infinite loops. */
  private readonly MAX_DEPTH = 12

  /**
   * A* search over action sequences to reach the goal state.
   * Returns the ordered list of actions to execute, or null if no plan exists.
   */
  plan(
    currentState: WorldState,
    goal: Goal,
    availableActions: Action[],
  ): Action[] | null {
    if (goal.isAchieved(currentState)) return []

    const open:   AStarNode[] = []
    const closed: Set<string> = new Set()

    const startNode: AStarNode = {
      state:  { ...currentState },
      parent: null,
      action: null,
      g: 0,
      h: this.heuristic(currentState, goal),
      f: this.heuristic(currentState, goal),
    }
    open.push(startNode)

    while (open.length > 0) {
      // Pop node with lowest f using a linear scan (open list stays small for
      // typical action counts of 8-20; a full heap would add complexity overhead).
      let bestIdx = 0
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i
      }
      const current = open[bestIdx]
      open.splice(bestIdx, 1)

      // Check goal.
      if (goal.isAchieved(current.state)) return reconstructPath(current)

      // Depth limit.
      if (_nodeDepth(current) >= this.MAX_DEPTH) continue

      // Mark visited.
      const stateKey = this._stateKey(current.state)
      if (closed.has(stateKey)) continue
      closed.add(stateKey)

      // Expand.
      for (const action of availableActions) {
        if (!this.stateMatches(current.state, action.preconditions)) continue

        const nextState    = this.applyEffects(current.state, action.effects)
        const nextStateKey = this._stateKey(nextState)
        if (closed.has(nextStateKey)) continue

        const g = current.g + action.cost
        const h = this.heuristic(nextState, goal)
        open.push({
          state:  nextState,
          parent: current,
          action,
          g,
          h,
          f: g + h,
        })
      }
    }

    return null // no plan found
  }

  /** Number of goal conditions not satisfied by `state`. */
  heuristic(state: WorldState, goal: Goal): number {
    let unsatisfied = 0
    for (const [key, desiredValue] of Object.entries(goal.desiredState)) {
      if (state[key] !== desiredValue) unsatisfied++
    }
    return unsatisfied
  }

  /** Check that all conditions in `conditions` are satisfied by `state`. */
  stateMatches(state: WorldState, conditions: WorldState): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (state[key] !== value) return false
    }
    return true
  }

  /** Return a new WorldState with `effects` applied. */
  applyEffects(state: WorldState, effects: WorldState): WorldState {
    return { ...state, ...effects }
  }

  /** Stable string key for a WorldState (for deduplication). */
  private _stateKey(state: WorldState): string {
    return Object.entries(state)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|')
  }
}

// ─── Standard action library ──────────────────────────────────────────────────

/**
 * Built-in action set shared across all Level 3-4 creatures.
 * Individual species / civilisation tiers can augment this set.
 *
 * `execute` stubs emit console logs in development — the ECS systems
 * read the creature's current goal plan and apply physics/state changes
 * outside this module.
 */
export const STANDARD_ACTIONS: Record<string, Action> = {
  findFood: {
    name:          'findFood',
    preconditions: { hasFood: false },
    effects:       { hasFood: true },
    cost:          2,
    execute:       (entityId, _dt) => {
      // ECS CreatureSystem will move the entity toward food gradient.
      void entityId
    },
  },

  eat: {
    name:          'eat',
    preconditions: { hasFood: true, hungry: true },
    effects:       { hungry: false, hasFood: false },
    cost:          1,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  drinkWater: {
    name:          'drinkWater',
    preconditions: { nearWater: true },
    effects:       { thirsty: false },
    cost:          1,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  findWater: {
    name:          'findWater',
    preconditions: { nearWater: false },
    effects:       { nearWater: true },
    cost:          3,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  findShelter: {
    name:          'findShelter',
    preconditions: {},
    effects:       { hasShelter: true },
    cost:          3,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  sleep: {
    name:          'sleep',
    preconditions: { hasShelter: true },
    effects:       { tired: false },
    cost:          2,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  restInPlace: {
    name:          'restInPlace',
    preconditions: {},
    effects:       { tired: false },
    cost:          4, // more expensive than sleeping in shelter
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  findMate: {
    name:          'findMate',
    preconditions: { reproductiveUrge: true },
    effects:       { hasMate: true },
    cost:          5,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  mate: {
    name:          'mate',
    preconditions: { reproductiveUrge: true, hasMate: true },
    effects:       { reproductiveUrge: false },
    cost:          2,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  flee: {
    name:          'flee',
    preconditions: { threatened: true },
    effects:       { threatened: false },
    cost:          1,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  attack: {
    name:          'attack',
    preconditions: { hasTarget: true },
    effects:       { hasTarget: false, hasFood: true },
    cost:          2,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  findPrey: {
    name:          'findPrey',
    preconditions: { hasTarget: false, hungry: true },
    effects:       { hasTarget: true },
    cost:          3,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  gatherMaterial: {
    name:          'gatherMaterial',
    preconditions: { nearMaterial: true },
    effects:       { hasMaterial: true },
    cost:          4,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  craftTool: {
    name:          'craftTool',
    preconditions: { hasMaterial: true, knowsRecipe: true },
    effects:       { hasTool: true },
    cost:          10,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  buildShelter: {
    name:          'buildShelter',
    preconditions: { hasMaterial: true, hasTool: true },
    effects:       { hasShelter: true },
    cost:          20,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  teachSkill: {
    name:          'teachSkill',
    preconditions: { hasSkill: true, hasStudent: true },
    effects:       { taughtSkill: true },
    cost:          5,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  learnSkill: {
    name:          'learnSkill',
    preconditions: { hasTeacher: true },
    effects:       { hasSkill: true },
    cost:          5,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  tradeItem: {
    name:          'tradeItem',
    preconditions: { hasItem: true, hasTrader: true },
    effects:       { hasDesiredItem: true, hasItem: false },
    cost:          3,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  explore: {
    name:          'explore',
    preconditions: {},
    effects:       { exploredArea: true },
    cost:          2,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  callForHelp: {
    name:          'callForHelp',
    preconditions: { threatened: true, hasAlly: true },
    effects:       { hasBackup: true },
    cost:          1,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },

  groomAlly: {
    name:          'groomAlly',
    preconditions: { hasAlly: true },
    effects:       { allianceStrength: true },
    cost:          3,
    execute:       (entityId, _dt) => {
      void entityId
    },
  },
}

// ─── Convenience: standard goal factory ──────────────────────────────────────

export function createSurviveGoal(priority = 10): Goal {
  return {
    name:        'survive',
    priority,
    desiredState: { threatened: false },
    isAchieved:  s => s['threatened'] === false,
  }
}

export function createEatGoal(priority = 8): Goal {
  return {
    name:        'eat',
    priority,
    desiredState: { hungry: false },
    isAchieved:  s => s['hungry'] === false,
  }
}

export function createRestGoal(priority = 6): Goal {
  return {
    name:        'rest',
    priority,
    desiredState: { tired: false },
    isAchieved:  s => s['tired'] === false,
  }
}

export function createReproduceGoal(priority = 4): Goal {
  return {
    name:        'reproduce',
    priority,
    desiredState: { reproductiveUrge: false },
    isAchieved:  s => s['reproductiveUrge'] === false,
  }
}

export function createBuildShelterGoal(priority = 5): Goal {
  return {
    name:        'buildShelter',
    priority,
    desiredState: { hasShelter: true },
    isAchieved:  s => s['hasShelter'] === true,
  }
}
