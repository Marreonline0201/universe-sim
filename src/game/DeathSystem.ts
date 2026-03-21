// ── DeathSystem.ts ─────────────────────────────────────────────────────────────
// M5: Death + Bedroll Respawn System
//
// Encapsulates the death trigger logic so it can be called from GameLoop
// without requiring the full SceneRoot context. Keeps SceneRoot minimal.

import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { determinDeathCause, resetDamageFlags } from './SurvivalSystems'
import type { Inventory } from '../player/Inventory'

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
  // Always reset damage flags at the start of the death check
  resetDamageFlags()

  const ps = usePlayerStore.getState()

  // Already dead — stay halted
  if (ps.isDead) return true

  // Health still above floor — alive
  if (entityHealthRef.current > 0) return false

  // === DEATH ===
  const dpx = playerPos.x
  const dpy = playerPos.y
  const dpz = playerPos.z

  const cause = determinDeathCause(ps)

  // Drop all inventory items as world pickups scattered around death position
  for (const { slot } of inv.listItems()) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.8 + Math.random() * 1.2
    DEATH_LOOT_DROPS.push({
      id: _lootIdCounter++,
      x: dpx + Math.cos(angle) * radius,
      y: dpy,
      z: dpz + Math.sin(angle) * radius,
      matId:    slot.materialId,
      itemId:   slot.itemId,
      label:    slot.itemId > 0 ? `item${slot.itemId}` : `mat${slot.materialId}`,
      quantity: slot.quantity,
      quality:  slot.quality,
    })
  }

  // Clear all inventory slots
  for (let i = inv.slotCount - 1; i >= 0; i--) {
    const s = inv.getSlot(i)
    if (s) inv.dropItem(i, s.quantity)
  }

  // Pin health at a tiny non-zero so this block doesn't re-fire next frame
  entityHealthRef.current = 0.001

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
  _entityId: number,  // reserved for future entity-specific logic
  setEcsPosition: (x: number, y: number, z: number) => void,
  setEcsHealth: (hp: number) => void,
  setEcsMetabolism: (hunger: number, thirst: number, energy: number) => void,
  worldSpawnPos: [number, number, number],
): void {
  const ps = usePlayerStore.getState()

  // Target: bedroll if placed, otherwise world spawn
  const target = ps.bedrollPos
    ? { x: ps.bedrollPos.x, y: ps.bedrollPos.y, z: ps.bedrollPos.z }
    : { x: worldSpawnPos[0], y: worldSpawnPos[1], z: worldSpawnPos[2] }

  // Teleport
  setEcsPosition(target.x, target.y, target.z)

  // Groggy vital state per M5 spec: health 50%, hunger 40%, thirst 40%
  const maxHp = 100  // will be corrected by ECS on next frame if evolution modified it
  setEcsHealth(maxHp * 0.5)
  setEcsMetabolism(0.4, 0.4, 0.7)

  // Clear death overlay
  ps.clearDeath()

  useUiStore.getState().addNotification(
    ps.bedrollPos ? 'Respawned at your bedroll.' : 'No bedroll — respawned at world spawn.',
    'info'
  )
}
