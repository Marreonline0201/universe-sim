// ── DynamicQuestBoardSystem.ts ────────────────────────────────────────────────
// M65 Track B: Dynamic Quest Board — procedural quests, difficulty tiers, level scaling

export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'legendary'

export interface BoardQuest {
  id: string
  title: string
  description: string
  difficulty: QuestDifficulty
  objective: string   // e.g. "Gather 20 Iron Ore"
  reward: { gold: number; xp: number; item?: string }
  timeLimit: number   // sim seconds, 0 = no limit
  postedAt: number    // simSeconds when posted
  accepted: boolean
  completed: boolean
}

// ── Templates ─────────────────────────────────────────────────────────────────

interface QuestTemplate {
  type: 'gather' | 'hunt' | 'craft'
  titleFn: (qty: number, target: string) => string
  descFn: (qty: number, target: string) => string
  objectiveFn: (qty: number, target: string) => string
  targets: string[]
  qtyRange: [number, number]
  timeLimitRange: [number, number]  // sim seconds; [0,0] means no limit
  item?: string
}

const GATHER_TEMPLATES: QuestTemplate[] = [
  {
    type: 'gather',
    titleFn: (qty, t) => `Gather ${qty} ${t}`,
    descFn:  (qty, t) => `The locals need ${qty} ${t}. Head out and collect them.`,
    objectiveFn: (qty, t) => `Gather ${qty} ${t}`,
    targets: ['Iron Ore', 'Coal', 'Copper Ore', 'Flint', 'Clay'],
    qtyRange: [10, 30],
    timeLimitRange: [0, 0],
  },
  {
    type: 'gather',
    titleFn: (qty, t) => `Harvest ${qty} ${t}`,
    descFn:  (qty, t) => `A merchant requires ${qty} ${t} for trade.`,
    objectiveFn: (qty, t) => `Harvest ${qty} ${t}`,
    targets: ['Wood', 'Oak Bark', 'Pine Resin', 'Berries', 'Mushrooms'],
    qtyRange: [15, 40],
    timeLimitRange: [0, 0],
  },
  {
    type: 'gather',
    titleFn: (qty, t) => `Collect ${qty} ${t}`,
    descFn:  (qty, t) => `We're running low on ${t}. Collect ${qty} for the settlement.`,
    objectiveFn: (qty, t) => `Collect ${qty} ${t}`,
    targets: ['Feathers', 'Animal Hide', 'Bones', 'Stone', 'Sand'],
    qtyRange: [20, 50],
    timeLimitRange: [600, 1800],
  },
  {
    type: 'gather',
    titleFn: (qty, t) => `Procure ${qty} ${t}`,
    descFn:  (qty, t) => `The alchemist has ordered ${qty} ${t}. Bring them swiftly.`,
    objectiveFn: (qty, t) => `Procure ${qty} ${t}`,
    targets: ['Sulfur Crystals', 'Moonbloom Petals', 'Dragon Root', 'Ether Dust', 'Void Shards'],
    qtyRange: [5, 15],
    timeLimitRange: [300, 900],
    item: 'Alchemist\'s Reagent',
  },
  {
    type: 'gather',
    titleFn: (qty, t) => `Retrieve ${qty} ${t}`,
    descFn:  (qty, t) => `Ancient ruins hold ${t}. Recover ${qty} before others find them.`,
    objectiveFn: (qty, t) => `Retrieve ${qty} ${t}`,
    targets: ['Ancient Coins', 'Runic Tablets', 'Glowing Orbs', 'Star Fragments', 'Obsidian Shards'],
    qtyRange: [3, 12],
    timeLimitRange: [600, 1200],
    item: 'Artifact Fragment',
  },
]

const HUNT_TEMPLATES: QuestTemplate[] = [
  {
    type: 'hunt',
    titleFn: (qty, t) => `Slay ${qty} ${t}`,
    descFn:  (qty, t) => `The ${t} menaces the region. Defeat ${qty} of them.`,
    objectiveFn: (qty, t) => `Defeat ${qty} ${t}`,
    targets: ['Forest Wolves', 'Cave Spiders', 'Bog Trolls'],
    qtyRange: [3, 10],
    timeLimitRange: [0, 0],
  },
  {
    type: 'hunt',
    titleFn: (qty, t) => `Hunt ${qty} ${t}`,
    descFn:  (qty, t) => `Hunters report ${qty} ${t} spotted to the north. Clear them out.`,
    objectiveFn: (qty, t) => `Hunt ${qty} ${t}`,
    targets: ['Goblin Raiders', 'Skeleton Warriors', 'Bandit Scouts'],
    qtyRange: [5, 15],
    timeLimitRange: [600, 1800],
  },
  {
    type: 'hunt',
    titleFn: (_, t) => `Vanquish the ${t}`,
    descFn:  (_, t) => `A legendary ${t} threatens the realm. Only the bravest dare challenge it.`,
    objectiveFn: (_, t) => `Defeat the ${t}`,
    targets: ['Ancient Lich', 'Infernal Drake', 'Void Colossus'],
    qtyRange: [1, 1],
    timeLimitRange: [1800, 3600],
    item: 'Boss Trophy',
  },
]

const CRAFT_TEMPLATES: QuestTemplate[] = [
  {
    type: 'craft',
    titleFn: (qty, t) => `Craft ${qty} ${t}`,
    descFn:  (qty, t) => `The blacksmith needs ${qty} ${t} forged urgently.`,
    objectiveFn: (qty, t) => `Craft ${qty} ${t}`,
    targets: ['Iron Swords', 'Steel Axes', 'Bronze Shields'],
    qtyRange: [2, 5],
    timeLimitRange: [900, 1800],
  },
  {
    type: 'craft',
    titleFn: (qty, t) => `Brew ${qty} ${t}`,
    descFn:  (qty, t) => `The healer's stores are empty. Brew ${qty} ${t} at once.`,
    objectiveFn: (qty, t) => `Brew ${qty} ${t}`,
    targets: ['Health Potions', 'Mana Potions', 'Antidotes'],
    qtyRange: [3, 8],
    timeLimitRange: [600, 1200],
    item: 'Master Brewer\'s Token',
  },
  {
    type: 'craft',
    titleFn: (qty, t) => `Build ${qty} ${t}`,
    descFn:  (qty, t) => `The settlement council requests ${qty} ${t} for construction.`,
    objectiveFn: (qty, t) => `Build ${qty} ${t}`,
    targets: ['Wooden Crates', 'Stone Bricks', 'Iron Fittings'],
    qtyRange: [4, 10],
    timeLimitRange: [1200, 2400],
  },
]

const ALL_TEMPLATES = [...GATHER_TEMPLATES, ...HUNT_TEMPLATES, ...CRAFT_TEMPLATES]

// ── Reward scaling ────────────────────────────────────────────────────────────

const GOLD_RANGE: Record<QuestDifficulty, [number, number]> = {
  easy:      [50,   100],
  medium:    [200,  400],
  hard:      [800,  1200],
  legendary: [3000, 5000],
}

const XP_RANGE: Record<QuestDifficulty, [number, number]> = {
  easy:      [50,   120],
  medium:    [200,  450],
  hard:      [700,  1100],
  legendary: [2500, 4500],
}

const DIFFICULTY_TEMPLATE_POOL: Record<QuestDifficulty, number[]> = {
  easy:      [0, 1, 2, 5, 6, 9],      // gather + basic hunt
  medium:    [0, 1, 2, 3, 5, 6, 9, 10, 11],
  hard:      [3, 4, 6, 7, 9, 10, 11], // harder gather + hunt + craft
  legendary: [4, 7, 8, 11],           // rare materials, boss hunts
}

// ── Internal state ────────────────────────────────────────────────────────────

let _board: BoardQuest[] = []
let _initialized = false
let _idCounter = 0
let _lastRefreshAt = 0

const REFRESH_INTERVAL = 300  // sim seconds
const BOARD_SLOTS: Record<QuestDifficulty, number> = {
  easy: 2, medium: 2, hard: 1, legendary: 1,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateId(): string {
  return `bquest_${++_idCounter}_${Date.now()}`
}

// ── Core generation ───────────────────────────────────────────────────────────

export function generateQuest(difficulty: QuestDifficulty, simSeconds: number): BoardQuest {
  const pool = DIFFICULTY_TEMPLATE_POOL[difficulty]
  const templateIdx = pickRandom(pool)
  const template = ALL_TEMPLATES[Math.min(templateIdx, ALL_TEMPLATES.length - 1)]

  const target = pickRandom(template.targets)
  const qty = rand(template.qtyRange[0], template.qtyRange[1])

  const [gMin, gMax] = GOLD_RANGE[difficulty]
  const [xMin, xMax] = XP_RANGE[difficulty]
  const gold = rand(gMin, gMax)
  const xp = rand(xMin, xMax)

  const [tlMin, tlMax] = template.timeLimitRange
  const timeLimit = tlMin === 0 && tlMax === 0 ? 0 : rand(tlMin, tlMax)

  return {
    id: generateId(),
    title: template.titleFn(qty, target),
    description: template.descFn(qty, target),
    difficulty,
    objective: template.objectiveFn(qty, target),
    reward: { gold, xp, item: template.item },
    timeLimit,
    postedAt: simSeconds,
    accepted: false,
    completed: false,
  }
}

function populateBoard(simSeconds: number): void {
  _board = []
  for (const [diff, count] of Object.entries(BOARD_SLOTS) as [QuestDifficulty, number][]) {
    for (let i = 0; i < count; i++) {
      _board.push(generateQuest(diff, simSeconds))
    }
  }
  _lastRefreshAt = simSeconds
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initDynamicQuestBoard(simSeconds = 0): void {
  if (_initialized) return
  _initialized = true
  populateBoard(simSeconds)
}

export function getBoardQuests(): BoardQuest[] {
  return _board
}

export function acceptBoardQuest(id: string): boolean {
  const quest = _board.find(q => q.id === id)
  if (!quest || quest.accepted || quest.completed) return false
  quest.accepted = true
  window.dispatchEvent(new CustomEvent('board-quest-accepted', { detail: { quest } }))
  return true
}

export function completeBoardQuest(id: string): boolean {
  const quest = _board.find(q => q.id === id)
  if (!quest || !quest.accepted || quest.completed) return false
  quest.completed = true
  window.dispatchEvent(new CustomEvent('board-quest-completed', { detail: { quest } }))
  return true
}

export function tickQuestBoard(simSeconds: number): void {
  if (!_initialized) return

  // Remove expired (time-limited, not accepted) quests
  const elapsed = simSeconds - _lastRefreshAt
  if (elapsed >= REFRESH_INTERVAL) {
    // Keep accepted-but-not-completed quests; replace the rest
    const kept = _board.filter(q => q.accepted && !q.completed)
    _board = [...kept]

    // Refill to target slot counts (only non-accepted slots)
    const currentCounts: Record<QuestDifficulty, number> = {
      easy: 0, medium: 0, hard: 0, legendary: 0,
    }
    for (const q of kept) {
      currentCounts[q.difficulty]++
    }

    for (const [diff, target] of Object.entries(BOARD_SLOTS) as [QuestDifficulty, number][]) {
      const needed = target - currentCounts[diff]
      for (let i = 0; i < needed; i++) {
        _board.push(generateQuest(diff, simSeconds))
      }
    }

    _lastRefreshAt = simSeconds
  }
}

export function getNextRefreshIn(simSeconds: number): number {
  const elapsed = simSeconds - _lastRefreshAt
  return Math.max(0, REFRESH_INTERVAL - elapsed)
}

// ── Serialization ─────────────────────────────────────────────────────────────

export interface QuestBoardSaveData {
  quests: BoardQuest[]
  lastRefreshAt: number
  idCounter: number
}

export function serializeQuestBoard(): QuestBoardSaveData {
  return {
    quests: _board,
    lastRefreshAt: _lastRefreshAt,
    idCounter: _idCounter,
  }
}

export function deserializeQuestBoard(data: QuestBoardSaveData): void {
  if (!data) return
  _board = data.quests ?? []
  _lastRefreshAt = data.lastRefreshAt ?? 0
  _idCounter = data.idCounter ?? 0
  _initialized = true
}
