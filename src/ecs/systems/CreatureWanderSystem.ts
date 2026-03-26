/**
 * CreatureWanderSystem — per-frame creature AI tick
 *
 * Extracted from SceneRoot.tsx (lines ~1043-1094).
 * Handles: wander direction changes, surface-hugging movement, bite damage.
 */
import * as THREE from 'three'
import { Position, Health, CreatureBody } from '../world'
import { terrainHeightAt, PLANET_RADIUS } from '../../world/SpherePlanet'
import { inflictWound, markCombatDamage } from '../../game/SurvivalSystems'

// ── Creature wander state ──────────────────────────────────────────────────────
// Each creature has a wander direction and a timer until it picks a new direction.
// Stored outside React state (module-level) for zero-allocation per-frame access.
export interface WanderState { vx: number; vy: number; vz: number; timer: number }
export const creatureWander = new Map<number, WanderState>()

// M9 T3: Scratch Vector3 for creature wander terrain projection — reused each frame
const _creatureDir3 = new THREE.Vector3()

/**
 * Tick all creature wander AI for one frame.
 * @param dt          Delta time in seconds (already capped)
 * @param playerEid   Player entity id — used for bite-range check
 * @param playerPx/Py/Pz  Player world position
 * @param entityId    Alias for playerEid used for damage writes
 */
export function tickCreatureWander(
  dt: number,
  playerEid: number,
  playerPx: number,
  playerPy: number,
  playerPz: number,
): void {
  for (const [eid, ws] of creatureWander) {
    ws.timer -= dt
    if (ws.timer <= 0) {
      // Pick a new random tangent-plane direction
      const angle = Math.random() * Math.PI * 2
      const speed = 0.3 + Math.random() * 0.5
      ws.vx = Math.cos(angle) * speed
      ws.vz = Math.sin(angle) * speed
      ws.timer = 2 + Math.random() * 4
    }
    // Move creature along surface: advance position, then re-project onto sphere
    const cx = Position.x[eid], cy = Position.y[eid], cz = Position.z[eid]
    let nx = cx + ws.vx * dt
    let ny = cy
    let nz = cz + ws.vz * dt
    // Re-project onto planet surface (keep at correct radius above terrain)
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
    if (len > 10) {
      const ndx = nx / len, ndy = ny / len, ndz = nz / len
      // M9 T3: Reuse module-level scratch — no Vector3 allocation per creature per frame
      _creatureDir3.set(ndx, ndy, ndz)
      const h = terrainHeightAt(_creatureDir3)
      if (h >= 0) {
        const size = CreatureBody.size[eid] || 0.5
        const r = PLANET_RADIUS + Math.max(0, h) + size * 0.5
        nx = ndx * r; ny = ndy * r; nz = ndz * r
      } else {
        // Hit ocean — reverse direction
        ws.vx = -ws.vx; ws.vz = -ws.vz
        nx = cx; ny = cy; nz = cz
      }
    }
    Position.x[eid] = nx; Position.y[eid] = ny; Position.z[eid] = nz

    // Slice 5: Larger creatures (size >= 0.65m) can bite the player
    const cSize = CreatureBody.size[eid] || 0.3
    if (cSize >= 0.65) {
      const bdx = playerPx - nx
      const bdy = playerPy - ny
      const bdz = playerPz - nz
      const bDist2 = bdx * bdx + bdy * bdy + bdz * bdz
      if (bDist2 < 2.25) {  // 1.5m radius
        // 5% chance per second to bite → probability per frame = 0.05 * dt
        if (Math.random() < 0.05 * dt) {
          const severity = 0.2 + Math.random() * 0.4  // mild to moderate bite
          Health.current[playerEid] = Math.max(0, Health.current[playerEid] - severity * 10)
          inflictWound(severity)
          markCombatDamage()  // M5: mark so death is attributed to combat
        }
      }
    }
  }
}
