/**
 * HazardSystem — M47 Track B: Environmental Hazards
 *
 * Defines environmental hazard zones (lava pools, poison swamps, quicksand,
 * toxic vents) scattered around the world. Each zone deals ongoing damage or
 * applies a movement penalty to the player when they enter it.
 *
 * Usage:
 *   - getActiveHazard(px, pz): returns the HazardZone the player is in, or null
 *   - isInHazard(px, pz): boolean shorthand
 *   - HAZARD_DEFS[type]: damage-per-second, icon, color, message
 */

export type HazardType = 'quicksand' | 'poison_swamp' | 'toxic_vent' | 'lava_pool'

export interface HazardZone {
  id: string
  type: HazardType
  x: number
  z: number
  radius: number
}

export interface HazardDef {
  name: string
  /** Damage per second (0 = no damage, just movement penalty) */
  dps: number
  icon: string
  color: string
  message: string
  /** Speed multiplier while in hazard (1.0 = normal) */
  speedMult?: number
}

// ── Hazard zone definitions ───────────────────────────────────────────────────
// Coordinates chosen to avoid dungeon rooms (typically < ±150 on both axes)
// and settlement areas (0–80 x, 0–80 z range). Volcano peak is near 0,0 high Y.

export const HAZARD_ZONES: HazardZone[] = [
  // ── Lava pools — volcanic area (high elevation x:200-400, z:200-400) ──
  { id: 'lava_1', type: 'lava_pool',    x: 220,  z: 210,  radius: 6 },
  { id: 'lava_2', type: 'lava_pool',    x: 310,  z: 285,  radius: 5 },
  { id: 'lava_3', type: 'lava_pool',    x: 390,  z: 360,  radius: 7 },

  // ── Poison swamps — south-west quadrant (negative coordinates) ──
  { id: 'swamp_1', type: 'poison_swamp', x: -180, z: -140, radius: 12 },
  { id: 'swamp_2', type: 'poison_swamp', x: -260, z: -80,  radius: 10 },
  { id: 'swamp_3', type: 'poison_swamp', x: -130, z: -300, radius: 9  },

  // ── Quicksand — desert area (east, positive x, negative z) ──
  { id: 'sand_1', type: 'quicksand',    x: 350,  z: -220, radius: 14 },
  { id: 'sand_2', type: 'quicksand',    x: 470,  z: -310, radius: 11 },

  // ── Toxic vents — north quadrant ──
  { id: 'vent_1', type: 'toxic_vent',   x: -50,  z: 320,  radius: 8  },
  { id: 'vent_2', type: 'toxic_vent',   x: 110,  z: 410,  radius: 6  },
]

export const HAZARD_DEFS: Record<HazardType, HazardDef> = {
  lava_pool: {
    name: 'Lava Pool',
    dps: 5,
    icon: '🔥',
    color: '#ff4500',
    message: "You're burning in lava!",
  },
  poison_swamp: {
    name: 'Poison Swamp',
    dps: 1.5,
    icon: '☠',
    color: '#7cfc00',
    message: 'Poisoned by swamp gas!',
  },
  quicksand: {
    name: 'Quicksand',
    dps: 0,
    icon: '⚠',
    color: '#d4a017',
    message: "You're sinking in quicksand!",
    speedMult: 0.3,
  },
  toxic_vent: {
    name: 'Toxic Vent',
    dps: 2,
    icon: '💀',
    color: '#9400d3',
    message: 'Toxic fumes are choking you!',
  },
}

/**
 * Returns the first hazard zone that contains position (px, pz), or null.
 * Checks all zones by flat (XZ) distance against each zone's radius.
 */
export function getActiveHazard(px: number, pz: number): HazardZone | null {
  for (const zone of HAZARD_ZONES) {
    const dx = px - zone.x
    const dz = pz - zone.z
    if (dx * dx + dz * dz <= zone.radius * zone.radius) {
      return zone
    }
  }
  return null
}

/**
 * Returns true if the player is currently inside any hazard zone.
 */
export function isInHazard(px: number, pz: number): boolean {
  return getActiveHazard(px, pz) !== null
}

/**
 * Lookup map from zone id → HazardType, for quick type retrieval when a zone
 * has already been identified by id (e.g. on hazard-exit).
 */
export const HAZARD_ZONE_TYPE_BY_ID: Record<string, HazardType> = Object.fromEntries(
  HAZARD_ZONES.map(z => [z.id, z.type])
)
