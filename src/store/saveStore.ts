/**
 * Handles save/load of player state to/from the Neon database via Vercel Functions.
 * Called after login (load) and every 60 seconds (auto-save).
 */
import { usePlayerStore } from './playerStore'
import { useGameStore } from './gameStore'
import { inventory, journal, buildingSystem } from '../game/GameSingletons'
import { skillSystem } from '../game/SkillSystem'
import { Health, Metabolism, Position } from '../ecs/world'
import { rapierWorld } from '../physics/RapierWorld'
import { PLANET_RADIUS } from '../world/SpherePlanet'

const GOD_MODE_KEY = 'universe_god_mode'

async function authHeaders(getToken: () => Promise<string | null>) {
  const token = await getToken()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export async function loadSave(getToken: () => Promise<string | null>) {
  const res = await fetch('/api/load', { headers: await authHeaders(getToken) })
  if (!res.ok) return false

  const data = await res.json()
  if (!data.exists) return false

  // Avoid restoring an invalid "alive with 0 HP" state from stale saves.
  const loadedHealth = typeof data.health === 'number' && data.health > 0 ? data.health : 1

  const ps = usePlayerStore.getState()
  const gs = useGameStore.getState()

  // Vitals & stats
  ps.updateVitals({ health: loadedHealth, hunger: data.hunger, thirst: data.thirst, energy: data.energy, fatigue: data.fatigue })
  ps.setCivTier(data.civTier)
  ps.setCurrentGoal(data.currentGoal)
  if (Array.isArray(data.discoveries)) {
    usePlayerStore.setState({ discoveries: new Set<string>(data.discoveries) })
  }
  gs.setSimSeconds(data.simSeconds)

  // Position (was saved but never restored — fixed)
  ps.setPosition(data.x ?? 0, data.y ?? 0, data.z ?? 0)

  // Inventory items
  if (Array.isArray(data.inventory) && data.inventory.length > 0) {
    inventory.loadSlots(data.inventory)
  }

  // Known crafting recipes
  if (Array.isArray(data.knownRecipes) && data.knownRecipes.length > 0) {
    inventory.loadKnownRecipes(data.knownRecipes)
  }

  // Discovery journal — full entry objects
  if (Array.isArray(data.journalEntries) && data.journalEntries.length > 0) {
    journal.loadEntries(data.journalEntries)
  }

  // Placed buildings
  if (Array.isArray(data.buildings) && data.buildings.length > 0) {
    buildingSystem.loadBuildings(data.buildings)
    useGameStore.getState().bumpBuildVersion()
  }

  // Bedroll position (M5)
  if (data.bedrollX != null && data.bedrollY != null && data.bedrollZ != null) {
    ps.setBedrollPos({ x: data.bedrollX, y: data.bedrollY, z: data.bedrollZ })
    ps.setBedrollPlaced(true)
  }

  // Murder count (M5 criminal record)
  if (data.murderCount && data.murderCount > 0) {
    ps.setMurderCount(data.murderCount)
  }

  // M7: Smithing XP
  if (data.smithingXp && data.smithingXp > 0) {
    ps.addSmithingXp(data.smithingXp)
  }

  // M22: Skill system
  if (data.skills) {
    skillSystem.deserialize(data.skills)
  }

  // Slice 5: Wounds — restore active infections so logout doesn't reset them.
  // Skip restoring wounds when the save had 0 HP (player died before saving); those
  // wounds caused the death and should not persist into the fresh load.
  const savedHealthWasValid = typeof data.health === 'number' && data.health > 0
  if (savedHealthWasValid && Array.isArray(data.wounds) && data.wounds.length > 0) {
    usePlayerStore.setState({ wounds: data.wounds })
  }

  // If the ECS entity already exists (engine init beat loadSave), write vitals and
  // position directly so they aren't overwritten by the GameLoop on the next frame.
  const entityId = usePlayerStore.getState().entityId
  if (entityId !== null) {
    const maxHp = Health.max[entityId] || 100
    Health.current[entityId]         = loadedHealth * maxHp
    Metabolism.hunger[entityId]      = data.hunger  ?? 0
    Metabolism.thirst[entityId]      = data.thirst  ?? 0
    Metabolism.energy[entityId]      = data.energy  ?? 1
    Metabolism.fatigue[entityId]     = data.fatigue ?? 0

    const sx = data.x ?? 0, sy = data.y ?? 0, sz = data.z ?? 0
    const savedR = Math.sqrt(sx * sx + sy * sy + sz * sz)
    const hasSavedPos = savedR > PLANET_RADIUS / 2
    if (hasSavedPos) {
      Position.x[entityId] = sx
      Position.y[entityId] = sy
      Position.z[entityId] = sz
      rapierWorld.getPlayer()?.body.setNextKinematicTranslation({ x: sx, y: sy, z: sz })
    }
  }

  // God mode — stored in localStorage (admin pref, not game state)
  const savedGodMode = localStorage.getItem(GOD_MODE_KEY) === 'true'
  if (savedGodMode) {
    inventory.setGodMode(true)
  }

  return true
}

export async function saveGame(getToken: () => Promise<string | null>, username: string) {
  const ps = usePlayerStore.getState()
  const gs = useGameStore.getState()

  await fetch('/api/save', {
    method: 'POST',
    headers: await authHeaders(getToken),
    body: JSON.stringify({
      username,
      x: ps.x, y: ps.y, z: ps.z,
      health: ps.health, hunger: ps.hunger, thirst: ps.thirst,
      energy: ps.energy, fatigue: ps.fatigue,
      civTier: ps.civTier,
      discoveries: Array.from(ps.discoveries),
      currentGoal: ps.currentGoal,
      simSeconds: gs.simSeconds,
      inventory: inventory.listItems(),
      knownRecipes: inventory.getKnownRecipes(),
      journalEntries: journal.getAll(),
      buildings: buildingSystem.getAllBuildings(),
      bedrollX: ps.bedrollPos?.x ?? null,
      bedrollY: ps.bedrollPos?.y ?? null,
      bedrollZ: ps.bedrollPos?.z ?? null,
      murderCount: ps.murderCount,
      smithingXp:  ps.smithingXp,
      wounds:      ps.wounds,
      skills:      skillSystem.serialize(),
    }),
  })
}

/** Persist god mode to localStorage. Call when toggling in AdminPanel. */
export function saveGodMode(on: boolean) {
  localStorage.setItem(GOD_MODE_KEY, String(on))
}
