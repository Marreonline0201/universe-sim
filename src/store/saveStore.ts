/**
 * Handles save/load of player state to/from the Neon database via Vercel Functions.
 * Called after login (load) and every 60 seconds (auto-save).
 */
import { usePlayerStore } from './playerStore'
import { useGameStore } from './gameStore'

async function authHeaders(getToken: () => Promise<string | null>) {
  const token = await getToken()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export async function loadSave(getToken: () => Promise<string | null>) {
  const res = await fetch('/api/load', { headers: await authHeaders(getToken) })
  if (!res.ok) return false

  const data = await res.json()
  if (!data.exists) return false

  const ps = usePlayerStore.getState()
  const gs = useGameStore.getState()

  ps.updateVitals({ health: data.health, hunger: data.hunger, thirst: data.thirst, energy: data.energy, fatigue: data.fatigue })
  ps.setCivTier(data.civTier)
  ps.setCurrentGoal(data.currentGoal)
  data.discoveries.forEach((d: string) => ps.addDiscovery(d))
  ps.addEvolutionPoints(data.evolutionPoints)
  gs.addSimSeconds(data.simSeconds)

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
      evolutionPoints: ps.evolutionPoints,
      civTier: ps.civTier,
      discoveries: ps.discoveries,
      currentGoal: ps.currentGoal,
      simSeconds: gs.simSeconds,
    }),
  })
}
