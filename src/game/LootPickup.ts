/**
 * LootPickup — death event loot drop pickup radius logic.
 *
 * Extracted from SceneRoot.tsx (GameLoop useFrame, loot pickup block ~lines 1265-1294).
 * Called once per frame when not in placement mode.
 */
import { DEATH_LOOT_DROPS, gatheredLootIds } from './DeathSystem'
import { inventory } from './GameSingletons'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import type { PlayerController } from '../player/PlayerController'
import type { RefObject } from 'react'

/**
 * Check for nearby loot drops and handle F-key pickup.
 * Returns the loot prompt label if a loot drop is nearby (or null).
 */
export function tickLootPickup(
  px: number,
  py: number,
  pz: number,
  controllerRef: RefObject<PlayerController | null>,
): void {
  const gs = useGameStore.getState()

  let nearLoot: (typeof DEATH_LOOT_DROPS)[0] | null = null
  let nearLootDist = Infinity
  for (const drop of DEATH_LOOT_DROPS) {
    if (gatheredLootIds.has(drop.id)) continue
    const ldx = px - drop.x
    const ldy = py - drop.y
    const ldz = pz - drop.z
    const ld2 = ldx * ldx + ldy * ldy + ldz * ldz
    if (ld2 < nearLootDist) { nearLootDist = ld2; nearLoot = drop }
  }

  if (nearLoot && nearLootDist < 9) {
    const lootLabel = `[F] Pick up dropped loot (${nearLoot.quantity}x)`
    if (gs.gatherPrompt === null) gs.setGatherPrompt(lootLabel)
    if (!gs.inputBlocked && controllerRef.current?.popInteract()) {
      gatheredLootIds.add(nearLoot.id)
      // Remove from DEATH_LOOT_DROPS array
      const idx = DEATH_LOOT_DROPS.findIndex((d) => d.id === nearLoot!.id)
      if (idx >= 0) DEATH_LOOT_DROPS.splice(idx, 1)
      inventory.addItem({
        itemId: nearLoot.itemId,
        materialId: nearLoot.matId,
        quantity: nearLoot.quantity,
        quality: nearLoot.quality,
      })
      useUiStore.getState().addNotification(`Recovered loot: ${nearLoot.label} x${nearLoot.quantity}`, 'discovery')
    }
  }
}
