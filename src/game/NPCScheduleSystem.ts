// -- NPCScheduleSystem.ts
// M68 Track B: NPC Daily Schedule System
// NPCs follow routines throughout the day (morning market, afternoon work,
// evening tavern), making the world feel alive.

export const DAY_DURATION = 240

export type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'

export function getTimeOfDay(simSeconds: number): TimeOfDay {
  const t = simSeconds % DAY_DURATION
  if (t < 24) return 'dawn'
  if (t < 96) return 'morning'
  if (t < 144) return 'afternoon'
  if (t < 192) return 'evening'
  return 'night'
}

export function getDayProgressFromSim(simSeconds: number): number {
  return (simSeconds % DAY_DURATION) / DAY_DURATION
}

export const SCHEDULED_NPCS = [
  { id: 'elara', name: 'Elara', icon: '🧙‍♀️', role: 'Mage' },
  { id: 'gruff', name: 'Gruff', icon: '⚒️',  role: 'Blacksmith' },
  { id: 'varek', name: 'Varek', icon: '⚔️',  role: 'Guard' },
  { id: 'mira',  name: 'Mira',  icon: '🌿',  role: 'Herbalist' },
  { id: 'zara',  name: 'Zara',  icon: '🎭',  role: 'Merchant' },
] as const

export interface ScheduleEntry {
  timeOfDay: TimeOfDay
  location: string
  activity: string
  icon: string
  mood: string
}

type NPCId = typeof SCHEDULED_NPCS[number]['id']

const NPC_SCHEDULES: Record<NPCId, Record<TimeOfDay, ScheduleEntry>> = {
  elara: {
    dawn:      { timeOfDay: 'dawn',      location: 'Home',        activity: 'Resting quietly',            icon: '🏠', mood: 'peaceful' },
    morning:   { timeOfDay: 'morning',   location: 'Library',     activity: 'Studying ancient texts',     icon: '📚', mood: 'focused' },
    afternoon: { timeOfDay: 'afternoon', location: 'Alchemy Lab', activity: 'Brewing potions',            icon: '🧪', mood: 'absorbed' },
    evening:   { timeOfDay: 'evening',   location: 'Tower',       activity: 'Meditating under stars',     icon: '🌟', mood: 'serene' },
    night:     { timeOfDay: 'night',     location: 'Bedroom',     activity: 'Sleeping',                   icon: '💤', mood: 'tired' },
  },
  gruff: {
    dawn:      { timeOfDay: 'dawn',      location: 'Forge',           activity: 'Lighting the forge',         icon: '🔥', mood: 'grumpy' },
    morning:   { timeOfDay: 'morning',   location: 'Blacksmith Shop', activity: 'Forging weapons',             icon: '⚒️', mood: 'industrious' },
    afternoon: { timeOfDay: 'afternoon', location: 'Blacksmith Shop', activity: 'Taking orders',               icon: '⚒️', mood: 'busy' },
    evening:   { timeOfDay: 'evening',   location: 'Tavern',          activity: 'Drinking with miners',        icon: '🍺', mood: 'relaxed' },
    night:     { timeOfDay: 'night',     location: 'Home',            activity: 'Resting weary bones',         icon: '🏠', mood: 'exhausted' },
  },
  varek: {
    dawn:      { timeOfDay: 'dawn',      location: 'Watchtower',  activity: 'Patrolling the walls',       icon: '🗼', mood: 'vigilant' },
    morning:   { timeOfDay: 'morning',   location: 'Barracks',    activity: 'Training recruits',          icon: '⚔️', mood: 'stern' },
    afternoon: { timeOfDay: 'afternoon', location: 'Town Square', activity: 'Guarding the market',        icon: '🏘️', mood: 'alert' },
    evening:   { timeOfDay: 'evening',   location: 'Barracks',    activity: 'Maintaining gear',           icon: '⚔️', mood: 'methodical' },
    night:     { timeOfDay: 'night',     location: 'Watchtower',  activity: 'Night watch',                icon: '🗼', mood: 'weary' },
  },
  mira: {
    dawn:      { timeOfDay: 'dawn',      location: 'Meadow',       activity: 'Gathering morning herbs',   icon: '🌿', mood: 'content' },
    morning:   { timeOfDay: 'morning',   location: 'Herb Garden',  activity: 'Tending the garden',        icon: '🌿', mood: 'cheerful' },
    afternoon: { timeOfDay: 'afternoon', location: "Healer's Hut", activity: 'Treating patients',         icon: '🏥', mood: 'compassionate' },
    evening:   { timeOfDay: 'evening',   location: 'Greenhouse',   activity: 'Sorting dried herbs',       icon: '🌿', mood: 'tired' },
    night:     { timeOfDay: 'night',     location: 'Cottage',      activity: 'Resting peacefully',        icon: '🏠', mood: 'restful' },
  },
  zara: {
    dawn:      { timeOfDay: 'dawn',      location: 'Warehouse', activity: 'Restocking inventory',         icon: '📦', mood: 'hurried' },
    morning:   { timeOfDay: 'morning',   location: 'Market',    activity: 'Running the market stall',     icon: '🏪', mood: 'energetic' },
    afternoon: { timeOfDay: 'afternoon', location: 'Market',    activity: 'Negotiating bulk deals',       icon: '🏪', mood: 'shrewd' },
    evening:   { timeOfDay: 'evening',   location: 'Inn',       activity: 'Reviewing trade ledgers',      icon: '📋', mood: 'calculating' },
    night:     { timeOfDay: 'night',     location: 'Inn Room',  activity: 'Sleeping soundly',             icon: '🏠', mood: 'satisfied' },
  },
}

export interface ScheduleSaveData {
  lastSimSeconds: number
}

let _initialized = false
let _lastSimSeconds = 0
const _lastTimeOfDay = new Map<string, TimeOfDay>()

export function initNPCScheduleSystem(): void {
  if (_initialized) return
  _initialized = true
  _lastSimSeconds = 0
  _lastTimeOfDay.clear()
}

export function getCurrentTimeOfDay(): TimeOfDay {
  return getTimeOfDay(_lastSimSeconds)
}

export function getDayProgress(): number {
  return getDayProgressFromSim(_lastSimSeconds)
}

export function getNPCCurrentActivity(npcId: string): ScheduleEntry | null {
  const schedule = NPC_SCHEDULES[npcId as NPCId]
  if (!schedule) return null
  return schedule[getTimeOfDay(_lastSimSeconds)]
}

export function getAllNPCActivities(): Array<{ npc: typeof SCHEDULED_NPCS[number]; current: ScheduleEntry }> {
  const tod = getTimeOfDay(_lastSimSeconds)
  return SCHEDULED_NPCS.map(npc => ({
    npc,
    current: NPC_SCHEDULES[npc.id as NPCId][tod],
  }))
}

export function getNPCFullSchedule(npcId: string): Array<{ timeOfDay: TimeOfDay; entry: ScheduleEntry }> {
  const schedule = NPC_SCHEDULES[npcId as NPCId]
  if (!schedule) return []
  const times: TimeOfDay[] = ['dawn', 'morning', 'afternoon', 'evening', 'night']
  return times.map(tod => ({ timeOfDay: tod, entry: schedule[tod] }))
}

export function tickSchedule(simSeconds: number): void {
  _lastSimSeconds = simSeconds
  const tod = getTimeOfDay(simSeconds)
  for (const npc of SCHEDULED_NPCS) {
    const prev = _lastTimeOfDay.get(npc.id)
    if (prev !== tod) {
      _lastTimeOfDay.set(npc.id, tod)
      const entry = NPC_SCHEDULES[npc.id as NPCId][tod]
      window.dispatchEvent(new CustomEvent('npc-schedule-changed', {
        detail: { npcId: npc.id, timeOfDay: tod, entry },
      }))
    }
  }
}

export function serializeSchedule(): ScheduleSaveData {
  return { lastSimSeconds: _lastSimSeconds }
}

export function deserializeSchedule(data: ScheduleSaveData): void {
  if (data && typeof data.lastSimSeconds === 'number') {
    _lastSimSeconds = data.lastSimSeconds
  }
  _initialized = true
}
