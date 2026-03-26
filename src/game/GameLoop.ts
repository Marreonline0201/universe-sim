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
import { festivalSystem } from './FestivalSystem'
import { useFestivalStore } from '../store/festivalStore'
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
  spawnAnimal,
  animalRegistry,
} from '../ecs/systems/AnimalAISystem'

import { inventory, buildingSystem, questSystem, combatSystem, achievementSystem, tutorialSystem, fishingSystem, merchantSystem } from './GameSingletons'
import { checkAchievements, getPlayerStats } from './AchievementSystem'
import { checkAndUpdateTitles } from './ReputationTitleSystem'
import { getNPCName } from './NPCScheduleSystem'
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
  BIOME_EXCLUSIVE_TYPES,
  BIOME_NODE_LABELS,
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
import { generateQuestsForSettlement } from './QuestGenerator'
import { useCivStore } from '../store/civStore'
import { checkAndFireMilestones } from './CivMilestoneSystem'
// M33 Track B: Food buff system
import { consumeFood, tickFoodBuffs } from './FoodBuffSystem'
// M34 Track B: Boss system
import { trySpawnBoss, damageBoss, currentBoss } from './BossSystem'
// M35 Track C: Faction system
import { useFactionStore } from '../store/factionStore'
import { FACTIONS, getFactionRelationship, FACTION_IDS } from './FactionSystem'
// M36 Track B: Dungeon room system
// M40 Track C: mini_boss + spike_trap rooms
// M47 Track C: scaled boss/mini-boss HP per floor
import {
  generateAllDungeonRooms,
  isDungeonRoomActive,
  activatePlate,
  clearDungeonRoom,
  resetDungeonRoom,
  nextPlateInSequence,
  CAVE_STALKER,
  CAVE_BOSS,
  dungeonState,
  damageMiniBoss,
  triggerTrap,
  disarmTrap,
  initMiniBossRoom,
  initSpikeTrapRoom,
  getScaledBossHp,
  getScaledMiniBossHp,
  type DungeonRoom,
} from './DungeonSystem'
import { useDungeonStore } from '../store/dungeonStore'
// M37 Track A: World event participation
import { currentWorldEvent, completeWorldEvent } from './WorldEventSystem'
// M37 Track C: Player stats tracking + title check
import { usePlayerStatsStore } from '../store/playerStatsStore'
import { checkNewTitles } from './TitleSystem'
// M40 Track B: Magic spell system
import { spellSystem } from './SpellSystem'
import { useSpellStore } from '../store/spellStore'
// M41 Track B: Mount and riding system
import { useMountStore } from '../store/mountStore'
import { setMountSpeedMult } from '../player/PlayerController'
// M42 Track B: Shelter system + cave entrances for shelter detection
import { updateShelterState, shelterState } from './ShelterSystem'
import { getCaveEntrancePositions } from '../rendering/CaveEntrances'
// M42 Track C: NPC reputation system
import { useReputationStore } from '../store/reputationStore'
// M43 Track B: Market restock tick
import { marketSystem } from './MarketSystem'
// M43 Track C: Map exploration + fog of war
import { useExplorationStore } from '../store/explorationStore'
// M46 Track B: Settlement siege events
import { tickSiege, startSiege, activeSiege } from './SiegeSystem'
// M46 Track C: Recipe unlock — skill milestone discoveries
import { discoverRecipe } from './RecipeUnlockSystem'
// M47 Track B: Environmental hazards
import { getActiveHazard, HAZARD_DEFS, HAZARD_ZONE_TYPE_BY_ID } from './HazardSystem'
import { isPotionFireImmune } from './PotionSystem'
// M48 Track B: NPC Merchant Restocking Events
import { tickRestockEvent, triggerRestockEvent } from './MerchantRestockSystem'
// M48 Track C: World events log
import { logCombatEvent } from './WorldEventLogger'
// M49 Track B: Trading routes
import { tickRoutes } from './TradingRouteSystem'
// M50 Track B: Weather forecast system
import { updateForecasts } from './WeatherForecastSystem'
// M52 Track C: Day/night event system
import { onTimeTransition, tickDayNightEvents } from './DayNightEventSystem'
// M52 Track A: Faction war events
import { tickFactionWars } from './FactionWarSystem'
// M53 Track A: Seasonal events
import { onSeasonChange, tickSeasonalEvents, normaliseSeasonName } from './SeasonalEventSystem'
// M53 Track C: Combo system
import { onHit, tickCombo, getDamageMultiplier } from './ComboSystem'
// M54 Track A: Merchant guild periodic refresh
import { refreshContracts } from './MerchantGuildSystem'
// M54 Track B: Bounty board
import { onKill as bountyOnKill, tickBountyBoard } from './BountyBoardSystem'
// M54 Track C: Exploration discovery system
import { checkDiscoveries } from './ExplorationDiscoverySystem'
// M55 Track B: Resource depletion & respawn system
import { tickResourceRespawn, harvestNode as depleteNode, getNearbyNodes, recordDepletedAt } from './ResourceDepletionSystem'

// M55 Track B: Map world node types to ResourceDepletionSystem types for harvest linking
const WORLD_TO_DEPLETION_TYPE: Record<string, string> = {
  wood: 'tree', bark: 'tree', ancient_wood: 'tree',
  iron_ore: 'ore_vein', copper_ore: 'ore_vein', coal: 'ore_vein', tin_ore: 'ore_vein',
  gold: 'ore_vein', silver: 'ore_vein', uranium: 'ore_vein', shadow_iron: 'ore_vein',
  luminite: 'ore_vein', sulfur: 'ore_vein', saltpeter: 'ore_vein',
  fiber: 'herb_patch', leaf: 'herb_patch', rubber: 'herb_patch',
  berry: 'berry_bush',
  stone: 'stone_deposit', flint: 'stone_deposit', clay: 'stone_deposit',
  sand: 'stone_deposit', glacier_ice: 'stone_deposit', desert_crystal: 'stone_deposit',
  volcanic_glass: 'stone_deposit',
  mushroom: 'mushroom_ring',
}
// M56 Track A: Dynamic NPC trade routes
import { tickTradeRoutes } from './TradeRouteSystem'

// Register skill system with offline save manager for serialization
registerSkillSystem(skillSystem)
// Register quest system with offline save manager for serialization (M23)
registerQuestSystem(questSystem)
// Register achievement + tutorial systems with offline save manager (M24)
registerAchievementSystem(achievementSystem)
registerTutorialSystem(tutorialSystem)

// M40 Track B: Give player starter spells
spellSystem.learnSpell('fireball')
spellSystem.learnSpell('heal')
spellSystem.equipSpell('fireball', 0)
spellSystem.equipSpell('heal', 1)

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
  const civTierTimerRef         = useRef(0)   // M39 Track C: seconds since last civ tier sync
  const ecosystemTimerRef       = useRef(0)   // M9: seconds since last ecosystem respawn check
  const fishingStateRef         = useRef<'idle'|'waiting'|'bite'>('idle')  // M10 Track B
  const offlineSaveTimerRef     = useRef(0)    // M22: auto-save every 60s
  const survivalXpTimerRef      = useRef(0)    // M22: passive survival XP every 60s
  // M29 Track B: Weather gameplay timers
  const coldDamageTimerRef      = useRef(0)    // 10s cold damage tick when warmth < 20
  const rainFireTimerRef        = useRef(0)    // 10s rain extinguishes fires check
  const lightningTimerRef       = useRef(0)    // countdown to next lightning strike
  const warmthStormMultRef      = useRef(1)    // storm movement speed multiplier
  // M42 Track B: Shelter update timer (every 2s) + heat exhaustion notify timer
  const shelterUpdateTimerRef   = useRef(0)    // shelter check every 2s
  const heatExhaustionNotifRef  = useRef(0)    // heat exhaustion warning throttle
  // M47 Track A: Periodic achievement check (every 30 real-time seconds)
  const achievementCheckTimerRef = useRef(0)
  // M35 Track B: Disaster system timers
  const tornadoSpawnTimerRef    = useRef(300 + Math.random() * 300)  // seconds until next tornado attempt
  const earthquakeTimerRef      = useRef(3600 + Math.random() * 3600) // seconds until next earthquake chance
  const earthquakeActiveRef     = useRef(0)   // countdown for active shake (0 = inactive)
  const volcanicAshTimerRef     = useRef(0)   // accumulates time near volcano
  const lavaCheckTimerRef       = useRef(0)   // 0.5s tick for lava damage
  // M47 Track B: active hazard tracking (id of last hazard zone entered, or null)
  const activeHazardIdRef       = useRef<string | null>(null)
  // M32: pending tame — animal id waiting for name input
  const pendingTameAnimalRef    = useRef<number | null>(null)
  // M34 Track A: home placement mode (true when player pressed B with HOME_DEED)
  const homePlacementModeRef    = useRef(false)
  // M35 Track C: faction war event timers
  const factionWarTimerRef      = useRef(0)  // seconds since last war check (fires every 60s)
  const factionHealTimerRef     = useRef(0)  // seconds since last settlement health tick (every 60s)
  // M36 Track B: Dungeon room tracking
  const dungeonRoomCheckRef     = useRef(0)  // seconds since last dungeon room respawn check (every 30s)
  const puzzleResetCheckRef     = useRef<Record<string, number>>({}) // roomId → reset timestamp
  // M37 Track A: World event completion tracking
  const worldEventCompletedRef  = useRef<string | null>(null)  // eventId that was completed this session
  // M37 Track C: Distance tracking for stats
  const lastStatsPos            = useRef<{ x: number; z: number } | null>(null)
  // M38 Track B: Track which faction abilities have been registered
  const registeredFactionAbilityRef = useRef<string | null>(null)
  // M43 Track C: Exploration tick — every 5s mark cells around player as explored
  const explorationTimerRef = useRef(0)
  // M43 Track C: Cave discovery dedup — set of cave IDs already discovered
  const discoveredCaveIdsRef = useRef<Set<string>>(new Set())
  // M46 Track B: Siege trigger timer — check every 600s (10 minutes)
  const siegeTriggerTimerRef = useRef(0)
  // M48 Track B: Merchant restock trigger timer — check every 300s (5 minutes)
  const restockTriggerTimerRef = useRef(0)
  // M50 Track B: Weather forecast refresh timer — every 60 game-seconds
  const forecastTimerRef = useRef(0)
  // M52 Track C: Last known time period for transition detection
  const lastTimePeriodRef = useRef<'dawn' | 'day' | 'dusk' | 'night' | null>(null)
  // M52 Track A: Faction war system tick timer — fires every 120 sim-seconds
  const warTimerRef = useRef(0)
  // M53 Track A: Last known season for seasonal-event change detection
  const lastSeasonRef = useRef<string | null>(null)
  // M54 Track A: Merchant guild contract refresh timer — fires every 60s
  const guildTimerRef = useRef(0)
  // M54 Track B: Bounty board tick timer — fires every 60s
  const bountyTimerRef = useRef(0)
  // M54 Track C: Exploration discovery check timer — fires every 2s
  const discoveryTimerRef = useRef(0)
  // M55 Track B: Resource respawn tick timer — fires every 5s
  const resourceRespawnTimerRef = useRef(0)
  // M56 Track A: NPC trade route tick timer — fires every 30s
  const tradeRouteTimerRef = useRef(0)

  useFrame((_, delta) => {
    // Cap dt to avoid spiral-of-death on slow frames
    const dt = Math.min(delta, 0.1)

    // M5: Reset damage-source flags at frame start so this frame's damage is tracked fresh
    resetDamageFlags()

    // M40 Track B: Mana regeneration + periodic store sync
    spellSystem.tick(dt)
    useSpellStore.getState().syncFromSystem()

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

    // M35 Track B: Earthquake camera shake — sinusoidal offset
    if (earthquakeActiveRef.current > 0) {
      const shakeIntensity = Math.min(1, earthquakeActiveRef.current / 3) * 0.3
      camera.position.x += Math.sin(Date.now() * 0.05) * shakeIntensity
      camera.position.y += Math.sin(Date.now() * 0.07 + 1.2) * shakeIntensity * 0.5
      camera.position.z += Math.cos(Date.now() * 0.04 + 0.8) * shakeIntensity
    }

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
    // M53 Track C: Combo system tick (dt is seconds, tickCombo expects ms)
    tickCombo(dt * 1000)

    // M38 Track B: Faction ability lazy registration
    {
      const pf = useFactionStore.getState().playerFaction
      if (pf && registeredFactionAbilityRef.current !== pf) {
        registeredFactionAbilityRef.current = pf
        const abilityDefs: Record<string, { name: string; description: string; cooldownMs: number }> = {
          rangers:   { name: "Hunter's Mark",  description: '+30% dmg to marked enemy for 10s', cooldownMs: 30_000 },
          merchants: { name: 'Golden Bribe',   description: 'Confuse non-boss enemy for 5s',   cooldownMs: 45_000 },
          scholars:  { name: 'Mind Blast',     description: 'Stun all enemies within 10m for 3s', cooldownMs: 60_000 },
          outlaws:   { name: 'Berserk',        description: 'Next 3 attacks deal 2x dmg for 5s',  cooldownMs: 40_000 },
        }
        const def = abilityDefs[pf]
        if (def) {
          combatSystem.registerFactionAbility(pf, {
            name: def.name,
            description: def.description,
            cooldownMs: def.cooldownMs,
            lastUsedMs: 0,
            applyEffect: () => {},
          })
        }
      }
    }

    // M38 Track B: Stamina regeneration — 10/s when not sprinting or dodging
    {
      const ps38 = usePlayerStore.getState()
      const isSprinting = !!(controllerRef.current as any)?.keys?.has?.('ShiftLeft') ||
                          !!(controllerRef.current as any)?.keys?.has?.('ShiftRight')
      const isDodgingNow = combatSystem.isDodging
      if (!isSprinting && !isDodgingNow && ps38.stamina < ps38.maxStamina) {
        ps38.addStamina(10 * dt)
      }
    }

    // M41 Track B: Mount and riding system
    {
      if (gs.inputBlocked) {
        // Clear any pending R key while UI is open so it doesn't fire on panel close
        controllerRef.current?.popMount()
      } else {
      const mountSt = useMountStore.getState()
      const isMounted = mountSt.mountedAnimalId !== null

      // R key: mount nearby tamed animal or dismount
      if (controllerRef.current?.popMount()) {
        if (isMounted) {
          // Dismount
          mountSt.dismount()
          setMountSpeedMult(1.0)
          window.dispatchEvent(new CustomEvent('mount-changed', { detail: { mounted: false } }))
        } else {
          // Find nearby tamed animal within 3m
          const _pxM = Position.x[entityId], _pyM = Position.y[entityId], _pzM = Position.z[entityId]
          let nearestTamed: import('../ecs/systems/AnimalAISystem').AnimalEntity | null = null
          let nearestTamedDist = 3
          for (const [, aData] of animalRegistry) {
            if (!aData.tamed || aData.behavior === 'DEAD') continue
            const dx = aData.x - _pxM, dy = aData.y - _pyM, dz = aData.z - _pzM
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (dist < nearestTamedDist) {
              nearestTamedDist = dist
              nearestTamed = aData
            }
          }
          if (nearestTamed) {
            // Determine speed based on species
            // wolf = fast, boar = medium, others = slower
            const sp: string = nearestTamed.species
            let mountSpeed = 1.3
            if (sp === 'wolf') mountSpeed = 1.6
            else if (sp === 'boar') mountSpeed = 1.4
            const mountName = nearestTamed.petName || nearestTamed.species
            mountSt.mount(nearestTamed.id, mountName, nearestTamed.health, mountSpeed)
            setMountSpeedMult(mountSpeed)
            window.dispatchEvent(new CustomEvent('mount-changed', { detail: { mounted: true, name: mountName } }))
            useUiStore.getState().addNotification(`Mounted ${mountName}! Shift = gallop. R = dismount.`, 'discovery')
          } else {
            useUiStore.getState().addNotification('No tamed animal nearby to mount.', 'warning')
          }
        }
      }

      if (isMounted) {
        const isGallopKey = !!(controllerRef.current as any)?.keys?.has?.('ShiftLeft') ||
                            !!(controllerRef.current as any)?.keys?.has?.('ShiftRight')
        const curStamina = mountSt.mountStamina

        // Update gallop state
        if (isGallopKey !== mountSt.isGalloping) {
          mountSt.setGalloping(isGallopKey)
        }

        if (isGallopKey && curStamina > 0) {
          // Gallop: 2× speed, drain stamina 15/s
          setMountSpeedMult(mountSt.mountSpeed * 2.0)
          const newStamina = curStamina - 15 * dt
          mountSt.setMountStamina(newStamina)
          // Force dismount if stamina runs out (check computed value, not stale snapshot)
          if (newStamina <= 0) {
            mountSt.dismount()
            setMountSpeedMult(1.0)
            window.dispatchEvent(new CustomEvent('mount-changed', { detail: { mounted: false } }))
            useUiStore.getState().addNotification('Mount exhausted — dismounted!', 'warning')
          }
        } else {
          // Normal riding speed
          setMountSpeedMult(mountSt.mountSpeed)
          // Regen stamina at 5/s when not galloping
          if (curStamina < 100) {
            mountSt.setMountStamina(curStamina + 5 * dt)
          }
          if (isGallopKey && curStamina <= 0) {
            mountSt.setGalloping(false)
          }
        }
      } else {
        // Not mounted — ensure speed mult is reset
        setMountSpeedMult(1.0)
      }
      } // end !inputBlocked
    }

    // M38 Track B: Dodge roll — check for double-tap dodge request
    {
      if (controllerRef.current?.popDodgeRequest()) {
        const ps38 = usePlayerStore.getState()
        if (!ps38.drainStamina(20)) {
          // Not enough stamina — flash warning
          combatSystem.triggerNoStaminaFlash()
        } else {
          const dodged = combatSystem.startDodge()
          if (!dodged) {
            // Still on cooldown — refund stamina
            ps38.addStamina(20)
          } else {
            achievementSystem.onDodge()
          }
        }
      }
    }

    // M38 Track B: Faction ability (X key)
    {
      if (controllerRef.current?.popFactionAbility()) {
        const { playerFaction } = useFactionStore.getState()
        if (playerFaction) {
          // Find nearest animal/enemy for targeted abilities
          let nearestAnimalId: number | null = null
          let nearestAnimalDist = 15  // within 15m
          const _px38 = Position.x[entityId], _py38 = Position.y[entityId], _pz38 = Position.z[entityId]
          for (const [aid, animal] of animalRegistry) {
            if (animal.behavior === 'DEAD') continue
            const dx = animal.x - _px38, dy = animal.y - _py38, dz = animal.z - _pz38
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
            if (dist < nearestAnimalDist) {
              nearestAnimalDist = dist
              nearestAnimalId = aid
            }
          }
          const activated = combatSystem.activateFactionAbility(playerFaction, nearestAnimalId)
          if (!activated) {
            useUiStore.getState().addNotification('Ability on cooldown!', 'warning')
          } else {
            // Apply AoE stun (Mind Blast) — scholars
            if (playerFaction === 'scholars' && combatSystem.aoeStunPending) {
              combatSystem.consumeAoeStun()
              const stunIds: number[] = []
              for (const [aid, animal] of animalRegistry) {
                if (animal.behavior === 'DEAD') continue
                const dx = animal.x - _px38, dy = animal.y - _py38, dz = animal.z - _pz38
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
                if (dist <= 10) stunIds.push(aid)
              }
              combatSystem.applyAoeStun(stunIds, 3)
              useUiStore.getState().addNotification(`Mind Blast! Stunned ${stunIds.length} enemies!`, 'discovery')
            } else {
              const ab = combatSystem.getFactionAbility(playerFaction)
              if (ab) useUiStore.getState().addNotification(`${ab.name} activated!`, 'discovery')
            }
          }
        }
      }
    }

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

    // M34 Track B: Boss spawn tick — try to spawn boss when new in-game day begins
    {
      const _bossSpawnDayAngle = getDayAngle()
      trySpawnBoss(
        _bossSpawnDayAngle,
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

    // M37 Track C: accumulate distance traveled
    if (lastStatsPos.current !== null) {
      const ddx = px - lastStatsPos.current.x
      const ddz = pz - lastStatsPos.current.z
      const moved = Math.sqrt(ddx * ddx + ddz * ddz)
      if (moved > 0.05) {
        usePlayerStatsStore.getState().incrementStat('distanceTraveled', moved)
        lastStatsPos.current = { x: px, z: pz }
      }
    } else {
      lastStatsPos.current = { x: px, z: pz }
    }

    // ── M37 Track A: World event proximity / participation ────────────────────
    {
      const ev = currentWorldEvent
      if (ev && ev.active && ev.id !== worldEventCompletedRef.current) {
        const [ex, ey, ez] = ev.position
        const dx = px - ex, dy = py - ey, dz = pz - ez
        const dist2 = dx * dx + dy * dy + dz * dz
        let completed = false

        if (ev.type === 'treasure_hunt' && dist2 < 25) {          // 5m
          completed = true
        } else if (ev.type === 'meteor_impact' && dist2 < 64) {   // 8m — gather crater resources
          completed = true
        } else if (ev.type === 'migration' && dist2 < 400) {      // 20m — near herd
          // Check if any tamed animal is within 30m of player (taming happened nearby)
          let hasTamedNearby = false
          for (const [, aData] of animalRegistry) {
            if ((aData as {tamed?: boolean}).tamed) { hasTamedNearby = true; break }
          }
          if (hasTamedNearby) completed = true
        } else if (ev.type === 'ancient_ruins' && dist2 < 9 && controllerRef.current?.popInteract()) { // 3m + E
          completed = true
        } else if (ev.type === 'faction_war' && dist2 < 225) {    // 15m — in the battle zone
          completed = true
        }

        if (completed) {
          worldEventCompletedRef.current = ev.id
          completeWorldEvent(ev.id, 'local')
          // Grant XP (gold already granted inside completeWorldEvent)
          skillSystem.addXp('combat', ev.rewards.xp)
          // Notify server
          getWorldSocket()?.send({ type: 'WORLD_EVENT_COMPLETE', eventId: ev.id })
        }
      }
    }

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
                  // M37 Track C: Track tame stat
                  usePlayerStatsStore.getState().incrementStat('animalsTamed')
                  checkNewTitles()
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

      // M38 Track C: Biome-exclusive node skill gate (requires Crafting Lv.3)
      const isBiomeNode = BIOME_EXCLUSIVE_TYPES.has(nearNode.type)
      const craftingLevel = skillSystem.getLevel('crafting')
      const hasBiomeSkill = craftingLevel >= 3
      const biomeLabel = BIOME_NODE_LABELS[nearNode.type]

      let label: string
      if (isBiomeNode && !hasBiomeSkill) {
        label = `[Need Crafting Lv.3] ${nearNode.label}${biomeLabel ? ` (${biomeLabel})` : ''}`
      } else {
        const biomeTag = biomeLabel ? ` (${biomeLabel})` : ''
        label = canGather
          ? maxHits > 1
            ? `[F] Gather ${nearNode.label}${biomeTag}  ·  Hit ${hitsSoFar + 1}/${maxHits}`
            : `[F] Gather ${nearNode.label}${biomeTag}`
          : isIronOre
            ? `[Need Iron Pickaxe] ${nearNode.label}`
            : `[Need Stone Tool] ${nearNode.label}`
      }
      const canActuallyGather = canGather && (!isBiomeNode || hasBiomeSkill)
      if (gs.gatherPrompt !== label) gs.setGatherPrompt(label)

      if (canActuallyGather && !gs.inputBlocked && controllerRef.current?.popInteract()) {
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
          // M55 Track B: Deduct a charge from the nearest ResourceDepletionSystem node
          {
            const deplType = WORLD_TO_DEPLETION_TYPE[nearNode.type]
            if (deplType) {
              const nearby = getNearbyNodes(px, pz, 200).filter(n => n.type === deplType && !n.depleted)
              if (nearby.length > 0) {
                const closest = nearby.reduce((a, b) => {
                  const da = (a.position.x - px) ** 2 + (a.position.z - pz) ** 2
                  const db = (b.position.x - px) ** 2 + (b.position.z - pz) ** 2
                  return da < db ? a : b
                })
                if (depleteNode(closest.id)) {
                  recordDepletedAt(closest.id, useGameStore.getState().simSeconds)
                }
              }
            }
          }
          // M22: Gathering XP (10-30 based on ore vs basic)
          skillSystem.addXp('gathering', isOre ? 25 : 15)
          // M46 Track C: Unlock recipe discoveries at gathering milestones
          {
            const gatherLv = skillSystem.getLevel('gathering')
            if (gatherLv >= 3) {
              discoverRecipe(34)  // Gunpowder — gathering Lv.3 milestone
            }
            if (gatherLv >= 5) {
              discoverRecipe(58)  // Charcoal Powder — gathering Lv.5 milestone
            }
          }
          // M37 Track C: Track gather stat
          usePlayerStatsStore.getState().incrementStat('resourcesGathered', qty)
          checkNewTitles()
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
                  // M42 Track C: Quest completion → reputation gain
                  {
                    const nearId = useSettlementStore.getState().nearSettlementId
                    if (nearId !== null) {
                      const sName = useSettlementStore.getState().settlements.get(nearId)?.name ?? 'Unknown'
                      useReputationStore.getState().addPoints(nearId, sName, 50)
                    }
                  }
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

    // ── M36 Track B: Dungeon room interactions ────────────────────────────────
    {
      const isUG = useCaveStore.getState().underground
      if (isUG) {
        const allRooms = generateAllDungeonRooms()
        const uiSt = useUiStore.getState()
        const pPos = new THREE.Vector3(px, py, pz)

        // Periodic room-respawn check every 30s
        dungeonRoomCheckRef.current += dt
        if (dungeonRoomCheckRef.current > 30) {
          dungeonRoomCheckRef.current = 0
          for (const room of allRooms) {
            if (room.cleared && Date.now() - room.clearedAt > room.respawnMs) {
              resetDungeonRoom(room)
            }
          }
        }

        for (const room of allRooms) {
          if (!isDungeonRoomActive(room)) continue

          const rPos = new THREE.Vector3(...room.position)
          const distToRoom = pPos.distanceTo(rPos)

          // ── Guardian room ─────────────────────────────────────────────────
          if (room.type === 'guardian') {
            const triggerRadius = room.radius + 2
            if (distToRoom < triggerRadius) {
              // Show warning once per room visit
              if (!room.warned) {
                room.warned = true
                uiSt.addNotification('⚠ Guardian Chamber — Enemies ahead', 'warning')
              }
              // Spawn guardian stalkers if not yet spawned
              if (room.guardianIds.length === 0) {
                for (let gi = 0; gi < room.guardianCount; gi++) {
                  const angle = (gi / room.guardianCount) * Math.PI * 2
                  const spawnX = rPos.x + Math.cos(angle) * 4
                  const spawnY = rPos.y
                  const spawnZ = rPos.z + Math.sin(angle) * 4
                  // Spawn as elite wolves with cave stalker stats
                  const stalker = spawnAnimal('wolf', spawnX, spawnY, spawnZ, 9999, rPos.x, rPos.y, rPos.z)
                  stalker.health = CAVE_STALKER.hp
                  stalker.maxHealth = CAVE_STALKER.maxHp
                  stalker.elite = true
                  stalker.eliteGlowColor = '#333344'
                  room.guardianIds.push(stalker.id)
                }
              }
              // Check if all guardians are dead
              if (room.guardianIds.length > 0) {
                const allDead = room.guardianIds.every(gid => {
                  const g = animalRegistry.get(gid)
                  return !g || g.behavior === 'DEAD' || g.health <= 0
                })
                if (allDead) {
                  clearDungeonRoom(room)
                  uiSt.addNotification('Guardian Chamber cleared! Legendary chest unlocked.', 'discovery')
                  window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'guardian', roomId: room.id } }))
                }
              }
            }

            // Open legendary chest (post-clear, player within 2m)
            if (room.cleared) {
              const isUnderground = useCaveStore.getState().underground
              if (isUnderground && distToRoom < 2 && !gs.inputBlocked && gs.gatherPrompt === null) {
                gs.setGatherPrompt('[F] Open Legendary Chest')
                if (controllerRef.current?.popInteract()) {
                  gs.setGatherPrompt(null)
                  const lootLines = ['10x Iron Ore', '3x Velar Crystal', '+500 gold', 'Diamond Blade']
                  inventory.addItem({ itemId: 0, materialId: 14, quantity: 10, quality: 0.9 }) // iron ore
                  inventory.addItem({ itemId: 0, materialId: 40, quantity: 3,  quality: 1.0 }) // velar crystal
                  usePlayerStore.getState().addGold(500)
                  skillSystem.addXp('exploration', 100)
                  uiSt.addNotification('Legendary loot obtained!', 'discovery')
                  window.dispatchEvent(new CustomEvent('chest-opened', { detail: { tier: 'legendary', lootLines } }))
                }
              }
            }
          }

          // ── Puzzle room ──────────────────────────────────────────────────
          if (room.type === 'puzzle') {
            const triggerRadius = room.radius + 4

            if (distToRoom < triggerRadius && !gs.inputBlocked) {
              // Show sequence hint if not solved
              if (!room.cleared) {
                const nextOrder = nextPlateInSequence(room)
                const hintLabel = `Step on plates in order: ${room.plates.map(p => p.correctOrder).sort((a, b) => a - b).join('→')} (next: ${nextOrder})`
                if (gs.gatherPrompt === null) gs.setGatherPrompt(hintLabel)

                // Handle puzzle reset timer
                if (room.puzzleResetAt > 0 && Date.now() > room.puzzleResetAt) {
                  room.puzzleResetAt = 0
                  uiSt.addNotification('Puzzle reset — wrong order!', 'warning')
                }

                // Check if player is stepping on a plate (within 1.2m of any plate)
                for (let pi = 0; pi < room.plates.length; pi++) {
                  const plate = room.plates[pi]
                  if (plate.activated) continue
                  const plateDx = (rPos.x + plate.offsetX) - px
                  const plateDz = (rPos.z + plate.offsetZ) - pz
                  const plateDist = Math.sqrt(plateDx * plateDx + plateDz * plateDz)
                  if (plateDist < 1.2) {
                    const result = activatePlate(room, pi)
                    if (result === 'wrong') {
                      uiSt.addNotification('Wrong plate! Puzzle resets in 3s…', 'warning')
                    } else if (result === 'correct') {
                      uiSt.addNotification(`Plate ${plate.correctOrder} activated!`, 'info')
                    } else if (result === 'solved') {
                      clearDungeonRoom(room)
                      uiSt.addNotification('Puzzle solved! Chest unlocked!', 'discovery')
                      skillSystem.addXp('exploration', 80)
                      // Grant puzzle loot
                      inventory.addItem({ itemId: 0, materialId: 14, quantity: 5, quality: 0.85 })
                      usePlayerStore.getState().addGold(100)
                      window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'puzzle', roomId: room.id } }))
                    }
                    break
                  }
                }
              }
            }
          }

          // ── Shrine room ──────────────────────────────────────────────────
          if (room.type === 'shrine') {
            if (distToRoom < 3 && !gs.inputBlocked) {
              if (room.shrineUsed) {
                if (gs.gatherPrompt === null) gs.setGatherPrompt('[Shrine dimmed — returns in 20 min]')
              } else {
                if (gs.gatherPrompt === null) gs.setGatherPrompt('[E] Make offering: 5 Iron Ore → Skill XP Boost')
                if (controllerRef.current?.popInteract()) {
                  // Check iron ore (MAT.IRON_ORE = 14)
                  let ironCount = 0
                  const ironSlots: number[] = []
                  for (let slot = 0; slot < 40; slot++) {
                    const s = inventory.getSlot(slot)
                    if (s && s.itemId === 0 && s.materialId === 14) {
                      ironCount += s.quantity
                      ironSlots.push(slot)
                    }
                  }
                  if (ironCount >= 5) {
                    // Consume 5 iron ore
                    let toRemove = 5
                    for (const slotIdx of ironSlots) {
                      if (toRemove <= 0) break
                      const s = inventory.getSlot(slotIdx)
                      if (!s) continue
                      const take = Math.min(toRemove, s.quantity)
                      inventory.removeItem(slotIdx, take)
                      toRemove -= take
                    }
                    // Grant +200 XP to a random non-maxed skill
                    const skills: Array<'gathering' | 'crafting' | 'combat' | 'survival' | 'exploration' | 'smithing' | 'husbandry'> =
                      ['gathering', 'crafting', 'combat', 'survival', 'exploration', 'smithing', 'husbandry']
                    const chosen = skills[Math.floor(Math.random() * skills.length)]
                    skillSystem.addXp(chosen, 200)
                    room.shrineUsed = true
                    room.shrineUsedAt = Date.now()
                    gs.setGatherPrompt(null)
                    uiSt.addNotification(`The shrine glows... +200 ${chosen.charAt(0).toUpperCase() + chosen.slice(1)} XP`, 'discovery')
                    window.dispatchEvent(new CustomEvent('shrine-used', { detail: { skill: chosen, roomId: room.id } }))
                  } else {
                    uiSt.addNotification(`Need 5 Iron Ore — you have ${ironCount}`, 'warning')
                    gs.setGatherPrompt(null)
                  }
                }
              }
            }
          }

          // ── Boss lair ────────────────────────────────────────────────────
          if (room.type === 'boss_lair') {
            if (distToRoom < room.radius + 4) {
              if (room.bossAlive) {
                // Spawn boss entity (wolf-body, max stats)
                if (room.bossEntityId < 0) {
                  const scaledBossHp = getScaledBossHp()
                  const boss = spawnAnimal('wolf', rPos.x, rPos.y, rPos.z, 0, rPos.x, rPos.y, rPos.z)
                  boss.health = scaledBossHp
                  boss.maxHealth = scaledBossHp
                  boss.elite = true
                  boss.eliteGlowColor = '#660000'
                  room.bossEntityId = boss.id
                  room.bossHp = scaledBossHp
                  room.bossMaxHp = scaledBossHp
                  uiSt.addNotification(`⚠ ${CAVE_BOSS.name} awakens! (Floor ${useDungeonStore.getState().currentFloor})`, 'warning')
                }
                // Sync hp from entity
                const bossEntity = animalRegistry.get(room.bossEntityId)
                if (bossEntity) {
                  room.bossHp = bossEntity.health
                }
                if (!bossEntity || bossEntity.behavior === 'DEAD' || (bossEntity && bossEntity.health <= 0)) {
                  // Boss defeated
                  room.bossAlive = false
                  clearDungeonRoom(room)
                  // Drop unique loot
                  inventory.addItem({ itemId: 0, materialId: 14, quantity: 5,  quality: 1.0 }) // iron ore
                  inventory.addItem({ itemId: 0, materialId: 40, quantity: 3,  quality: 1.0 }) // velar crystal
                  inventory.addItem({ itemId: 0, materialId: 5,  quantity: 8,  quality: 1.0 }) // coal
                  usePlayerStore.getState().addGold(150)
                  skillSystem.addXp('combat', 200)
                  skillSystem.addXp('exploration', 100)
                  uiSt.addNotification(`${CAVE_BOSS.name} defeated! Rare cave loot dropped!`, 'discovery')
                  window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'boss_lair', roomId: room.id } }))
                  // M47 Track C: sync floor store after boss defeat (advanceDungeonFloor already called inside damageBoss/clearDungeonRoom chain)
                  useDungeonStore.getState().sync()
                }
              } else if (room.cleared && distToRoom < 2 && gs.gatherPrompt === null) {
                gs.setGatherPrompt('[F] Collect boss loot')
              }
            }
          }

          // ── M40 Track C: Mini-boss room ───────────────────────────────────
          if (room.type === 'mini_boss') {
            if (distToRoom < room.radius + 4) {
              if (room.miniBossAlive) {
                // Spawn mini-boss entity if not yet spawned
                if (room.miniBossEntityId < 0) {
                  const scaledMbHp = getScaledMiniBossHp()
                  room.miniBossMaxHp = scaledMbHp
                  room.miniBossHp = scaledMbHp
                  const mb = spawnAnimal('wolf', rPos.x, rPos.y, rPos.z, 0, rPos.x, rPos.y, rPos.z)
                  mb.health = scaledMbHp
                  mb.maxHealth = scaledMbHp
                  mb.elite = true
                  mb.eliteGlowColor = '#9933cc'
                  room.miniBossEntityId = mb.id
                  room.miniBossHp = room.miniBossMaxHp
                  // Sync into dungeonState singleton for DungeonRenderer
                  initMiniBossRoom(room)
                  useDungeonStore.getState().sync()
                  uiSt.addNotification(`⚠ ${room.miniBossName} awakens!`, 'warning')
                }
                // Sync HP from entity
                const mbEntity = animalRegistry.get(room.miniBossEntityId)
                if (mbEntity) {
                  room.miniBossHp = mbEntity.health
                  dungeonState.miniBossHp = mbEntity.health
                  useDungeonStore.getState().sync()
                }
                if (!mbEntity || mbEntity.behavior === 'DEAD' || mbEntity.health <= 0) {
                  // Mini-boss defeated
                  const gold = 50 + Math.floor(Math.random() * 51) // 50-100
                  room.miniBossAlive = false
                  clearDungeonRoom(room)
                  // Drop rare item + gold
                  inventory.addItem({ itemId: 0, materialId: 40, quantity: 1, quality: 1.0 }) // velar crystal (rare)
                  usePlayerStore.getState().addGold(gold)
                  skillSystem.addXp('combat', 150)
                  // Sync store
                  dungeonState.miniBossAlive = false
                  useDungeonStore.getState().sync()
                  uiSt.addNotification(`${room.miniBossName} defeated! +${gold} gold`, 'discovery')
                  window.dispatchEvent(new CustomEvent('dungeon-boss-defeated', {
                    detail: { name: room.miniBossName, gold },
                  }))
                }
              }
            }
          }

          // ── M40 Track C: Spike trap room ──────────────────────────────────
          if (room.type === 'spike_trap') {
            if (distToRoom < room.radius + 4) {
              if (!room.cleared) {
                // Initialise dungeon trap state on first entry
                if (dungeonState.activeTraps.length === 0 && room.traps.length > 0) {
                  initSpikeTrapRoom(room)
                  useDungeonStore.getState().sync()
                }

                // Check each trap for proximity trigger and E-key disarm
                for (const trap of room.traps) {
                  if (trap.disarmed) continue
                  const tdx = trap.x - px
                  const tdz = trap.z - pz
                  const trapDist = Math.sqrt(tdx * tdx + tdz * tdz)

                  // Trigger: player steps on trap (within 0.6m)
                  if (trapDist < 0.6) {
                    const dmg = triggerTrap(trap.id, { current: Health.current[entityId], max: Health.max[entityId] })
                    if (dmg > 0) {
                      Health.current[entityId] = Math.max(0, Health.current[entityId] - dmg)
                      room.trapTriggerCount++
                      // Keep room trap list in sync with dungeonState
                      const dsTrap = dungeonState.activeTraps.find(t => t.id === trap.id)
                      if (dsTrap) dsTrap.lastTriggered = Date.now()
                      trap.lastTriggered = Date.now()
                      useDungeonStore.getState().sync()
                      uiSt.addNotification(`Spike trap! -${dmg} HP`, 'warning')
                    }
                  }

                  // Disarm: E key within 1.5m
                  if (trapDist < 1.5 && gs.gatherPrompt === null) {
                    gs.setGatherPrompt('[E] Disarm spike trap')
                    if (controllerRef.current?.popInteract()) {
                      disarmTrap(trap.id)
                      trap.disarmed = true
                      const dsTrap = dungeonState.activeTraps.find(t => t.id === trap.id)
                      if (dsTrap) dsTrap.disarmed = true
                      useDungeonStore.getState().sync()
                      gs.setGatherPrompt(null)
                      skillSystem.addXp('exploration', 20)
                      uiSt.addNotification('Spike trap disarmed!', 'info')
                    }
                  }
                }

                // Room clears when all traps disarmed or 10 total triggers
                const allDisarmed = room.traps.every(t => t.disarmed)
                if (allDisarmed || room.trapTriggerCount >= 10) {
                  clearDungeonRoom(room)
                  dungeonState.activeTraps = []
                  useDungeonStore.getState().sync()
                  uiSt.addNotification('Spike trap room cleared!', 'discovery')
                  window.dispatchEvent(new CustomEvent('dungeon-room-cleared', { detail: { type: 'spike_trap', roomId: room.id } }))
                }
              }
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
          let npcSettlementId = 'default'
          let nearestSettDist = Infinity
          for (const [, sett] of settlements) {
            const sdx = sett.x - closestNpc.x, sdy = sett.y - closestNpc.y, sdz = sett.z - closestNpc.z
            const sdist = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz)
            if (sdist < nearestSettDist) {
              nearestSettDist = sdist
              npcSettlement = sett.name
              npcSettlementId = String(sett.id)
            }
          }
          const NPC_ROLES = ['villager', 'guard', 'elder', 'trader', 'artisan', 'scout', 'healer', 'blacksmith', 'scholar']
          const npcRole = NPC_ROLES[closestNpc.id % NPC_ROLES.length]
          const isMerchant = npcRole === 'trader'
          // M38: Use seeded NPC names (consistent per settlement+role)
          const settIdNum = Number(npcSettlementId) || 0
          const roleIndex = closestNpc.id % NPC_ROLES.length
          const npcName = getNPCName(settIdNum, npcRole, roleIndex)
          const promptLabel = isMerchant ? `[F] Trade with ${npcName} 🛍` : `[F] Talk to ${npcName}`
          gs.setGatherPrompt(promptLabel)
          if (controllerRef.current?.popInteract()) {
            gs.setGatherPrompt(null)
            if (isMerchant) {
              // M27: Open merchant panel with appropriate archetype
              // M35: Also store settlement ID for dynamic market pricing
              const civTier = usePlayerStore.getState().civTier
              const archetype = merchantSystem.getArchetypeForSettlementTier(civTier)
              useDialogueStore.getState().setMerchantArchetype(archetype)
              useDialogueStore.getState().setMerchantSettlementId(npcSettlementId)
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
                logCombatEvent('Creature (musket)', 60) // M48 Track C: Log to world events
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
        // M53 Track C: Apply combo streak multiplier
        const streakMult = getDamageMultiplier()
        const totalDamage = stats.damage * comboMult * critMult * skillDmgMult * streakMult

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
          onHit() // M53 Track C: register hit for combo streak
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
            logCombatEvent('Creature', 40) // M48 Track C: Log to world events
            // M46 Track C: Combat milestone discovery — Steel Sword recipe at combat Lv.3
            if (skillSystem.getLevel('combat') >= 3) {
              discoverRecipe(71)  // Steel Sword (M8) — combat milestone
            }
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
              onHit() // M53 Track C: register hit for combo streak
              combatSystem.spawnDamageNumber(hit.x, hit.y + 1.5, hit.z, effectiveDamage, isCritical)
              // M24: Update health bar for surviving animals
              if (!killed) {
                combatSystem.updateEnemyHealth(hit.id, hit.species, hit.x, hit.y, hit.z, hit.health, hit.maxHealth)
              }

              // M38 Track B: Apply weapon special effects on animal hit
              {
                const enchantSlot = usePlayerStore.getState().equippedSlot
                const enchantList: string[] = []
                // TODO: Read enchants from EnchantSystem when available
                const weaponFx = combatSystem.applyWeaponEffects(stats.name, effectiveDamage, hit.id, enchantList)
                // Life steal: heal player
                if (weaponFx.healAmount > 0) {
                  const maxHp38 = Health.max[entityId] || 100
                  Health.current[entityId] = Math.min(maxHp38, Health.current[entityId] + weaponFx.healAmount)
                }
                // Stun notification
                if (weaponFx.stunned) {
                  useUiStore.getState().addNotification(`${stats.name} stunned the ${hit.species}!`, 'discovery')
                }
                // Blink strike (Quantum Blade): move player 2m toward enemy
                if (weaponFx.blink) {
                  const dx38 = hit.x - px, dy38 = hit.y - py, dz38 = hit.z - pz
                  const dist38 = Math.sqrt(dx38 * dx38 + dy38 * dy38 + dz38 * dz38)
                  if (dist38 > 0.1) {
                    const blinkDist = Math.min(2, dist38 - 0.5)
                    const nx38 = px + (dx38 / dist38) * blinkDist
                    const ny38 = py + (dy38 / dist38) * blinkDist
                    const nz38 = pz + (dz38 / dist38) * blinkDist
                    const rapPhys38 = rapierWorld.getPlayer()
                    if (rapPhys38) {
                      rapPhys38.body.setNextKinematicTranslation({ x: nx38, y: ny38, z: nz38 })
                    }
                  }
                }
              }
            }
            if (killed) {
              const speciesName = killed.species.charAt(0).toUpperCase() + killed.species.slice(1)
              const elitePrefix = killed.elite ? '[ELITE] ' : killed.boss ? '[BOSS] ' : ''
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
                  `${elitePrefix}${speciesName} killed — ${lootSummary}`, 'discovery'
                )
              } else {
                // Fallback to old loot system for unknown species
                for (const drop of loot) {
                  inventory.addItem({ itemId: drop.itemId ?? 0, materialId: drop.materialId, quantity: drop.quantity, quality: 0.8, rarity: drop.rarity })
                }
                const lootSummary = loot.map(l => `${l.quantity}x ${l.label}`).join(', ')
                useUiStore.getState().addNotification(
                  `${elitePrefix}${speciesName} killed — ${lootSummary} collected!`, 'discovery'
                )
              }
              // M34 Track B: Apply extra elite loot (from AnimalAISystem augmented loot)
              if (killed.elite) {
                for (const drop of loot) {
                  if (drop.materialId === 14 || drop.materialId === 27 || drop.materialId === 90 || drop.materialId === 23 || drop.materialId === 72) {
                    inventory.addItem({ itemId: 0, materialId: drop.materialId, quantity: drop.quantity, quality: 0.85, rarity: drop.rarity ?? 0 })
                  }
                }
              }
              // M34 Track B: Boss kill — trigger legendary loot + announcement
              if (killed.boss && currentBoss && currentBoss.entityId === killed.id) {
                damageBoss(effectiveDamage, 'Player', inventory)
                skillSystem.addXp('combat', 500)  // bonus XP for boss kill
                // M37 Track C: Track boss kill
                usePlayerStatsStore.getState().incrementStat('bossesKilled')
              }
              skillSystem.addXp('combat', 50) // M22: Combat XP on animal kill
              logCombatEvent(killed.species ?? 'Animal', 50) // M48 Track C: Log to world events
              window.dispatchEvent(new CustomEvent('combat-kill', { detail: { enemyName: killed.species ?? 'creature' } }))
              // M23: Quest progress on kill
              questSystem.onKill(killed.species)
              // M54 Track B: Bounty board kill progress
              bountyOnKill(killed.species)
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
                      // M42 Track C: Quest completion → reputation gain
                      {
                        const nearId = useSettlementStore.getState().nearSettlementId
                        if (nearId !== null) {
                          const sName = useSettlementStore.getState().settlements.get(nearId)?.name ?? 'Unknown'
                          useReputationStore.getState().addPoints(nearId, sName, 50)
                        }
                      }
                    }
                  }
                }
              }
              // M24: Achievement progress on kill
              achievementSystem.onKill(killed.species)
              achievementSystem.onDealDamage(effectiveDamage)
              // M37 Track C: Track kill stat + check titles
              usePlayerStatsStore.getState().incrementStat('killCount')
              checkNewTitles()
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
                // M42 Track C: NPC murder → reputation penalty
                const settlementName = useSettlementStore.getState().settlements.get(nearSettlementId)?.name ?? 'Unknown'
                useReputationStore.getState().addPoints(nearSettlementId, settlementName, -100)
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

    // ── M34 Track A: Home placement (B key) + E-near-home ────────────────────
    {
      const psHome = usePlayerStore.getState()
      const hasHomeDeed = inventory.hasItemById(ITEM.HOME_DEED)

      // B key: enter home placement mode (if has deed and not already placed)
      if (!gs.inputBlocked && !psHome.homeSet && hasHomeDeed && controllerRef.current?.popHomePlacement?.()) {
        homePlacementModeRef.current = !homePlacementModeRef.current
        if (homePlacementModeRef.current) {
          useUiStore.getState().addNotification('Home placement mode — left-click terrain to place cabin!', 'discovery')
        } else {
          gs.setGatherPrompt(null)
        }
      }

      // Home placement mode active — show hint and place on left-click
      if (homePlacementModeRef.current && !gs.inputBlocked) {
        const placeLabel = '[F] Place cabin here  [B] Cancel'
        if (gs.gatherPrompt !== placeLabel) gs.setGatherPrompt(placeLabel)

        // Confirm placement on F (interact) key — consistent with building system
        if (controllerRef.current?.popInteract()) {
          // Snap position to surface directly in front of player
          const playerDir = new THREE.Vector3(px, py, pz).normalize()
          const surfR = surfaceRadiusAt(px, py, pz)
          const placePos: [number, number, number] = [
            playerDir.x * surfR,
            playerDir.y * surfR,
            playerDir.z * surfR,
          ]
          psHome.setHomePosition(placePos)
          psHome.setBedrollPos({ x: placePos[0], y: placePos[1], z: placePos[2] })
          // Consume HOME_DEED from inventory
          for (let _i = 0; _i < inventory.slotCount; _i++) {
            const _s = inventory.getSlot(_i)
            if (_s && _s.itemId === ITEM.HOME_DEED) {
              inventory.removeItem(_i, 1)
              break
            }
          }
          homePlacementModeRef.current = false
          gs.setGatherPrompt(null)
          useUiStore.getState().addNotification('Home placed! This is now your respawn point. Press H to open.', 'discovery')
        }
      }

      // E near home — show "Enter Home" prompt and open HomePanel
      if (!gs.inputBlocked && psHome.homeSet && psHome.homePosition && !homePlacementModeRef.current) {
        const [hx, hy, hz] = psHome.homePosition
        const hdx = hx - px, hdy = hy - py, hdz = hz - pz
        const homeDist2 = hdx * hdx + hdy * hdy + hdz * hdz
        if (homeDist2 < 9) {  // within 3m
          if (gs.gatherPrompt === null) gs.setGatherPrompt('[E] Enter Home')
          if (controllerRef.current?.popEat?.()) {
            useUiStore.getState().openPanel('home')
            gs.setGatherPrompt(null)
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
        // M35 Track C: ensure all settlements have faction assignments
        const settlementIds = Array.from(settlementStore.settlements.keys())
        useFactionStore.getState().assignSettlementFactions(settlementIds)
        // M45 Track B: auto-generate quests for settlements that have reached civLevel >= 1 and have no quests yet
        {
          const questStore = useSettlementQuestStore.getState()
          for (const s of settlementStore.settlements.values()) {
            if ((s.civLevel ?? 0) >= 1) {
              const existing = Object.values(questStore.quests).some(q => q.settlementId === s.id)
              if (!existing) {
                const generated = generateQuestsForSettlement(s.id, s.name, s.civLevel ?? 1, 3)
                questStore.addQuests(generated)
              }
            }
          }
        }
        // M39 Track C: sync civilization tier from settlement civLevels
        civTierTimerRef.current += dt
        if (civTierTimerRef.current >= 5) {
          civTierTimerRef.current = 0
          let totalTier = 0
          for (const s of settlementStore.settlements.values()) totalTier += (s.civLevel ?? 0)
          const civState = useCivStore.getState()
          civState.setTotalTier(totalTier)
          checkAndFireMilestones(civState.civLevel)
        }
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

      if (wState === 'STORM' || wState === 'RAIN' || wState === 'ACID_RAIN') {
        const storedTemp = usePlayerStore.getState().ambientTemp
        const windChill = Math.max(wTemp - (playerWeather?.windSpeed ?? 0) * 0.5, wTemp - 12)
        const rate = wState === 'STORM' ? 2.0 : 0.8
        const newTemp = storedTemp + (windChill - storedTemp) * Math.min(1, rate * dt)
        usePlayerStore.getState().setAmbientTemp(newTemp)

        if (newTemp < 0 && !inventory.isGodMode() && !shelterState.isSheltered) {
          const coldDps = wState === 'STORM' ? 1.5 : 0.5
          Health.current[entityId] = Math.max(0, Health.current[entityId] - coldDps * dt)
          markColdDamage()
        }
      } else if (wState === 'BLIZZARD') {
        // M42 Track B: Blizzard — push ambient to -40°C, blocked while sheltered
        if (!shelterState.isSheltered) {
          usePlayerStore.getState().setAmbientTemp(-40)
        }
      } else {
        const storedTemp = usePlayerStore.getState().ambientTemp
        if (Math.abs(storedTemp - wTemp) > 0.1) {
          const newTemp = storedTemp + (wTemp - storedTemp) * Math.min(1, 0.4 * dt)
          usePlayerStore.getState().setAmbientTemp(newTemp)
        }
      }

      // M42 Track B: ACID_RAIN — 3 dps bypassing armor, skipped when sheltered
      if (wState === 'ACID_RAIN' && !inventory.isGodMode() && !shelterState.isSheltered) {
        Health.current[entityId] = Math.max(0, Health.current[entityId] - 3 * dt)
        useUiStore.getState().addNotification('Acid rain is corroding you!', 'error')
      }

      // M42 Track B: Heat exhaustion — ambient > 45°C
      if (!inventory.isGodMode()) {
        const ambientT = usePlayerStore.getState().ambientTemp
        if (ambientT > 45) {
          const pState = usePlayerStore.getState()
          // 3× faster thirst drain + energy drain
          const newThirst = Math.min(1, pState.thirst + 3 * 0.0002 * dt)
          const newEnergy = Math.max(0, pState.energy - 0.01 * dt)
          pState.updateVitals({ thirst: newThirst, energy: newEnergy })
          heatExhaustionNotifRef.current += dt
          if (heatExhaustionNotifRef.current >= 10) {
            heatExhaustionNotifRef.current = 0
            useUiStore.getState().addNotification('Heat exhaustion! Find shade or water!', 'warning')
          }
        } else {
          heatExhaustionNotifRef.current = 0
        }
      }

      // M42 Track B: Pollution > 0.7 converts RAIN/STORM to ACID_RAIN
      {
        const wStore42 = useWeatherStore.getState()
        if (wStore42.pollutionLevel > 0.7 && (wState === 'RAIN' || wState === 'STORM')) {
          const sId = wStore42.playerSectorId
          const sec = wStore42.sectors.find(s => s.sectorId === sId)
          if (sec && sec.state !== 'ACID_RAIN') {
            wStore42.updateSector({ ...sec, state: 'ACID_RAIN' })
            wStore42.setWeatherTransition(sec.state, 'ACID_RAIN')
            useUiStore.getState().addNotification('Pollution has turned the rain acidic!', 'error')
          }
        }
      }
    }

    // ── M50 Track B: Weather forecast refresh (every 60 game-seconds) ───────────
    {
      forecastTimerRef.current += dt
      if (forecastTimerRef.current >= 60) {
        forecastTimerRef.current = 0
        const simSecs = useGameStore.getState().simSeconds
        const wStoreFc = useWeatherStore.getState()
        const fcWeather = wStoreFc.getPlayerWeather()?.state ?? 'CLEAR'
        updateForecasts(simSecs, fcWeather)
      }
    }

    // ── M42 Track B: Shelter update (every 2s) ────────────────────────────────
    {
      shelterUpdateTimerRef.current += dt
      if (shelterUpdateTimerRef.current >= 2) {
        shelterUpdateTimerRef.current = 0
        const homePos = usePlayerStore.getState().homePosition
        const homePosXZ = homePos ? { x: homePos[0], z: homePos[2] } : null
        const caveEntrances = getCaveEntrancePositions().map(v => ({ x: v.x, y: v.y, z: v.z }))
        const nearBuildingTypes: string[] = []
        const SHELTER_BUILDING_RADIUS_SQ = 10 * 10
        for (const b of buildingSystem.getAllBuildings()) {
          const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
          if (dx * dx + dy * dy + dz * dz < SHELTER_BUILDING_RADIUS_SQ) {
            nearBuildingTypes.push(b.typeId)
          }
        }
        updateShelterState(px, py, pz, homePosXZ, caveEntrances, nearBuildingTypes)
      }
    }

    // ── M29 Track B: Weather-responsive gameplay ──────────────────────────────
    {
      const wStore29   = useWeatherStore.getState()
      const pw29       = wStore29.getPlayerWeather()
      const wState29   = pw29?.state ?? 'CLEAR'

      // B4: Storm/rain movement penalty (M42: BLIZZARD -40%, ACID_RAIN same as STORM)
      setWeatherSpeedMult(
        wState29 === 'BLIZZARD'   ? 0.6 :
        wState29 === 'STORM'      ? 0.6 :
        wState29 === 'ACID_RAIN'  ? 0.6 :
        wState29 === 'RAIN'       ? 0.85 : 1.0
      )

      // B1: Warmth drain by weather type
      const dayAngle29 = getDayAngle()
      const isNight29  = Math.sin(dayAngle29) <= 0
      const nightMult  = isNight29 ? 2.0 : 1.0
      // M42: shelter blocks warmth drain; ACID_RAIN same drain as STORM
      const drainRates: Record<string, number> = { CLEAR: 0, CLOUDY: 0.5, RAIN: 1.5, STORM: 3.0, ACID_RAIN: 3.0 }
      const drainRate29 = shelterState.isSheltered ? 0 : (drainRates[wState29] ?? 0) * nightMult
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

      // B1: Cold damage when warmth < 20 — every 10s deal -1 HP (M42: skip when sheltered)
      if (!inventory.isGodMode() && !shelterState.isSheltered) {
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

    // ── M35 Track B: Disaster system ─────────────────────────────────────────
    {
      const wStore35  = useWeatherStore.getState()
      const pw35      = wStore35.getPlayerWeather()
      const wState35  = pw35?.state ?? 'CLEAR'

      // ─ Tornado spawning during STORM (10% chance per 5-minute window) ────
      if (wState35 === 'STORM' && !wStore35.tornadoPos) {
        tornadoSpawnTimerRef.current -= dt
        if (tornadoSpawnTimerRef.current <= 0) {
          // 10% chance of tornado spawning
          if (Math.random() < 0.10) {
            const angle    = Math.random() * Math.PI * 2
            const spawnDist = 80 + Math.random() * 60
            wStore35.setTornadoPos({
              x: px + Math.cos(angle) * spawnDist,
              y: py,
              z: pz + Math.sin(angle) * spawnDist,
            })
            useUiStore.getState().addNotification('⚠️ TORNADO FORMING — seek shelter!', 'error')
          }
          // Reset timer for next attempt (5 minutes)
          tornadoSpawnTimerRef.current = 300 + Math.random() * 60
        }
      } else if (wState35 !== 'STORM') {
        // Clear tornado when storm ends
        if (wStore35.tornadoPos) wStore35.setTornadoPos(null)
        tornadoSpawnTimerRef.current = 300
      }

      // ─ BLIZZARD: M35 + M42 Track B — extreme cold, -40% speed, 2x cold damage
      if (wState35 === 'BLIZZARD' && !inventory.isGodMode()) {
        // 3× faster warmth drain than STORM (STORM rate = 3.0/s from M29 block)
        if (!shelterState.isSheltered) {
          usePlayerStore.getState().addWarmth(-9.0 * dt)
        }
        // M42 Track B: 2x cold damage rate during blizzard when not sheltered
        const ambientT35 = usePlayerStore.getState().ambientTemp
        if (ambientT35 < 0 && !shelterState.isSheltered) {
          Health.current[entityId] = Math.max(0, Health.current[entityId] - 3.0 * dt)  // 2x STORM coldDps
          markColdDamage()
        }
        // Notify player about blizzard effects
        window.dispatchEvent(new CustomEvent('blizzard-active'))
      }

      // ─ VOLCANIC_ASH: damage player if not protected ──────────────────────
      if (wState35 === 'VOLCANIC_ASH' && !inventory.isGodMode()) {
        Health.current[entityId] = Math.max(0, Health.current[entityId] - 2 * dt)
        window.dispatchEvent(new CustomEvent('volcanic-ash-active'))
        // Extinguish nearby campfires (20% per 10s)
        volcanicAshTimerRef.current += dt
        if (volcanicAshTimerRef.current >= 10) {
          volcanicAshTimerRef.current = 0
          const campfireBuildings35 = buildingSystem.getAllBuildings().filter(b =>
            b.typeId === 'campfire_pit' || b.typeId === 'campfire'
          )
          for (const b of campfireBuildings35) {
            if (Math.random() < 0.20) {
              if (simManagerRef.current) {
                simManagerRef.current.suppressFire(b.position[0], b.position[1], b.position[2], 3)
              }
              const dx = px - b.position[0], dy = py - b.position[1], dz = pz - b.position[2]
              if (dx * dx + dy * dy + dz * dz < 400) {
                useUiStore.getState().addNotification('Volcanic ash smothered your campfire!', 'warning')
              }
            }
          }
        }
      } else {
        volcanicAshTimerRef.current = 0
      }

      // ─ Earthquake: rare random trigger ───────────────────────────────────
      if (earthquakeActiveRef.current <= 0) {
        earthquakeTimerRef.current -= dt
        if (earthquakeTimerRef.current <= 0) {
          // 1% chance per hour near volcano or heavy STORM
          const isNearVolcano = false  // TODO: use biome flag when available
          if (Math.random() < 0.01 || isNearVolcano) {
            const shakeDuration = 5 + Math.random() * 5
            earthquakeActiveRef.current = shakeDuration
            wStore35.setEarthquake(true, 0.8)
            useUiStore.getState().addNotification('🌋 Earthquake!', 'error')
            window.dispatchEvent(new CustomEvent('earthquake-start', { detail: { duration: shakeDuration } }))
          }
          // Reset timer: next check in ~1 hour
          earthquakeTimerRef.current = 3200 + Math.random() * 800
        }
      } else {
        earthquakeActiveRef.current -= dt
        const intensity = Math.min(1, earthquakeActiveRef.current / 2)
        wStore35.setEarthquake(earthquakeActiveRef.current > 0, intensity)
        if (earthquakeActiveRef.current <= 0) {
          wStore35.setEarthquake(false, 0)
          window.dispatchEvent(new CustomEvent('earthquake-end'))
        }
      }

      // ─ Lava pools (volcano biome): constant damage within 3m of seeded positions
      // Volcano biome positions are seeded around y > planet_radius + 50 and high terrain
      lavaCheckTimerRef.current += dt
      if (lavaCheckTimerRef.current >= 0.5) {
        lavaCheckTimerRef.current = 0
        // Approximate volcano area: high Y + specific XZ region
        // Use a simple heuristic: player is "near volcano" if very high up
        const aboveGroundY = Math.sqrt(px * px + py * py + pz * pz) - 4000
        if (aboveGroundY > 80) {
          // Seed deterministic lava pool positions
          const LAVA_POOLS = [
            { ox: 20, oz: 15 }, { ox: -18, oz: 22 }, { ox: 5, oz: -25 },
            { ox: -10, oz: 10 }, { ox: 30, oz: -5 }, { ox: -5, oz: 30 },
          ]
          const volcanoPeakX = 0, volcanoPeakZ = 0  // approximate volcano center
          for (const pool of LAVA_POOLS) {
            const lpx = volcanoPeakX + pool.ox
            const lpz = volcanoPeakZ + pool.oz
            const dx = px - lpx, dz = pz - lpz
            const dist2 = dx * dx + dz * dz
            if (dist2 < 25) {  // within 5m show warning
              if (dist2 < 9 && !inventory.isGodMode()) {  // within 3m — lava damage
                Health.current[entityId] = Math.max(0, Health.current[entityId] - 15 * 0.5)
                window.dispatchEvent(new CustomEvent('lava-damage'))
              }
              window.dispatchEvent(new CustomEvent('lava-warning'))
              break
            }
          }
        }
      }
    }

    // ── M47 Track B: Environmental hazard damage ─────────────────────────────
    {
      const hazardZone = getActiveHazard(px, pz)
      if (hazardZone) {
        const def = HAZARD_DEFS[hazardZone.type]

        // Fire immunity from potions skips lava damage
        const skipDamage = hazardZone.type === 'lava_pool' && isPotionFireImmune()

        if (!skipDamage && def.dps > 0 && !inventory.isGodMode()) {
          Health.current[entityId] = Math.max(0, Health.current[entityId] - def.dps * dt)
        }

        // Dispatch hazard-enter only on first entry (or when zone changes)
        if (activeHazardIdRef.current !== hazardZone.id) {
          activeHazardIdRef.current = hazardZone.id
          window.dispatchEvent(new CustomEvent('hazard-enter', { detail: { type: hazardZone.type } }))
          // For quicksand: also emit speed event
          if (hazardZone.type === 'quicksand') {
            window.dispatchEvent(new CustomEvent('quicksand-enter'))
          }
        }
      } else {
        // Player has left all hazards
        if (activeHazardIdRef.current !== null) {
          const prevType = HAZARD_ZONE_TYPE_BY_ID[activeHazardIdRef.current]
          activeHazardIdRef.current = null
          window.dispatchEvent(new CustomEvent('hazard-exit'))
          if (prevType === 'quicksand') {
            window.dispatchEvent(new CustomEvent('quicksand-exit'))
          }
        }
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

    // ── M41 Track C: Festival system tick ────────────────────────────────────
    {
      const currentSeason = useSeasonStore.getState().season
      // One in-game day = 1200 real seconds (matches simSeconds day/night cycle)
      festivalSystem.tick(dt, currentSeason, 1200)
      useFestivalStore.getState().sync()
    }

    // ── M53 Track A: Seasonal events ─────────────────────────────────────────
    {
      const simSecs53 = useGameStore.getState().simSeconds
      const serverSeason53 = useSeasonStore.getState().season
      if (lastSeasonRef.current !== serverSeason53) {
        lastSeasonRef.current = serverSeason53
        const normSeason53 = normaliseSeasonName(serverSeason53)
        onSeasonChange(normSeason53, simSecs53)
      }
      tickSeasonalEvents(simSecs53)
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

      // ── M25 Track C: New fishing state machine (M34: species + tension) ──────
      {
        const fsPhase = fishingSystem.state.phase
        const keysSet25 = (controllerRef.current as any)?._keys ?? (controllerRef.current as any)?.keys ?? new Set()
        const fKeyHeld = keysSet25.has('KeyF') || keysSet25.has('f') || keysSet25.has('F')

        // M34: pass environmental context to fishing system
        const isUnderground = (useCaveStore.getState() as any).underground ?? false
        fishingSystem.setContext(fishingSystem.state.nearGoodSpot, isUnderground)

        if (canFish && fsPhase === 'idle' && !isFishingActive() && !gs10.inputBlocked) {
          const rodDur = fishingSystem.state.rodDurability
          const fishLabel = rodDur <= 0
            ? '[Rod broken — repair needed]'
            : fishingSystem.state.nearGoodSpot
              ? '[F] Cast (good spot! +20% catch rate)'
              : '[F] Cast fishing rod'
          if (gs10.gatherPrompt === null) gs10.setGatherPrompt(fishLabel)
        } else if ((nearWater || nearRiver10) && !inventory.hasItemById(ITEM.FISHING_ROD) && fsPhase === 'idle' && !gs10.inputBlocked) {
          // Discovery path: player is near water but has no fishing rod — show discovery hint
          const discoverLabel = '[F] Fish'
          if (gs10.gatherPrompt === null) gs10.setGatherPrompt(discoverLabel)
        }

        if (canFish && !gs10.inputBlocked && controllerRef.current?.popInteract()) {
          if (fsPhase === 'idle') {
            if (fishingSystem.state.rodDurability <= 0) {
              useUiStore.getState().addNotification('Your fishing rod is broken! Craft a new one.', 'warning')
            } else {
              // Cast line — open fishing panel
              fishingSystem.cast()
              useUiStore.getState().openPanel('fishing')
              useUiStore.getState().addNotification('Line cast! Watch the tension meter.', 'info')
              gs10.setGatherPrompt(null)
            }
          } else if (fsPhase === 'waiting') {
            // M34: Tension minigame — press F at right moment
            const tensionResult = fishingSystem.tensionPress()
            if (tensionResult === 'sweet') {
              useUiStore.getState().addNotification('Nice timing! Fish on the hook!', 'info')
            } else if (tensionResult === 'critical') {
              useUiStore.getState().addNotification('PERFECT timing! Rare fish chance doubled!', 'discovery')
            } else if (tensionResult === 'miss') {
              useUiStore.getState().addNotification('Missed! Fish escaped — 5s cooldown.', 'warning')
            }
          } else if (fsPhase === 'biting') {
            // Player pressed F during bite window — start reeling
            fishingSystem.startReel()
          } else if (fsPhase === 'landed' || fsPhase === 'escaped') {
            // Reset so next F press casts again
            fishingSystem.reset()
          }
        }

        // Tick fishing state machine every frame (pass F-held for reeling)
        if (fsPhase !== 'idle') {
          const result = fishingSystem.tick(dt, fKeyHeld)
          if (result === 'landed') {
            const caught = fishingSystem.state.lastCatch
            if (caught) {
              // M34: use species materialId instead of generic MAT.FISH
              const qualityMap: Record<string, number> = {
                Legendary: 1.0, Rare: 1.0, Uncommon: 0.85, Common: 0.7,
              }
              inventory.addItem({
                itemId: 0,
                materialId: caught.materialId,
                quantity: 1,
                quality: qualityMap[caught.rarity] ?? 0.7,
              })
              const xpMap: Record<string, number> = {
                Legendary: 100, Rare: 50, Uncommon: 30, Common: 15,
              }
              skillSystem.addXp('gathering', xpMap[caught.rarity] ?? 15)

              if (caught.isGolden) {
                // M34: Golden Fish legendary notification
                useUiStore.getState().addNotification(
                  'LEGENDARY CATCH! Golden Fish — worth 500 gold!',
                  'discovery',
                )
                window.dispatchEvent(new CustomEvent('golden-fish-caught'))
                // M37 Track C: Track golden fish stat
                usePlayerStatsStore.getState().incrementStat('goldenFishCaught')
                checkNewTitles()
              } else {
                useUiStore.getState().addNotification(
                  `Caught ${caught.rarity} ${caught.name}! Added to inventory.`,
                  'discovery',
                )
              }
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

    // ── M54 Track A: Merchant guild contract refresh every 60s ───────────────
    guildTimerRef.current += dt
    if (guildTimerRef.current >= 60) {
      guildTimerRef.current = 0
      refreshContracts(useGameStore.getState().simSeconds)
    }

    // ── M54 Track B: Bounty board tick every 60s ─────────────────────────────
    bountyTimerRef.current += dt
    if (bountyTimerRef.current >= 60) {
      bountyTimerRef.current = 0
      const bountySimSecs = useGameStore.getState().simSeconds
      tickBountyBoard(bountySimSecs)
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
      achievementSystem.onTierReached(currentTier)
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

    // ── M47 Track A: Periodic stat-threshold achievement check (every 30 s) ─
    achievementCheckTimerRef.current += dt
    if (achievementCheckTimerRef.current >= 30) {
      achievementCheckTimerRef.current = 0
      checkAchievements(getPlayerStats())

      // M50 Track A: Reputation titles check
      const repSettlements = useReputationStore.getState().settlements
      const totalRep = Object.values(repSettlements).reduce(
        (acc, s) => acc + Math.max(0, s.points), 0
      )
      const factionStore = useFactionStore.getState()
      const factionReps: Record<string, number> = {}
      for (const s of Object.values(repSettlements)) {
        const fid = factionStore.getSettlementFaction?.(s.settlementId) ?? null
        if (fid) {
          factionReps[fid] = (factionReps[fid] ?? 0) + Math.max(0, s.points)
        }
      }
      checkAndUpdateTitles(totalRep, factionReps)
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

    // ── M35 Track C: Faction war events — raid check every 60s ───────────────
    {
      const WAR_CHECK_INTERVAL = 60    // seconds between war event checks
      const HEAL_INTERVAL = 60         // seconds between passive heal ticks
      const RAID_CHANCE = 0.20         // 20% chance per warring faction pair per tick
      const RAID_DAMAGE = 10           // settlement loses 10% health per undefended raid
      const HEAL_RATE = 5              // 5% health regen per minute when peaceful

      factionWarTimerRef.current += dt
      factionHealTimerRef.current += dt

      if (factionHealTimerRef.current >= HEAL_INTERVAL) {
        factionHealTimerRef.current = 0
        const fStore = useFactionStore.getState()
        const settStore = useSettlementStore.getState()
        for (const s of settStore.settlements.values()) {
          // Only heal if no active raid against this settlement
          const hasActiveRaid = fStore.raidEvents.some(r => r.active && r.defendingSettlementId === s.id)
          if (!hasActiveRaid) {
            fStore.healSettlement(s.id, HEAL_RATE)
          }
        }
      }

      if (factionWarTimerRef.current >= WAR_CHECK_INTERVAL) {
        factionWarTimerRef.current = 0
        const fStore = useFactionStore.getState()
        const settStore = useSettlementStore.getState()
        const uiStore = useUiStore.getState()

        // Assign faction IDs to all settlements if not done yet
        const settlementIdList = Array.from(settStore.settlements.keys())
        fStore.assignSettlementFactions(settlementIdList)

        // Check each warring faction pair
        const checkedPairs = new Set<string>()
        for (const [aId, a] of settStore.settlements) {
          for (const [bId, b] of settStore.settlements) {
            if (aId === bId) continue
            const pairKey = [Math.min(aId, bId), Math.max(aId, bId)].join('-')
            if (checkedPairs.has(pairKey)) continue
            checkedPairs.add(pairKey)

            const factionA = fStore.getSettlementFaction(aId)
            const factionB = fStore.getSettlementFaction(bId)
            if (!factionA || !factionB) continue
            if (factionA === factionB) continue

            const rel = getFactionRelationship(factionA, factionB)
            if (rel !== 'war') continue

            // 20% chance to trigger a raid
            if (Math.random() > RAID_CHANCE) continue

            // Pick the "weaker" settlement as the defender (lower health)
            const healthA = fStore.getSettlementHealth(aId)
            const healthB = fStore.getSettlementHealth(bId)
            const [attackerSettId, defenderSettId] = healthA > healthB
              ? [aId, bId] : [bId, aId]
            const defenderFaction = fStore.getSettlementFaction(defenderSettId)!
            const attackerFaction = fStore.getSettlementFaction(attackerSettId)!

            // Start raid event
            fStore.startRaid(attackerFaction, defenderSettId, defenderFaction)

            // Check if player is near the defending settlement and in defending faction
            const defSett = settStore.settlements.get(defenderSettId)
            const playerFaction = fStore.playerFaction
            if (defSett) {
              const dxR = px - defSett.x, dzR = pz - defSett.z
              const distR = Math.sqrt(dxR * dxR + dzR * dzR)
              const isNear = distR < 200

              const defenderFactionData = FACTIONS[defenderFaction]
              const attackerFactionData = FACTIONS[attackerFaction]
              const dir = distR > 0 ? Math.round(Math.atan2(defSett.z - pz, defSett.x - px) * 180 / Math.PI) : 0

              // Notify player regardless
              const distText = isNear ? 'nearby' : `${Math.round(distR)}m`
              const bearing = distR > 50 ? ` ${distText}` : ''
              uiStore.addNotification(
                `[RAID] ${attackerFactionData.icon} ${attackerFactionData.name} attacks ${defSett.name}${bearing}`,
                'warning'
              )

              // Dispatch raid alert event for the RaidAlertBanner in HUD
              window.dispatchEvent(new CustomEvent('faction-raid-alert', {
                detail: {
                  message: `[RAID] ${attackerFactionData.icon} ${attackerFactionData.name} attacks ${defenderFactionData.icon} ${defSett.name}${bearing}`,
                },
              }))

              // If player is near and in defending faction, they can earn XP
              if (isNear && playerFaction && (
                playerFaction === defenderFaction ||
                getFactionRelationship(playerFaction, defenderFaction) === 'ally'
              )) {
                // Player is defending — award XP and gold
                usePlayerStore.getState().addGold(50)
                fStore.addFactionXp(100)
                uiStore.addNotification(
                  `You defended ${defSett.name}! +100 Faction XP, +50 Gold`,
                  'discovery'
                )
              } else {
                // Undefended — damage settlement
                fStore.damageSettlement(defenderSettId, RAID_DAMAGE)
              }
            }
          }
        }
      }
    }

    // ── M52 Track A: Faction war system — tick every 120 sim-seconds ────────
    {
      warTimerRef.current += dt
      if (warTimerRef.current >= 120) {
        warTimerRef.current = 0
        const simSecs52 = useGameStore.getState().simSeconds
        tickFactionWars(simSecs52, FACTION_IDS)
      }
    }

    // ── M46 Track B: Siege system tick + trigger ──────────────────────────────
    {
      // Tick active siege every frame
      tickSiege(dt * 1000)

      // Every 10 minutes, randomly start a siege against a qualifying settlement
      const SIEGE_TRIGGER_INTERVAL = 600  // seconds
      const SIEGE_CHANCE = 0.05           // 5% per eligible settlement per check
      siegeTriggerTimerRef.current += dt
      if (siegeTriggerTimerRef.current >= SIEGE_TRIGGER_INTERVAL && activeSiege === null) {
        siegeTriggerTimerRef.current = 0
        const settStore46 = useSettlementStore.getState()
        const fStore46 = useFactionStore.getState()
        const eligible = Array.from(settStore46.settlements.values()).filter(s => (s.civLevel ?? 0) >= 2)
        for (const s of eligible) {
          if (Math.random() > SIEGE_CHANCE) continue
          // Pick a hostile faction (one that is at war with the settlement's faction)
          const sF = fStore46.getSettlementFaction(s.id)
          if (!sF) continue
          const hostileFactions = FACTION_IDS.filter(fId => {
            if (fId === sF) return false
            return FACTIONS[fId].relationship[sF] === 'war'
          })
          if (hostileFactions.length === 0) continue
          const attacker = hostileFactions[Math.floor(Math.random() * hostileFactions.length)]
          const intensity = (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3
          startSiege(s.id, attacker, intensity)
          useUiStore.getState().addNotification(
            `[SIEGE] ${FACTIONS[attacker].icon} ${FACTIONS[attacker].name} is besieging ${s.name}!`,
            'warning'
          )
          break  // Only one siege at a time
        }
      }
    }

    // ── M43 Track B: Market restock tick ─────────────────────────────────────
    marketSystem.restockTick(dt)

    // ── M48 Track B: Merchant restock event tick + trigger (every 5 minutes) ──
    {
      tickRestockEvent()
      const RESTOCK_TRIGGER_INTERVAL = 300  // seconds
      restockTriggerTimerRef.current += dt
      if (restockTriggerTimerRef.current >= RESTOCK_TRIGGER_INTERVAL) {
        restockTriggerTimerRef.current = 0
        const settStore48 = useSettlementStore.getState()
        const settList48 = Array.from(settStore48.settlements.values())
        if (settList48.length > 0) {
          const s48 = settList48[Math.floor(Math.random() * settList48.length)]
          const merchantNames = ['Aldric', 'Mira', 'Torben', 'Seyla', 'Oryn']
          const mName = merchantNames[Math.floor(Math.random() * merchantNames.length)]
          triggerRestockEvent(s48.id, mName)
        }
      }
    }

    // ── M49 Track B: Trading routes tick ─────────────────────────────────────
    tickRoutes(dt * 1000)

    // ── M52 Track C: Day/Night event system ──────────────────────────────────
    {
      const simSecs52 = useGameStore.getState().simSeconds
      // Tick expirations every frame
      tickDayNightEvents(simSecs52)

      // Detect time-period transitions using dayAngle (same cycle as NPC schedules)
      // dayAngle=0 is midnight, dayAngle=π is noon; hour = (dayAngle/(2π))*24
      const da52 = getDayAngle()
      const norm52 = ((da52 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      const hour52 = (norm52 / (2 * Math.PI)) * 24
      let period52: 'dawn' | 'day' | 'dusk' | 'night'
      if (hour52 >= 5 && hour52 < 7)  period52 = 'dawn'
      else if (hour52 >= 7 && hour52 < 17) period52 = 'day'
      else if (hour52 >= 17 && hour52 < 21) period52 = 'dusk'
      else period52 = 'night'

      if (lastTimePeriodRef.current !== period52) {
        lastTimePeriodRef.current = period52
        onTimeTransition(period52, simSecs52)
      }
    }

    // ── M43 Track C: Exploration tracking (every 5s) ─────────────────────────
    {
      explorationTimerRef.current += dt
      if (explorationTimerRef.current >= 5) {
        explorationTimerRef.current = 0
        useExplorationStore.getState().markExplored(px, pz, 100)

        // Cave discovery: check entrances within 10m
        const caveEntrances43 = getCaveEntrancePositions()
        const explorationStore43 = useExplorationStore.getState()
        for (let i = 0; i < caveEntrances43.length; i++) {
          const ce = caveEntrances43[i]
          const dx = ce.x - px, dz = ce.z - pz
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist <= 10) {
            const caveId = `cave_${i}`
            if (!discoveredCaveIdsRef.current.has(caveId)) {
              discoveredCaveIdsRef.current.add(caveId)
              explorationStore43.addDiscovery({
                id: caveId,
                name: `Cave Entrance ${i + 1}`,
                x: ce.x,
                z: ce.z,
                type: 'cave',
              })
              useUiStore.getState().addNotification(`Discovered cave entrance!`, 'discovery')
            }
          }
        }

        // Settlement discovery: add to exploration store for map markers
        const settStore43 = useSettlementStore.getState()
        const discoveredUiStore43 = useUiStore.getState().discoveredSettlements
        for (const s of settStore43.settlements.values()) {
          const sid = String(s.id)
          if (discoveredUiStore43.has(sid)) {
            const discoveryId = `settlement_${s.id}`
            explorationStore43.addDiscovery({
              id: discoveryId,
              name: s.name,
              x: s.x,
              z: s.z,
              type: 'settlement',
            })
          }
        }
      }
    }

    // ── M54 Track C: Exploration discovery check (every 2s) ──────────────────
    {
      discoveryTimerRef.current += dt
      if (discoveryTimerRef.current >= 2) {
        discoveryTimerRef.current = 0
        checkDiscoveries(px, pz, useGameStore.getState().simSeconds)
      }
    }

    // ── M55 Track B: Resource respawn tick (every 5s) ────────────────────────
    {
      resourceRespawnTimerRef.current += dt
      if (resourceRespawnTimerRef.current >= 5) {
        resourceRespawnTimerRef.current = 0
        tickResourceRespawn(useGameStore.getState().simSeconds)
      }
    }

    // ── M56 Track A: NPC trade route tick (every 30s) ────────────────────────
    {
      tradeRouteTimerRef.current += dt
      if (tradeRouteTimerRef.current >= 30) {
        tradeRouteTimerRef.current = 0
        tickTradeRoutes(useGameStore.getState().simSeconds)
      }
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
