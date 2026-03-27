// ── OfflineSaveManager.ts ─────────────────────────────────────────────────────
// Offline save/load using localStorage.
// RPG systems have been removed. Only core simulation state is saved.

import { usePlayerStore } from '../store/playerStore'
import { useGameStore } from '../store/gameStore'
import { Health, Metabolism, Position } from '../ecs/world'
import { rapierWorld } from '../physics/RapierWorld'
import { PLANET_RADIUS } from '../world/SpherePlanet'

const LS_PREFIX = 'universe_save_'

// No-op stubs kept for compatibility with GameLoop.ts call sites
export function registerSkillSystem(_sys: unknown) {}
export function registerQuestSystem(_sys: unknown) {}
export function registerAchievementSystem(_sys: unknown) {}
export function registerTutorialSystem(_sys: unknown) {}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveOffline(): Promise<boolean> {
  try {
    const ps = usePlayerStore.getState()
    const gs = useGameStore.getState()

    if (ps.isDead) return false

    const pos = JSON.stringify({ x: ps.x, y: ps.y, z: ps.z })
    const state = JSON.stringify({
      simSeconds: gs.simSeconds,
      civTier: ps.civTier,
    })
    const meta = JSON.stringify({
      timestamp: Date.now(),
      playTime: gs.simSeconds,
      version: 2,
    })

    localStorage.setItem(LS_PREFIX + 'pos', pos)
    localStorage.setItem(LS_PREFIX + 'state', state)
    localStorage.setItem(LS_PREFIX + 'meta', meta)

    return true
  } catch {
    return false
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadOffline(): Promise<boolean> {
  try {
    const metaRaw = localStorage.getItem(LS_PREFIX + 'meta')
    if (!metaRaw) return false

    const posRaw = localStorage.getItem(LS_PREFIX + 'pos')
    const stateRaw = localStorage.getItem(LS_PREFIX + 'state')

    if (!posRaw || !stateRaw) return false

    const pos = JSON.parse(posRaw)
    const state = JSON.parse(stateRaw)

    const ps = usePlayerStore.getState()
    const gs = useGameStore.getState()

    ps.setCivTier(state.civTier ?? 0)
    gs.setSimSeconds(state.simSeconds ?? 0)

    // Restore position in ECS + physics
    const eid = ps.entityId
    if (eid !== null && typeof pos.x === 'number') {
      Position.x[eid] = pos.x
      Position.y[eid] = pos.y
      Position.z[eid] = pos.z
      rapierWorld.getPlayer()?.body.setNextKinematicTranslation(pos)
    }

    return true
  } catch {
    return false
  }
}

// ── Wipe ──────────────────────────────────────────────────────────────────────

export function wipeOfflineSave(): void {
  const keys = [
    'pos', 'state', 'meta', 'vitals', 'vitals_tmp', 'pos_tmp', 'state_tmp',
  ]
  for (const k of keys) {
    localStorage.removeItem(LS_PREFIX + k)
  }
  // Also wipe old RPG keys that may exist in existing saves
  const rpgKeys = [
    'inventory', 'buildings', 'journal', 'recipes', 'bedroll',
  ]
  for (const k of rpgKeys) {
    localStorage.removeItem(LS_PREFIX + k)
  }
}
