// ── DeathSystem.ts ─────────────────────────────────────────────────────────────
// M5: Death + Bedroll Respawn System
//
// Encapsulates the death trigger logic so it can be called from GameLoop
// without requiring the full SceneRoot context. Keeps SceneRoot minimal.

import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { determinDeathCause } from './SurvivalSystems'
import { MAT, ITEM, type Inventory } from '../player/Inventory'
import { world, IsDead } from '../ecs/world'
import { removeComponent } from 'bitecs'
import { surfaceRadiusAt, PLANET_RADIUS } from '../world/SpherePlanet'

// Reverse lookup maps so dropped loot labels are human-readable
const MAT_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)
const ITEM_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ITEM).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')])
)

// ── Loot drop record ──────────────────────────────────────────────────────────
// Items are dropped at the death position and rendered as world pickups.
// Stored in the module so SceneRoot's renderers can read them.
export interface LootDrop {
  id: number
  x: number
  y: number
  z: number
  matId: number
  itemId: number
  label: string
  quantity: number
  quality: number
}

export const DEATH_LOOT_DROPS: LootDrop[] = []
export const gatheredLootIds = new Set<number>()
let _lootIdCounter = 100_000

// ── Bedroll world anchor ──────────────────────────────────────────────────────
export interface BedrollAnchor {
  x: number
  y: number
  z: number
}
export let placedBedrollAnchor: BedrollAnchor | null = null
export function setPlacedBedrollAnchor(anchor: BedrollAnchor | null): void {
  placedBedrollAnchor = anchor
}

// ── Core death trigger ────────────────────────────────────────────────────────
// Call this each frame when Health.current[entityId] <= 0.
// Returns true if death was triggered this frame (caller should `return` from GameLoop).
export function checkAndTriggerDeath(
  entityHealthRef: { current: number },
  playerPos: { x: number; y: number; z: number },
  inv: Inventory,
): boolean {
  // Treat <=0.5% HP as fatal so HUD never shows "1" while dead.
  const DEATH_HP_EPSILON = 0.005
  const ps = usePlayerStore.getState()

  // Already dead — stay halted
  if (ps.isDead) return true

  // Health still above floor — alive
  entityHealthRef.current = Math.max(0, entityHealthRef.current)
  if (entityHealthRef.current > DEATH_HP_EPSILON) return false

  // Snap tiny residual health to zero so HUD/state cannot show "0 but alive".
  entityHealthRef.current = 0

  // === DEATH ===
  const dpx = playerPos.x
  const dpy = playerPos.y
  const dpz = playerPos.z

  const cause = determinDeathCause(ps)

  // Death position on sphere surface — used to compute surface-projected scatter
  const deathDir = { x: dpx / PLANET_RADIUS, y: dpy / PLANET_RADIUS, z: dpz / PLANET_RADIUS }
  const deathLen = Math.sqrt(deathDir.x ** 2 + deathDir.y ** 2 + deathDir.z ** 2) || 1
  deathDir.x /= deathLen; deathDir.y /= deathLen; deathDir.z /= deathLen

  // Build two orthonormal tangent vectors perpendicular to the surface normal (deathDir).
  // Pick a reference axis not collinear with deathDir, then use cross-products.
  const absX = Math.abs(deathDir.x), absY = Math.abs(deathDir.y), absZ = Math.abs(deathDir.z)
  let refX: number, refY: number, refZ: number
  if (absY <= absX && absY <= absZ) { refX = 0; refY = 1; refZ = 0 }   // deathDir mostly in XZ
  else if (absX <= absY && absX <= absZ) { refX = 1; refY = 0; refZ = 0 }  // deathDir mostly in YZ
  else { refX = 0; refY = 0; refZ = 1 }                                 // deathDir mostly in XY
  // t1 = cross(deathDir, ref)
  let t1x = deathDir.y * refZ - deathDir.z * refY
  let t1y = deathDir.z * refX - deathDir.x * refZ
  let t1z = deathDir.x * refY - deathDir.y * refX
  const t1Len = Math.sqrt(t1x*t1x + t1y*t1y + t1z*t1z) || 1
  t1x /= t1Len; t1y /= t1Len; t1z /= t1Len
  // t2 = cross(deathDir, t1) — second tangent, already unit length since both inputs are unit+perpendicular
  const t2x = deathDir.y * t1z - deathDir.z * t1y
  const t2y = deathDir.z * t1x - deathDir.x * t1z
  const t2z = deathDir.x * t1y - deathDir.y * t1x

  // Drop all inventory items as world pickups scattered around death position
  for (const { slot } of inv.listItems()) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.8 + Math.random() * 1.2
    // Scatter in the tangent plane (spanned by t1 and t2) then project back to sphere surface
    const ox = (Math.cos(angle) * t1x + Math.sin(angle) * t2x) * radius
    const oy = (Math.cos(angle) * t1y + Math.sin(angle) * t2y) * radius
    const oz = (Math.cos(angle) * t1z + Math.sin(angle) * t2z) * radius
    const nx = dpx + ox, ny = dpy + oy, nz = dpz + oz
    const sr = surfaceRadiusAt(nx, ny, nz)
    const nDir = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    DEATH_LOOT_DROPS.push({
      id: _lootIdCounter++,
      x: (nx / nDir) * sr,
      y: (ny / nDir) * sr,
      z: (nz / nDir) * sr,
      matId:    slot.materialId,
      itemId:   slot.itemId,
      label:    slot.itemId > 0 ? (ITEM_NAMES[slot.itemId] ?? `item${slot.itemId}`) : (MAT_NAMES[slot.materialId] ?? `mat${slot.materialId}`),
      quantity: slot.quantity,
      quality:  slot.quality,
    })
  }

  // Clear all inventory slots
  for (let i = inv.slotCount - 1; i >= 0; i--) {
    const s = inv.getSlot(i)
    if (s) inv.dropItem(i, s.quantity)
  }

  // Keep health at zero in dead state; isDead prevents re-triggering.
  entityHealthRef.current = 0

  // Transition to death state — DeathScreen component reads isDead
  ps.triggerDeath(cause, { x: dpx, y: dpy, z: dpz })

  useUiStore.getState().addNotification(
    `You died from ${cause}. Your loot dropped here. Press RESPAWN.`,
    'warning'
  )

  return true
}

// ── Respawn execution ─────────────────────────────────────────────────────────
// Called when the player clicks RESPAWN on the DeathScreen.
// Teleports to bedroll (or world spawn), resets vitals to groggy state.
export function executeRespawn(
  entityId: number,
  setEcsPosition: (x: number, y: number, z: number) => void,
  setEcsHealth: (hp: number) => void,
  setEcsMetabolism: (hunger: number, thirst: number, energy: number) => void,
  worldSpawnPos: [number, number, number],
): void {
  const ps = usePlayerStore.getState()

  // Target priority: shelter (server-registered) > home base > bedroll > world spawn
  let respawnLabel = 'Respawned at world spawn.'
  let target: { x: number; y: number; z: number }

  if (ps.shelterPos) {
    target = { x: ps.shelterPos.x, y: ps.shelterPos.y, z: ps.shelterPos.z }
    respawnLabel = 'Respawned at your shelter.'
  } else if (ps.homeSet && ps.homePosition) {
    const [hx, hy, hz] = ps.homePosition
    target = { x: hx, y: hy, z: hz }
    respawnLabel = 'Respawned at your home base.'
  } else if (ps.bedrollPos) {
    target = { x: ps.bedrollPos.x, y: ps.bedrollPos.y, z: ps.bedrollPos.z }
    respawnLabel = 'Respawned at your bedroll.'
  } else {
    target = { x: worldSpawnPos[0], y: worldSpawnPos[1], z: worldSpawnPos[2] }
  }

  // Teleport
  setEcsPosition(target.x, target.y, target.z)

  // Groggy vital state per M5 spec: health 50%, hunger 40%, thirst 40%
  const maxHp = 100  // will be corrected by ECS on next frame if evolution modified it
  setEcsHealth(maxHp * 0.5)
  setEcsMetabolism(0.4, 0.4, 0.7)

  // Clear ECS dead flag so MetabolismSystem stops treating this entity as dead
  removeComponent(world, IsDead, entityId)

  // Clear wounds on respawn — active infections don't carry over (fresh start)
  usePlayerStore.setState({ wounds: [] })

  // Clear death overlay
  ps.clearDeath()

  useUiStore.getState().addNotification(respawnLabel, 'info')
}
