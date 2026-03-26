// ── WorldBossSystem.ts ─────────────────────────────────────────────────────────
// M60 Track B: World Boss Spawn System
// Manages lifecycle, timer, and loot table for world boss events.
// Actual 3D boss spawning is handled elsewhere; this system tracks
// spawned/active/defeated status and awards rewards on defeat.

import { usePlayerStore } from '../store/playerStore'
import { skillSystem } from './SkillSystem'
import { useUiStore } from '../store/uiStore'
import type { SkillId } from './SkillSystem'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BossDefinition {
  id: string
  name: string
  icon: string
  description: string
  difficulty: 'hard' | 'epic' | 'legendary'
  spawnCondition: string
  rewards: { gold: number; xp: number; skill: string }
  lootTable: Array<{ matId: number; qty: number; chance: number }>
}

export interface ActiveBoss {
  bossId: string
  spawnedAt: number   // simSeconds
  defeatedAt?: number // simSeconds
  status: 'active' | 'defeated' | 'expired'
}

// ── Boss Definitions ───────────────────────────────────────────────────────────

export const BOSS_DEFINITIONS: BossDefinition[] = [
  {
    id: 'stone_golem',
    name: 'Stone Golem',
    icon: '🗿',
    description: 'An ancient construct of living rock awakened by tectonic tremors. Its fists crack the earth with every step.',
    difficulty: 'hard',
    spawnCondition: 'Randomly',
    rewards: { gold: 500, xp: 200, skill: 'combat' },
    lootTable: [
      { matId: 9,  qty: 5,  chance: 0.9 },  // stone
      { matId: 10, qty: 2,  chance: 0.5 },  // iron_ore
      { matId: 11, qty: 1,  chance: 0.2 },  // rare mineral
    ],
  },
  {
    id: 'shadow_wraith',
    name: 'Shadow Wraith',
    icon: '👻',
    description: 'A remnant of a fallen civilization, this spectral entity emerges from the void when moonlight fades.',
    difficulty: 'epic',
    spawnCondition: 'At Night',
    rewards: { gold: 1000, xp: 400, skill: 'survival' },
    lootTable: [
      { matId: 40, qty: 1,  chance: 0.7 },  // shadow essence
      { matId: 14, qty: 3,  chance: 0.6 },  // silver
      { matId: 50, qty: 1,  chance: 0.15 }, // wraith core
    ],
  },
  {
    id: 'storm_titan',
    name: 'Storm Titan',
    icon: '⛈',
    description: 'A colossal being of living lightning that rides the storm front. Its roar precedes the thunderclap.',
    difficulty: 'epic',
    spawnCondition: 'During Storm',
    rewards: { gold: 1200, xp: 500, skill: 'combat' },
    lootTable: [
      { matId: 51, qty: 2,  chance: 0.8 },  // storm shard
      { matId: 10, qty: 4,  chance: 0.7 },  // iron_ore
      { matId: 52, qty: 1,  chance: 0.2 },  // lightning core
    ],
  },
  {
    id: 'forest_ancient',
    name: 'Forest Ancient',
    icon: '🌲',
    description: 'A primordial tree-spirit that has walked the land for millennia. It moves slowly but hits with devastating force.',
    difficulty: 'hard',
    spawnCondition: 'Randomly',
    rewards: { gold: 600, xp: 250, skill: 'gathering' },
    lootTable: [
      { matId: 1,  qty: 20, chance: 0.95 }, // wood
      { matId: 6,  qty: 5,  chance: 0.6 },  // fiber
      { matId: 53, qty: 1,  chance: 0.25 }, // ancient bark
    ],
  },
  {
    id: 'iron_behemoth',
    name: 'Iron Behemoth',
    icon: '⚙️',
    description: 'A mechanical monstrosity of unknown origin. Its gears grind ceaselessly as it crushes everything underfoot.',
    difficulty: 'legendary',
    spawnCondition: 'Randomly',
    rewards: { gold: 2000, xp: 800, skill: 'crafting' },
    lootTable: [
      { matId: 10, qty: 10, chance: 0.9 },  // iron_ore
      { matId: 54, qty: 3,  chance: 0.7 },  // gears
      { matId: 55, qty: 1,  chance: 0.3 },  // behemoth core
    ],
  },
  {
    id: 'void_serpent',
    name: 'Void Serpent',
    icon: '🐍',
    description: 'A serpent born from the space between worlds. It strikes from impossible angles, phasing through solid matter.',
    difficulty: 'legendary',
    spawnCondition: 'During Faction War',
    rewards: { gold: 1500, xp: 600, skill: 'combat' },
    lootTable: [
      { matId: 56, qty: 2,  chance: 0.8 },  // void scale
      { matId: 57, qty: 1,  chance: 0.5 },  // serpent fang
      { matId: 58, qty: 1,  chance: 0.2 },  // void heart
    ],
  },
]

const BOSS_MAP = new Map<string, BossDefinition>(
  BOSS_DEFINITIONS.map(b => [b.id, b])
)

// ── Module-level state ─────────────────────────────────────────────────────────

let _initialized = false
let _activeBoss: ActiveBoss | null = null
let _bossHistory: ActiveBoss[] = []
let _nextSpawnAt = 300        // simSeconds until first spawn
let _lastSimSeconds = 0       // last known simSeconds for defeat scheduling

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandomBoss(): BossDefinition {
  return BOSS_DEFINITIONS[Math.floor(Math.random() * BOSS_DEFINITIONS.length)]
}

function pushHistory(boss: ActiveBoss): void {
  _bossHistory = [boss, ..._bossHistory].slice(0, 10)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initWorldBossSystem(): void {
  if (_initialized) return
  _initialized = true
  _nextSpawnAt = 300
  _activeBoss = null
  _bossHistory = []
}

export function tickWorldBoss(simSeconds: number): void {
  _lastSimSeconds = simSeconds

  // Spawn new boss if none active and timer elapsed
  if (!_activeBoss && simSeconds >= _nextSpawnAt) {
    const def = pickRandomBoss()
    _activeBoss = { bossId: def.id, spawnedAt: simSeconds, status: 'active' }
    _nextSpawnAt = simSeconds + randomInt(600, 1800)

    useUiStore.getState().addNotification(
      `⚠️ WORLD BOSS: ${def.icon} ${def.name} has appeared! (${def.spawnCondition})`,
      'warning',
    )
    window.dispatchEvent(new CustomEvent('boss-spawned', { detail: { bossId: def.id } }))
    return
  }

  // Expire active boss if up for > 10 minutes (600s)
  if (_activeBoss && _activeBoss.status === 'active') {
    const elapsed = simSeconds - _activeBoss.spawnedAt
    if (elapsed > 600) {
      const expiredBoss: ActiveBoss = { ..._activeBoss, status: 'expired' }
      pushHistory(expiredBoss)
      _activeBoss = null

      const def = BOSS_MAP.get(expiredBoss.bossId)
      useUiStore.getState().addNotification(
        `${def ? def.icon : '👹'} World Boss ${def ? def.name : expiredBoss.bossId} has despawned.`,
        'info',
      )
      window.dispatchEvent(new CustomEvent('boss-expired', { detail: { bossId: expiredBoss.bossId } }))
    }
  }
}

export function defeatBoss(bossId: string): void {
  if (!_activeBoss || _activeBoss.bossId !== bossId || _activeBoss.status !== 'active') return

  const def = BOSS_MAP.get(bossId)
  if (!def) return

  const simSeconds = _lastSimSeconds

  // Award gold + XP
  usePlayerStore.getState().addGold(def.rewards.gold)
  skillSystem.addXp(def.rewards.skill as SkillId, def.rewards.xp)

  // Apply loot — award gold equivalent of loot table for now
  let lootGold = 0
  for (const entry of def.lootTable) {
    if (Math.random() < entry.chance) {
      lootGold += entry.qty * 10
    }
  }
  if (lootGold > 0) {
    usePlayerStore.getState().addGold(lootGold)
  }

  // Update status and archive
  const defeatedBoss: ActiveBoss = {
    ..._activeBoss,
    defeatedAt: simSeconds,
    status: 'defeated',
  }
  pushHistory(defeatedBoss)
  _activeBoss = null

  // Schedule next spawn
  _nextSpawnAt = simSeconds + randomInt(300, 900)

  useUiStore.getState().addNotification(
    `🏆 ${def.icon} ${def.name} defeated! +${def.rewards.gold} gold, +${def.rewards.xp} ${def.rewards.skill} XP`,
    'discovery',
  )
  window.dispatchEvent(new CustomEvent('boss-defeated', { detail: { bossId } }))
}

export function getActiveBoss(): ActiveBoss | null {
  return _activeBoss
}

export function getBossHistory(): ActiveBoss[] {
  return _bossHistory
}

export function getBossDefinition(id: string): BossDefinition | undefined {
  return BOSS_MAP.get(id)
}

export function getNextSpawnAt(): number {
  return _nextSpawnAt
}
