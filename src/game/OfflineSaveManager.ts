// ── OfflineSaveManager.ts ─────────────────────────────────────────────────────
// M22 Track A: Offline save/load using localStorage (small state) + IndexedDB
// (large state like inventory, buildings, journal entries).
//
// Provides saveOffline() and loadOffline() that work without authentication.
// Auto-save fires every 60s from GameLoop. Manual save/load from SettingsPanel.
//
// Storage layout:
//   localStorage:  universe_save_meta   → { timestamp, civTier, playTime }
//                  universe_save_vitals → { health, hunger, thirst, energy, fatigue }
//                  universe_save_pos    → { x, y, z }
//                  universe_save_state  → { civTier, simSeconds, currentGoal, discoveries[], murderCount, smithingXp, wounds[], skills }
//   IndexedDB:     universe_save_db / store "gamedata"
//                  key "inventory"      → InventorySlot[]
//                  key "buildings"      → BuildingData[]
//                  key "journalEntries" → Discovery[]
//                  key "knownRecipes"   → number[]
//                  key "bedroll"        → { x, y, z } | null

import { usePlayerStore } from '../store/playerStore'
import { useGameStore } from '../store/gameStore'
import { useSkillStore } from '../store/skillStore'
import { inventory, journal, buildingSystem } from './GameSingletons'
import { serializeSpecs, deserializeSpecs } from './SkillSpecializationSystem'
import { serializeHome, deserializeHome } from './HomeCustomizationSystem'
import { serializeRoutes, deserializeRoutes } from './TradingRouteSystem'
import { serializeRepTitles, deserializeRepTitles } from './ReputationTitleSystem'
import { serializeDiscovery, deserializeDiscovery } from './RecipeDiscoverySystem'
import { serializeDiscoveries, deserializeDiscoveries } from './ExplorationDiscoverySystem'
import { serializeNodes, deserializeNodes } from './ResourceDepletionSystem'
import { serializeLore, deserializeLore } from './LoreSystem'
import { serializeMilestones, deserializeMilestones } from './AchievementShowcaseSystem'
import { serializeTitles, deserializeTitles } from './TitleProgressionSystem'
import { serializeUpgrades, deserializeUpgrades } from './HousingUpgradeSystem'
import { serializePet, deserializePet } from './PetAdvancementSystem'
import { serializeGiftCooldowns, deserializeGiftCooldowns } from './NPCGiftSystem'
import { serializeMastery, deserializeMastery } from './CraftingMasterySystem'
import { serializeEconomies, deserializeEconomies } from './SettlementEconomySystem'
import { serializeFactions, deserializeFactions } from './FactionReputationSystem'
import { serializeBlueprints, deserializeBlueprints } from './BlueprintUnlockSystem'
import { serializeMemories, deserializeMemories } from './NPCMemorySystem'
import { serializeChronicle, deserializeChronicle } from './WorldChronicleSystem'
import { serializeSeasons, deserializeSeasons } from './SeasonalEventSystem'
import { serializeJournal, deserializeJournal } from './PlayerJournalSystem'
import { serializeHousing, deserializeHousing } from './PlayerHousingSystem'
import { serializeTalents, deserializeTalents } from './TalentTreeSystem'
import { serializeQuestBoard, deserializeQuestBoard } from './DynamicQuestBoardSystem'
import { serializeEmotions, deserializeEmotions } from './NPCEmotionSystem'
import { serializeTradingNetwork, deserializeTradingNetwork } from './ResourceTradingNetwork'
import { serializeTitles as serializePlayerTitles, deserializeTitles as deserializePlayerTitles } from './PlayerTitleSystem'
import { serializeScheduler, deserializeScheduler } from './WorldEventSchedulerSystem'
import { serializeCodex, deserializeCodex } from './WorldHistoryCodexSystem'
import { serializeAchievementJournal, deserializeAchievementJournal } from './PlayerAchievementJournalSystem'
import { serializeRelations, deserializeRelations } from './SettlementRelationsSystem'
import { serializeRecipeBook, deserializeRecipeBook, type RecipeBookSaveData } from './RecipeBookSystem'
import { serializeExpeditions, deserializeExpeditions, type ExpeditionSaveData } from './ExpeditionSystem'
import { Health, Metabolism, Position } from '../ecs/world'
import { rapierWorld } from '../physics/RapierWorld'
import { PLANET_RADIUS } from '../world/SpherePlanet'

const LS_PREFIX = 'universe_save_'
const DB_NAME = 'universe_save_db'
const DB_VERSION = 1
const STORE_NAME = 'gamedata'

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

// ── Skill system integration (lazy import to avoid circular deps) ─────────────

let _skillSystem: { serialize: () => unknown; deserialize: (d: unknown) => void } | null = null

export function registerSkillSystem(sys: { serialize: () => unknown; deserialize: (d: unknown) => void }) {
  _skillSystem = sys
}

// ── Quest system integration ──────────────────────────────────────────────────

let _questSystem: { serialize: () => unknown; deserialize: (d: unknown) => void } | null = null

export function registerQuestSystem(sys: { serialize: () => unknown; deserialize: (d: unknown) => void }) {
  _questSystem = sys
}

// ── Achievement system integration ───────────────────────────────────────────

let _achievementSystem: { serialize: () => unknown; deserialize: (d: unknown) => void } | null = null

export function registerAchievementSystem(sys: { serialize: () => unknown; deserialize: (d: unknown) => void }) {
  _achievementSystem = sys
}

// ── Tutorial system integration ──────────────────────────────────────────────

let _tutorialSystem: { serialize: () => unknown; deserialize: (d: unknown) => void } | null = null

export function registerTutorialSystem(sys: { serialize: () => unknown; deserialize: (d: unknown) => void }) {
  _tutorialSystem = sys
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveOffline(): Promise<boolean> {
  try {
    const ps = usePlayerStore.getState()
    const gs = useGameStore.getState()

    // Don't save if player is dead or in interplanetary transit
    if (ps.isDead) return false

    // localStorage: small state (atomic swap pattern — write to temp, then rename)
    const vitals = JSON.stringify({
      health: ps.health, hunger: ps.hunger, thirst: ps.thirst,
      energy: ps.energy, fatigue: ps.fatigue,
    })
    const pos = JSON.stringify({ x: ps.x, y: ps.y, z: ps.z })
    const state = JSON.stringify({
      civTier: ps.civTier,
      simSeconds: gs.simSeconds,
      currentGoal: ps.currentGoal,
      discoveries: Array.from(ps.discoveries),
      murderCount: ps.murderCount,
      smithingXp: ps.smithingXp,
      wounds: ps.wounds,
      gold: ps.gold,
      skills: _skillSystem ? _skillSystem.serialize() : null,
      skillTree: useSkillStore.getState().serialize(),
      specs: serializeSpecs(),
      quests: _questSystem ? _questSystem.serialize() : null,
      achievements: _achievementSystem ? _achievementSystem.serialize() : null,
      tutorialStep: _tutorialSystem ? _tutorialSystem.serialize() : null,
      tradeRoutes: serializeRoutes(),
      repTitles: serializeRepTitles(),
      recipeDiscovery: serializeDiscovery(),
      homeCustomization: serializeHome(),
      explorationDiscoveries: serializeDiscoveries(),
      resourceNodes: serializeNodes(),
      achievementShowcase: serializeMilestones(),
      loreCodex: serializeLore(),
      housingUpgrades: serializeUpgrades(),
      petAdvancement: serializePet(),
      giftCooldowns: serializeGiftCooldowns(),
      titleProgression: serializeTitles(),
      craftMastery: serializeMastery(),
      settlementEconomy: serializeEconomies(),
      factions: serializeFactions(),
      blueprints: serializeBlueprints(),
      npcMemories: serializeMemories(),
      worldChronicle: serializeChronicle(),
      seasonalEvents: serializeSeasons(),
      playerJournal: serializeJournal(),
      playerHousing: serializeHousing(),
      talents: serializeTalents(),
      questBoard: serializeQuestBoard(),
      npcEmotions: serializeEmotions(),
      tradingNetwork: serializeTradingNetwork(),
      playerTitles: serializePlayerTitles(),
      worldEventScheduler: serializeScheduler(),
      worldHistoryCodex: serializeCodex(),
      achievementJournal: serializeAchievementJournal(),
      settlementRelations: serializeRelations(),
      recipeBook: serializeRecipeBook(),
      expeditions: serializeExpeditions(),
    })
    const meta = JSON.stringify({
      timestamp: Date.now(),
      civTier: ps.civTier,
      playTime: gs.simSeconds,
      version: 1,
    })

    // Write to temp keys first, then swap (atomic pattern for crash safety)
    localStorage.setItem(LS_PREFIX + 'vitals_tmp', vitals)
    localStorage.setItem(LS_PREFIX + 'pos_tmp', pos)
    localStorage.setItem(LS_PREFIX + 'state_tmp', state)

    localStorage.setItem(LS_PREFIX + 'vitals', vitals)
    localStorage.setItem(LS_PREFIX + 'pos', pos)
    localStorage.setItem(LS_PREFIX + 'state', state)
    localStorage.setItem(LS_PREFIX + 'meta', meta)

    // Clean up temp keys
    localStorage.removeItem(LS_PREFIX + 'vitals_tmp')
    localStorage.removeItem(LS_PREFIX + 'pos_tmp')
    localStorage.removeItem(LS_PREFIX + 'state_tmp')

    // IndexedDB: large state
    try {
      const db = await openDB()
      await Promise.all([
        idbPut(db, 'inventory', inventory.listItems()),
        idbPut(db, 'buildings', buildingSystem.getAllBuildings()),
        idbPut(db, 'journalEntries', journal.getAll()),
        idbPut(db, 'knownRecipes', inventory.getKnownRecipes()),
        idbPut(db, 'bedroll', ps.bedrollPos),
      ])
      db.close()
    } catch {
      // IndexedDB unavailable (private browsing) — fall back to localStorage
      try {
        localStorage.setItem(LS_PREFIX + 'inventory', JSON.stringify(inventory.listItems()))
        localStorage.setItem(LS_PREFIX + 'buildings', JSON.stringify(buildingSystem.getAllBuildings()))
        localStorage.setItem(LS_PREFIX + 'journal', JSON.stringify(journal.getAll()))
        localStorage.setItem(LS_PREFIX + 'recipes', JSON.stringify(inventory.getKnownRecipes()))
        localStorage.setItem(LS_PREFIX + 'bedroll', JSON.stringify(ps.bedrollPos))
      } catch {
        // localStorage full — silently fail
      }
    }

    return true
  } catch {
    return false
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadOffline(): Promise<boolean> {
  try {
    // Check if save exists
    const metaRaw = localStorage.getItem(LS_PREFIX + 'meta')
    if (!metaRaw) return false

    const vitalsRaw = localStorage.getItem(LS_PREFIX + 'vitals')
    const posRaw = localStorage.getItem(LS_PREFIX + 'pos')
    const stateRaw = localStorage.getItem(LS_PREFIX + 'state')

    if (!vitalsRaw || !posRaw || !stateRaw) return false

    const vitals = JSON.parse(vitalsRaw)
    const pos = JSON.parse(posRaw)
    const state = JSON.parse(stateRaw)

    const ps = usePlayerStore.getState()
    const gs = useGameStore.getState()

    // Restore vitals (clamp health to avoid dead-on-load)
    const loadedHealth = typeof vitals.health === 'number' && vitals.health > 0 ? vitals.health : 1
    ps.updateVitals({
      health: loadedHealth,
      hunger: vitals.hunger,
      thirst: vitals.thirst,
      energy: vitals.energy,
      fatigue: vitals.fatigue,
    })

    // Restore state
    ps.setCivTier(state.civTier ?? 0)
    ps.setCurrentGoal(state.currentGoal ?? 'survive')
    gs.setSimSeconds(state.simSeconds ?? 0)
    if (Array.isArray(state.discoveries)) {
      usePlayerStore.setState({ discoveries: new Set<string>(state.discoveries) })
    }
    if (state.murderCount > 0) ps.setMurderCount(state.murderCount)
    if (state.smithingXp > 0) ps.addSmithingXp(state.smithingXp)
    if (typeof state.gold === 'number' && state.gold > 0) ps.addGold(state.gold)

    // Restore wounds (only if health was valid)
    if (loadedHealth > 0 && Array.isArray(state.wounds) && state.wounds.length > 0) {
      usePlayerStore.setState({ wounds: state.wounds })
    }

    // Restore skills
    if (state.skills && _skillSystem) {
      _skillSystem.deserialize(state.skills)
    }

    // M36: Restore skill tree nodes, points, prestige
    if (state.skillTree) {
      useSkillStore.getState().deserialize(state.skillTree)
    }

    // M49: Restore skill specializations
    deserializeSpecs(state.specs ?? {})

    // Restore quest progress (M23)
    if (state.quests && _questSystem) {
      _questSystem.deserialize(state.quests)
    }

    // Restore achievements (M24)
    if (state.achievements && _achievementSystem) {
      _achievementSystem.deserialize(state.achievements)
    }

    // Restore tutorial step (M24)
    if (state.tutorialStep && _tutorialSystem) {
      _tutorialSystem.deserialize(state.tutorialStep)
    }

    // Restore trading routes (M49 Track B)
    if (state.tradeRoutes) {
      deserializeRoutes(state.tradeRoutes)
    }

    // Restore reputation titles (M50 Track A)
    if (state.repTitles) {
      deserializeRepTitles(state.repTitles)
    }

    // M52 Track B: Restore recipe discovery state
    if (state.recipeDiscovery) {
      deserializeDiscovery(state.recipeDiscovery)
    }

    // M53 Track B: Restore home customization
    if (state.homeCustomization) {
      deserializeHome(state.homeCustomization)
    }

    // M54 Track C: Restore exploration discoveries
    if (state.explorationDiscoveries) {
      deserializeDiscoveries(state.explorationDiscoveries)
    }

    // M55 Track B: Restore resource node depletion state
    if (state.resourceNodes) {
      deserializeNodes(state.resourceNodes)
    }

    // M57 Track A: Restore achievement showcase milestones
    if (state.achievementShowcase) {
      deserializeMilestones(state.achievementShowcase)
    }

    // M57 Track B: Restore lore codex
    if (state.loreCodex) {
      deserializeLore(state.loreCodex)
    }

    // M58 Track A: Restore housing upgrade tree
    if (state.housingUpgrades) {
      deserializeUpgrades(state.housingUpgrades)
    }

    // M58 Track C: Restore pet advancement state
    if (state.petAdvancement) {
      deserializePet(state.petAdvancement)
    }

    // M58 Track B: Restore NPC gift cooldowns
    if (state.giftCooldowns) {
      deserializeGiftCooldowns(state.giftCooldowns)
    }

    // M59 Track B: Restore title progression state
    if (state.titleProgression) {
      deserializeTitles(state.titleProgression)
    }

    // M60 Track A: Restore crafting mastery state
    if (state.craftMastery) {
      deserializeMastery(state.craftMastery)
    }

    // M61 Track B: Restore settlement economy state
    if (state.settlementEconomy) {
      deserializeEconomies(state.settlementEconomy)
    }

    // M62 Track A: Restore faction reputation standings
    if (state.factions) {
      deserializeFactions(state.factions)
    }

    // M63 Track A: Restore blueprint unlock state
    if (state.blueprints) {
      deserializeBlueprints(state.blueprints)
    }

    // M63 Track B: Restore NPC memory state
    if (state.npcMemories) {
      deserializeMemories(state.npcMemories)
    }

    // M63 Track C: Restore world chronicle
    if (state.worldChronicle) {
      deserializeChronicle(state.worldChronicle)
    }

    // M64 Track A: Restore seasonal events state
    if (state.seasonalEvents) {
      deserializeSeasons(state.seasonalEvents)
    }

    // M62 Track B: Restore player journal
    if (state.playerJournal) {
      deserializeJournal(state.playerJournal)
    }

    // M64 Track B: Restore player housing
    if (state.playerHousing) {
      deserializeHousing(state.playerHousing)
    }

    // M65 Track A: Restore talent tree
    if (state.talents) {
      deserializeTalents(state.talents)
    }

    // M65 Track B: Restore dynamic quest board
    if (state.questBoard) {
      deserializeQuestBoard(state.questBoard)
    }

    // M65 Track C: Restore NPC emotion states
    if (state.npcEmotions) {
      deserializeEmotions(state.npcEmotions)
    }

    // M66 Track C: Restore resource trading network
    if (state.tradingNetwork) {
      deserializeTradingNetwork(state.tradingNetwork)
    }

    // M66 Track B: Restore player title system
    if (state.playerTitles) {
      deserializePlayerTitles(state.playerTitles)
    }

    // M66 Track A: Restore world event scheduler
    if (state.worldEventScheduler) {
      deserializeScheduler(state.worldEventScheduler)
    }

    // M67 Track A: Restore world history codex
    if (state.worldHistoryCodex) {
      deserializeCodex(state.worldHistoryCodex)
    }

    // M67 Track B: Restore player achievement journal
    if (state.achievementJournal) {
      deserializeAchievementJournal(state.achievementJournal)
    }

    // M67 Track C: Restore settlement relations
    if (state.settlementRelations) {
      deserializeRelations(state.settlementRelations)
    }

    // M68 Track A: Restore recipe book
    if (state.recipeBook) {
      deserializeRecipeBook(state.recipeBook as RecipeBookSaveData)
    }

    // M68 Track C: Restore expedition state
    if (state.expeditions) {
      deserializeExpeditions(state.expeditions as ExpeditionSaveData)
    }

    // Restore position
    ps.setPosition(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)

    // Load large state from IndexedDB (with localStorage fallback)
    let inv: unknown[] | undefined
    let buildings: unknown[] | undefined
    let journalEntries: unknown[] | undefined
    let recipes: number[] | undefined
    let bedroll: { x: number; y: number; z: number } | null | undefined

    try {
      const db = await openDB()
      inv = await idbGet<unknown[]>(db, 'inventory')
      buildings = await idbGet<unknown[]>(db, 'buildings')
      journalEntries = await idbGet<unknown[]>(db, 'journalEntries')
      recipes = await idbGet<number[]>(db, 'knownRecipes')
      bedroll = await idbGet<{ x: number; y: number; z: number } | null>(db, 'bedroll')
      db.close()
    } catch {
      // Fallback to localStorage
      try {
        const invRaw = localStorage.getItem(LS_PREFIX + 'inventory')
        const bldRaw = localStorage.getItem(LS_PREFIX + 'buildings')
        const jrnRaw = localStorage.getItem(LS_PREFIX + 'journal')
        const recRaw = localStorage.getItem(LS_PREFIX + 'recipes')
        const bedRaw = localStorage.getItem(LS_PREFIX + 'bedroll')
        if (invRaw) inv = JSON.parse(invRaw)
        if (bldRaw) buildings = JSON.parse(bldRaw)
        if (jrnRaw) journalEntries = JSON.parse(jrnRaw)
        if (recRaw) recipes = JSON.parse(recRaw)
        if (bedRaw) bedroll = JSON.parse(bedRaw)
      } catch {
        // Corrupted localStorage data — skip
      }
    }

    if (Array.isArray(inv) && inv.length > 0) {
      inventory.loadSlots(inv as Parameters<typeof inventory.loadSlots>[0])
    }
    if (Array.isArray(recipes) && recipes.length > 0) {
      inventory.loadKnownRecipes(recipes)
    }
    if (Array.isArray(journalEntries) && journalEntries.length > 0) {
      journal.loadEntries(journalEntries as Parameters<typeof journal.loadEntries>[0])
    }
    if (Array.isArray(buildings) && buildings.length > 0) {
      buildingSystem.loadBuildings(buildings as Parameters<typeof buildingSystem.loadBuildings>[0])
      useGameStore.getState().bumpBuildVersion()
    }
    if (bedroll && bedroll.x != null) {
      ps.setBedrollPos(bedroll)
      ps.setBedrollPlaced(true)
    }

    // Write vitals + position to ECS if entity already exists
    const entityId = usePlayerStore.getState().entityId
    if (entityId !== null) {
      const maxHp = Health.max[entityId] || 100
      Health.current[entityId] = loadedHealth * maxHp
      Metabolism.hunger[entityId] = vitals.hunger ?? 0
      Metabolism.thirst[entityId] = vitals.thirst ?? 0
      Metabolism.energy[entityId] = vitals.energy ?? 1
      Metabolism.fatigue[entityId] = vitals.fatigue ?? 0

      const sx = pos.x ?? 0, sy = pos.y ?? 0, sz = pos.z ?? 0
      const savedR = Math.sqrt(sx * sx + sy * sy + sz * sz)
      if (savedR > PLANET_RADIUS / 2) {
        Position.x[entityId] = sx
        Position.y[entityId] = sy
        Position.z[entityId] = sz
        rapierWorld.getPlayer()?.body.setNextKinematicTranslation({ x: sx, y: sy, z: sz })
      }
    }

    return true
  } catch {
    return false
  }
}

// ── Metadata query ────────────────────────────────────────────────────────────

export interface SaveMeta {
  timestamp: number
  civTier: number
  playTime: number
  version: number
}

export function getSaveMeta(): SaveMeta | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + 'meta')
    if (!raw) return null
    return JSON.parse(raw) as SaveMeta
  } catch {
    return null
  }
}

export function getCloudSaveTimestamp(): number | null {
  // Check if cloud save exists by looking at the server-saved timestamp
  // This is set by saveStore.ts after a successful cloud save
  try {
    const raw = localStorage.getItem('universe_cloud_save_ts')
    return raw ? parseInt(raw, 10) : null
  } catch {
    return null
  }
}

export function setCloudSaveTimestamp(ts: number): void {
  localStorage.setItem('universe_cloud_save_ts', String(ts))
}

// ── Delete save ───────────────────────────────────────────────────────────────

export function deleteOfflineSave(): void {
  const keys = ['meta', 'vitals', 'pos', 'state', 'inventory', 'buildings', 'journal', 'recipes', 'bedroll']
  for (const k of keys) {
    localStorage.removeItem(LS_PREFIX + k)
    localStorage.removeItem(LS_PREFIX + k + '_tmp')
  }
  try {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onerror = () => {}
  } catch {
    // IndexedDB not available
  }
}
