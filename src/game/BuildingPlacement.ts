/**
 * BuildingPlacement — building ghost preview, placement validation, confirmation.
 *
 * Extracted from SceneRoot.tsx (GameLoop useFrame, placement mode block ~lines 1208-1263).
 * Called once per frame when placementMode is active.
 */
import * as THREE from 'three'
import { Position } from '../ecs/world'
import { BUILDING_TYPES } from '../civilization/BuildingSystem'
import { surfaceRadiusAt, PLANET_RADIUS, SEA_LEVEL, terrainHeightAt } from '../world/SpherePlanet'
import { inventory, buildingSystem, questSystem } from './GameSingletons'
import { activateReactor } from './NuclearReactorSystem'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import type { PlayerController } from '../player/PlayerController'
import type { RefObject } from 'react'

// Shared mutable position for building ghost — BuildingGhost writes, GameLoop reads
export let ghostBuildPos: [number, number, number] = [0, 0, 0]

// Scratch vector for forward direction projection — no per-frame allocation
const _fwdVec = new THREE.Vector3()

/**
 * Tick building placement logic for one frame.
 * Returns true if placement was confirmed (caller should return early from game loop).
 */
export function tickBuildingPlacement(
  dt: number,
  entityId: number,
  camera: THREE.Camera,
  controllerRef: RefObject<PlayerController | null>,
  placementMode: string,
  setPlacementMode: (mode: string | null) => void,
  bumpBuildVersion: () => void,
): boolean {
  const btype = BUILDING_TYPES.find(t => t.id === placementMode)
  if (!btype) return false

  const px = Position.x[entityId]
  const py = Position.y[entityId]
  const pz = Position.z[entityId]

  // Project camera forward, tangent to sphere surface, 6m ahead
  const playerPos = new THREE.Vector3(px, py, pz)
  const playerUp  = playerPos.clone().normalize()
  _fwdVec.set(0, 0, -1).applyQuaternion(camera.quaternion)
  _fwdVec.addScaledVector(playerUp, -_fwdVec.dot(playerUp))
  if (_fwdVec.lengthSq() < 0.001) _fwdVec.copy(playerUp).cross(new THREE.Vector3(1,0,0)).normalize()
  else _fwdVec.normalize()

  // Ghost position: step 6m along tangent plane, then snap to surface
  const ghostDir = playerPos.clone().addScaledVector(_fwdVec, 6).normalize()
  let ghostSR  = surfaceRadiusAt(ghostDir.x * PLANET_RADIUS, ghostDir.y * PLANET_RADIUS, ghostDir.z * PLANET_RADIUS)
  // M28 Track B: Raft floats at SEA_LEVEL instead of terrain surface
  if (placementMode === 'raft') {
    ghostSR = PLANET_RADIUS + SEA_LEVEL + 0.5
  }
  ghostBuildPos = [ghostDir.x * ghostSR, ghostDir.y * ghostSR, ghostDir.z * ghostSR]

  const gs = useGameStore.getState()
  const placeLabel = `[F] Place ${btype.name}  ·  [B/Esc] Cancel`
  if (gs.gatherPrompt !== placeLabel) gs.setGatherPrompt(placeLabel)

  if (controllerRef.current?.popInteract()) {
    // Check materials
    const canBuild = btype.materialsRequired.every(req =>
      inventory.countMaterial(req.materialId) >= req.quantity
    )
    const addNotification = useUiStore.getState().addNotification

    // M28 Track B: Raft can only be placed on water (terrain height < SEA_LEVEL)
    if (placementMode === 'raft') {
      const ghostDir2 = new THREE.Vector3(...ghostBuildPos).normalize()
      const terrH = terrainHeightAt(ghostDir2)
      if (terrH >= SEA_LEVEL - 0.5) {
        addNotification('Raft must be placed on water!', 'warning')
        setPlacementMode(null)
        gs.setGatherPrompt(null)
        return true
      }
    }

    if (canBuild) {
      // Consume materials (bypasses god mode for buildings)
      for (const req of btype.materialsRequired) {
        let remaining = req.quantity
        for (let i = 0; i < inventory.slotCount && remaining > 0; i++) {
          const slot = inventory.getSlot(i)
          if (slot && slot.itemId === 0 && slot.materialId === req.materialId) {
            const take = Math.min(slot.quantity, remaining)
            inventory.removeItemForce(i, take)
            remaining -= take
          }
        }
      }
      buildingSystem.place(placementMode, ghostBuildPos, 0, useGameStore.getState().simSeconds)
      // Hook nuclear reactor activation when placed
      if (placementMode === 'nuclear_reactor_small' || placementMode === 'nuclear_reactor') {
        activateReactor(ghostBuildPos)
      }
      // M23: Quest progress on building placement
      questSystem.onBuild(0)
      bumpBuildVersion()
      setPlacementMode(null)
      gs.setGatherPrompt(null)
      addNotification(`Built: ${btype.name}`, 'discovery')
    } else {
      addNotification('Not enough materials to build!', 'warning')
      setPlacementMode(null)
      gs.setGatherPrompt(null)
    }
  }

  return true  // caller should return after calling this when placement is active
}
