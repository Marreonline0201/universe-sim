/**
 * NeuralArchitecture.ts
 *
 * Core brain system. Each creature's brain scales from Level 0 (reflex) to
 * Level 4 (abstract reasoning) based on genome neural complexity score.
 *
 *   Level 0  (neuralComplexity  0-15):  Pure stimulus-response (bacteria, jellyfish)
 *   Level 1  (neuralComplexity 16-63):  FSM — instinct-driven (fish, insects)
 *   Level 2  (neuralComplexity 64-127): Behaviour tree + learning (mammals, birds)
 *   Level 3  (neuralComplexity 128-191):GOAP planner (great apes, early humans)
 *   Level 4  (neuralComplexity 192-255):GOAP + LLM integration (humans)
 */

import type { EmotionState } from './EmotionModel'

// ─── Neural level ──────────────────────────────────────────────────────────────

export type NeuralLevel = 0 | 1 | 2 | 3 | 4

// ─── Sensory input bundle ──────────────────────────────────────────────────────

/**
 * Sensory input bundle (filled by SensorySystem each tick).
 */
export interface SensoryInput {
  // Vision
  nearestFood:        { distance: number; direction: [number, number, number]; type: string } | null
  nearestPredator:    { distance: number; direction: [number, number, number]; speciesId: number } | null
  nearestPrey:        { distance: number; direction: [number, number, number]; speciesId: number } | null
  nearestConspecific: { distance: number; direction: [number, number, number] } | null
  lightLevel:         number  // 0-255

  // Chemical
  foodGradient:   [number, number, number]  // direction of increasing food chemical
  dangerChemical: number                    // alarm pheromone concentration
  mateChemical:   number                    // mate-attracting pheromone concentration

  // Physical
  temperature:  number   // °C in current cell
  pressure:     number   // Pa
  groundBelow:  boolean  // is there ground below creature?

  // Internal body state
  hunger:  number  // 0-1  (1 = starving)
  thirst:  number  // 0-1
  fatigue: number  // 0-1
  pain:    number  // 0-1
  health:  number  // 0-1
  energy:  number  // 0-1  (ATP reserves)
}

// ─── Motor output ──────────────────────────────────────────────────────────────

/**
 * Motor output (what the creature will do this tick).
 */
export interface MotorOutput {
  moveDirection: [number, number, number]  // normalised vector
  moveSpeed:     number                    // 0-1 (fraction of max speed)
  attack:        boolean
  flee:          boolean
  eat:           boolean
  sleep:         boolean
  communicate:   string | null             // signal to emit (null = silence)
  useItem:       number | null             // item ID to use
}

// ─── Creature FSM states ───────────────────────────────────────────────────────

export type CreatureState =
  | 'idle' | 'exploring' | 'foraging' | 'hunting' | 'fleeing'
  | 'eating' | 'drinking' | 'sleeping' | 'mating' | 'nesting'
  | 'fighting' | 'socializing' | 'grooming' | 'migrating'
  | 'working' | 'building' | 'teaching' | 'grieving'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  if (len === 0) return [0, 0, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function defaultMotor(): MotorOutput {
  return {
    moveDirection: [0, 0, 0],
    moveSpeed: 0,
    attack: false,
    flee: false,
    eat: false,
    sleep: false,
    communicate: null,
    useItem: null,
  }
}

// ─── Brain ────────────────────────────────────────────────────────────────────

export class Brain {
  readonly level: NeuralLevel

  /** Short-term memory scratchpad (up to 8 slots). */
  private workingMemory: any[] = []

  /** Previous motor output — used for inertia / continuity. */
  private lastAction: MotorOutput = defaultMotor()

  /** Current FSM state (used by Level 1). */
  private fsmState: CreatureState = 'idle'

  /** Time spent in current FSM state (seconds). */
  private fsmTimer = 0

  /** Learning weights for behaviour tree nodes (Level 2).
   *  Key = node identifier, value = weight modifier [-1, +1]. */
  private learningWeights: Map<string, number> = new Map()

  /** Deterministic noise seed derived from genome hash. */
  private noiseSeed: number

  constructor(level: NeuralLevel, genomeHash: string) {
    this.level = level
    // Derive a stable noise seed from the genome hash string.
    let seed = 0
    for (let i = 0; i < genomeHash.length; i++) {
      seed = (Math.imul(31, seed) + genomeHash.charCodeAt(i)) | 0
    }
    this.noiseSeed = seed >>> 0
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Main tick: accept sensory input, run appropriate AI tier, return motor output.
   */
  tick(input: SensoryInput, emotions: EmotionState, dt: number): MotorOutput {
    let output: MotorOutput

    switch (this.level) {
      case 0: output = this.level0Tick(input);                    break
      case 1: output = this.level1Tick(input, emotions, dt);      break
      case 2: output = this.level2Tick(input, emotions, dt);      break
      case 3: output = this.level3Tick(input, emotions, dt);      break
      case 4: output = this.level4Tick(input, emotions, dt);      break
      default: output = defaultMotor()
    }

    this.lastAction = output
    return output
  }

  // ─── Level 0: Stimulus-response lookup table ─────────────────────────────────

  /**
   * Pure reflexive behaviour — no memory, no planning.
   * Covers bacteria, primitive multicellular organisms, jellyfish.
   *
   * Priority: danger chemicals > food gradient > mate chemical > random wander
   */
  private level0Tick(input: SensoryInput): MotorOutput {
    const out = defaultMotor()

    // 1. Flee from danger chemicals (alarm pheromones).
    if (input.dangerChemical > 0.3) {
      // Escape opposite to food gradient (best approximation without vision).
      out.flee = true
      out.moveDirection = normalize3([
        -input.foodGradient[0],
        -input.foodGradient[1],
        -input.foodGradient[2],
      ])
      out.moveSpeed = Math.min(1, input.dangerChemical * 1.5)
      out.communicate = 'alarm'
      return out
    }

    // 2. Chase food gradient if hungry.
    if (input.hunger > 0.4) {
      const gradMag = Math.sqrt(
        input.foodGradient[0] ** 2 +
        input.foodGradient[1] ** 2 +
        input.foodGradient[2] ** 2,
      )
      if (gradMag > 0.01) {
        out.moveDirection = normalize3(input.foodGradient)
        out.moveSpeed = 0.6 * input.hunger
        return out
      }
    }

    // 3. Eat if food is adjacent (distance 0).
    if (input.nearestFood && input.nearestFood.distance < 0.5) {
      out.eat = true
      return out
    }

    // 4. Move toward mate chemical if reproduction conditions are met.
    if (input.mateChemical > 0.5 && input.hunger < 0.7) {
      out.moveDirection = normalize3(input.foodGradient) // approximate
      out.moveSpeed = 0.3
      out.communicate = 'mate_signal'
      return out
    }

    // 5. Brownian random walk (default for bacteria-level life).
    const angle = ((this._lcg() / 0xffffffff) * 2 - 1) * Math.PI
    out.moveDirection = [Math.cos(angle), 0, Math.sin(angle)]
    out.moveSpeed = 0.1
    return out
  }

  // ─── Level 1: Finite state machine ───────────────────────────────────────────

  /**
   * FSM with 8 core states. Emotions bias transitions.
   * Covers fish, insects, reptiles.
   */
  private level1Tick(
    input: SensoryInput,
    emotions: EmotionState,
    dt: number,
  ): MotorOutput {
    this.fsmTimer += dt

    // ── State transitions ──
    const newState = this._fsmTransition(input, emotions)
    if (newState !== this.fsmState) {
      this.fsmState = newState
      this.fsmTimer = 0
    }

    // ── State actions ──
    return this._fsmAction(input, emotions)
  }

  private _fsmTransition(input: SensoryInput, emotions: EmotionState): CreatureState {
    const s = this.fsmState

    // Universal override: threat → flee
    const threatLevel = (input.nearestPredator
      ? Math.max(0, 1 - input.nearestPredator.distance / 20)
      : 0) + emotions.fear * 0.5
    if (threatLevel > 0.5) return 'fleeing'

    // Universal override: severe hunger while foraging/idle
    if (input.hunger > 0.85 && s !== 'eating') return 'foraging'

    // Universal override: sleep if exhausted
    if (input.fatigue > 0.9 && s !== 'sleeping') return 'sleeping'

    switch (s) {
      case 'idle':
        if (this.fsmTimer > 3) return 'exploring'
        if (input.hunger > 0.5) return 'foraging'
        return 'idle'

      case 'exploring':
        if (input.nearestFood !== null && input.hunger > 0.3) return 'foraging'
        if (this.fsmTimer > 15) return 'idle'
        return 'exploring'

      case 'foraging':
        if (input.nearestFood && input.nearestFood.distance < 0.8) return 'eating'
        if (input.hunger < 0.2) return 'idle'
        return 'foraging'

      case 'eating':
        if (input.hunger < 0.15) return 'idle'
        if (!input.nearestFood || input.nearestFood.distance > 1.5) return 'foraging'
        return 'eating'

      case 'fleeing':
        if (threatLevel < 0.15 && this.fsmTimer > 4) return 'idle'
        return 'fleeing'

      case 'sleeping':
        if (input.fatigue < 0.1) return 'idle'
        if (threatLevel > 0.6) return 'fleeing' // danger overrides sleep
        return 'sleeping'

      case 'mating':
        if (this.fsmTimer > 10 || input.hunger > 0.8) return 'idle'
        return 'mating'

      default:
        return 'idle'
    }
  }

  private _fsmAction(input: SensoryInput, emotions: EmotionState): MotorOutput {
    const out = defaultMotor()

    switch (this.fsmState) {
      case 'fleeing':
        out.flee = true
        if (input.nearestPredator) {
          out.moveDirection = normalize3([
            -input.nearestPredator.direction[0],
            -input.nearestPredator.direction[1],
            -input.nearestPredator.direction[2],
          ])
        } else {
          out.moveDirection = normalize3([
            -input.foodGradient[0],
            -input.foodGradient[1],
            -input.foodGradient[2],
          ])
        }
        out.moveSpeed = 1.0
        out.communicate = 'alarm'
        break

      case 'foraging':
        if (input.nearestFood) {
          out.moveDirection = normalize3(input.nearestFood.direction)
        } else {
          out.moveDirection = normalize3(input.foodGradient)
        }
        out.moveSpeed = 0.7
        break

      case 'eating':
        out.eat = true
        out.moveSpeed = 0
        break

      case 'exploring': {
        const rng = this._lcg() / 0xffffffff
        const angle = rng * Math.PI * 2
        out.moveDirection = [Math.cos(angle), 0, Math.sin(angle)]
        out.moveSpeed = 0.4
        break
      }

      case 'sleeping':
        out.sleep = true
        out.moveSpeed = 0
        break

      case 'mating':
        if (input.nearestConspecific) {
          out.moveDirection = normalize3(input.nearestConspecific.direction)
          out.moveSpeed = 0.5
        }
        out.communicate = 'mate_signal'
        break

      case 'idle':
      default:
        out.moveSpeed = 0
        break
    }

    return out
  }

  // ─── Level 2: Behaviour tree with learning weights ───────────────────────────

  /**
   * A simplified but fully functional behaviour tree evaluation.
   * Weights are updated via positive/negative reinforcement (basic Q-learning).
   * Covers mammals and birds.
   */
  private level2Tick(
    input: SensoryInput,
    emotions: EmotionState,
    dt: number,
  ): MotorOutput {
    // Update learning: reward the last action if it improved state.
    this._updateLearning(input)

    // Run behaviour tree root — Selector: try highest-priority subtrees first.
    // Priority ordering (with emotion modulation):
    //   survive > eat > drink > rest > reproduce > socialise > explore
    const out = defaultMotor()

    const fleeWeight = this._weight('flee', 1.0) + emotions.fear * 0.8
    const eatWeight  = this._weight('eat',  1.0) * input.hunger
    const drinkWeight = this._weight('drink', 1.0) * input.thirst
    const sleepWeight = this._weight('sleep', 1.0) * input.fatigue
    const mateWeight = this._weight('mate',  1.0) * emotions.love * (1 - input.hunger)
    const exploreWeight = this._weight('explore', 1.0) * emotions.curiosity

    const threatLevel = input.nearestPredator
      ? Math.max(0, 1 - input.nearestPredator.distance / 25)
      : 0

    // Build priority list and pick highest.
    const priorities: Array<[string, number]> = [
      ['flee',    threatLevel * fleeWeight],
      ['eat',     eatWeight],
      ['drink',   drinkWeight * 0.9],
      ['sleep',   sleepWeight * 0.8],
      ['mate',    mateWeight * 0.6],
      ['explore', exploreWeight * 0.4],
    ]
    priorities.sort((a, b) => b[1] - a[1])

    const chosen = priorities[0][0]

    switch (chosen) {
      case 'flee':
        out.flee = true
        out.moveSpeed = 1
        if (input.nearestPredator) {
          out.moveDirection = normalize3([
            -input.nearestPredator.direction[0],
            -input.nearestPredator.direction[1],
            -input.nearestPredator.direction[2],
          ])
        }
        break

      case 'eat':
        if (input.nearestFood) {
          if (input.nearestFood.distance < 0.8) {
            out.eat = true
          } else {
            out.moveDirection = normalize3(input.nearestFood.direction)
            out.moveSpeed = 0.7 + input.hunger * 0.3
          }
        } else {
          out.moveDirection = normalize3(input.foodGradient)
          out.moveSpeed = 0.5
        }
        break

      case 'drink':
        // Approximate: move toward coolest/moist area (lowest temperature = water).
        out.moveDirection = [0, -1, 0] // downhill heuristic
        out.moveSpeed = 0.5
        break

      case 'sleep':
        out.sleep = true
        out.moveSpeed = 0
        break

      case 'mate':
        if (input.nearestConspecific) {
          out.moveDirection = normalize3(input.nearestConspecific.direction)
          out.moveSpeed = 0.4
        }
        out.communicate = 'mate_call'
        break

      case 'explore':
      default: {
        // Curiosity-driven exploration with memory of last direction.
        const noise = (this._lcg() / 0xffffffff - 0.5) * 0.4
        const prev = this.lastAction.moveDirection
        const blended: [number, number, number] = [
          prev[0] + noise,
          0,
          prev[2] + noise,
        ]
        out.moveDirection = normalize3(blended)
        out.moveSpeed = 0.35
        break
      }
    }

    // Store chosen action in working memory for learning update next tick.
    this.workingMemory[0] = chosen
    this.workingMemory[1] = { hunger: input.hunger, fatigue: input.fatigue }

    return out
  }

  private _weight(key: string, base: number): number {
    return base + (this.learningWeights.get(key) ?? 0)
  }

  private _updateLearning(input: SensoryInput): void {
    const lastChosen = this.workingMemory[0] as string | undefined
    const lastState  = this.workingMemory[1] as { hunger: number; fatigue: number } | undefined
    if (!lastChosen || !lastState) return

    // Positive reinforcement: if hunger decreased after eating, strengthen eat weight.
    if (lastChosen === 'eat' && input.hunger < lastState.hunger - 0.01) {
      this._adjustWeight('eat', +0.05)
    }
    if (lastChosen === 'eat' && input.hunger > lastState.hunger + 0.02) {
      this._adjustWeight('eat', -0.03) // bad food choice
    }
    if (lastChosen === 'sleep' && input.fatigue < lastState.fatigue - 0.02) {
      this._adjustWeight('sleep', +0.03)
    }
  }

  private _adjustWeight(key: string, delta: number): void {
    const current = this.learningWeights.get(key) ?? 0
    this.learningWeights.set(key, Math.max(-0.5, Math.min(0.5, current + delta)))
  }

  // ─── Level 3: GOAP planner ────────────────────────────────────────────────────

  /**
   * Goal-Oriented Action Planning.
   * Each tick, constructs a world-state snapshot, selects the most urgent goal,
   * and follows the cached plan one step at a time.
   * Covers great apes, dolphins, early humans.
   */
  private level3Tick(
    input: SensoryInput,
    emotions: EmotionState,
    dt: number,
  ): MotorOutput {
    // Build simplified world state from senses.
    const ws: Record<string, boolean> = {
      hasFood:         input.nearestFood !== null && input.nearestFood.distance < 2,
      hungry:          input.hunger > 0.5,
      threatened:      input.nearestPredator !== null &&
                       (input.nearestPredator.distance < 15 || emotions.fear > 0.5),
      tired:           input.fatigue > 0.6,
      hasMate:         input.nearestConspecific !== null && emotions.love > 0.4,
      nearWater:       input.thirst > 0.1 && input.temperature < 30, // heuristic
      hasShelter:      !input.groundBelow,
      reproductiveUrge: emotions.love > 0.6 && input.hunger < 0.6,
      hasTarget:       input.nearestPrey !== null,
    }

    // Goal priority (emotions modulate).
    const goals: Array<{ name: string; priority: number; action: keyof MotorOutput | 'move' }> = [
      { name: 'survive',    priority: ws.threatened ? 10 + emotions.fear * 5 : 0,   action: 'flee' },
      { name: 'eat',        priority: ws.hungry     ? 8  + emotions.distress * 2  : 0, action: 'eat' },
      { name: 'rest',       priority: ws.tired      ? 6  + input.fatigue * 3      : 0, action: 'sleep' },
      { name: 'reproduce',  priority: ws.reproductiveUrge ? 4 + emotions.love * 2  : 0, action: 'move' },
      { name: 'hunt',       priority: ws.hasTarget  ? 3 + (1 - input.hunger) * 2   : 0, action: 'attack' },
    ]
    goals.sort((a, b) => b.priority - a.priority)

    const top = goals[0]
    const out = defaultMotor()

    if (top.priority <= 0) {
      // Idle / socialise.
      if (input.nearestConspecific) {
        out.moveDirection = normalize3(input.nearestConspecific.direction)
        out.moveSpeed = 0.2
        out.communicate = 'greeting'
      }
      return out
    }

    switch (top.name) {
      case 'survive':
        out.flee = true
        out.moveSpeed = 1
        if (input.nearestPredator) {
          out.moveDirection = normalize3([
            -input.nearestPredator.direction[0],
            -input.nearestPredator.direction[1],
            -input.nearestPredator.direction[2],
          ])
        }
        out.communicate = 'alarm'
        break

      case 'eat':
        if (ws.hasFood) {
          out.eat = true
        } else if (input.nearestFood) {
          out.moveDirection = normalize3(input.nearestFood.direction)
          out.moveSpeed = 0.8
        } else {
          out.moveDirection = normalize3(input.foodGradient)
          out.moveSpeed = 0.6
        }
        break

      case 'rest':
        out.sleep = true
        break

      case 'reproduce':
        if (input.nearestConspecific) {
          out.moveDirection = normalize3(input.nearestConspecific.direction)
          out.moveSpeed = 0.5
          out.communicate = 'mate_call'
        }
        break

      case 'hunt':
        if (input.nearestPrey) {
          if (input.nearestPrey.distance < 1.5) {
            out.attack = true
          } else {
            out.moveDirection = normalize3(input.nearestPrey.direction)
            out.moveSpeed = 0.9
          }
        }
        break
    }

    // Store plan step in working memory.
    this.workingMemory[0] = top.name
    return out
  }

  // ─── Level 4: GOAP + LLM integration ─────────────────────────────────────────

  /**
   * Human-equivalent intelligence.
   * Operates as Level 3 GOAP by default but can receive LLM-generated action
   * overrides when engaged in dialogue.  The LLMBridge queues async requests;
   * results are injected into workingMemory[2] when available.
   */
  private level4Tick(
    input: SensoryInput,
    emotions: EmotionState,
    dt: number,
  ): MotorOutput {
    // Check if there is a pending LLM-directed action override.
    const llmOverride = this.workingMemory[2] as MotorOutput | undefined
    if (llmOverride) {
      // Consume it (one-shot override).
      this.workingMemory[2] = undefined
      return llmOverride
    }

    // Default: fall through to Level 3 GOAP with enhanced social/tool use layer.
    const base = this.level3Tick(input, emotions, dt)

    // Level 4 enhancement: teach/trade/communicate when safe and near conspecifics.
    if (
      !base.flee &&
      !base.attack &&
      input.nearestConspecific !== null &&
      input.nearestConspecific.distance < 3 &&
      emotions.distress < 0.3 &&
      input.hunger < 0.6
    ) {
      base.communicate = emotions.joy > 0.5 ? 'share_knowledge' : 'greeting'
    }

    return base
  }

  /**
   * Inject an LLM-generated action override (called by LLMBridge).
   */
  injectLLMAction(action: MotorOutput): void {
    this.workingMemory[2] = action
  }

  // ─── LCG PRNG (deterministic per brain) ──────────────────────────────────────

  private _lcg(): number {
    // Linear Congruential Generator — fast, deterministic.
    this.noiseSeed = (Math.imul(1664525, this.noiseSeed) + 1013904223) >>> 0
    return this.noiseSeed
  }
}
