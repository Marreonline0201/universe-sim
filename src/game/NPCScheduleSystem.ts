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

// ── Legacy M38/M46 exports (used by SettlementRenderer, DialoguePanel, GameLoop) ──

export type NPCActivity = 'working' | 'eating' | 'sleeping' | 'patrolling' | 'socializing'

export interface NPCScheduleEntry {
  startHour: number
  endHour: number
  activity: NPCActivity
  position: [number, number, number]
}

export const SCHEDULES: Record<string, NPCScheduleEntry[]> = {
  guard: [
    { startHour: 6,  endHour: 18, activity: 'patrolling', position: [ 5, 0,  5] },
    { startHour: 18, endHour: 21, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 21, endHour: 24, activity: 'sleeping',   position: [-3, 0, -3] },
    { startHour: 0,  endHour: 6,  activity: 'sleeping',   position: [-3, 0, -3] },
  ],
  trader: [
    { startHour: 8,  endHour: 12, activity: 'working',    position: [ 3, 0,  0] },
    { startHour: 12, endHour: 13, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 13, endHour: 18, activity: 'working',    position: [ 3, 0,  0] },
    { startHour: 18, endHour: 21, activity: 'socializing',position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',   position: [-2, 0,  2] },
    { startHour: 0,  endHour: 8,  activity: 'sleeping',   position: [-2, 0,  2] },
  ],
  villager: [
    { startHour: 7,  endHour: 12, activity: 'working',    position: [ 2, 0,  3] },
    { startHour: 12, endHour: 13, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'working',    position: [ 2, 0,  3] },
    { startHour: 19, endHour: 21, activity: 'socializing',position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',   position: [-2, 0,  1] },
    { startHour: 0,  endHour: 7,  activity: 'sleeping',   position: [-2, 0,  1] },
  ],
  elder: [
    { startHour: 8,  endHour: 12, activity: 'working',    position: [-1, 0,  1] },
    { startHour: 12, endHour: 14, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 14, endHour: 20, activity: 'socializing',position: [ 0, 0,  0] },
    { startHour: 20, endHour: 24, activity: 'sleeping',   position: [-4, 0, -2] },
    { startHour: 0,  endHour: 8,  activity: 'sleeping',   position: [-4, 0, -2] },
  ],
  scout: [
    { startHour: 5,  endHour: 11, activity: 'patrolling', position: [ 6, 0,  0] },
    { startHour: 11, endHour: 13, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'patrolling', position: [ 0, 0,  6] },
    { startHour: 19, endHour: 21, activity: 'socializing',position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',   position: [-3, 0,  3] },
    { startHour: 0,  endHour: 5,  activity: 'sleeping',   position: [-3, 0,  3] },
  ],
  artisan: [
    { startHour: 7,  endHour: 12, activity: 'working',    position: [ 4, 0, -1] },
    { startHour: 12, endHour: 13, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 13, endHour: 18, activity: 'working',    position: [ 4, 0, -1] },
    { startHour: 18, endHour: 20, activity: 'socializing',position: [ 0, 0,  0] },
    { startHour: 20, endHour: 24, activity: 'sleeping',   position: [-1, 0,  3] },
    { startHour: 0,  endHour: 7,  activity: 'sleeping',   position: [-1, 0,  3] },
  ],
  healer: [
    { startHour: 7,  endHour: 12, activity: 'working',    position: [ 2, 0, -2] },
    { startHour: 12, endHour: 13, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'working',    position: [ 2, 0, -2] },
    { startHour: 19, endHour: 22, activity: 'socializing',position: [ 0, 0,  0] },
    { startHour: 22, endHour: 24, activity: 'sleeping',   position: [-3, 0, -1] },
    { startHour: 0,  endHour: 7,  activity: 'sleeping',   position: [-3, 0, -1] },
  ],
  blacksmith: [
    { startHour: 6,  endHour: 12, activity: 'working',    position: [-3, 0, -2] },
    { startHour: 12, endHour: 13, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 13, endHour: 19, activity: 'working',    position: [-3, 0, -2] },
    { startHour: 19, endHour: 21, activity: 'socializing',position: [ 0, 0,  0] },
    { startHour: 21, endHour: 24, activity: 'sleeping',   position: [-1, 0,  4] },
    { startHour: 0,  endHour: 6,  activity: 'sleeping',   position: [-1, 0,  4] },
  ],
  scholar: [
    { startHour: 9,  endHour: 13, activity: 'working',    position: [ 1, 0, -3] },
    { startHour: 13, endHour: 14, activity: 'eating',     position: [ 0, 0,  2] },
    { startHour: 14, endHour: 21, activity: 'working',    position: [ 1, 0, -3] },
    { startHour: 21, endHour: 24, activity: 'sleeping',   position: [ 2, 0,  4] },
    { startHour: 0,  endHour: 9,  activity: 'sleeping',   position: [ 2, 0,  4] },
  ],
}

export function getInGameHour(dayAngle: number): number {
  const normalized = ((dayAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return (normalized / (2 * Math.PI)) * 24
}

export function getCurrentActivity(role: string, dayAngle: number): NPCScheduleEntry {
  const hour = getInGameHour(dayAngle)
  const key = role.trim().toLowerCase()
  const schedule = SCHEDULES[key] ?? SCHEDULES.villager
  for (const entry of schedule) {
    if (entry.startHour < entry.endHour) {
      if (hour >= entry.startHour && hour < entry.endHour) return entry
    } else {
      if (hour >= entry.startHour || hour < entry.endHour) return entry
    }
  }
  return schedule[0]
}

export function isNighttime(dayAngle: number): boolean {
  const hour = getInGameHour(dayAngle)
  return hour >= 21 || hour < 6
}

export type NpcSchedule = Record<TimeOfDay, { location: string; activity: string }>

export const NPC_ROLE_SCHEDULES: Record<string, NpcSchedule> = {
  villager: { dawn: { location: 'home', activity: 'waking up' }, morning: { location: 'the fields', activity: 'working fields' }, afternoon: { location: 'marketplace', activity: 'visiting the marketplace' }, evening: { location: 'the tavern', activity: 'relaxing at the tavern' }, night: { location: 'home', activity: 'sleeping' } },
  guard:    { dawn: { location: 'the gate', activity: 'on duty at the gate' }, morning: { location: 'on patrol', activity: 'patrolling the settlement' }, afternoon: { location: 'the wall', activity: 'watching from the wall' }, evening: { location: 'on patrol', activity: 'evening patrol' }, night: { location: 'the gate', activity: 'guarding the gate' } },
  trader:   { dawn: { location: 'the storeroom', activity: 'restocking goods' }, morning: { location: 'the stall', activity: 'open for business' }, afternoon: { location: 'the stall', activity: 'open for business' }, evening: { location: 'the stall', activity: 'closing up for the day' }, night: { location: 'home', activity: 'sleeping' } },
  healer:   { dawn: { location: 'the herb garden', activity: 'tending the herb garden' }, morning: { location: 'the clinic', activity: 'seeing patients' }, afternoon: { location: 'the clinic', activity: 'tending to the sick' }, evening: { location: 'the ward', activity: 'doing evening rounds' }, night: { location: 'quarters', activity: 'resting' } },
  blacksmith: { dawn: { location: 'the forge', activity: 'stoking the forge' }, morning: { location: 'the forge', activity: 'forging metalwork' }, afternoon: { location: 'the forge', activity: 'forging metalwork' }, evening: { location: 'the smithy', activity: 'cleaning up the smithy' }, night: { location: 'home', activity: 'sleeping' } },
  scholar:  { dawn: { location: 'the study', activity: 'studying before dawn' }, morning: { location: 'the library', activity: 'researching in the library' }, afternoon: { location: 'the hall', activity: 'teaching students' }, evening: { location: 'the study', activity: 'writing notes' }, night: { location: 'the study', activity: 'studying late into the night' } },
  elder:    { dawn: { location: 'council hall', activity: 'in quiet reflection' }, morning: { location: 'council hall', activity: 'receiving petitioners' }, afternoon: { location: 'council hall', activity: 'holding council' }, evening: { location: 'council hall', activity: 'reviewing settlement matters' }, night: { location: 'council hall', activity: 'in late deliberation' } },
  scout:    { dawn: { location: 'the gate', activity: 'preparing gear for the day' }, morning: { location: 'the wilds', activity: 'scouting the perimeter' }, afternoon: { location: 'the wilds', activity: 'ranging further afield' }, evening: { location: 'the barracks', activity: 'filing a report' }, night: { location: 'home', activity: 'sleeping' } },
  artisan:  { dawn: { location: 'the workshop', activity: 'preparing the workshop' }, morning: { location: 'the workshop', activity: 'crafting goods' }, afternoon: { location: 'the workshop', activity: 'crafting goods' }, evening: { location: 'the stall', activity: 'selling wares at the market' }, night: { location: 'home', activity: 'sleeping' } },
  smith:    { dawn: { location: 'the forge', activity: 'stoking the forge' }, morning: { location: 'the forge', activity: 'forging metalwork' }, afternoon: { location: 'the forge', activity: 'forging metalwork' }, evening: { location: 'the smithy', activity: 'cleaning up the smithy' }, night: { location: 'home', activity: 'sleeping' } },
}

export function getNpcActivity(role: string, gameHour: number): { location: string; activity: string } {
  const tod = getTimeOfDay(gameHour)
  const key = role.trim().toLowerCase()
  const schedule = NPC_ROLE_SCHEDULES[key] ?? NPC_ROLE_SCHEDULES.villager
  return schedule[tod]
}

export function getNpcScheduleDesc(role: string, gameHour: number): string {
  const { activity, location } = getNpcActivity(role, gameHour)
  return `Currently: ${activity} at ${location}`
}

export function getActivityDescription(activity: NPCActivity, npcName: string, role: string): string {
  const key = role.trim().toLowerCase()
  switch (activity) {
    case 'working':
      if (key === 'blacksmith' || key === 'smith') return `${npcName} is working at the forge.`
      if (key === 'trader') return `${npcName} is working at their stall.`
      if (key === 'healer') return `${npcName} is tending to the sick.`
      if (key === 'scholar') return `${npcName} is studying in the library.`
      return `${npcName} is busy working.`
    case 'eating': return `${npcName} is on a meal break.`
    case 'sleeping': return `${npcName} is asleep.`
    case 'patrolling': return `${npcName} is on patrol.`
    case 'socializing': return `${npcName} is relaxing in the town square.`
    default: return `${npcName} is occupied.`
  }
}

// ── NPC Name Generation (M38 compatibility) ───────────────────────────────────
// Seeded by (settlementId, roleIndex) so names are consistent across sessions.

const FIRST_NAMES = [
  'Aldric', 'Bren', 'Cara', 'Dov', 'Ela', 'Fern', 'Gard', 'Hana',
  'Ivo', 'Jana', 'Kel', 'Lyra', 'Mira', 'Ned', 'Ora', 'Penn',
  'Quin', 'Reva', 'Sel', 'Tara', 'Ulf', 'Vera', 'Wynn', 'Xan',
  'Yold', 'Zara', 'Ash', 'Brin', 'Cael', 'Dara',
]

const ROLE_TITLES: Record<string, string> = {
  guard: 'Guard', trader: 'Merchant', elder: 'Elder', villager: 'Villager',
  scout: 'Scout', artisan: 'Artisan', healer: 'Healer', blacksmith: 'Smith',
  smith: 'Smith', scholar: 'Scholar', librarian: 'Scholar', captain: 'Captain',
  'guard captain': 'Captain',
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

export function getNPCName(settlementId: number, role: string, roleIndex: number): string {
  const seed = settlementId * 97 + roleIndex * 31 + role.length * 13
  const nameIdx = Math.floor(seededRandom(seed) * FIRST_NAMES.length)
  const firstName = FIRST_NAMES[nameIdx]
  const key = role.trim().toLowerCase()
  const title = ROLE_TITLES[key] ?? 'Traveler'
  return `${title} ${firstName}`
}
