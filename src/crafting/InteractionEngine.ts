import { getMaterialProps } from '../engine/MaterialRegistry'
import { MAT, ITEM } from '../player/Inventory'

// ── Environment at the moment of interaction ──────────────────────────────────
export interface CraftEnvironment {
  temperature: number      // °C (from weather/season system)
  humidity: number         // 0-1 (from weather)
  hasFireNearby: boolean   // player is near an active fire
  hasWaterNearby: boolean  // player is near a water source
  isRaining: boolean
}

// ── One material the player is using ─────────────────────────────────────────
export interface MaterialInput {
  matId: number
  quantity: number
  moisture?: number   // override the material's default moisture
}

// ── What the player is trying to do ──────────────────────────────────────────
export type CraftAction =
  | 'rub'      // rub two items together (friction fire)
  | 'strike'   // strike one against another (flint spark)
  | 'shape'    // manually shape material (clay forming, stone knapping)
  | 'smelt'    // apply sustained heat to melt/refine
  | 'cook'     // apply moderate heat to food
  | 'mix'      // combine materials (alloys, compounds)
  | 'cut'      // use one material to cut another

// ── Result of an interaction attempt ─────────────────────────────────────────
export interface InteractionResult {
  success: boolean
  outputMatId?: number      // the material produced (if success)
  outputItemId?: number     // the item produced (if success)
  outputQuantity?: number
  discoveryId?: string      // knowledge to unlock (first-time discovery)
  message: string           // human-readable description of what happened
  partialProgress?: number  // 0-1 (for time-based actions like bow drill)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Build the practice-tracking key for a given action + inputs */
function practiceKey(action: CraftAction, inputs: MaterialInput[]): string {
  const sortedIds = inputs.map(i => i.matId).sort((a, b) => a - b).join('_')
  return `${action}_${sortedIds}`
}

/** Effective moisture: use override if supplied, otherwise fall back to physics data */
function effectiveMoisture(input: MaterialInput): number {
  if (input.moisture !== undefined) return input.moisture
  return getMaterialProps(input.matId).moisture
}

/** Roll success given a probability in [0, 1] */
function roll(chance: number): boolean {
  return Math.random() < chance
}

// ── Interaction handlers ──────────────────────────────────────────────────────

function tryFrictionFire(
  inputs: MaterialInput[],
  env: CraftEnvironment,
  playerKnowledge: Set<string>,
  practiceCount: Map<string, number>,
): InteractionResult {
  const key = practiceKey('rub', inputs)

  // Increment practice count (always, success or fail)
  practiceCount.set(key, (practiceCount.get(key) ?? 0) + 1)
  const practice = practiceCount.get(key)!

  // Identify spindle (soft wood, hardness ≤ 2.5) and fireboard (hardwood, 2 ≤ hardness ≤ 4)
  // Both must be wood-category materials with required flammability
  const spindleInput = inputs.find(i => {
    const p = getMaterialProps(i.matId)
    return p.hardness <= 2.5 && p.flammability > 0.4
  })
  const fireboardInput = inputs.find(i => {
    const p = getMaterialProps(i.matId)
    return p.hardness >= 2 && p.hardness <= 4 && p.flammability > 0.4 && i !== spindleInput
  })

  if (!spindleInput) {
    return {
      success: false,
      message: "You need a soft wood spindle (hardness ≤ 2.5) to start a friction fire.",
    }
  }
  if (!fireboardInput) {
    return {
      success: false,
      message: "You need a harder wood fireboard to rub against. Try pairing pine with hardwood.",
    }
  }

  // Moisture checks
  const spindleMoisture  = effectiveMoisture(spindleInput)
  const fireboardMoisture = effectiveMoisture(fireboardInput)

  if (spindleMoisture >= 0.3) {
    return {
      success: false,
      message: "The spindle wood is too damp to generate enough heat. Dry it first.",
    }
  }
  if (fireboardMoisture >= 0.3) {
    return {
      success: false,
      message: "The fireboard is too wet. Smoke rises but no ember forms — dry the wood first.",
    }
  }

  // Base chance 15%, +2% per practice attempt (capped at 55%)
  const bonusPerAttempt = 0.02
  const baseChance = 0.15
  const practiceBonus = Math.min(practice, 30) * bonusPerAttempt
  let chance = Math.min(baseChance + practiceBonus, 0.55)

  // Rain / high humidity penalty
  if (env.isRaining || env.humidity > 0.8) {
    chance *= 0.3
  }

  const isFirstTime = !playerKnowledge.has('fire_making')

  if (roll(chance)) {
    return {
      success: true,
      outputItemId: ITEM.FIRE,
      outputQuantity: 1,
      discoveryId: isFirstTime ? 'fire_making' : undefined,
      message: isFirstTime
        ? "Smoke curls from the notch — a tiny ember falls onto the tinder. You've discovered fire-making!"
        : "A coal-black ember forms in the notch. You coax it into flame.",
    }
  }

  // Failure messages vary by reason
  const wetWeather = env.isRaining || env.humidity > 0.8
  if (wetWeather) {
    return {
      success: false,
      message: "The humid air steals the heat before an ember can form. Keep trying.",
      partialProgress: Math.min(practice / 30, 1),
    }
  }
  return {
    success: false,
    message: "Smoke rises but no ember forms. Your technique will improve with practice.",
    partialProgress: Math.min(practice / 30, 1),
  }
}

function tryStrikeFire(
  inputs: MaterialInput[],
  env: CraftEnvironment,
  playerKnowledge: Set<string>,
  practiceCount: Map<string, number>,
): InteractionResult {
  const key = practiceKey('strike', inputs)
  practiceCount.set(key, (practiceCount.get(key) ?? 0) + 1)
  const practice = practiceCount.get(key)!

  // Need flint (matId=2, hardness≥6.5) + iron pyrite OR iron (matId=15)
  const flintInput  = inputs.find(i => i.matId === MAT.FLINT && getMaterialProps(i.matId).hardness >= 6.5)
  const ironInput   = inputs.find(i => i.matId === MAT.IRON || i.matId === 15)
  // iron pyrite: not in MAT constants, treated as iron for simplicity

  if (!flintInput) {
    return {
      success: false,
      message: "You need a piece of flint to strike sparks. A sharp, hard stone is required.",
    }
  }
  if (!ironInput) {
    return {
      success: false,
      message: "You need iron or iron pyrite to strike against the flint.",
    }
  }

  const bonusPerAttempt = 0.01
  const baseChance = 0.40
  const practiceBonus = Math.min(practice, 30) * bonusPerAttempt
  const chance = Math.min(baseChance + practiceBonus, 0.70)

  const isFirstTime = !playerKnowledge.has('fire_strike')

  if (roll(chance)) {
    return {
      success: true,
      outputItemId: ITEM.FIRE,
      outputQuantity: 1,
      discoveryId: isFirstTime ? 'fire_strike' : undefined,
      message: isFirstTime
        ? "Sparks fly as flint meets iron — a bright shower of fire! You've learned to strike a spark."
        : "A sharp crack, a shower of sparks, and a tiny flame catches.",
    }
  }

  return {
    success: false,
    message: "Sparks fly but nothing catches. Keep your tinder close and dry.",
    partialProgress: Math.min(practice / 30, 1),
  }
}

function tryStoneKnapping(
  inputs: MaterialInput[],
  env: CraftEnvironment,
  playerKnowledge: Set<string>,
  practiceCount: Map<string, number>,
): InteractionResult {
  const key = practiceKey('shape', inputs)
  practiceCount.set(key, (practiceCount.get(key) ?? 0) + 1)

  // Primary material: flint or stone (matId 1 or 2)
  const primaryInput = inputs.find(i => i.matId === MAT.STONE || i.matId === MAT.FLINT)
  if (!primaryInput) {
    return {
      success: false,
      message: "Stone knapping needs flint or stone as the primary material.",
    }
  }

  const primaryProps = getMaterialProps(primaryInput.matId)

  // Hammer stone: second input with hardness ≥ primary material's hardness
  const hammerInput = inputs.find(i => {
    if (i === primaryInput) return false
    return getMaterialProps(i.matId).hardness >= primaryProps.hardness
  })

  if (!hammerInput) {
    return {
      success: false,
      message: "You need a harder hammer stone to knap this material. Find a denser rock.",
    }
  }

  if (roll(0.70)) {
    return {
      success: true,
      outputItemId: ITEM.STONE_TOOL,
      outputQuantity: 1,
      message: "Chips fly as you strike the stone at the right angle. A sharp edge emerges.",
    }
  }

  return {
    success: false,
    message: "The stone fractures poorly. Adjust your striking angle and try again.",
  }
}

function tryClayForming(
  inputs: MaterialInput[],
  env: CraftEnvironment,
  playerKnowledge: Set<string>,
  practiceCount: Map<string, number>,
): InteractionResult {
  const key = practiceKey('shape', inputs)
  practiceCount.set(key, (practiceCount.get(key) ?? 0) + 1)

  const clayInput = inputs.find(i => i.matId === MAT.CLAY)
  if (!clayInput) {
    return {
      success: false,
      message: "Clay forming requires clay. Gather some from a riverbank.",
    }
  }
  if (clayInput.quantity < 2) {
    return {
      success: false,
      message: "You need at least 2 units of clay to form a pot.",
    }
  }

  const clayProps = getMaterialProps(MAT.CLAY)
  // workability ≥ 0.8 means hands-only works (clay is 0.95)
  if (clayProps.workability < 0.8) {
    return {
      success: false,
      message: "This material is too stiff to shape by hand.",
    }
  }

  const isFirstTime = !playerKnowledge.has('pottery')

  if (roll(0.95)) {
    return {
      success: true,
      outputItemId: ITEM.CLAY_POT,
      outputQuantity: 1,
      discoveryId: isFirstTime ? 'pottery' : undefined,
      message: isFirstTime
        ? "The clay yields under your hands, taking shape into a rough but usable pot. Pottery discovered!"
        : "Your hands work the clay with practiced ease into a useful vessel.",
    }
  }

  return {
    success: false,
    message: "The clay collapses before it holds shape. Work more slowly and evenly.",
  }
}

function trySmelt(
  inputs: MaterialInput[],
  env: CraftEnvironment,
  playerKnowledge: Set<string>,
  practiceCount: Map<string, number>,
): InteractionResult {
  const key = practiceKey('smelt', inputs)
  practiceCount.set(key, (practiceCount.get(key) ?? 0) + 1)

  if (!env.hasFireNearby) {
    return {
      success: false,
      message: "Smelting requires an active fire or furnace nearby.",
    }
  }

  // Validate temperature is sufficient for all inputs being smelted
  for (const input of inputs) {
    const props = getMaterialProps(input.matId)
    if (props.meltingPoint === Infinity) continue  // non-metal (e.g. charcoal/fuel)
    const requiredTemp = props.meltingPoint * 0.9
    if (env.temperature < requiredTemp) {
      return {
        success: false,
        message: `Temperature ${env.temperature}°C is insufficient. Need ~${Math.round(requiredTemp)}°C. Build a proper furnace or forge.`,
      }
    }
  }

  // Delegate the actual smelting outcome to the existing SurvivalSystems logic.
  // InteractionEngine validates environmental pre-conditions; SurvivalSystems handles
  // the grid-temperature-based auto-smelt loop.
  return {
    success: true,
    message: "The conditions are right for smelting. Place ore in your furnace — it will smelt automatically as temperature rises.",
  }
}

// ── Main exported function ────────────────────────────────────────────────────

export function tryInteraction(
  inputs: MaterialInput[],
  action: CraftAction,
  env: CraftEnvironment,
  playerKnowledge: Set<string>,
  practiceCount: Map<string, number>,
): InteractionResult {
  // Dispatch to the right handler
  switch (action) {
    case 'rub':
      return tryFrictionFire(inputs, env, playerKnowledge, practiceCount)

    case 'strike':
      return tryStrikeFire(inputs, env, playerKnowledge, practiceCount)

    case 'shape': {
      // Determine if the player is working clay or stone
      const hasClay  = inputs.some(i => i.matId === MAT.CLAY)
      const hasStone = inputs.some(i => i.matId === MAT.STONE || i.matId === MAT.FLINT)

      if (hasClay) return tryClayForming(inputs, env, playerKnowledge, practiceCount)
      if (hasStone) return tryStoneKnapping(inputs, env, playerKnowledge, practiceCount)

      return {
        success: false,
        message: "You're not sure how to shape this material by hand.",
      }
    }

    case 'smelt':
      return trySmelt(inputs, env, playerKnowledge, practiceCount)

    case 'cook': {
      if (!env.hasFireNearby) {
        return {
          success: false,
          message: "Cooking requires a fire nearby.",
        }
      }
      // Basic cook — actual food system handled elsewhere; validate environment only
      return {
        success: true,
        message: "The fire is hot enough to cook. Place food near the flames.",
      }
    }

    case 'mix': {
      // Mixing (alloys, compounds) — basic env check; specific outcomes handled by recipe system
      return {
        success: true,
        message: "You combine the materials. The result depends on their properties.",
      }
    }

    case 'cut': {
      // Need a cutter (higher hardness) and something to cut
      if (inputs.length < 2) {
        return { success: false, message: "Cutting requires a tool and a material to cut." }
      }
      const sorted = [...inputs].sort(
        (a, b) => getMaterialProps(b.matId).hardness - getMaterialProps(a.matId).hardness,
      )
      const cutter  = sorted[0]
      const target  = sorted[1]
      const cutterH = getMaterialProps(cutter.matId).hardness
      const targetH = getMaterialProps(target.matId).hardness
      if (cutterH <= targetH) {
        return {
          success: false,
          message: "Your cutting tool isn't hard enough to cut that material.",
        }
      }
      return {
        success: true,
        message: `You cut the ${target.matId} material cleanly.`,
      }
    }

    default:
      return {
        success: false,
        message: "Unknown action.",
      }
  }
}
