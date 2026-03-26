// ── ChestSystem.ts ────────────────────────────────────────────────────────────
// M33 Track C: Cave Treasure Chests
//
// Generates 2-4 treasure chests per cave chamber, seeded deterministically.
// Chests have 3 tiers: common / rare / legendary.
// Locked chests require a lockpick item (MAT.LOCKPICK) or lockpick skill >= 3.
// Chests respawn 10 minutes after being looted.

import { MAT, ITEM } from '../player/Inventory'
import { CAVE_SEED, getCaveEntrancePositions } from '../rendering/CaveEntrances'
import * as THREE from 'three'

// ── Seeded PRNG (same as CaveTunnelRenderer) ─────────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChestTier = 'common' | 'rare' | 'legendary'

export interface LootEntry {
  matId?: number    // raw material ID (itemId=0 slots)
  itemId?: number   // item ID
  gold?: number
  qty: number
  weight: number    // relative probability
}

export interface TreasureChest {
  id: string
  caveIndex: number
  position: THREE.Vector3
  locked: boolean
  tier: ChestTier
  lootTable: LootEntry[]
  lastOpenedAt: number   // ms timestamp, 0 = never opened
  respawnMs: number      // 600_000 = 10 minutes
}

// ── Loot tables per tier ──────────────────────────────────────────────────────

const COMMON_LOOT: LootEntry[] = [
  { matId: MAT.WOOD,     qty: 5,  weight: 20 },
  { matId: MAT.STONE,    qty: 4,  weight: 18 },
  { matId: MAT.BONE,     qty: 3,  weight: 15 },
  { matId: MAT.COAL,     qty: 2,  weight: 12 },
  { matId: MAT.ROPE,     qty: 1,  weight: 10 },
  { matId: MAT.FIBER,    qty: 5,  weight: 15 },
  { gold: 1, qty: 1, weight: 10 },  // gold: 5-15 range handled via qty multiplier
]

const RARE_LOOT: LootEntry[] = [
  { matId: MAT.IRON_ORE, qty: 3,  weight: 25 },
  { matId: MAT.COAL,     qty: 4,  weight: 20 },
  { matId: MAT.ROPE,     qty: 2,  weight: 15 },
  { matId: MAT.ALCOHOL,  qty: 1,  weight: 10 },
  { matId: MAT.LOCKPICK, qty: 2,  weight: 12 },
  { gold: 2, qty: 1, weight: 18 },  // gold: 20-50 range
]

const LEGENDARY_LOOT: LootEntry[] = [
  { itemId: ITEM.DIAMOND_BLADE, qty: 1, weight: 15 },
  { itemId: ITEM.QUANTUM_BLADE, qty: 1, weight: 8  },
  { matId: MAT.VELAR_CRYSTAL,   qty: 1, weight: 10 },
  { matId: MAT.IRON_ORE,        qty: 5, weight: 12 },
  { matId: MAT.COAL,            qty: 6, weight: 12 },
  { gold: 3, qty: 1, weight: 43 },  // gold: 80-200 range
]

// ── Gold ranges per tier ──────────────────────────────────────────────────────
// gold entry qty is a tier index (1=common, 2=rare, 3=legendary)
// actual gold amount is rolled in openChest using seededRandom

const GOLD_RANGES: Record<number, [number, number]> = {
  1: [5,  15],   // common
  2: [20, 50],   // rare
  3: [80, 200],  // legendary
}

// ── Chamber position re-computation ──────────────────────────────────────────
// Mirrors the logic in CaveTunnelRenderer.buildTunnel to get chamberCenter

function getChamberCenter(entrance: THREE.Vector3, rng: () => number): THREE.Vector3 {
  const inward = entrance.clone().normalize().negate()
  const depth = 15 + rng() * 15
  // Consume same lateral drift calls as buildTunnel
  rng(); rng(); rng() // lateral1
  rng(); rng(); rng() // lateral2
  return entrance.clone().addScaledVector(inward, depth)
}

function getChamberBasis(chamberCenter: THREE.Vector3): {
  coreDir: THREE.Vector3
  right: THREE.Vector3
  fwd: THREE.Vector3
} {
  const coreDir = chamberCenter.clone().normalize().negate()
  const up = new THREE.Vector3(0, 1, 0)
  if (Math.abs(coreDir.dot(up)) > 0.9) up.set(1, 0, 0)
  const right = new THREE.Vector3().crossVectors(coreDir, up).normalize()
  const fwd   = new THREE.Vector3().crossVectors(right, coreDir).normalize()
  return { coreDir, right, fwd }
}

// ── Chest generation ──────────────────────────────────────────────────────────

// Cache to avoid re-generating every frame
let _cachedChests: TreasureChest[] | null = null

export function generateAllCaveChests(): TreasureChest[] {
  if (_cachedChests) return _cachedChests

  const entrances = getCaveEntrancePositions()
  const chests: TreasureChest[] = []

  for (let caveIdx = 0; caveIdx < entrances.length; caveIdx++) {
    const entrance = entrances[caveIdx]

    // Compute chamberCenter using a fresh seeded rng that mirrors buildTunnel's calls
    const tunnelRng = seededRandom(CAVE_SEED + caveIdx * 0x1000)
    const chamberCenter = getChamberCenter(entrance, tunnelRng)
    const { coreDir, right, fwd } = getChamberBasis(chamberCenter)

    // Use a separate dedicated seed for chest placement (CAVE_SEED + caveIdx + chest offset)
    // This avoids needing to perfectly mirror all of CaveTunnelRenderer's rng consumption.
    const rng = seededRandom(CAVE_SEED + caveIdx * 0x1000 + 0x7EC5)

    const chestCount = 2 + Math.floor(rng() * 3)  // 2-4 chests
    for (let ci = 0; ci < chestCount; ci++) {
      const angle  = rng() * Math.PI * 2
      const spread = 2 + rng() * 4
      const offset = right.clone().multiplyScalar(Math.cos(angle) * spread)
        .addScaledVector(fwd, Math.sin(angle) * spread)
        .addScaledVector(coreDir, -(3 + rng() * 2))
      const pos = chamberCenter.clone().add(offset)

      // Tier roll: 70% common, 25% rare, 5% legendary
      const tierRoll = rng()
      let tier: ChestTier
      let lootTable: LootEntry[]
      if (tierRoll < 0.70) {
        tier = 'common'
        lootTable = COMMON_LOOT
      } else if (tierRoll < 0.95) {
        tier = 'rare'
        lootTable = RARE_LOOT
      } else {
        tier = 'legendary'
        lootTable = LEGENDARY_LOOT
      }

      // Rare and legendary chests are locked
      const locked = tier !== 'common'

      chests.push({
        id: `cave${caveIdx}_chest${ci}`,
        caveIndex: caveIdx,
        position: pos,
        locked,
        tier,
        lootTable,
        lastOpenedAt: 0,
        respawnMs: 600_000,
      })
    }
  }

  _cachedChests = chests
  return chests
}

// ── Chest availability ────────────────────────────────────────────────────────

export function isChestAvailable(chest: TreasureChest): boolean {
  if (chest.lastOpenedAt === 0) return true
  return Date.now() - chest.lastOpenedAt > chest.respawnMs
}

// ── Lockpick check ────────────────────────────────────────────────────────────

export function canOpenChest(
  chest: TreasureChest,
  hasLockpick: boolean,
  lockpickSkillLevel: number,
): boolean {
  if (!chest.locked) return true
  return hasLockpick || lockpickSkillLevel >= 3
}

// ── Loot rolling ─────────────────────────────────────────────────────────────

export interface RolledLoot {
  matId?: number
  itemId?: number
  gold?: number
  qty: number
  label: string
}

function rollLootFromTable(table: LootEntry[], rng: () => number, tier: ChestTier): RolledLoot[] {
  const results: RolledLoot[] = []
  // Pick 2-4 items from the loot table using weighted random
  const pickCount = 2 + Math.floor(rng() * 3)
  const totalWeight = table.reduce((s, e) => s + e.weight, 0)

  const picked = new Set<number>()
  for (let p = 0; p < pickCount; p++) {
    let r = rng() * totalWeight
    for (let i = 0; i < table.length; i++) {
      r -= table[i].weight
      if (r <= 0 && !picked.has(i)) {
        picked.add(i)
        break
      }
    }
  }

  for (const idx of picked) {
    const entry = table[idx]
    if (entry.gold !== undefined) {
      const [min, max] = GOLD_RANGES[entry.gold] ?? [5, 15]
      const goldAmount = Math.floor(min + rng() * (max - min + 1))
      results.push({ gold: goldAmount, qty: goldAmount, label: `${goldAmount} gold` })
    } else if (entry.itemId !== undefined) {
      results.push({ itemId: entry.itemId, qty: entry.qty, label: getItemLabel(entry.itemId) })
    } else if (entry.matId !== undefined) {
      results.push({ matId: entry.matId, qty: entry.qty, label: `${entry.qty}x ${getMatLabel(entry.matId)}` })
    }
  }

  return results
}

export function openChest(chest: TreasureChest): RolledLoot[] {
  chest.lastOpenedAt = Date.now()
  const rng = seededRandom(Date.now() ^ chest.id.length * 0x1337)
  return rollLootFromTable(chest.lootTable, rng, chest.tier)
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function getMatLabel(matId: number): string {
  const lookup: Record<number, string> = {
    [MAT.WOOD]:         'Wood',
    [MAT.STONE]:        'Stone',
    [MAT.BONE]:         'Bone',
    [MAT.COAL]:         'Coal',
    [MAT.ROPE]:         'Rope',
    [MAT.FIBER]:        'Fiber',
    [MAT.IRON_ORE]:     'Iron Ore',
    [MAT.ALCOHOL]:      'Alcohol',
    [MAT.LOCKPICK]:     'Lockpick',
    [MAT.VELAR_CRYSTAL]:'Velar Crystal',
  }
  return lookup[matId] ?? `mat#${matId}`
}

function getItemLabel(itemId: number): string {
  const lookup: Record<number, string> = {
    [ITEM.DIAMOND_BLADE]: 'Diamond Blade',
    [ITEM.QUANTUM_BLADE]:  'Quantum Blade',
  }
  return lookup[itemId] ?? `item#${itemId}`
}
