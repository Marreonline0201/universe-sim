// ── BossSystem.ts ──────────────────────────────────────────────────────────────
// M34 Track B: World Boss — Ancient Dire Wolf
//
// One world boss spawns once per in-game day when dayAngle crosses 0 (new day).
// The boss is a wolf variant with 500 HP, 40 damage, speed 8 m/s.
// Boss drops on death: Quantum Blade (30%) or Diamond Blade (60%),
//   100-200 gold, 10 Iron Ore, 5 Velar Crystal.
//
// Coordinates with AnimalAISystem — boss is registered as a normal AnimalEntity
// with boss=true flag so the renderer can show the aura.

import { spawnAnimal, animalRegistry, pendingLoot, type AnimalEntity } from '../ecs/systems/AnimalAISystem'
import type { Inventory, InventorySlot } from '../player/Inventory'
import { ITEM, MAT } from '../player/Inventory'
import { PLANET_RADIUS, terrainHeightAt } from '../world/SpherePlanet'
import * as THREE from 'three'

// ── Boss constants ─────────────────────────────────────────────────────────────
const BOSS_HP       = 500
const BOSS_DAMAGE   = 40   // HP per hit (applied via boss=true flag in wolf AI)
const BOSS_SPEED    = 8    // m/s
const BOSS_NAME     = 'Ancient Dire Wolf'

// ── Boss state ────────────────────────────────────────────────────────────────

export interface WorldBoss {
  species: string
  entityId: number           // id of AnimalEntity in animalRegistry
  position: [number, number, number]
  hp: number
  maxHp: number
  spawnedAt: number          // Date.now()
  killed: boolean
  killedAt: number
}

export let currentBoss: WorldBoss | null = null

// Track the last day we spawned a boss (dayAngle crossing 0)
let _lastBossDay = -1
let _prevDayAngle = 0

// ── Helpers ───────────────────────────────────────────────────────────────────

function findValidBossPosition(
  spawnX: number, spawnY: number, spawnZ: number,
): [number, number, number] | null {
  const spawnDir = new THREE.Vector3(spawnX, spawnY, spawnZ).normalize()
  const perpBase = Math.abs(spawnDir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)
  const tangent = new THREE.Vector3().crossVectors(spawnDir, perpBase).normalize()

  for (let attempt = 0; attempt < 40; attempt++) {
    const angle   = Math.random() * Math.PI * 2
    const distM   = 200 + Math.random() * 300  // 200-500m from world center (player start)
    const arcDist = distM / PLANET_RADIUS
    const axis    = tangent.clone().applyAxisAngle(spawnDir, angle)
    const dir     = spawnDir.clone().applyAxisAngle(axis, arcDist)
    const h       = terrainHeightAt(dir)
    if (h < 1) continue
    const r = PLANET_RADIUS + h + 1
    return [dir.x * r, dir.y * r, dir.z * r]
  }
  return null
}

// ── trySpawnBoss ──────────────────────────────────────────────────────────────

/**
 * Call each frame with the current dayAngle (0–2π).
 * Spawns boss when dayAngle crosses 0 (new day), once per day.
 * spawnX/Y/Z is the world-center reference point (usually player start).
 */
export function trySpawnBoss(
  dayAngle: number,
  spawnX: number, spawnY: number, spawnZ: number,
): void {
  // Detect day crossing: _prevDayAngle was near 2π, now near 0
  const crossedDay = _prevDayAngle > Math.PI && dayAngle < Math.PI * 0.1
  _prevDayAngle = dayAngle

  if (!crossedDay) return

  // Only one boss per day
  const today = Math.floor(Date.now() / (24 * 3600 * 1000))
  if (today === _lastBossDay) return
  _lastBossDay = today

  // If an old boss is still alive, remove it first
  if (currentBoss && !currentBoss.killed) {
    const oldEntity = animalRegistry.get(currentBoss.entityId)
    if (oldEntity) {
      oldEntity.behavior = 'DEAD'
      oldEntity.deadTimer = 0
    }
  }

  // Find a valid spawn position
  const pos = findValidBossPosition(spawnX, spawnY, spawnZ)
  if (!pos) return

  const [bx, by, bz] = pos

  // Spawn a wolf entity with boss flags
  const entity = spawnAnimal('wolf', bx, by, bz, 999, bx, by, bz)
  entity.boss = true
  entity.elite = false
  entity.health = BOSS_HP
  entity.maxHealth = BOSS_HP
  entity.eliteGlowColor = '#cc0000'  // deep red aura
  // Override speed via phenotype-like approach (multiply happens in tickWolf at 2×)
  // Boss AI speed: 8 m/s = WOLF_SPEED_HUNT (6) × 2.0 boss mult → ~12; we set a direct mult
  // Actually we just set petName for labeling; speed/damage come from boss mult in tickWolf

  currentBoss = {
    species: 'wolf',
    entityId: entity.id,
    position: [bx, by, bz],
    hp: BOSS_HP,
    maxHp: BOSS_HP,
    spawnedAt: Date.now(),
    killed: false,
    killedAt: 0,
  }

  // Announce boss spawn via window event
  const directionHint = _getDirectionHint(bx, bz, spawnX, spawnZ)
  const distM = Math.round(Math.sqrt((bx - spawnX) ** 2 + (by - spawnY) ** 2 + (bz - spawnZ) ** 2))
  window.dispatchEvent(new CustomEvent('world-boss-spawned', {
    detail: { name: BOSS_NAME, distance: distM, direction: directionHint },
  }))
}

// ── damageBoss ────────────────────────────────────────────────────────────────

/**
 * Deal damage directly to the current boss (called when player hits boss entity).
 * Returns true if boss died this hit.
 * Pass killerName for the kill announcement.
 */
export function damageBoss(amount: number, killerName: string, targetInventory?: Inventory): boolean {
  if (!currentBoss || currentBoss.killed) return false

  const entity = animalRegistry.get(currentBoss.entityId)
  if (!entity || entity.behavior === 'DEAD') {
    currentBoss.killed = true
    return true
  }

  // Damage is also applied to the entity in attackNearestAnimal; sync here
  currentBoss.hp = Math.max(0, entity.health)

  if (entity.health > 0) return false

  // Boss died
  currentBoss.killed = true
  currentBoss.killedAt = Date.now()
  currentBoss.hp = 0

  // Drop legendary loot
  const bossLoot: InventorySlot[] = []

  // 100-200 gold
  const goldAmt = 100 + Math.floor(Math.random() * 101)
  bossLoot.push({ itemId: 0, materialId: MAT.GOLD, quantity: goldAmt, quality: 1.0, rarity: 3 })

  // 10 Iron Ore
  bossLoot.push({ itemId: 0, materialId: MAT.IRON_ORE, quantity: 10, quality: 0.9, rarity: 1 })

  // 5 Velar Crystal
  bossLoot.push({ itemId: 0, materialId: MAT.VELAR_CRYSTAL, quantity: 5, quality: 1.0, rarity: 3 })

  // 30% Quantum Blade, 60% Diamond Blade (10% neither)
  const weaponRoll = Math.random()
  if (weaponRoll < 0.30) {
    bossLoot.push({ itemId: ITEM.QUANTUM_BLADE, materialId: 0, quantity: 1, quality: 1.0, rarity: 4 })
  } else if (weaponRoll < 0.90) {
    bossLoot.push({ itemId: ITEM.DIAMOND_BLADE, materialId: 0, quantity: 1, quality: 0.95, rarity: 3 })
  }

  if (targetInventory) {
    for (const slot of bossLoot) {
      targetInventory.addItem(slot)
    }
  }

  // Announce via window event
  window.dispatchEvent(new CustomEvent('world-boss-killed', {
    detail: { name: BOSS_NAME, killerName, loot: bossLoot },
  }))

  return true
}

// ── syncBossPosition ──────────────────────────────────────────────────────────

/** Sync boss position from entity registry each frame (for minimap / HP bar). */
export function syncBossPosition(): void {
  if (!currentBoss || currentBoss.killed) return
  const entity = animalRegistry.get(currentBoss.entityId)
  if (!entity) { currentBoss.killed = true; return }
  currentBoss.position = [entity.x, entity.y, entity.z]
  currentBoss.hp = entity.health
}

// ── getBossDistanceAndDirection ────────────────────────────────────────────────

export function getBossDistanceAndDirection(
  px: number, py: number, pz: number,
): { distance: number; direction: string } | null {
  if (!currentBoss || currentBoss.killed) return null
  const [bx, by, bz] = currentBoss.position
  const dx = bx - px, dy = by - py, dz = bz - pz
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return { distance: Math.round(dist), direction: _getDirectionHint(bx, bz, px, pz) }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getDirectionHint(bx: number, bz: number, fromX: number, fromZ: number): string {
  const dx = bx - fromX
  const dz = bz - fromZ
  const angle = Math.atan2(dz, dx) * (180 / Math.PI)
  // Convert to compass bearing
  const bearing = ((angle + 360 + 90) % 360)
  if (bearing < 22.5 || bearing >= 337.5) return 'N'
  if (bearing < 67.5) return 'NE'
  if (bearing < 112.5) return 'E'
  if (bearing < 157.5) return 'SE'
  if (bearing < 202.5) return 'S'
  if (bearing < 247.5) return 'SW'
  if (bearing < 292.5) return 'W'
  return 'NW'
}
