// ── NPCScheduleSystem.ts ──────────────────────────────────────────────────────
// M38 Track A: NPC daily schedules and routines.
//
// Each NPC role has a daily schedule defining where they are at each in-game hour.
// In-game time: dayAngle 0→2π maps to 0→24 hours (full day cycle of 1200 real-seconds).
// dayAngle starts near π*0.6 (~mid-morning). sin(dayAngle)=+1 is noon, sin=-1 is midnight.
//
// Hour mapping:
//   angle = 0      → hour 0  (midnight)
//   angle = π/2    → hour 6  (dawn)  — sin = 1 is actually noon so:
//   We map: hour = (dayAngle / (2π)) * 24
//   START_ANGLE = π*0.6 ≈ 1.885 → hour ≈ 7.2 (morning)

export type NPCActivity =
  | 'working'       // At job station (blacksmith/merchant stall/guard post)
  | 'eating'        // At tavern/fire (midday break)
  | 'sleeping'      // In home building (nighttime)
  | 'patrolling'    // Guard NPCs walk perimeter
  | 'socializing'   // Gathered in town square (evening)

export interface NPCScheduleEntry {
  startHour: number             // 0-24 in-game hour
  endHour: number
  activity: NPCActivity
  position: [number, number, number]  // world offset from settlement center
}

// NPC role → schedule template
export const SCHEDULES: Record<string, NPCScheduleEntry[]> = {
  guard: [
    { startHour: 6,  endHour: 18, activity: 'patrolling',   position: [ 5, 0,  5] },
    { startHour: 18, endHour: 21, activity: 'eating',        position: [ 0, 0,  2] },
    { startHour: 21, endHour: 24, activity: 'sleeping',      position: [-3, 0, -3] },
    { startHour: 0,  endHour: 6,  activity: 'sleeping',      position: [-3, 0, -3] },
  ],
  trader: [
    { startHour: 8,  endHour: 12, activity: 'working',       position: [ 3, 0,  0] },
    { startHour: 12, endHour: 13, activity: 'eating',         position: [ 0, 0,  2] },
    { startHour: 13, endHour: 18, activity: 'working',        position: [ 3, 0,  0] },
    { startHour: 18, endHour: 21, activity: 'socializing',    position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',       position: [-2, 0,  2] },
    { startHour: 0,  endHour: 8,  activity: 'sleeping',       position: [-2, 0,  2] },
  ],
  villager: [
    { startHour: 7,  endHour: 12, activity: 'working',        position: [ 2, 0,  3] },
    { startHour: 12, endHour: 13, activity: 'eating',          position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'working',         position: [ 2, 0,  3] },
    { startHour: 19, endHour: 21, activity: 'socializing',     position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',        position: [-2, 0,  1] },
    { startHour: 0,  endHour: 7,  activity: 'sleeping',        position: [-2, 0,  1] },
  ],
  elder: [
    { startHour: 8,  endHour: 12, activity: 'working',        position: [-1, 0,  1] },
    { startHour: 12, endHour: 14, activity: 'eating',          position: [ 0, 0,  2] },
    { startHour: 14, endHour: 20, activity: 'socializing',     position: [ 0, 0,  0] },
    { startHour: 20, endHour: 24, activity: 'sleeping',        position: [-4, 0, -2] },
    { startHour: 0,  endHour: 8,  activity: 'sleeping',        position: [-4, 0, -2] },
  ],
  scout: [
    { startHour: 5,  endHour: 11, activity: 'patrolling',     position: [ 6, 0,  0] },
    { startHour: 11, endHour: 13, activity: 'eating',          position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'patrolling',      position: [ 0, 0,  6] },
    { startHour: 19, endHour: 21, activity: 'socializing',     position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',        position: [-3, 0,  3] },
    { startHour: 0,  endHour: 5,  activity: 'sleeping',        position: [-3, 0,  3] },
  ],
  artisan: [
    { startHour: 7,  endHour: 12, activity: 'working',        position: [ 4, 0, -1] },
    { startHour: 12, endHour: 13, activity: 'eating',          position: [ 0, 0,  2] },
    { startHour: 13, endHour: 18, activity: 'working',         position: [ 4, 0, -1] },
    { startHour: 18, endHour: 20, activity: 'socializing',     position: [ 0, 0,  0] },
    { startHour: 20, endHour: 24, activity: 'sleeping',        position: [-1, 0,  3] },
    { startHour: 0,  endHour: 7,  activity: 'sleeping',        position: [-1, 0,  3] },
  ],
  healer: [
    { startHour: 7,  endHour: 12, activity: 'working',        position: [ 2, 0, -2] },
    { startHour: 12, endHour: 13, activity: 'eating',          position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'working',         position: [ 2, 0, -2] },
    { startHour: 19, endHour: 22, activity: 'socializing',     position: [ 0, 0,  0] },
    { startHour: 22, endHour: 24, activity: 'sleeping',        position: [-3, 0, -1] },
    { startHour: 0,  endHour: 7,  activity: 'sleeping',        position: [-3, 0, -1] },
  ],
  blacksmith: [
    { startHour: 6,  endHour: 12, activity: 'working',        position: [-3, 0, -2] },
    { startHour: 12, endHour: 13, activity: 'eating',          position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'working',         position: [-3, 0, -2] },
    { startHour: 19, endHour: 21, activity: 'socializing',     position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',        position: [-1, 0,  4] },
    { startHour: 0,  endHour: 6,  activity: 'sleeping',        position: [-1, 0,  4] },
  ],
  scholar: [
    { startHour: 9,  endHour: 13, activity: 'working',        position: [ 1, 0, -3] },
    { startHour: 13, endHour: 14, activity: 'eating',          position: [ 0, 0,  2] },
    { startHour: 14, endHour: 21, activity: 'working',         position: [ 1, 0, -3] },
    { startHour: 21, endHour: 24, activity: 'sleeping',        position: [ 2, 0,  4] },
    { startHour: 0,  endHour: 9,  activity: 'sleeping',        position: [ 2, 0,  4] },
  ],
}

// Fallback schedule for unknown roles
const DEFAULT_SCHEDULE: NPCScheduleEntry[] = SCHEDULES.villager

/**
 * Convert dayAngle (0–2π) to in-game hour (0–24).
 * dayAngle=0 is midnight (hour 0), dayAngle=π is noon (hour 12).
 */
export function getInGameHour(dayAngle: number): number {
  const normalized = ((dayAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return (normalized / (2 * Math.PI)) * 24
}

/**
 * Get the current schedule entry for an NPC role at a given dayAngle.
 */
export function getCurrentActivity(role: string, dayAngle: number): NPCScheduleEntry {
  const hour = getInGameHour(dayAngle)
  const key = role.trim().toLowerCase()
  const schedule = SCHEDULES[key] ?? DEFAULT_SCHEDULE

  for (const entry of schedule) {
    if (entry.startHour < entry.endHour) {
      if (hour >= entry.startHour && hour < entry.endHour) return entry
    } else {
      // Wraps midnight (e.g. startHour=22, endHour=6)
      if (hour >= entry.startHour || hour < entry.endHour) return entry
    }
  }

  // Fallback to first entry
  return schedule[0]
}

/**
 * Return true if the given hour is "nighttime" for sleeping.
 */
export function isNighttime(dayAngle: number): boolean {
  const hour = getInGameHour(dayAngle)
  return hour >= 21 || hour < 6
}

// ── NPC Name Generation ────────────────────────────────────────────────────────
// Seeded by (settlementId, roleIndex) so names are consistent across sessions.

const FIRST_NAMES = [
  'Aldric', 'Bren', 'Cara', 'Dov', 'Ela', 'Fern', 'Gard', 'Hana',
  'Ivo', 'Jana', 'Kel', 'Lyra', 'Mira', 'Ned', 'Ora', 'Penn',
  'Quin', 'Reva', 'Sel', 'Tara', 'Ulf', 'Vera', 'Wynn', 'Xan',
  'Yold', 'Zara', 'Ash', 'Brin', 'Cael', 'Dara',
]

const ROLE_TITLES: Record<string, string> = {
  guard:      'Guard',
  trader:     'Merchant',
  elder:      'Elder',
  villager:   'Villager',
  scout:      'Scout',
  artisan:    'Artisan',
  healer:     'Healer',
  blacksmith: 'Smith',
  smith:      'Smith',
  scholar:    'Scholar',
  librarian:  'Scholar',
  captain:    'Captain',
  'guard captain': 'Captain',
}

/** Simple seeded random — deterministic from seed */
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

/**
 * Returns a consistent NPC name for a given settlement + role index.
 * e.g. getNPCName(3, 'guard', 0) → "Guard Aldric"
 */
export function getNPCName(settlementId: number, role: string, roleIndex: number): string {
  const seed = settlementId * 97 + roleIndex * 31 + role.length * 13
  const nameIdx = Math.floor(seededRandom(seed) * FIRST_NAMES.length)
  const firstName = FIRST_NAMES[nameIdx]
  const key = role.trim().toLowerCase()
  const title = ROLE_TITLES[key] ?? 'Traveler'
  return `${title} ${firstName}`
}

/**
 * Get a human-readable description of the current NPC activity.
 */
export function getActivityDescription(activity: NPCActivity, npcName: string, role: string): string {
  const key = role.trim().toLowerCase()
  switch (activity) {
    case 'working':
      if (key === 'blacksmith' || key === 'smith') return `${npcName} is working at the forge.`
      if (key === 'trader' || key === 'merchant') return `${npcName} is working at their stall.`
      if (key === 'healer') return `${npcName} is tending to the sick.`
      if (key === 'scholar' || key === 'librarian') return `${npcName} is studying in the library.`
      return `${npcName} is busy working.`
    case 'eating':
      return `${npcName} is on a meal break.`
    case 'sleeping':
      return `${npcName} is asleep.`
    case 'patrolling':
      return `${npcName} is on patrol.`
    case 'socializing':
      return `${npcName} is relaxing in the town square.`
  }
}
