// ── DungeonDelveSystem ─────────────────────────────────────────────────────
// M61 Track C: Dungeon Delve Tracker
// Manages "delve runs" — timed sessions descending into procedural dungeons
// with escalating difficulty and rewards. Cooldowns use Date.now() (real time).

export interface DungeonDefinition {
  id: string
  name: string
  icon: string
  description: string
  minDepth: number    // floors
  maxDepth: number
  baseReward: { gold: number; xp: number }
  difficulty: 'normal' | 'hard' | 'extreme'
  cooldownMinutes: number
}

export interface ActiveDelve {
  dungeonId: string
  startedAt: number
  currentFloor: number
  maxFloor: number
  status: 'active'
  lootCollected: { gold: number; xp: number }
}

export interface CompletedDelve {
  dungeonId: string
  dungeonName: string
  floorsCleared: number
  maxFloor: number
  goldEarned: number
  xpEarned: number
  completedAt: number
  status: 'completed' | 'abandoned'
}

// ── Dungeon definitions ────────────────────────────────────────────────────

export const DUNGEON_DEFINITIONS: DungeonDefinition[] = [
  {
    id: 'crystal_caves',
    name: 'Crystal Caves',
    icon: '💎',
    description: 'Shimmering caverns filled with mineral deposits and crystalline creatures.',
    minDepth: 3,
    maxDepth: 5,
    baseReward: { gold: 80, xp: 120 },
    difficulty: 'normal',
    cooldownMinutes: 15,
  },
  {
    id: 'ruined_tower',
    name: 'Ruined Tower',
    icon: '🏰',
    description: 'A crumbling wizard\'s spire haunted by arcane constructs and rogue golems.',
    minDepth: 5,
    maxDepth: 8,
    baseReward: { gold: 160, xp: 240 },
    difficulty: 'hard',
    cooldownMinutes: 30,
  },
  {
    id: 'undead_crypt',
    name: 'Undead Crypt',
    icon: '💀',
    description: 'Ancient burial chambers teeming with restless undead and cursed relics.',
    minDepth: 4,
    maxDepth: 7,
    baseReward: { gold: 140, xp: 200 },
    difficulty: 'hard',
    cooldownMinutes: 25,
  },
  {
    id: 'fire_mountain',
    name: 'Fire Mountain',
    icon: '🌋',
    description: 'A volcanic caldera where fire elementals and molten behemoths dwell.',
    minDepth: 6,
    maxDepth: 10,
    baseReward: { gold: 300, xp: 450 },
    difficulty: 'extreme',
    cooldownMinutes: 60,
  },
  {
    id: 'void_rift',
    name: 'Void Rift',
    icon: '🕳️',
    description: 'A tear in reality where dimensional horrors and cosmic abominations lurk.',
    minDepth: 8,
    maxDepth: 15,
    baseReward: { gold: 500, xp: 800 },
    difficulty: 'extreme',
    cooldownMinutes: 90,
  },
]

// ── Module state ───────────────────────────────────────────────────────────

let _initialized = false
let _activeDelve: ActiveDelve | null = null
const _delveHistory: CompletedDelve[] = []
const _cooldowns = new Map<string, number>() // dungeonId -> last completion timestamp

// ── Helpers ────────────────────────────────────────────────────────────────

function getDungeon(id: string): DungeonDefinition | undefined {
  return DUNGEON_DEFINITIONS.find(d => d.id === id)
}

function randomFloorCount(def: DungeonDefinition): number {
  return def.minDepth + Math.floor(Math.random() * (def.maxDepth - def.minDepth + 1))
}

/** Gold loot for a specific floor (scales with floor number) */
function floorGold(def: DungeonDefinition, floor: number): number {
  const perFloor = Math.round(def.baseReward.gold / def.minDepth)
  const multiplier = 1 + (floor - 1) * 0.15
  return Math.round(perFloor * multiplier)
}

// ── Public API ─────────────────────────────────────────────────────────────

export function initDungeonDelveSystem(): void {
  if (_initialized) return
  _initialized = true
}

export function startDelve(dungeonId: string): boolean {
  if (_activeDelve) return false
  if (!canStartDelve(dungeonId)) return false

  const def = getDungeon(dungeonId)
  if (!def) return false

  const maxFloor = randomFloorCount(def)
  _activeDelve = {
    dungeonId,
    startedAt: Date.now(),
    currentFloor: 1,
    maxFloor,
    status: 'active',
    lootCollected: { gold: 0, xp: 0 },
  }

  window.dispatchEvent(new CustomEvent('delve-started', { detail: { dungeonId, maxFloor } }))
  return true
}

export function advanceFloor(): boolean {
  if (!_activeDelve) return false

  const def = getDungeon(_activeDelve.dungeonId)
  if (!def) return false

  // Collect floor loot
  const goldGain = floorGold(def, _activeDelve.currentFloor)
  _activeDelve.lootCollected.gold += goldGain

  window.dispatchEvent(new CustomEvent('delve-floor-cleared', {
    detail: {
      floor: _activeDelve.currentFloor,
      goldGained: goldGain,
      totalGold: _activeDelve.lootCollected.gold,
    },
  }))

  if (_activeDelve.currentFloor >= _activeDelve.maxFloor) {
    completeDelve()
  } else {
    _activeDelve.currentFloor++
  }

  return true
}

export function completeDelve(): void {
  if (!_activeDelve) return

  const def = getDungeon(_activeDelve.dungeonId)
  if (!def) return

  const floorsCleared = _activeDelve.currentFloor
  const floorRatio = floorsCleared / _activeDelve.maxFloor

  // XP scales with floors cleared / max floor
  const xpEarned = Math.round(def.baseReward.xp * floorRatio)
  const goldEarned = _activeDelve.lootCollected.gold

  // Apply rewards via game store events
  window.dispatchEvent(new CustomEvent('delve-reward', { detail: { gold: goldEarned, xp: xpEarned } }))

  const record: CompletedDelve = {
    dungeonId: _activeDelve.dungeonId,
    dungeonName: def.name,
    floorsCleared,
    maxFloor: _activeDelve.maxFloor,
    goldEarned,
    xpEarned,
    completedAt: Date.now(),
    status: 'completed',
  }

  _delveHistory.unshift(record)
  if (_delveHistory.length > 20) _delveHistory.splice(20)

  _cooldowns.set(_activeDelve.dungeonId, Date.now())
  _activeDelve = null

  window.dispatchEvent(new CustomEvent('delve-completed', { detail: record }))
}

export function abandonDelve(): boolean {
  if (!_activeDelve) return false

  const dungeonId = _activeDelve.dungeonId
  const def = getDungeon(dungeonId)

  const record: CompletedDelve = {
    dungeonId,
    dungeonName: def?.name ?? dungeonId,
    floorsCleared: _activeDelve.currentFloor,
    maxFloor: _activeDelve.maxFloor,
    goldEarned: 0,
    xpEarned: 0,
    completedAt: Date.now(),
    status: 'abandoned',
  }

  _delveHistory.unshift(record)
  if (_delveHistory.length > 20) _delveHistory.splice(20)

  _activeDelve = null

  window.dispatchEvent(new CustomEvent('delve-abandoned', { detail: record }))
  return true
}

export function getActiveDelve(): ActiveDelve | null {
  return _activeDelve
}

export function getDelveHistory(): CompletedDelve[] {
  return [..._delveHistory]
}

export function canStartDelve(dungeonId: string): boolean {
  if (_activeDelve) return false
  if (!getDungeon(dungeonId)) return false
  return getRemainingCooldown(dungeonId) <= 0
}

export function getRemainingCooldown(dungeonId: string): number {
  const def = getDungeon(dungeonId)
  if (!def) return 0

  const lastCompletion = _cooldowns.get(dungeonId)
  if (!lastCompletion) return 0

  const cooldownMs = def.cooldownMinutes * 60 * 1000
  const elapsed = Date.now() - lastCompletion
  return Math.max(0, cooldownMs - elapsed)
}
