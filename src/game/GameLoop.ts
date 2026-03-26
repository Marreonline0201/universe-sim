/**
 * GameLoop — per-frame update logic extracted from SceneRoot.tsx.
 *
 * Handles: player movement, vitals tick, metabolism drain, health regen,
 * stamina, creature AI, resource gathering, building placement, loot pickup,
 * weather effects, river interaction, sailing, fishing, and all survival systems.
 *
 * Extracted from SceneRoot.tsx (~lines 973-2354).
 * SceneRoot renders <GameLoop ... /> inside its Canvas; this file contains the
 * implementation component.
 */
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { RefObject } from 'react'

import { rapierWorld } from '../physics/RapierWorld'
import { useGameStore } from '../store/gameStore'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { useMultiplayerStore } from '../store/multiplayerStore'
import { useSettlementStore } from '../store/settlementStore'
import { useDialogueStore } from '../store/dialogueStore'
import { useOutlawStore } from '../store/outlawStore'
import { useWeatherStore } from '../store/weatherStore'
import { useRiverStore } from '../store/riverStore'
import { useSeasonStore } from '../store/seasonStore'
import { useShopStore } from '../store/shopStore'
import { useTransitStore } from '../store/transitStore'
import { useVelarStore } from '../store/velarStore'
import { useInspectPlayerStore } from '../ui/InspectPlayerOverlay'
import { useCaveStore } from '../store/caveStore'
import {
  generateAllCaveChests,
  isChestAvailable,
  canOpenChest,
  openChest,
} from './ChestSystem'

import {
  world,
  Metabolism, Health, Position, Velocity, IsDead,
} from '../ecs/world'
import { removeComponent, removeEntity } from 'bitecs'
import { MetabolismSystem, setMetabolismDt } from '../ecs/systems/MetabolismSystem'
import { creatureWander, tickCreatureWander } from '../ecs/systems/CreatureWanderSystem'
import {
  tickAnimalAI,
  attackNearestAnimal,
  pendingLoot,
  tickEcosystemBalance,
  tickRespawnQueue,
  findNearestTameableAnimal,
  attemptTameNearestAnimal,
  renameTamedAnimal,
} from '../ecs/systems/AnimalAISystem'

import { inventory, buildingSystem, questSystem, combatSystem, achievementSystem, tutorialSystem, fishingSystem, merchantSystem } from './GameSingletons'
import { SPECIES_LOOT, rollLoot } from './LootTable'
import { ITEM, MAT, RARITY_NAMES, type RarityTier } from '../player/Inventory'
import { getItemStats, canHarvest } from '../player/EquipSystem'
import { CombatSystem } from './CombatSystem'
import { BUILDING_TYPES } from '../civilization/BuildingSystem'
import {
  tickFoodCooking,
  tickWoundSystem,
  tickSleepSystem,
  tickFurnaceSmelting,
  tickBlastFurnaceSmelting,
  tickQuenching,
  tickBuildingPhysics,
  tryEatFood,
  tryApplyHerb,
  tryStartSleep,
  inflictWound,
  markCombatDamage,
  markColdDamage,
  resetDamageFlags,
} from './SurvivalSystems'
import {
  checkAndTriggerDeath,
  DEATH_LOOT_DROPS,
  gatheredLootIds,
  setPlacedBedrollAnchor,
} from './DeathSystem'
import { tickBuildingPlacement, ghostBuildPos } from './BuildingPlacement'
import { tickRaft, tryMountRaft, dismountRaft, getRaftState } from './RaftSystem'
import { tickLootPickup } from './LootPickup'
import {
  RESOURCE_NODES,
  gatheredNodeIds,
  NODE_RESPAWN_AT,
  NODE_HITS_TAKEN,
  NODE_RESPAWN_DELAY,
  getNodeMaxHits,
} from '../world/ResourceNodeManager'
import { surfaceRadiusAt, PLANET_RADIUS, getSurfaceDigMaterials, terrainHeightAt } from '../world/SpherePlanet'
import { queryNearestRiver } from '../world/RiverSystem'
import { getSectorIdForPosition } from '../world/WeatherSectors'
import { beginInterplanetaryTransit } from './InterplanetaryTransitSystem'
import { tickMusket, fireMusket, isMusketReady } from './GunpowderSystem'
import { tickRocket, beginLaunch, isLaunching } from './RocketSystem'
import { tickNuclearReactor } from './NuclearReactorSystem'
import { ITEM as _ITEM } from '../player/Inventory'
import {
  tickSailing,
  startFishing,
  tickFishing,
  cancelFishing,
  isFishingActive,
  type VesselType,
} from '../world/SailingSystem'
import { getWorldSocket } from '../net/useWorldSocket'
import { tickEmoteSystem } from './EmoteSystem'
import type { PlayerController } from '../player/PlayerController'
import type { LocalSimManager } from '../engine/LocalSimManager'
import { tickChemistryGameplay } from './ChemistryGameplay'
import { CreatureBody } from '../ecs/world'
import { skillSystem } from './SkillSystem'
import { saveOffline, registerSkillSystem, registerQuestSystem, registerAchievementSystem, registerTutorialSystem } from './OfflineSaveManager'
import { useSettlementQuestStore } from '../store/settlementQuestStore'
// M33 Track B: Food buff system
import { consumeFood, tickFoodBuffs } from './FoodBuffSystem'

// Register skill system with offline save manager for serialization
registerSkillSystem(skillSystem)
// Register quest system with offline save manager for serialization (M23)
registerQuestSystem(questSystem)
// Register achievement + tutorial systems with offline save manager (M24)
registerAchievementSystem(achievementSystem)
registerTutorialSystem(tutorialSystem)

// ── Dig holes ─────────────────────────────────────────────────────────────────
export interface DigHole { x: number; y: number; z: number; r: number }
export const DIG_HOLES: DigHole[] = []
export const MAX_DIG_HOLES = 64
export const DIG_RADIUS = 1.4   // visual patch radius in metres

// ── M29 Track B: Storm movement multiplier ───────────────────────────────────
// Set each frame in GameLoop based on current weather. Read by PlayerController.
export let weatherSpeedMult = 1.0
export function setWeatherSpeedMult(v: number) { weatherSpeedMult = v }

// Auto-open inventory on the player's first-ever gather so the playtester can
// immediately inspect the item without knowing to press I.
let _firstGatherDone = false

// Apply cumulative ECS stat bonuses from all unlocked evolution nodes.
// Primitive organism base stats — fixed values, no upgrade gates.
function applyEvolutionEffects(eid: number): void {
  const BASE_HP    = 100
  const BASE_REGEN = 0.1   // HP/s
  const BASE_RATE  = 0.07  // metabolicRate

  Health.max[eid]               = BASE_HP
  if (Health.current[eid] > BASE_HP) Health.current[eid] = BASE_HP
  Health.regenRate[eid]         = BASE_REGEN
  Metabolism.metabolicRate[eid] = BASE_RATE
}

export interface GameLoopProps {
  controllerRef: RefObject<PlayerController | null>
  simManagerRef: RefObject<LocalSimManager | null>
  entityId: number
  gameActive: boolean
}

export function GameLoop({ controllerRef, simManagerRef, entityId, gameActive }: GameLoopProps) {
  const { camera } = useThree()
  const updateVitals        = usePlayerStore(s => s.updateVitals)
  const setPosition         = usePlayerStore(s => s.setPosition)
  const setCivTier          = usePlayerStore(s => s.setCivTier)
  const spectateTarget      = useGameStore(s => s.spectateTarget)
  const placementMode       = useGameStore(s => s.placementMode)
  const setPlacementMode    = useGameStore(s => s.setPlacementMode)
  const bumpBuildVersion    = useGameStore(s => s.bumpBuildVersion)
  const getDayAngle         = () => useGameStore.getState().dayAngle
  // Survival system refs
  const _sleepKeyRef            = useRef(false)
  const evoUnlockedRef          = useRef(-1)  // -1 triggers base stats on first frame
  const fwdVec                  = useRef(new THREE.Vector3())
  const settlementCheckTimerRef = useRef(0)   // M6: seconds since last proximity check
  const ecosystemTimerRef       = useRef(0)   // M9: seconds since last ecosystem respawn check
  const fishingStateRef         = useRef<'idle'|'waiting'|'bite'>('idle')  // M10 Track B
  const offlineSaveTimerRef     = useRef(0)    // M22: auto-save every 60s
  const survivalXpTimerRef      = useRef(0)    // M22: passive survival XP every 60s
  // M29 Track B: Weather gameplay timers
  const coldDamageTimerRef      = useRef(0)    // 10s cold damage tick when warmth < 20
  const rainFireTimerRef        = useRef(0)    // 10s rain extinguishes fires check
  const lightningTimerRef       = useRef(0)    // countdown to next lightning strike
  const warmthStormMultRef      = useRef(1)    // storm movement speed multiplier
  // M32: pending tame — animal id waiting for name input
  const pendingTameAnimalRef    = useRef<number | null>(null)

  useFrame((_, delta) => {
    // Cap dt to avoid spiral-of-death on slow frames
    const dt = Math.min(delta, 0.1)

    // M5: Reset damage-source flags at frame start so this frame's damage is tracked fresh
    resetDamageFlags()

    // Pause all game logic when the CLICK TO PLAY overlay is visible (B-08 fix).
    if (!gameActive) return

    // Admin spectate overrides player camera
    if (spectateTarget) {
      camera.position.set(spectateTarget.x, spectateTarget.y + 20, spectateTarget.z + 15)
      camera.lookAt(spectateTarget.x, spectateTarget.y, spectateTarget.z)
      return
    }

    // 1. Player movement + camera (computes desired movement, calls Rapier KCC)
    controllerRef.current?.update(dt, camera)

    // 2. Step Rapier physics world (commits kinematic body positions)
    rapierWorld.step(dt)

    // 2b. Creature wander AI
    const _playerPx = Position.x[entityId]
    const _playerPy = Position.y[entityId]
    const _playerPz = Position.z[entityId]
    tickCreatureWander(dt, entityId, _playerPx, _playerPy, _playerPz)

    // 2c. M9 Animal AI tick — deer/wolf/boar behavior state machines
    {
      const ps9 = usePlayerStore.getState()
      tickAnimalAI({
        dt,
        playerX: _playerPx, playerY: _playerPy, playerZ: _playerPz,
        playerMurderCount: ps9.murderCount,
        playerCrouching: !!(controllerRef.current as any)?.keys?.has?.('ControlLeft'),
        onPlayerDamaged: (dmg) => {
          // M24: Apply combat system damage reduction (dodge iframe, block)
          const effectiveDmg = dmg * combatSystem.getIncomingDamageMultiplier()
          if (effectiveDmg <= 0) return  // dodged!
          Health.current[entityId] = Math.max(0, Health.current[entityId] - effectiveDmg)
          inflictWound(effectiveDmg / 100)
          markCombatDamage()
        },
        onAnimalKilled: () => { /* handled via return value of attackNearestAnimal */ },
        // M32: Tamed animal passive product drop
        onTamedProductDrop: (animal, materialId, label) => {
          inventory.addItem({ itemId: 0, materialId, quantity: 1, quality: 0.8 })
          skillSystem.addXp('husbandry', 10)
          useUiStore.getState().addNotification(
            `${animal.petName} produced +1 ${label}!`,
            'discovery'
          )
        },
      })
      // Drain pending loot from wolf kills (wolf-on-deer kills drop loot here)
      while (pendingLoot.length > 0) {
        const drop = pendingLoot.shift()!
        inventory.addItem({ itemId: 0, materialId: drop.materialId, quantity: drop.quantity, quality: 0.8 })
      }
    }

    // M24: Combat system tick (cooldowns, damage numbers, health bar pruning)
    combatSystem.tick(dt)

    // M24: Animal respawn queue tick
    tickRespawnQueue(dt)

    // 2d. M9 Ecosystem balance — respawn animals every 10s if below 50% cap
    ecosystemTimerRef.current += dt
    if (ecosystemTimerRef.current >= 10) {
      ecosystemTimerRef.current = 0
      tickEcosystemBalance(
        Position.x[entityId],
        Position.y[entityId],
        Position.z[entityId],
      )
    }

    // 3. Metabolism (hunger, thirst, fatigue, health regen)
    setMetabolismDt(dt)
    MetabolismSystem(world)

    // B-16 fix: God Mode bypasses starvation/dehydration damage
    if (inventory.isGodMode()) {
      Metabolism.hunger[entityId] = 0
      Metabolism.thirst[entityId] = 0
    }

    // 3. Push ECS vitals → playerStore so HUD bars update
    const maxHp = Health.max[entityId] || 100
    updateVitals({
      health:  Health.current[entityId] / maxHp,
      hunger:  Metabolism.hunger[entityId],
      thirst:  Metabolism.thirst[entityId],
      energy:  Metabolism.energy[entityId],
      fatigue: Metabolism.fatigue[entityId],
    })

    // 3b. Death trigger (M5) - delegates to DeathSystem
    {
      const _hpRef = { current: Health.current[entityId] }
      const _died = checkAndTriggerDeath(
        _hpRef,
        {
          x: Position.x[entityId],
          y: Position.y[entityId],
          z: Position.z[entityId],
        },
        inventory,
      )
      Health.current[entityId] = _hpRef.current
      if (_died) return
    }

    // 4b. Apply base creature stats once on first frame
    if (evoUnlockedRef.current === -1) {
      evoUnlockedRef.current = 0
      applyEvolutionEffects(entityId)
    }

    // 4b. Node respawn — check if any gathered nodes are ready to come back
    if (gatheredNodeIds.size > 0) {
      const now = Date.now()
      for (const id of gatheredNodeIds) {
        const at = NODE_RESPAWN_AT.get(id)
        if (at !== undefined && now >= at) {
          gatheredNodeIds.delete(id)
          NODE_RESPAWN_AT.delete(id)
          NODE_HITS_TAKEN.delete(id)  // reset hit state on respawn
        }
      }
    }

    // Ground detection and position sync are now handled by Rapier KCC
    const px = Position.x[entityId]
    const py = Position.y[entityId]
    const pz = Position.z[entityId]
    setPosition(px, py, pz)

    // M29 Track C4: Inspect remote player — F within 3m, prioritised over gather
    {
      const inspectStore = useInspectPlayerStore.getState()
      if (!inspectStore.inspectedPlayer) {
        const remotePlayers_inspect = useMultiplayerStore.getState().remotePlayers
        let nearestRemote = null as import('../store/multiplayerStore').RemotePlayer | null
        let nearestRemoteDist = Infinity
        for (const rp of remotePlayers_inspect.values()) {
          const dx = rp.x - px, dy = (rp.y + 0.6) - py, dz = rp.z - pz
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 < 9 && d2 < nearestRemoteDist) { // 3m²=9
            nearestRemoteDist = d2
            nearestRemote = rp
          }
        }
        const gs_inspect = useGameStore.getState()
        if (nearestRemote) {
          const inspLabel = `[F] Inspect ${nearestRemote.username}`
          if (gs_inspect.gatherPrompt !== inspLabel) gs_inspect.setGatherPrompt(inspLabel)
          if (!gs_inspect.inputBlocked && controllerRef.current?.popInteract()) {
            inspectStore.openInspect(nearestRemote)
          }
        }
      }
    }

    // ── M32 Track B: Animal taming prompt ────────────────────────────────────
    {
      const gs_tame = useGameStore.getState()
      if (!gs_tame.inputBlocked && gs_tame.gatherPrompt === null) {
        const nearTameable = findNearestTameableAnimal(px, py, pz, 3)
        if (nearTameable) {
          const speciesLabel = nearTameable.species.charAt(0).toUpperCase() + nearTameable.species.slice(1)
          const tameLabel = `[F] Tame ${speciesLabel}`
          if (gs_tame.gatherPrompt !== tameLabel) gs_tame.setGatherPrompt(tameLabel)
          if (controllerRef.current?.popInteract()) {
            gs_tame.setGatherPrompt(null)
            // Check for food item in inventory (any food material)
            const foodMatIds = [MAT.RAW_MEAT, MAT.COOKED_MEAT, MAT.FISH, MAT.GRAIN]
            let foodSlotIdx = -1
            for (const fid of foodMatIds) {
              const idx = inventory.findItem(fid)
              if (idx >= 0) { foodSlotIdx = idx; break }
            }
            if (foodSlotIdx < 0) {
              useUiStore.getState().addNotification(
                'Need food to tame! Bring raw meat, fish, or grain.',
                'warning'
              )
            } else {
              // Award XP for attempt regardless of outcome
              skillSystem.addXp('husbandry', 20)
              // Use survival level for base chance; husbandry provides an extra bonus
              const survLevel = skillSystem.getLevel('survival')
              const husbandryBonus = skillSystem.getBonuses().husbandryTameBonus
              // The husbandry bonus stacks on top of the survival-based chance
              // attemptTameNearestAnimal uses survivalLevel * 0.05, so pass combined value
              const effectiveLevel = survLevel + Math.round(husbandryBonus / 0.05)
              const result = attemptTameNearestAnimal(px, py, pz, effectiveLevel)
              if (result) {
                if (result.success) {
                  // Consume 1 food item on success
                  inventory.removeItem(foodSlotIdx, 1)
                  skillSystem.addXp('husbandry', 50)
                  pendingTameAnimalRef.current = result.animal.id
                  // Show name-input popup via custom event
                  const specName = result.animal.species
                  window.dispatchEvent(new CustomEvent('tame-animal-name-prompt', {
                    detail: { animalId: result.animal.id, defaultName: specName }
                  }))
                  useUiStore.getState().addNotification(
                    `You tamed a ${speciesLabel}! Name your companion.`,
                    'discovery'
                  )
                } else {
                  useUiStore.getState().addNotification(
                    `Taming failed — ${speciesLabel} spooked! Try again in 30s.`,
                    'warning'
                  )
                }
              }
            }
          }
        }
      }
    }

    // 5. Resource proximity + gather (3D distance on sphere surface)
    const gs = useGameStore.getState()
    // Merge local gathered set with server-authoritative depleted set
    const serverDepleted = useMultiplayerStore.getState().depletedNodes
    let nearNode: (typeof RESOURCE_NODES)[0] | null = null
    let nearDist = Infinity
    for (const node of RESOURCE_NODES) {
      if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
      const dx = px - node.x
      const dy = py - node.y
      const dz = pz - node.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < nearDist) { nearDist = d2; nearNode = node }
    }

    // 6. Placement mode — update ghost position + handle F key to confirm
    if (placementMode) {
      tickBuildingPlacement(dt, entityId, camera, controllerRef, placementMode, setPlacementMode, bumpBuildVersion)
      return
    }

    // ── M5: Death loot pickup ──────────────────────────────────────────────────
    tickLootPickup(px, py, pz, controllerRef)

    if (nearNode && nearDist < 9) { // within 3m
      const oreMatIds: number[] = [MAT.COPPER_ORE, MAT.IRON_ORE, MAT.COAL, MAT.TIN_ORE, MAT.SULFUR, MAT.GOLD, MAT.SILVER, MAT.URANIUM]
      const isOre = oreMatIds.includes(nearNode.matId)
      const isIronOre = nearNode.matId === MAT.IRON_ORE
      const hasAnyPickaxe = inventory.hasItemById(ITEM.STONE_TOOL) || inventory.hasItemById(ITEM.AXE)
      const hasIronPickaxe = inventory.hasItemById(ITEM.IRON_PICKAXE) || inventory.hasItemById(ITEM.IRON_AXE)
      const canGather = !isOre
        ? true
        : isIronOre
          ? hasIronPickaxe
          : hasAnyPickaxe || hasIronPickaxe

      const ps_gather = usePlayerStore.getState()
      const gatherSlot = ps_gather.equippedSlot !== null ? inventory.getSlot(ps_gather.equippedSlot) : null
      const gatherItemId = gatherSlot?.itemId ?? 0
      const harvestPower = getItemStats(gatherItemId).harvestPower
      const maxHits = getNodeMaxHits(nearNode.type, harvestPower)
      const hitsSoFar = NODE_HITS_TAKEN.get(nearNode.id) ?? 0

      const label = canGather
        ? maxHits > 1
          ? `[F] Gather ${nearNode.label}  ·  Hit ${hitsSoFar + 1}/${maxHits}`
          : `[F] Gather ${nearNode.label}`
        : isIronOre
          ? `[Need Iron Pickaxe] ${nearNode.label}`
          : `[Need Stone Tool] ${nearNode.label}`
      if (gs.gatherPrompt !== label) gs.setGatherPrompt(label)

      if (canGather && !gs.inputBlocked && controllerRef.current?.popInteract()) {
        const newHits = hitsSoFar + 1
        if (newHits < maxHits) {
          NODE_HITS_TAKEN.set(nearNode.id, newHits)
          const hitsLeft = maxHits - newHits
          useUiStore.getState().addNotification(
            `⚒ ${nearNode.label} — ${hitsLeft} hit${hitsLeft !== 1 ? 's' : ''} remaining`,
            'info'
          )
        } else {
          // Final hit — fully gather the node
          NODE_HITS_TAKEN.delete(nearNode.id)
          gatheredNodeIds.add(nearNode.id)
          NODE_RESPAWN_AT.set(nearNode.id, Date.now() + NODE_RESPAWN_DELAY)
          gs.setGatherPrompt(null)
          const qty = isOre ? 3 : 1
          inventory.addItem({ itemId: 0, materialId: nearNode.matId, quantity: qty, quality: 0.8 })
          getWorldSocket()?.send({
            type: 'NODE_DESTROYED',
            nodeId: nearNode.id,
            nodeType: nearNode.type,
            x: nearNode.x, y: nearNode.y, z: nearNode.z,
          })
          if (nearNode.matId === MAT.STONE || nearNode.matId === MAT.FLINT) {
            inventory.discoverRecipe(1)
          }
          // M22: Gathering XP (10-30 based on ore vs basic)
          skillSystem.addXp('gathering', isOre ? 25 : 15)
          // M23: Quest progress on gather
          questSystem.onGather(nearNode.matId, qty)
          // M33: Settlement quest board progress on gather
          {
            const sqStore = useSettlementQuestStore.getState()
            const active = sqStore.getActiveQuests()
            for (const q of active) {
              if (q.type === 'gather' && (q.targetId === 0 || q.targetId === nearNode.matId)) {
                sqStore.updateProgress(q.id, qty)
                const updated = useSettlementQuestStore.getState().quests[q.id]
                if (updated && updated.progress >= updated.targetCount) {
                  sqStore.completeQuest(q.id)
                  usePlayerStore.getState().addGold(q.reward.gold)
                  skillSystem.addXp('gathering', q.reward.xp)
                  useUiStore.getState().addNotification(
                    `Quest Complete: "${q.title}" +${q.reward.xp} XP +${q.reward.gold} gold`,
                    'discovery'
                  )
                }
              }
            }
          }
          const addNotification = useUiStore.getState().addNotification
          addNotification(
            `✓ Gathered ${qty > 1 ? qty + '× ' : ''}${nearNode.label} — [I] to view items`,
            'discovery'
          )
          if (!_firstGatherDone) {
            _firstGatherDone = true
            skillSystem.addXp('exploration', 50) // M22: Exploration XP on first gather
            useUiStore.getState().openPanel('inventory')
          }
          if (isOre) {
            // EP award placeholder
          }
        }
      }
    } else {
      if (gs.gatherPrompt !== null) gs.setGatherPrompt(null)
    }

    // ── M33 Track C: Cave treasure chest interaction ───────────────────────────
    {
      const isUnderground = useCaveStore.getState().underground
      if (isUnderground && !gs.inputBlocked && gs.gatherPrompt === null) {
        const allChests = generateAllCaveChests()
        let nearChest = null as ReturnType<typeof generateAllCaveChests>[0] | null
        let nearChestDist = Infinity
        for (const chest of allChests) {
          if (!isChestAvailable(chest)) continue
          const dx = chest.position.x - px
          const dy = chest.position.y - py
          const dz = chest.position.z - pz
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 < 4 && d2 < nearChestDist) { // within 2m
            nearChestDist = d2
            nearChest = chest
          }
        }
        if (nearChest) {
          // Check player's lockpick inventory and lockpick skill
          const lockpickSlotIdx = inventory.findItem(MAT.LOCKPICK)
          const hasLockpick = lockpickSlotIdx >= 0
          const lockpickSkillLevel = skillSystem.getLevel('survival') // use survival as proxy
          const canOpen = canOpenChest(nearChest, hasLockpick, lockpickSkillLevel)
          const promptLabel = nearChest.locked
            ? (canOpen ? '[F] Pick Lock' : '[F] Open Chest (Need Lockpick)')
            : '[F] Open Chest'
          if (gs.gatherPrompt !== promptLabel) gs.setGatherPrompt(promptLabel)

          if (controllerRef.current?.popInteract()) {
            if (!canOpen) {
              useUiStore.getState().addNotification(
                'Need a Lockpick! Craft one from Iron Ore + Rope.',
                'warning'
              )
            } else {
              // Consume lockpick if chest was locked
              if (nearChest.locked && hasLockpick) {
                inventory.removeItem(lockpickSlotIdx, 1)
              }
              const loot = openChest(nearChest)
              gs.setGatherPrompt(null)
              // Grant loot to player
              let goldGained = 0
              const lootLines: string[] = []
              for (const entry of loot) {
                if (entry.gold !== undefined) {
                  goldGained += entry.gold
                  lootLines.push(`+${entry.gold} gold`)
                } else if (entry.itemId !== undefined) {
                  inventory.addItem({ itemId: entry.itemId, materialId: 0, quantity: entry.qty, quality: 0.85 })
                  lootLines.push(entry.label)
                } else if (entry.matId !== undefined) {
                  inventory.addItem({ itemId: 0, materialId: entry.matId, quantity: entry.qty, quality: 0.8 })
                  lootLines.push(entry.label)
                }
              }
              if (goldGained > 0) {
                usePlayerStore.getState().addGold(goldGained)
              }
              skillSystem.addXp('exploration', 30)
              // Dispatch loot popup event for HUD
              window.dispatchEvent(new CustomEvent('chest-opened', {
                detail: { tier: nearChest.tier, lootLines }
              }))
            }
          }
        }
      }
    }

    // ── M20 Track B: NPC dialogue proximity ──────────────────────────────────
    {
      const dialogueState = useDialogueStore.getState()
      if (!dialogueState.isOpen && !gs.inputBlocked) {
        const remoteNpcs2 = useMultiplayerStore.getState().remoteNpcs
        let closestNpc: typeof remoteNpcs2[0] | null = null
        let closestDist = Infinity
        for (const npc of remoteNpcs2) {
          const dx = npc.x - px, dy = (npc.y ?? 1) - py, dz = npc.z - pz
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < 4 && dist < closestDist) {
            closestDist = dist
            closestNpc = npc
          }
        }
        if (closestNpc && gs.gatherPrompt === null) {
          // Find nearest settlement for NPC name/role
          const settlements = useSettlementStore.getState().settlements
          let npcSettlement = 'Wanderer'
          let nearestSettDist = Infinity
          for (const [, sett] of settlements) {
            const sdx = sett.x - closestNpc.x, sdy = sett.y - closestNpc.y, sdz = sett.z - closestNpc.z
            const sdist = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz)
            if (sdist < nearestSettDist) {
              nearestSettDist = sdist
              npcSettlement = sett.name
            }
          }
          const NPC_ROLES = ['villager', 'guard', 'elder', 'trader', 'artisan', 'scout']
          const npcRole = NPC_ROLES[closestNpc.id % NPC_ROLES.length]
          const isMerchant = npcRole === 'trader'
          const npcName = `${npcSettlement} ${npcRole.charAt(0).toUpperCase() + npcRole.slice(1)}`
          const promptLabel = isMerchant ? `[F] Trade with ${npcName} 🛍` : `[F] Talk to ${npcName}`
          gs.setGatherPrompt(promptLabel)
          if (controllerRef.current?.popInteract()) {
            gs.setGatherPrompt(null)
            if (isMerchant) {
              // M27: Open merchant panel with appropriate archetype
              const civTier = usePlayerStore.getState().civTier
              const archetype = merchantSystem.getArchetypeForSettlementTier(civTier)
              useDialogueStore.getState().setMerchantArchetype(archetype)
              useUiStore.getState().openPanel('merchant')
            } else {
              useDialogueStore.getState().openDialogue(closestNpc.id, npcName, npcRole, npcSettlement)
              useUiStore.getState().openPanel('dialogue')
            }
          }
        }
      }
    }

    // ── M11 Track D: Telescope ───────────────────────────────────────────────
    {
      const ps_tel = usePlayerStore.getState()
      const telSlot = ps_tel.equippedSlot !== null ? inventory.getSlot(ps_tel.equippedSlot) : null
      const hasTelescope = telSlot?.itemId === ITEM.TELESCOPE
      if (hasTelescope && !gs.inputBlocked && gs.gatherPrompt === null) {
        gs.setGatherPrompt('[F] Look through telescope')
        if (controllerRef.current?.popInteract()) {
          window.dispatchEvent(new CustomEvent('open-telescope'))
          gs.setGatherPrompt(null)
        }
      }
    }

    // ── M12 Track A: Rocket ─────────────────────────────────────────────────
    {
      const ps_rkt = usePlayerStore.getState()
      const rktSlot = ps_rkt.equippedSlot !== null ? inventory.getSlot(ps_rkt.equippedSlot) : null
      const hasRocket = rktSlot?.itemId === ITEM.ROCKET
      if (hasRocket && !gs.inputBlocked && !isLaunching()) {
        const launchPads = buildingSystem.getBuildingsProviding('rocket_launch')
        let nearPad = false
        let padPos: [number, number, number] = [px, py, pz]
        for (const pad of launchPads) {
          const dx = px - pad.position[0], dz = pz - pad.position[2]
          if (Math.sqrt(dx * dx + dz * dz) < 15) { nearPad = true; padPos = pad.position; break }
        }
        if (nearPad) {
          if (gs.gatherPrompt !== '[F] Launch Rocket') {
            gs.setGatherPrompt('[F] Launch Rocket')
          }
          if (controllerRef.current?.popInteract()) {
            beginLaunch(padPos)
            for (let i = 0; i < inventory.slotCount; i++) {
              const sl = inventory.getSlot(i)
              if (sl?.itemId === ITEM.ROCKET) { inventory.removeItem(i, 1); break }
            }
            gs.setGatherPrompt(null)
          }
        }
      }
    }

    // ── M14 Track A: Interplanetary transit ──────────────────────────────────
    {
      const transitPhase = useTransitStore.getState().phase
      if (transitPhase === 'idle' && !gs.inputBlocked) {
        const hasCapOrEquip = (() => {
          for (let i = 0; i < inventory.slotCount; i++) {
            const sl = inventory.getSlot(i)
            if (sl?.itemId === ITEM.ORBITAL_CAPSULE) return true
          }
          return false
        })()

        if (hasCapOrEquip) {
          const launchPads = buildingSystem.getBuildingsProviding('rocket_launch')
          let nearPad = false
          let padPos: [number, number, number] = [px, py, pz]
          for (const pad of launchPads) {
            const dx = px - pad.position[0], dz = pz - pad.position[2]
            if (Math.sqrt(dx * dx + dz * dz) < 15) { nearPad = true; padPos = pad.position; break }
          }
          if (nearPad) {
            if (gs.gatherPrompt !== '[F] Board Orbital Capsule') {
              gs.setGatherPrompt('[F] Board Orbital Capsule')
            }
            if (controllerRef.current?.popInteract()) {
              beginInterplanetaryTransit(padPos, 'Home')
              gs.setGatherPrompt(null)
            }
          }
        }
      } else if (transitPhase === 'arrived' && !gs.inputBlocked) {
        if (gs.gatherPrompt !== '[F] Return Home') {
          gs.setGatherPrompt('[F] Return Home')
        }
        if (controllerRef.current?.popInteract()) {
          beginInterplanetaryTransit([px, py, pz], useTransitStore.getState().toPlanet)
          gs.setGatherPrompt(null)
        }
      }
    }

    // ── M14 Track B: Velar Key ────────────────────────────────────────────────
    {
      const velarSt = useVelarStore.getState()
      if (velarSt.gatewayRevealed && !velarSt.gatewayActive && !gs.inputBlocked) {
        let hasKey = false
        for (let i = 0; i < inventory.slotCount; i++) {
          const sl = inventory.getSlot(i)
          if (sl?.itemId === _ITEM.VELAR_KEY) { hasKey = true; break }
        }
        if (hasKey) {
          if (gs.gatherPrompt !== '[F] Activate Velar Gateway') {
            gs.setGatherPrompt('[F] Activate Velar Gateway')
          }
          if (controllerRef.current?.popInteract()) {
            for (let i = 0; i < inventory.slotCount; i++) {
              const sl = inventory.getSlot(i)
              if (sl?.itemId === _ITEM.VELAR_KEY) { inventory.removeItem(i, 1); break }
            }
            try { getWorldSocket()?.send({ type: 'VELAR_GATEWAY_ACTIVATED' }) } catch {}
            gs.setGatherPrompt(null)
            useUiStore.getState().addNotification(
              'Velar Key inserted. The gateway resonates... A new universe is opening.',
              'discovery'
            )
          }
        }
      }
    }

    // ── Ambient temperature update (fire warmth only) ─────────────────────────
    if (simManagerRef.current) {
      const simTemp = simManagerRef.current.getTemperatureAt(px, py, pz)
      const curAmbient = usePlayerStore.getState().ambientTemp
      if (simTemp > curAmbient + 2) {
        usePlayerStore.getState().setAmbientTemp(simTemp)
      }
    }

    // ── Slice 4: Food cooking thermodynamics ──────────────────────────────────
    tickFoodCooking(dt, inventory, simManagerRef.current, px, py, pz)

    // ── M33 Track B: Food buff tick — apply hp regen, warmth regen ────────────
    {
      const dtMs = dt * 1000
      tickFoodBuffs(dtMs, buff => {
        if (buff.hpRegenPerSec && entityId !== null) {
          const maxHp = Health.max[entityId] || 100
          Health.current[entityId] = Math.min(maxHp + (buff.maxHpBonus ?? 0), Health.current[entityId] + buff.hpRegenPerSec * dt)
        }
        if (buff.warmthRegenPerSec) {
          usePlayerStore.getState().addWarmth(buff.warmthRegenPerSec * dt)
        }
      })
    }

    // ── Slice 5: Wound + infection system ─────────────────────────────────────
    tickWoundSystem(dt, entityId ?? 0)

    // ── Slice 6: Sleep / stamina restoration ──────────────────────────────────
    tickSleepSystem(dt, entityId ?? 0)

    // ── Slice 7: Furnace smelting (copper) ────────────────────────────────────
    tickFurnaceSmelting(
      inventory,
      simManagerRef.current,
      buildingSystem.getAllBuildings().map(b => ({
        id: b.id,
        position: b.position,
        typeId: b.typeId,
      })),
      px, py, pz
    )

    // ── M8: Quench countdown timer ────────────────────────────────────────────
    usePlayerStore.getState().tickQuenchTimer(dt)

    // ── M7: Blast furnace smelting (iron) ─────────────────────────────────────
    tickBlastFurnaceSmelting(
      inventory,
      simManagerRef.current,
      buildingSystem.getAllBuildings().map(b => ({
        id: b.id,
        position: b.position,
        typeId: b.typeId,
      })),
      px, py, pz
    )

    // ── M8: Quenching system (hot steel → steel or soft_steel) ───────────────
    tickQuenching(inventory, simManagerRef.current, px, py, pz, useRiverStore.getState().inRiver)

    // ── M11 Track A: Musket reload tick ───────────────────────────────────────
    tickMusket(dt)

    // ── M12 Track A: Rocket launch tick ───────────────────────────────────────
    tickRocket(dt)

    // ── M13 Track C: Nuclear reactor tick ────────────────────────────────────
    {
      const ps = usePlayerStore.getState()
      const _nearOcean = py < PLANET_RADIUS + 2
      const _nearRiver = useRiverStore.getState().nearRiver
      const _hasCooling = _nearRiver || _nearOcean
      tickNuclearReactor(dt, _hasCooling, [ps.x, ps.y, ps.z], entityId ?? 0)
    }

    // ── P2-5: Building physics — fire damage to combustible structures ─────────
    tickBuildingPhysics(dt, buildingSystem, simManagerRef.current)

    // ── M18 Track C: Chemistry-to-gameplay bridge ────────────────────────────
    // Samples local grid chemistry and produces gameplay effects (acid damage,
    // fermentation rewards, photosynthesis O2 boost, combustion heat warnings).
    {
      const chemHealthDelta = tickChemistryGameplay(
        dt, simManagerRef.current, px, py, pz, inventory,
        entityId !== null ? Health.current[entityId] / Health.max[entityId] : 1,
      )
      if (entityId !== null && chemHealthDelta !== 0) {
        const newHp = Health.current[entityId] + chemHealthDelta * Health.max[entityId]
        Health.current[entityId] = Math.max(0, Math.min(Health.max[entityId], newHp))
      }
    }

    // ── Tool use: left click harvests with equipped item ──────────────────────
    const ps2 = usePlayerStore.getState()
    const equippedSlot2 = ps2.equippedSlot ?? null
    const equippedItem2 = equippedSlot2 !== null ? inventory.getSlot(equippedSlot2) : null
    const hasFlint = equippedItem2?.materialId === MAT.FLINT
    const hasFireItem = equippedItem2?.itemId === ITEM.FIRE

    // ── B-10 fix: Show fire-item usage prompt ─────────────────────────────────
    if (hasFireItem && !gs.inputBlocked && gs.gatherPrompt === null) {
      gs.setGatherPrompt('[Left-click] Place fire from item')
    }

    // ── Fire prompt: show when flint equipped + can start fire ────────────────
    if (hasFlint && !gs.inputBlocked) {
      let nearestBurnable: (typeof RESOURCE_NODES)[0] | null = null
      let nearestBurnDist = 3.0
      for (const node of RESOURCE_NODES) {
        if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
        if (node.matId !== MAT.WOOD && node.matId !== MAT.BARK && node.matId !== MAT.FIBER) continue
        const dx = px - node.x, dy = py - node.y, dz = pz - node.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < nearestBurnDist) { nearestBurnDist = dist; nearestBurnable = node }
      }
      const hasInventoryWood   = inventory.countMaterial(MAT.WOOD) >= 1
      const hasInventoryTinder = inventory.countMaterial(MAT.FIBER) >= 1 || inventory.countMaterial(MAT.BARK) >= 1
      if (nearestBurnable) {
        const fireLabel = `[Left-click] Strike flint — ignite ${nearestBurnable.label}`
        if (gs.gatherPrompt !== fireLabel) gs.setGatherPrompt(fireLabel)
      } else if (hasInventoryWood && hasInventoryTinder) {
        const fireLabel = '[Left-click] Strike flint — place campfire from inventory'
        if (gs.gatherPrompt !== fireLabel) gs.setGatherPrompt(fireLabel)
      }
    }

    // ── Fire-starting: equipped flint + left-click near wood/bark/fiber ───────
    if (hasFlint && !gs.inputBlocked && controllerRef.current?.popAttack() && simManagerRef.current) {
      let nearestFireNode: (typeof RESOURCE_NODES)[0] | null = null
      let nearestFireDist = 3.0
      for (const node of RESOURCE_NODES) {
        if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
        if (node.matId !== MAT.WOOD && node.matId !== MAT.BARK && node.matId !== MAT.FIBER) continue
        const dx = px - node.x, dy = py - node.y, dz = pz - node.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist < nearestFireDist) { nearestFireDist = dist; nearestFireNode = node }
      }
      if (nearestFireNode) {
        simManagerRef.current.placeWood(nearestFireNode.x, nearestFireNode.y, nearestFireNode.z, nearestFireNode.matId)
        simManagerRef.current.ignite(nearestFireNode.x, nearestFireNode.y, nearestFireNode.z)
        getWorldSocket()?.send({ type: 'FIRE_STARTED', x: nearestFireNode.x, y: nearestFireNode.y, z: nearestFireNode.z })
        gs.setGatherPrompt(null)
        useUiStore.getState().addNotification('Fire started! Temperature rising...', 'info')
      } else {
        const hasWood   = inventory.countMaterial(MAT.WOOD) >= 1
        const hasTinder = inventory.countMaterial(MAT.FIBER) >= 1 || inventory.countMaterial(MAT.BARK) >= 1
        if (hasWood && hasTinder && simManagerRef.current) {
          const woodIdx   = inventory.findItem(MAT.WOOD)
          const tinderIdx = inventory.findItem(MAT.FIBER) >= 0
            ? inventory.findItem(MAT.FIBER)
            : inventory.findItem(MAT.BARK)
          if (woodIdx >= 0) inventory.removeItem(woodIdx, 1)
          if (tinderIdx >= 0) inventory.removeItem(tinderIdx, 1)
          simManagerRef.current.placeWood(px, py - 1, pz)
          simManagerRef.current.ignite(px, py - 1, pz)
          getWorldSocket()?.send({ type: 'FIRE_STARTED', x: px, y: py - 1, z: pz })
          gs.setGatherPrompt(null)
          useUiStore.getState().addNotification('Fire started from inventory! Temperature rising...', 'info')
        } else if (!hasWood || !hasTinder) {
          useUiStore.getState().addNotification('Need wood + tinder (fiber/bark) in inventory to start fire', 'warning')
        }
      }
    } else if (!gs.inputBlocked && controllerRef.current?.popAttack()) {
      const equippedItem = equippedItem2
      const itemId       = equippedItem?.itemId ?? 0
      const stats        = getItemStats(itemId)

      // ── B-10 fix: ITEM.FIRE equipped → place + ignite fire at player's feet ─
      const _isFireItem = itemId === ITEM.FIRE
      if (_isFireItem && simManagerRef.current) {
        simManagerRef.current.placeWood(px, py - 1, pz)
        simManagerRef.current.ignite(px, py - 1, pz)
        getWorldSocket()?.send({ type: 'FIRE_STARTED', x: px, y: py - 1, z: pz })
        if (equippedSlot2 !== null) inventory.removeItem(equippedSlot2, 1)
        gs.setGatherPrompt(null)
        useUiStore.getState().addNotification('Fire placed!', 'info')
      }

      // ── M11: Musket firing ────────────────────────────────────────────────
      const _isMusket = itemId === ITEM.MUSKET
      if (_isMusket) {
        if (!isMusketReady()) {
          useUiStore.getState().addNotification('Musket reloading...', 'warning')
        } else {
          const hasBall = inventory.countMaterial(MAT.MUSKET_BALL) > 0
          if (!hasBall) {
            useUiStore.getState().addNotification('No musket balls! Craft iron balls first.', 'warning')
          } else {
            const ballSlot = inventory.findItem(MAT.MUSKET_BALL)
            if (ballSlot >= 0) inventory.removeItem(ballSlot, 1)
            let targetEid: number | null = null
            let _nearestDist = Infinity
            for (const [eid] of creatureWander) {
              const dx = Position.x[eid] - px, dy = Position.y[eid] - py, dz = Position.z[eid] - pz
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
              if (dist < stats.range && dist < _nearestDist) { _nearestDist = dist; targetEid = eid }
            }
            const shotResult = fireMusket(px, py, pz, targetEid)
            if (shotResult && shotResult.effectiveHit && targetEid !== null) {
              Health.current[targetEid] = Math.max(0, Health.current[targetEid] - shotResult.damage)
              if (Health.current[targetEid] <= 0) {
                inventory.addItem({ itemId: 0, materialId: MAT.RAW_MEAT, quantity: 1, quality: 0.8 })
                inventory.addItem({ itemId: 0, materialId: MAT.HIDE, quantity: 1, quality: 0.7 })
                creatureWander.delete(targetEid)
                removeEntity(world, targetEid)
                skillSystem.addXp('combat', 60) // M22: Combat XP on musket kill
                useUiStore.getState().addNotification('Creature killed by musket shot!', 'discovery')
              } else {
                useUiStore.getState().addNotification(`Musket hit — ${shotResult.damage} dmg! Reloading (8s)...`, 'warning')
              }
            } else if (shotResult) {
              useUiStore.getState().addNotification('Musket fired — missed! Reloading (8s)...', 'info')
            }
          }
        }
      }

      // ── Check creatures / harvest (skip for musket/fire-item) ───────────────
      if (!_isMusket && !_isFireItem) {
        // M24: Check combat system cooldown before allowing attack
        if (!combatSystem.canAttack()) {
          // Attack on cooldown — skip
        } else {
        // M24: Start attack — get combo multiplier and apply cooldown
        const comboMult = combatSystem.startAttack(stats.name)
        // M31 Track C: Improved crit — 5% base + 2%/combat level + 15% backstab
        const combatLevel = skillSystem.getLevel('combat')
        const isCritical = combatSystem.rollCrit(combatLevel)
        const critMult = isCritical ? CombatSystem.CRIT_MULTIPLIER : 1.0
        const skillDmgMult = skillSystem.getBonuses().combatDamageMultiplier
        const totalDamage = stats.damage * comboMult * critMult * skillDmgMult

        // M31 Track C: Weapon durability — reduce by 1 per attack on equipped weapon
        const eqSlot = usePlayerStore.getState().equippedSlot
        if (eqSlot !== null) {
          usePlayerStore.getState().reduceWeaponDurability(eqSlot, 1)
          const dur = usePlayerStore.getState().weaponDurability[eqSlot] ?? 100
          if (dur <= 0) {
            // Weapon breaks — remove from inventory and notify
            const brokenSlot = inventory.getSlot(eqSlot)
            const brokenName = brokenSlot ? stats.name : 'weapon'
            inventory.dropItem(eqSlot, brokenSlot?.quantity ?? 1)
            usePlayerStore.getState().unequip()
            useUiStore.getState().addNotification(`Your ${brokenName} broke!`, 'error')
          }
        }

        let hitCreature = false
        let nearestCreatureEid = -1
        let nearestCreatureDist = Infinity
        for (const [eid] of creatureWander) {
          const dx = Position.x[eid] - px
          const dy = Position.y[eid] - py
          const dz = Position.z[eid] - pz
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < stats.range && dist < nearestCreatureDist) {
            nearestCreatureDist = dist
            nearestCreatureEid = eid
          }
        }
        if (nearestCreatureEid >= 0) {
          hitCreature = true
          Health.current[nearestCreatureEid] = Math.max(0, Health.current[nearestCreatureEid] - totalDamage)
          const hp = Health.current[nearestCreatureEid]
          const maxHp2 = Health.max[nearestCreatureEid] || 100
          // M24: Spawn damage number
          combatSystem.spawnDamageNumber(
            Position.x[nearestCreatureEid], Position.y[nearestCreatureEid] + 1.5, Position.z[nearestCreatureEid],
            totalDamage, isCritical
          )
          // M24: Update health bar
          combatSystem.updateEnemyHealth(
            nearestCreatureEid, 'creature',
            Position.x[nearestCreatureEid], Position.y[nearestCreatureEid], Position.z[nearestCreatureEid],
            hp, maxHp2
          )
          if (hp <= 0) {
            inventory.addItem({ itemId: 0, materialId: MAT.RAW_MEAT, quantity: 1 + Math.floor(CreatureBody.size[nearestCreatureEid] * 2), quality: 0.8 })
            inventory.addItem({ itemId: 0, materialId: MAT.HIDE,     quantity: 1, quality: 0.7 })
            creatureWander.delete(nearestCreatureEid)
            removeEntity(world, nearestCreatureEid)
            skillSystem.addXp('combat', 40) // M22: Combat XP on creature kill
            useUiStore.getState().addNotification('Creature killed — raw meat + hide collected!', 'discovery')
          } else {
            useUiStore.getState().addNotification(
              `Hit creature for ${Math.round(totalDamage)} dmg (${hp.toFixed(0)}/${maxHp2} HP remaining)`,
              'warning'
            )
          }
        }

        // ── M9: Check if player hit a deer/wolf/boar ─────────────────────────
        if (!hitCreature) {
          const animalHit = attackNearestAnimal(px, py, pz, totalDamage, stats.range)
          if (animalHit) {
            hitCreature = true
            const { killed, hit, loot, effectiveDamage } = animalHit
            // M24: Spawn damage number at hit position
            if (hit) {
              combatSystem.spawnDamageNumber(hit.x, hit.y + 1.5, hit.z, effectiveDamage, isCritical)
              // M24: Update health bar for surviving animals
              if (!killed) {
                combatSystem.updateEnemyHealth(hit.id, hit.species, hit.x, hit.y, hit.z, hit.health, hit.maxHealth)
              }
            }
            if (killed) {
              const speciesName = killed.species.charAt(0).toUpperCase() + killed.species.slice(1)
              // M23: Use loot table system for rarity-aware drops
              const speciesTable = SPECIES_LOOT[killed.species]
              if (speciesTable) {
                const lootDrops = rollLoot(speciesTable)
                for (const drop of lootDrops) {
                  inventory.addItem(drop)
                }
                const lootSummary = lootDrops.map(l => {
                  const rarityName = l.rarity && l.rarity > 0 ? ` [${RARITY_NAMES[(l.rarity ?? 0) as RarityTier]}]` : ''
                  return `${l.quantity}x item${rarityName}`
                }).join(', ')
                useUiStore.getState().addNotification(
                  `${speciesName} killed — ${lootSummary}`, 'discovery'
                )
              } else {
                // Fallback to old loot system for unknown species
                for (const drop of loot) {
                  inventory.addItem({ itemId: 0, materialId: drop.materialId, quantity: drop.quantity, quality: 0.8 })
                }
                const lootSummary = loot.map(l => `${l.quantity}x ${l.label}`).join(', ')
                useUiStore.getState().addNotification(
                  `${speciesName} killed — ${lootSummary} collected!`, 'discovery'
                )
              }
              skillSystem.addXp('combat', 50) // M22: Combat XP on animal kill
              // M23: Quest progress on kill
              questSystem.onKill(killed.species)
              // M33: Settlement quest board progress on kill
              {
                const sqStore = useSettlementQuestStore.getState()
                const active = sqStore.getActiveQuests()
                for (const q of active) {
                  if (q.type === 'hunt') {
                    sqStore.updateProgress(q.id, 1)
                    const updated = useSettlementQuestStore.getState().quests[q.id]
                    if (updated && updated.progress >= updated.targetCount) {
                      sqStore.completeQuest(q.id)
                      usePlayerStore.getState().addGold(q.reward.gold)
                      skillSystem.addXp('combat', q.reward.xp)
                      useUiStore.getState().addNotification(
                        `Quest Complete: "${q.title}" +${q.reward.xp} XP +${q.reward.gold} gold`,
                        'discovery'
                      )
                    }
                  }
                }
              }
              // M24: Achievement progress on kill
              achievementSystem.onKill(killed.species)
              achievementSystem.onDealDamage(effectiveDamage)
            } else {
              useUiStore.getState().addNotification(
                `Hit animal for ${Math.round(effectiveDamage)} dmg!`, 'warning'
              )
            }
          }
        }

        // ── M7 T2: Check if player hit a remote player (PvP) ─────────────────
        if (!hitCreature) {
          const remotePlayers = useMultiplayerStore.getState().remotePlayers
          for (const rp of remotePlayers.values()) {
            const dx = rp.x - px, dy = rp.y - py, dz = rp.z - pz
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (dist < stats.range + 1.5) {
              const dmgFraction = stats.damage / 100
              const newHealth   = Math.max(0, (rp.health ?? 1) - dmgFraction)
              useMultiplayerStore.getState().upsertRemotePlayer({ ...rp, health: newHealth })

              if (newHealth <= 0) {
                getWorldSocket()?.send({ type: 'PLAYER_KILLED', victimId: rp.userId })
                const wanted = useOutlawStore.getState().getWantedEntry(rp.userId)
                if (wanted) {
                  getWorldSocket()?.send({ type: 'BOUNTY_COLLECT', targetId: rp.userId })
                }
                useUiStore.getState().addNotification(
                  `You killed ${rp.username}!${wanted ? ` Bounty claim submitted: ${wanted.reward} copper.` : ''}`,
                  'error'
                )
              } else {
                useUiStore.getState().addNotification(
                  `Hit ${rp.username} for ${stats.damage} dmg (${(newHealth * 100).toFixed(0)}% HP remaining)`,
                  'warning'
                )
              }
              hitCreature = true
              break
            }
          }
        }

        // ── M6: Check if player hit a server NPC ──────────────────────────────
        if (!hitCreature) {
          const remoteNpcs = useMultiplayerStore.getState().remoteNpcs
          for (const npc of remoteNpcs) {
            const dx = npc.x - px, dy = (npc.y ?? 1) - py, dz = npc.z - pz
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (dist < stats.range + 1) {
              const nearSettlementId = useSettlementStore.getState().nearSettlementId
              if (nearSettlementId !== null) {
                getWorldSocket()?.send({ type: 'NPC_ATTACKED', settlementId: nearSettlementId })
                useUiStore.getState().addNotification(
                  'You attacked a settlement member! They will remember this.',
                  'warning'
                )
              }
              hitCreature = true
              break
            }
          }
        }

        // ── Resource node harvesting (only if no creature was hit) ─────────────
        let nearest: (typeof RESOURCE_NODES)[0] | null = null
        let nearestDist2 = Infinity

        if (!hitCreature) {
          for (const node of RESOURCE_NODES) {
            if (gatheredNodeIds.has(node.id) || serverDepleted.has(node.id)) continue
            const dx = node.x - px
            const dy = node.y - py
            const dz = node.z - pz
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (dist < stats.range && dist < nearestDist2 && canHarvest(itemId, node.type)) {
              nearest = node
              nearestDist2 = dist
            }
          }

          if (!nearest) {
            useUiStore.getState().addNotification(
              `Nothing to hit — get closer or equip the right tool (reach: ${stats.range.toFixed(1)}m)`,
              'warning'
            )
          }
        }

        if (nearest) {
          const maxHits2   = getNodeMaxHits(nearest.type, stats.harvestPower)
          const hitsSoFar2 = (NODE_HITS_TAKEN.get(nearest.id) ?? 0) + 1
          NODE_HITS_TAKEN.set(nearest.id, hitsSoFar2)

          if (hitsSoFar2 >= maxHits2) {
            NODE_HITS_TAKEN.delete(nearest.id)
            const qty     = nearest.type === 'wood' ? 3 : Math.floor(Math.random() * 3) + 1
            const quality = 0.7 + Math.random() * 0.3
            inventory.addItem({ itemId: 0, materialId: nearest.matId, quantity: qty, quality })
            gatheredNodeIds.add(nearest.id)
            NODE_RESPAWN_AT.set(nearest.id, Date.now() + NODE_RESPAWN_DELAY)
            getWorldSocket()?.send({
              type: 'NODE_DESTROYED',
              nodeId: nearest.id,
              nodeType: nearest.type,
              x: nearest.x, y: nearest.y, z: nearest.z,
            })
            // M22: Gathering XP on left-click harvest
            skillSystem.addXp('gathering', 20)
            const verb = nearest.type === 'wood' ? 'Felled' : 'Harvested'
            useUiStore.getState().addNotification(`${verb} ${qty}× ${nearest.label}`, 'info')
          } else {
            const hitsLeft = maxHits2 - hitsSoFar2
            useUiStore.getState().addNotification(
              `Hit ${nearest.label} — ${hitsLeft} more hit${hitsLeft > 1 ? 's' : ''} to fell`,
              'info'
            )
          }
        }
      } // end if (!_isMusket && !_isFireItem)
      } // end if (combatSystem.canAttack()) else
    }

    // ── Eat (E key) ───────────────────────────────────────────────────────────
    if (!gs.inputBlocked) {
      const psNow = usePlayerStore.getState()
      if (inventory.countMaterial(MAT.COOKED_MEAT) > 0 && psNow.hunger > 0.05) {
        const eatLabel = '[E] Eat cooked meat'
        if (gs.gatherPrompt === null) gs.setGatherPrompt(eatLabel)
      }
      // M30 Track B: Show drink prompt for fermented beverages
      if (inventory.countMaterial(MAT.ALCOHOL) > 0) {
        if (gs.gatherPrompt === null) gs.setGatherPrompt('[E] Drink grain spirit (+warmth)')
      } else if (inventory.countMaterial(MAT.MEAD) > 0) {
        if (gs.gatherPrompt === null) gs.setGatherPrompt('[E] Drink mead (+warmth +hunger)')
      }
      // M33 Track B: Show eat prompt for cooked buff foods
      const buffFoodIds = [MAT.COOKED_FISH, MAT.MUSHROOM_SOUP, MAT.BERRY_JAM, MAT.HERBAL_TEA, MAT.HEARTY_STEW]
      for (const fid of buffFoodIds) {
        if (inventory.countMaterial(fid) > 0) {
          const labels: Record<number, string> = {
            [MAT.COOKED_FISH]:   '[E] Eat cooked fish (+HP regen)',
            [MAT.MUSHROOM_SOUP]: '[E] Eat mushroom soup (+speed)',
            [MAT.BERRY_JAM]:     '[E] Eat berry jam (+speed burst)',
            [MAT.HERBAL_TEA]:    '[E] Drink herbal tea (+warmth)',
            [MAT.HEARTY_STEW]:   '[E] Eat hearty stew (full meal!)',
          }
          if (gs.gatherPrompt === null) gs.setGatherPrompt(labels[fid] ?? '[E] Eat food')
          break
        }
      }
      if (psNow.wounds.length > 0 && inventory.countMaterial(MAT.LEAF) > 0) {
        const herbLabel = '[H] Apply herb to wound'
        if (gs.gatherPrompt === null) gs.setGatherPrompt(herbLabel)
      }
      const nearFurnace = buildingSystem.getAllBuildings().find(b => {
        if (b.typeId !== 'smelting_furnace' && b.typeId !== 'stone_furnace') return false
        const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
        return dx * dx + dy * dy + dz * dz < 36
      })
      if (nearFurnace && gs.gatherPrompt === null) {
        const furnaceTemp = simManagerRef.current ? simManagerRef.current.getTemperatureAt(
          nearFurnace.position[0], nearFurnace.position[1], nearFurnace.position[2]
        ) : 0
        const hasOre = inventory.countMaterial(MAT.COPPER_ORE) >= 3
        const hasChar = inventory.countMaterial(MAT.CHARCOAL) >= 2
        if (hasOre && hasChar) {
          const smeltLabel = `[F] Smelt copper — furnace ${furnaceTemp.toFixed(0)}°C / 500°C needed`
          gs.setGatherPrompt(smeltLabel)
        } else if (!hasOre) {
          gs.setGatherPrompt(`Furnace nearby — need 3x Copper Ore + 2x Charcoal to smelt`)
        }
      }

      const nearShelter = buildingSystem.getAllBuildings().some(b => {
        const shelterTypes = ['lean_to', 'pit_house', 'mud_brick_house', 'stone_house']
        if (!shelterTypes.includes(b.typeId)) return false
        const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
        return dx * dx + dy * dy + dz * dz < 64
      })
      const hasBedroll = inventory.hasItemById(ITEM.BEDROLL)
      if ((nearShelter || hasBedroll) && !psNow.isSleeping) {
        const sleepLabel = '[Z] Sleep — restore stamina'
        if (gs.gatherPrompt === null) gs.setGatherPrompt(sleepLabel)
      }
      if (psNow.isSleeping) {
        gs.setGatherPrompt('[Z] Wake up')
      }
    }

    // ── M28 Track B: Raft — tick buoyancy/movement, show proximity prompt ─────
    {
      const raftSt = getRaftState()
      const raftSimTime = useGameStore.getState().simSeconds
      const keysSetRaft = (controllerRef.current as any)?._keys ?? (controllerRef.current as any)?.keys ?? new Set<string>()
      if (!gs.inputBlocked) {
        tickRaft(entityId ?? 0, keysSetRaft, dt, raftSimTime)
        if (raftSt.mounted) {
          // Sync Rapier body to raft position so physics doesn't fight the raft
          const rb = rapierWorld.getPlayer()?.body
          if (rb) {
            rb.setNextKinematicTranslation({
              x: Position.x[entityId ?? 0],
              y: Position.y[entityId ?? 0],
              z: Position.z[entityId ?? 0],
            })
          }
        } else {
          // Show mount prompt when near a placed raft
          const allRafts = buildingSystem.getAllBuildings().filter(b => b.typeId === 'raft')
          for (const rb2 of allRafts) {
            const drx = rb2.position[0] - px
            const dry = rb2.position[1] - py
            const drz = rb2.position[2] - pz
            if (drx * drx + dry * dry + drz * drz < 4) {
              if (gs.gatherPrompt === null) gs.setGatherPrompt('[E] Board Raft')
              break
            }
          }
        }
      }
    }

    // ── E key: eat cooked food, apply herb, or drink from river ──────────────
    if (!gs.inputBlocked && controllerRef.current?.popEat?.()) {
      // M28: if near raft, use E to mount/dismount instead of eat
      const raftStE = getRaftState()
      if (raftStE.mounted) {
        dismountRaft(entityId ?? 0)
        useUiStore.getState().addNotification('Dismounted raft', 'info')
        // Don't fall through to eat
      } else if (tryMountRaft(entityId ?? 0)) {
        useUiStore.getState().addNotification('Mounted raft — WASD to sail, Q/E to rotate, E to dismount', 'discovery')
        // Don't fall through to eat
      } else {
    // Original eat block wrapped in else
      if (!tryEatFood(inventory, entityId ?? 0)) {
        const _psE = usePlayerStore.getState()
        if (_psE.wounds.length > 0 && !tryApplyHerb(inventory)) {
          // tryApplyHerb already showed the appropriate notification
        } else if (_psE.wounds.length === 0) {
          const _inRiver = useRiverStore.getState().inRiver
          if (_inRiver) {
            if (_psE.thirst > 0.01) {
              const instant = Math.min(_psE.thirst, 0.25)
              _psE.updateVitals({ thirst: Math.max(0, _psE.thirst - instant) })
              Metabolism.thirst[entityId ?? 0] = Math.max(0, _psE.thirst - instant)
              useUiStore.getState().addNotification('Drank from river — thirst reduced!', 'info')
            }
          }
        }
      }
      } // close else (not raft interaction)
    }

    // ── H key: apply herb to wound ────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popHerb?.()) {
      tryApplyHerb(inventory)
    }

    // ── Z key: sleep / wake ───────────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popSleep?.()) {
      const didSleep = tryStartSleep(
        inventory,
        buildingSystem.getAllBuildings().map(b => ({ position: b.position, typeId: b.typeId })),
        px, py, pz
      )
      {
        const psAfterSleep = usePlayerStore.getState()
        if (didSleep && psAfterSleep.bedrollPlaced) {
          const prevPos = psAfterSleep.bedrollPos
          const sameSpot = prevPos
            && Math.abs(prevPos.x - px) < 0.1
            && Math.abs(prevPos.z - pz) < 0.1
          if (!sameSpot) {
            psAfterSleep.setBedrollPos({ x: px, y: py, z: pz })
            setPlacedBedrollAnchor({ x: px, y: py, z: pz })
            useUiStore.getState().addNotification(
              'Bedroll placed! This is now your respawn point.', 'discovery'
            )
          }
        }
      }
    }

    // ── Dig (G key) ───────────────────────────────────────────────────────────
    if (!gs.inputBlocked && controllerRef.current?.popDig()) {
      const sr = surfaceRadiusAt(px, py, pz)
      const len = Math.sqrt(px * px + py * py + pz * pz)
      const ux = px / len, uy = py / len, uz = pz / len
      const gx = ux * sr, gy = uy * sr, gz = uz * sr
      if (DIG_HOLES.length >= MAX_DIG_HOLES) DIG_HOLES.shift()
      DIG_HOLES.push({ x: gx, y: gy, z: gz, r: DIG_RADIUS })
      const digDir = new THREE.Vector3(ux, uy, uz)
      const surfH   = terrainHeightAt(digDir)
      const digMats = getSurfaceDigMaterials(digDir, surfH)
      const mat = digMats[Math.floor(Math.random() * digMats.length)]
      const qty = Math.floor(Math.random() * 3) + 1
      inventory.addItem({ itemId: 0, materialId: mat, quantity: qty, quality: 0.7 })
      const addNotification = useUiStore.getState().addNotification
      const matLabel = (Object.entries(MAT).find(([, v]) => v === mat)?.[0] ?? 'Material')
        .replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())
      skillSystem.addXp('gathering', 10) // M22: Gathering XP on dig
      addNotification(`Dug up ${qty}× ${matLabel}`, 'info')
    }

    // ── M6: Settlement proximity check ────────────────────────────────────────
    {
      const SETTLEMENT_PROXIMITY_RADIUS_SQ = 150 * 150
      const SETTLEMENT_CHECK_INTERVAL = 3
      settlementCheckTimerRef.current += dt
      if (settlementCheckTimerRef.current >= SETTLEMENT_CHECK_INTERVAL) {
        settlementCheckTimerRef.current = 0
        const settlementStore = useSettlementStore.getState()
        let nearestId: number | null = null
        let nearestDistSq = Infinity
        for (const s of settlementStore.settlements.values()) {
          const dx = px - s.x, dz = pz - s.z
          const distSq = dx * dx + dz * dz
          if (distSq < SETTLEMENT_PROXIMITY_RADIUS_SQ && distSq < nearestDistSq) {
            nearestId   = s.id
            nearestDistSq = distSq
          }
        }
        const prevNearId = settlementStore.nearSettlementId
        if (nearestId !== prevNearId) {
          settlementStore.setNearSettlement(nearestId)
          if (nearestId === null) {
            settlementStore.setPendingOffer(null)
          }
        }
        if (nearestId !== null) {
          getWorldSocket()?.send({ type: 'PLAYER_NEAR_SETTLEMENT', settlementId: nearestId })

          const localMurderCount = usePlayerStore.getState().murderCount
          const gatesAlreadyClosed = useSettlementStore.getState().closedGates.has(nearestId)
          if (!gatesAlreadyClosed) {
            if (localMurderCount >= 1 && localMurderCount <= 2) {
              useUiStore.getState().addNotification('Strangers are wary of you. Shop prices increased.', 'warning')
            }
          }
        }
      }
    }

    // ── M8: Weather simulation integration ────────────────────────────────────
    {
      const sectorId = getSectorIdForPosition(px, py, pz)
      const wStore = useWeatherStore.getState()
      if (sectorId !== wStore.playerSectorId) {
        wStore.setPlayerSectorId(sectorId)
      }
      const playerWeather = wStore.getPlayerWeather()
      const wState = playerWeather?.state ?? 'CLEAR'
      const wTemp  = playerWeather?.temperature ?? 15

      if ((wState === 'RAIN' || wState === 'STORM') && simManagerRef.current) {
        const rainChance = wState === 'STORM' ? 1.0 : 0.5
        if (Math.random() < rainChance * dt) {
          simManagerRef.current.suppressFire(px, py, pz, 15)
        }
      }

      if (wState === 'STORM' || wState === 'RAIN') {
        const storedTemp = usePlayerStore.getState().ambientTemp
        const windChill = Math.max(wTemp - (playerWeather?.windSpeed ?? 0) * 0.5, wTemp - 12)
        const rate = wState === 'STORM' ? 2.0 : 0.8
        const newTemp = storedTemp + (windChill - storedTemp) * Math.min(1, rate * dt)
        usePlayerStore.getState().setAmbientTemp(newTemp)

        if (newTemp < 0 && !inventory.isGodMode()) {
          const coldDps = wState === 'STORM' ? 1.5 : 0.5
          Health.current[entityId] = Math.max(0, Health.current[entityId] - coldDps * dt)
          markColdDamage()
        }
      } else {
        const storedTemp = usePlayerStore.getState().ambientTemp
        if (Math.abs(storedTemp - wTemp) > 0.1) {
          const newTemp = storedTemp + (wTemp - storedTemp) * Math.min(1, 0.4 * dt)
          usePlayerStore.getState().setAmbientTemp(newTemp)
        }
      }
    }

    // ── M29 Track B: Weather-responsive gameplay ──────────────────────────────
    {
      const wStore29   = useWeatherStore.getState()
      const pw29       = wStore29.getPlayerWeather()
      const wState29   = pw29?.state ?? 'CLEAR'

      // B4: Storm/rain movement penalty
      setWeatherSpeedMult(wState29 === 'STORM' ? 0.6 : wState29 === 'RAIN' ? 0.85 : 1.0)

      // B1: Warmth drain by weather type
      const dayAngle29 = getDayAngle()
      const isNight29  = Math.sin(dayAngle29) <= 0
      const nightMult  = isNight29 ? 2.0 : 1.0
      const drainRates: Record<string, number> = { CLEAR: 0, CLOUDY: 0.5, RAIN: 1.5, STORM: 3.0 }
      const drainRate29 = (drainRates[wState29] ?? 0) * nightMult
      if (drainRate29 > 0 && !inventory.isGodMode()) {
        usePlayerStore.getState().addWarmth(-drainRate29 * dt)
      }

      // B2: Campfire warmth bonus (+5/s when within 8m of active campfire)
      {
        const CAMPFIRE_IDS = new Set(['campfire_pit', 'campfire'])
        const buildings29 = buildingSystem.getAllBuildings()
        let nearFire = false
        for (const b of buildings29) {
          if (!CAMPFIRE_IDS.has(b.typeId)) continue
          const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
          const dist2 = dx * dx + dy * dy + dz * dz
          if (dist2 < 64) { // 8m squared
            // Check if there's actual fire heat from simulation (campfire is lit)
            const fireTemp = simManagerRef.current
              ? simManagerRef.current.getTemperatureAt(b.position[0], b.position[1], b.position[2])
              : 0
            if (fireTemp > 30) { nearFire = true; break }
            // Fallback: assume campfire is active if sim not available
            if (!simManagerRef.current) { nearFire = true; break }
          }
        }
        if (nearFire) {
          usePlayerStore.getState().addWarmth(5 * dt)
        }
      }

      // B1: Cold damage when warmth < 20 — every 10s deal -1 HP
      if (!inventory.isGodMode()) {
        const warmth29 = usePlayerStore.getState().warmth
        if (warmth29 < 20) {
          coldDamageTimerRef.current += dt
          if (coldDamageTimerRef.current >= 10) {
            coldDamageTimerRef.current = 0
            Health.current[entityId] = Math.max(0, Health.current[entityId] - 1)
            useUiStore.getState().addNotification('You are freezing! Find warmth or a campfire!', 'warning')
          }
        } else {
          coldDamageTimerRef.current = 0
        }
      }

      // B3: Rain/Storm extinguishes campfires every 10s (10% per campfire)
      if (wState29 === 'RAIN' || wState29 === 'STORM') {
        rainFireTimerRef.current += dt
        if (rainFireTimerRef.current >= 10) {
          rainFireTimerRef.current = 0
          const campfireBuildings = buildingSystem.getAllBuildings().filter(b =>
            b.typeId === 'campfire_pit' || b.typeId === 'campfire'
          )
          for (const b of campfireBuildings) {
            if (Math.random() < 0.1) {
              // Suppress fire at this location
              if (simManagerRef.current) {
                simManagerRef.current.suppressFire(b.position[0], b.position[1], b.position[2], 3)
              }
              // Notify player if near the campfire
              const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
              if (dx * dx + dy * dy + dz * dz < 100) {
                useUiStore.getState().addNotification('Your campfire was extinguished by the rain!', 'warning')
              }
            }
          }
        }
      } else {
        rainFireTimerRef.current = 0
      }

      // B5: Lightning strikes during STORM
      if (wState29 === 'STORM') {
        if (lightningTimerRef.current <= 0) {
          // Schedule next strike: 30-90s
          lightningTimerRef.current = 30 + Math.random() * 60
        }
        lightningTimerRef.current -= dt
        if (lightningTimerRef.current <= 0) {
          // Fire a lightning strike
          const angle  = Math.random() * Math.PI * 2
          const dist   = Math.random() * 100
          const sx = px + Math.cos(angle) * dist
          const sz = pz + Math.sin(angle) * dist
          const sy = py  // approximate

          // Flash overlay
          window.dispatchEvent(new CustomEvent('lightning-flash'))

          // Damage player if within 3m
          const dx = px - sx, dz = pz - sz
          if (dx * dx + dz * dz < 9) {
            if (!inventory.isGodMode()) {
              Health.current[entityId] = Math.max(0, Health.current[entityId] - 50)
              useUiStore.getState().addNotification('⚡ You were struck by lightning! (-50 HP)', 'error')
            }
          }

          // Ignite fire at strike position
          if (simManagerRef.current) {
            simManagerRef.current.ignite(sx, sy, sz)
          }

          // Dispatch strike position for Three.js visual (spawned in SceneRoot or separate effect)
          window.dispatchEvent(new CustomEvent('lightning-strike', { detail: { x: sx, y: sy, z: sz } }))

          // Schedule next strike
          lightningTimerRef.current = 30 + Math.random() * 60
        }
      } else {
        lightningTimerRef.current = 0
      }
    }

    // ── M9: River system ──────────────────────────────────────────────────────
    {
      const RIVER_NEAR_DIST    = 20
      const RIVER_IN_DIST      = 6
      const RIVER_DRINK_RATE   = 0.04
      const WIND_CHILL_VALLEY_FACTOR = 0.7

      const rStore = useRiverStore.getState()
      const nearResult = queryNearestRiver(px, py, pz, RIVER_NEAR_DIST)

      if (nearResult) {
        if (!rStore.nearRiver) rStore.setNearRiver(true)

        const inRiver = nearResult.dist < RIVER_IN_DIST
        if (inRiver !== rStore.inRiver) rStore.setInRiver(inRiver)

        if (inRiver) {
          const pushScale = nearResult.speed * 0.4
          const cvx = nearResult.flowDirX * pushScale
          const cvy = nearResult.flowDirY * pushScale
          const cvz = nearResult.flowDirZ * pushScale
          rStore.setRiverCurrent(cvx, cvy, cvz)

          Velocity.x[entityId] = (Velocity.x[entityId] || 0) + cvx * dt
          Velocity.y[entityId] = (Velocity.y[entityId] || 0) + cvy * dt
          Velocity.z[entityId] = (Velocity.z[entityId] || 0) + cvz * dt

          const kccBody = rapierWorld.getPlayer()?.body
          if (kccBody) {
            const t3 = kccBody.translation()
            kccBody.setNextKinematicTranslation({
              x: t3.x + cvx * dt,
              y: t3.y + cvy * dt,
              z: t3.z + cvz * dt,
            })
          }

          const psRiver = usePlayerStore.getState()
          if (psRiver.thirst > 0.02) {
            const newThirst = Math.max(0, psRiver.thirst - RIVER_DRINK_RATE * dt)
            psRiver.updateVitals({ thirst: newThirst })
            Metabolism.thirst[entityId] = newThirst
          }

          if (nearResult.t > 0.3) {
            const psW = usePlayerStore.getState()
            const currentTemp = psW.ambientTemp
            if (currentTemp < 5) {
              const warmedTemp = currentTemp + (5 - currentTemp) * WIND_CHILL_VALLEY_FACTOR * dt * 0.5
              psW.setAmbientTemp(warmedTemp)
            }
          }
        } else {
          rStore.clearRiverCurrent()
        }

        if (!gs.inputBlocked && usePlayerStore.getState().thirst > 0.1) {
          const drinkLabel = inRiver
            ? '[E] Drink from river — restoring thirst'
            : `River nearby (${nearResult.dist.toFixed(0)}m) — approach to drink`
          if (gs.gatherPrompt === null) gs.setGatherPrompt(drinkLabel)
        }
      } else {
        if (rStore.nearRiver)   rStore.setNearRiver(false)
        if (rStore.inRiver)     rStore.setInRiver(false)
        rStore.clearRiverCurrent()
      }
    }

    // ── M10 Track A: Season metabolic multiplier ──────────────────────────────
    {
      const seasonState = useSeasonStore.getState()
      const mult = seasonState.metabolicMult ?? 1.0
      if (mult !== 1.0) {
        const baseRate = 0.07
        Metabolism.metabolicRate[entityId] = baseRate * mult
      }

      const tempMod = seasonState.tempModifier ?? 0
      if (tempMod !== 0 && simManagerRef.current) {
        const curTemp = usePlayerStore.getState().ambientTemp
        const target = curTemp + tempMod * 0.02
        usePlayerStore.getState().setAmbientTemp(curTemp + (target - curTemp) * Math.min(1, dt))
      }
    }

    // ── M10 Track B: Sailing + fishing ────────────────────────────────────────
    {
      const ps10 = usePlayerStore.getState()
      const equippedSlot10 = ps10.equippedSlot ?? null
      const equippedItem10 = equippedSlot10 !== null ? inventory.getSlot(equippedSlot10) : null
      let vesselType: VesselType | null = null
      if (equippedItem10 && equippedItem10.itemId === ITEM.RAFT) vesselType = 'raft'
      else if (equippedItem10 && equippedItem10.itemId === ITEM.SAILING_BOAT) vesselType = 'sailing_boat'

      const wStore10 = useWeatherStore.getState()
      const pw10 = wStore10.getPlayerWeather()
      const windDir10 = pw10?.windDir ?? 0
      const windSpeed10 = pw10?.windSpeed ?? 3

      const keysSet = (controllerRef.current as any)?._keys ?? (controllerRef.current as any)?.keys ?? new Set()

      const sailDelta = tickSailing(
        px, py, pz,
        windDir10, windSpeed10,
        keysSet,
        dt,
        vesselType,
      )

      if (sailDelta) {
        Position.x[entityId] += sailDelta.dx
        Position.y[entityId] += sailDelta.dy
        Position.z[entityId] += sailDelta.dz
      }

      const nearWater = py < PLANET_RADIUS + 2
      const nearRiver10 = useRiverStore.getState().inRiver
      const canFish = (nearWater || nearRiver10) && inventory.hasItemById(ITEM.FISHING_ROD)
      const gs10 = useGameStore.getState()

      // ── M25 Track C: New fishing state machine ──────────────────────────────
      {
        const fsPhase = fishingSystem.state.phase
        const keysSet25 = (controllerRef.current as any)?._keys ?? (controllerRef.current as any)?.keys ?? new Set()
        const fKeyHeld = keysSet25.has('KeyF') || keysSet25.has('f') || keysSet25.has('F')

        if (canFish && fsPhase === 'idle' && !isFishingActive() && !gs10.inputBlocked) {
          const fishLabel = '[F] Cast fishing rod'
          if (gs10.gatherPrompt === null) gs10.setGatherPrompt(fishLabel)
        } else if ((nearWater || nearRiver10) && !inventory.hasItemById(ITEM.FISHING_ROD) && fsPhase === 'idle' && !gs10.inputBlocked) {
          // Discovery path: player is near water but has no fishing rod — show discovery hint
          const discoverLabel = '[F] Fish'
          if (gs10.gatherPrompt === null) gs10.setGatherPrompt(discoverLabel)
        }

        if (canFish && !gs10.inputBlocked && controllerRef.current?.popInteract()) {
          if (fsPhase === 'idle') {
            // Cast line — open fishing panel
            fishingSystem.cast()
            useUiStore.getState().openPanel('fishing')
            useUiStore.getState().addNotification('Line cast! Watch the fishing panel.', 'info')
            gs10.setGatherPrompt(null)
          } else if (fsPhase === 'biting') {
            // Player pressed F during bite window — start reeling
            fishingSystem.startReel()
          } else if (fsPhase === 'landed' || fsPhase === 'escaped') {
            // Reset so next F press casts again
            fishingSystem.reset()
          }
        }

        if (fsPhase === 'biting' && !gs10.inputBlocked && controllerRef.current?.popInteract()) {
          // Already handled above; no-op here to avoid double-consume
        }

        // Tick fishing state machine every frame (pass F-held for reeling)
        if (fsPhase !== 'idle') {
          const result = fishingSystem.tick(dt, fKeyHeld)
          if (result === 'landed') {
            const caught = fishingSystem.state.lastCatch
            if (caught) {
              inventory.addItem({ itemId: 0, materialId: MAT.FISH, quantity: 1, quality: caught.rarity === 'Rare' ? 1.0 : caught.rarity === 'Uncommon' ? 0.85 : 0.7 })
              useUiStore.getState().addNotification(`Caught ${caught.rarity} ${caught.name}! Added to inventory.`, 'discovery')
              skillSystem.addXp('gathering', caught.rarity === 'Rare' ? 50 : caught.rarity === 'Uncommon' ? 30 : 15)
            }
          } else if (result === 'escaped') {
            useUiStore.getState().addNotification('The fish got away! Try again.', 'warning')
          }
        }
      }

      // ── Legacy M10 Track B fishing (SailingSystem) — kept for compatibility ─
      if (false && canFish && !isFishingActive()) {
        // Legacy path disabled — M25 Track C handles fishing above
        const started = startFishing()
        if (started) {
          useUiStore.getState().addNotification('Line cast — waiting for a bite... (5-15s)', 'info')
          gs10.setGatherPrompt('Fishing... [Esc to cancel]')
          fishingStateRef.current = 'waiting'
        }
      }

      if (isFishingActive()) {
        const fishResult = tickFishing(dt)
        fishingStateRef.current = fishResult
        if (fishResult === 'bite') {
          inventory.addItem({ itemId: 0, materialId: MAT.FISH, quantity: 1 + Math.floor(Math.random() * 2), quality: 0.8 })
          useUiStore.getState().addNotification('Fish caught! Raw fish added to inventory.', 'discovery')
          gs10.setGatherPrompt(null)
          fishingStateRef.current = 'idle'
        }
      }

      if (equippedItem10 && equippedItem10.itemId === ITEM.COMPASS && gs10.gatherPrompt === null) {
        const playerDir10 = new THREE.Vector3(px, py, pz).normalize()
        const northTangent = new THREE.Vector3(0, 0, 1).addScaledVector(playerDir10, -new THREE.Vector3(0, 0, 1).dot(playerDir10))
        const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        camFwd.addScaledVector(playerDir10, -camFwd.dot(playerDir10))
        const bearing = northTangent.angleTo(camFwd) * (180 / Math.PI)
        const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        const card = cardinals[Math.round(bearing / 45) % 8]
        gs10.setGatherPrompt(`Compass: ${card} (${bearing.toFixed(0)}°)`)
      }

      if (controllerRef.current?.popInteract()) {
        const nearSettlement10 = useSettlementStore.getState().nearSettlementId
        if (nearSettlement10 !== null && gs10.gatherPrompt === null) {
          getWorldSocket()?.send({ type: 'SHOP_OPEN_REQUEST', settlementId: nearSettlement10 })
        }
      }

      if (useShopStore.getState().open) {
        const gs10b = useGameStore.getState()
        if (gs10b.inputBlocked) useShopStore.getState().closeShop()
      }
    }

    // ── M22: Auto-save offline every 60s ────────────────────────────────────
    offlineSaveTimerRef.current += dt
    if (offlineSaveTimerRef.current >= 60) {
      offlineSaveTimerRef.current = 0
      saveOffline().catch(() => {})
    }

    // ── M26 Track B: Tick emote system (cleans expired remote emotes) ────────
    tickEmoteSystem()

    // ── M22: Passive survival XP every 60s alive ────────────────────────────
    survivalXpTimerRef.current += dt
    if (survivalXpTimerRef.current >= 60) {
      survivalXpTimerRef.current = 0
      skillSystem.addXp('survival', 5)
    }

    // ── M23: Quest day-tick + tier-check ────────────────────────────────────
    {
      const dayCount = useGameStore.getState().dayCount ?? 1
      questSystem.onDayTick(dayCount)
      const currentTier = usePlayerStore.getState().civTier ?? 0
      questSystem.onTierReached(currentTier)
    }

    // ── M24: Achievement system tick ────────────────────────────────────────
    {
      const gs2 = useGameStore.getState()
      const dayCount2 = gs2.dayCount ?? 1
      const healthPct = Health.current[entityId] / (Health.max[entityId] || 100)
      const isNight = (gs2.simSeconds % 1200) > 600
      const biome = gs2.currentBiome ?? ''
      const mapRevealPct = 0  // TODO: wire real map reveal
      const belowSeaLevel = Position.y[entityId] < 0
      achievementSystem.tick(dt, px, py, pz, healthPct, dayCount2, isNight, biome, mapRevealPct, belowSeaLevel)
    }

    // ── M24: Tutorial system tick ───────────────────────────────────────────
    if (tutorialSystem && !tutorialSystem.isComplete) {
      const hasWood = inventory.listItems().some((it: any) => it.materialId === 1 && it.quantity > 0)
      const hasStoneAxe = inventory.listItems().some((it: any) => it.itemId === 2)
      const equippedIsAxe = false  // TODO: read from EquipSystem
      const hasCampfire = buildingSystem.getAllBuildings().some((b: any) => b.type === 'campfire')
      const hasAttackedAnimal = combatSystem.isInCombat
      tutorialSystem.tick(dt, px, py, pz, hasWood, hasStoneAxe, equippedIsAxe, hasCampfire, hasAttackedAnimal, 0)
    }

    // ── M7 T2: NPC guard aggro ────────────────────────────────────────────────
    {
      const localMurderCount = usePlayerStore.getState().murderCount
      const WANTED_THRESHOLD_CLIENT = 5
      const GUARD_RANGE_SQ = 30 * 30
      const GUARD_DPS = 8
      if (localMurderCount >= WANTED_THRESHOLD_CLIENT) {
        const nearestSettlement = useSettlementStore.getState().nearSettlementId
        if (nearestSettlement !== null) {
          const remoteNpcs3 = useMultiplayerStore.getState().remoteNpcs
          for (const npc of remoteNpcs3) {
            const dx = npc.x - px, dy = (npc.y ?? 1) - py, dz = npc.z - pz
            const distSq = dx * dx + dy * dy + dz * dz
            if (distSq < GUARD_RANGE_SQ) {
              const guardDmg = GUARD_DPS * dt
              Health.current[entityId] = Math.max(0, Health.current[entityId] - guardDmg)
              markCombatDamage()
              break
            }
          }
        }
      }
    }
  })

  return null
}
