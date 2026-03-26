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

// ── M46 Track A: NPC Schedules and Daily Routines ──────────────────────────────

export type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'

/**
 * Map an in-game hour (0–24) to a named time of day.
 * dawn: 5–7, morning: 7–12, afternoon: 12–17, evening: 17–21, night: 21–5
 */
export function getTimeOfDay(gameHour: number): TimeOfDay {
  if (gameHour >= 5  && gameHour < 7)  return 'dawn'
  if (gameHour >= 7  && gameHour < 12) return 'morning'
  if (gameHour >= 12 && gameHour < 17) return 'afternoon'
  if (gameHour >= 17 && gameHour < 21) return 'evening'
  return 'night'
}

export type NpcSchedule = Record<TimeOfDay, { location: string; activity: string }>

export const NPC_ROLE_SCHEDULES: Record<string, NpcSchedule> = {
  villager: {
    dawn:      { location: 'home',        activity: 'waking up' },
    morning:   { location: 'the fields',  activity: 'working fields' },
    afternoon: { location: 'marketplace', activity: 'visiting the marketplace' },
    evening:   { location: 'the tavern',  activity: 'relaxing at the tavern' },
    night:     { location: 'home',        activity: 'sleeping' },
  },
  guard: {
    dawn:      { location: 'the gate',    activity: 'on duty at the gate' },
    morning:   { location: 'on patrol',   activity: 'patrolling the settlement' },
    afternoon: { location: 'the wall',    activity: 'watching from the wall' },
    evening:   { location: 'on patrol',   activity: 'evening patrol' },
    night:     { location: 'the gate',    activity: 'guarding the gate' },
  },
  trader: {
    dawn:      { location: 'the storeroom', activity: 'restocking goods' },
    morning:   { location: 'the stall',     activity: 'open for business' },
    afternoon: { location: 'the stall',     activity: 'open for business' },
    evening:   { location: 'the stall',     activity: 'closing up for the day' },
    night:     { location: 'home',          activity: 'sleeping' },
  },
  healer: {
    dawn:      { location: 'the herb garden', activity: 'tending the herb garden' },
    morning:   { location: 'the clinic',      activity: 'seeing patients' },
    afternoon: { location: 'the clinic',      activity: 'tending to the sick' },
    evening:   { location: 'the ward',        activity: 'doing evening rounds' },
    night:     { location: 'quarters',        activity: 'resting' },
  },
  blacksmith: {
    dawn:      { location: 'the forge',    activity: 'stoking the forge' },
    morning:   { location: 'the forge',    activity: 'forging metalwork' },
    afternoon: { location: 'the forge',    activity: 'forging metalwork' },
    evening:   { location: 'the smithy',   activity: 'cleaning up the smithy' },
    night:     { location: 'home',         activity: 'sleeping' },
  },
  scholar: {
    dawn:      { location: 'the study',   activity: 'studying before dawn' },
    morning:   { location: 'the library', activity: 'researching in the library' },
    afternoon: { location: 'the hall',    activity: 'teaching students' },
    evening:   { location: 'the study',   activity: 'writing notes' },
    night:     { location: 'the study',   activity: 'studying late into the night' },
  },
  elder: {
    dawn:      { location: 'council hall', activity: 'in quiet reflection' },
    morning:   { location: 'council hall', activity: 'receiving petitioners' },
    afternoon: { location: 'council hall', activity: 'holding council' },
    evening:   { location: 'council hall', activity: 'reviewing settlement matters' },
    night:     { location: 'council hall', activity: 'in late deliberation' },
  },
  scout: {
    dawn:      { location: 'the gate',      activity: 'preparing gear for the day' },
    morning:   { location: 'the wilds',     activity: 'scouting the perimeter' },
    afternoon: { location: 'the wilds',     activity: 'ranging further afield' },
    evening:   { location: 'the barracks',  activity: 'filing a report' },
    night:     { location: 'home',          activity: 'sleeping' },
  },
  artisan: {
    dawn:      { location: 'the workshop',  activity: 'preparing the workshop' },
    morning:   { location: 'the workshop',  activity: 'crafting goods' },
    afternoon: { location: 'the workshop',  activity: 'crafting goods' },
    evening:   { location: 'the stall',     activity: 'selling wares at the market' },
    night:     { location: 'home',          activity: 'sleeping' },
  },
  smith: {
    dawn:      { location: 'the forge',     activity: 'stoking the forge' },
    morning:   { location: 'the forge',     activity: 'forging metalwork' },
    afternoon: { location: 'the forge',     activity: 'forging metalwork' },
    evening:   { location: 'the smithy',    activity: 'cleaning up the smithy' },
    night:     { location: 'home',          activity: 'sleeping' },
  },
}

const DEFAULT_NPC_SCHEDULE: NpcSchedule = NPC_ROLE_SCHEDULES.villager

/**
 * Get the location and activity for an NPC role at a given in-game hour.
 */
export function getNpcActivity(role: string, gameHour: number): { location: string; activity: string } {
  const tod = getTimeOfDay(gameHour)
  const key = role.trim().toLowerCase()
  const schedule = NPC_ROLE_SCHEDULES[key] ?? DEFAULT_NPC_SCHEDULE
  return schedule[tod]
}

/**
 * Returns a human-readable schedule hint, e.g. "Currently: working fields at the marketplace"
 */
export function getNpcScheduleDesc(role: string, gameHour: number): string {
  const { activity, location } = getNpcActivity(role, gameHour)
  return `Currently: ${activity} at ${location}`
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
    default:
      return `${npcName} is occupied.`
  }
}
