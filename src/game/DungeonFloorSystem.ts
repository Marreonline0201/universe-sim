// ── DungeonFloorSystem.ts ─────────────────────────────────────────────────────
// M47 Track C: Dungeon Floor Generation
//
// Tracks multi-floor dungeon progression with increasing difficulty per floor.
// Floor tiers:
//   Floor 1-2:  3 enemies, no bosses,             loot x1.0
//   Floor 3-4:  5 enemies, miniboss on floor 4,   loot x1.5
//   Floor 5+:   5 + floor*0.5 (rounded) enemies,  always miniboss,
//               boss every 5 floors,               loot x(1 + floor * 0.2)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DungeonFloor {
  floorNumber: number
  enemyCount: number
  hasMiniboss: boolean
  hasBoss: boolean
  lootMultiplier: number
}

// ── Mutable floor counter ─────────────────────────────────────────────────────

export let currentFloor: number = 1

// ── Floor generation ──────────────────────────────────────────────────────────

export function generateFloor(floorNumber: number): DungeonFloor {
  if (floorNumber <= 2) {
    return {
      floorNumber,
      enemyCount: 3,
      hasMiniboss: false,
      hasBoss: false,
      lootMultiplier: 1.0,
    }
  }

  if (floorNumber <= 4) {
    return {
      floorNumber,
      enemyCount: 5,
      hasMiniboss: floorNumber === 4,
      hasBoss: false,
      lootMultiplier: 1.5,
    }
  }

  // Floor 5+
  const enemyCount = Math.round(5 + floorNumber * 0.5)
  const hasBoss = floorNumber % 5 === 0
  return {
    floorNumber,
    enemyCount,
    hasMiniboss: true,
    hasBoss,
    lootMultiplier: parseFloat((1 + floorNumber * 0.2).toFixed(2)),
  }
}

// ── Floor actions ─────────────────────────────────────────────────────────────

/** Advance to the next floor and dispatch the 'dungeon-floor-advanced' event. */
export function advanceFloor(): void {
  currentFloor++
  const floor = currentFloor
  const floorData = generateFloor(floor)
  window.dispatchEvent(
    new CustomEvent('dungeon-floor-advanced', { detail: { floor, floorData } }),
  )
}

/** Reset floor progression back to floor 1. */
export function resetDungeonProgress(): void {
  currentFloor = 1
}

/** Return the generated floor data for the current floor. */
export function getFloorData(): DungeonFloor {
  return generateFloor(currentFloor)
}
