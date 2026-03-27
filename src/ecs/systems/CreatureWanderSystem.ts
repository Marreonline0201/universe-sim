/**
 * CreatureWanderSystem — per-frame creature AI tick
 *
 * Extracted from SceneRoot.tsx (lines ~1043-1094).
 * Handles: wander direction changes, surface-hugging movement, bite damage.
 */
import * as THREE from 'three'
import { Position, Health, CreatureBody, DietaryType, Metabolism } from '../world'
import { terrainHeightAt, PLANET_RADIUS } from '../../world/SpherePlanet'
import { inflictWound, markCombatDamage } from '../../game/SurvivalSystems'

// ── Creature wander state ──────────────────────────────────────────────────────
// Each creature has a wander direction and a timer until it picks a new direction.
// Stored outside React state (module-level) for zero-allocation per-frame access.
export interface WanderState { vx: number; vy: number; vz: number; timer: number }
export const creatureWander = new Map<number, WanderState>()

// M77: Track which organisms are actively hunting (for visual feedback)
// Maps heterotroph eid -> target eid (0 if not hunting)
export const huntingTargets = new Map<number, number>()

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
    const diet = DietaryType.type[eid]  // 0=auto, 1=hetero, 2=mixo, 3=chemoauto

    if (ws.timer <= 0) {
      // M77: Heterotrophs steer toward nearest autotroph
      if (diet === 1) {
        let bestDist2 = 900  // 30m search radius squared
        let targetEid = 0
        let tx = 0, ty = 0, tz = 0
        const cx = Position.x[eid], cy = Position.y[eid], cz = Position.z[eid]
        for (const [otherId] of creatureWander) {
          if (otherId === eid) continue
          const otherDiet = DietaryType.type[otherId]
          if (otherDiet !== 0) continue  // only hunt autotrophs
          const ox = Position.x[otherId], oy = Position.y[otherId], oz = Position.z[otherId]
          const dx = ox - cx, dy = oy - cy, dz = oz - cz
          const d2 = dx*dx + dy*dy + dz*dz
          if (d2 < bestDist2 && d2 > 0.01) {
            bestDist2 = d2
            targetEid = otherId
            tx = ox; ty = oy; tz = oz
          }
        }
        if (targetEid > 0) {
          // Steer toward target
          const dx = tx - Position.x[eid], dz = tz - Position.y[eid] // approximate: use xz plane steering
          const toTargetX = tx - Position.x[eid]
          const toTargetZ = tz - Position.z[eid]
          const dist = Math.sqrt(toTargetX*toTargetX + toTargetZ*toTargetZ)
          if (dist > 0.1) {
            const speed = 0.5 + Math.random() * 0.3  // heterotrophs move faster when hunting
            ws.vx = (toTargetX / dist) * speed
            ws.vz = (toTargetZ / dist) * speed
          }
          ws.timer = 1 + Math.random() * 2  // re-evaluate more frequently when hunting
          huntingTargets.set(eid, targetEid)
        } else {
          // No prey nearby — wander randomly
          const angle = Math.random() * Math.PI * 2
          const speed = 0.3 + Math.random() * 0.5
          ws.vx = Math.cos(angle) * speed
          ws.vz = Math.sin(angle) * speed
          ws.timer = 2 + Math.random() * 4
          huntingTargets.delete(eid)
        }
      } else {
        // Non-heterotrophs: normal random wander
        const angle = Math.random() * Math.PI * 2
        const speed = 0.3 + Math.random() * 0.5
        ws.vx = Math.cos(angle) * speed
        ws.vz = Math.sin(angle) * speed
        ws.timer = 2 + Math.random() * 4
        huntingTargets.delete(eid)
      }
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

    // M77: Heterotroph energy transfer — consume autotroph on contact
    if (diet === 1) {
      const target = huntingTargets.get(eid)
      if (target && target > 0) {
        const tx = Position.x[target], ty = Position.y[target], tz = Position.z[target]
        const dx = nx - tx, dy = ny - ty, dz = nz - tz
        const d2 = dx*dx + dy*dy + dz*dz
        const contactRadius = (CreatureBody.size[eid] + CreatureBody.size[target]) * 0.5
        if (d2 < contactRadius * contactRadius) {
          // Transfer energy: heterotroph gains, autotroph loses
          const transfer = 0.15  // 15% energy per bite
          Metabolism.energy[eid] = Math.min(1.0, Metabolism.energy[eid] + transfer)
          Metabolism.energy[target] = Math.max(0, Metabolism.energy[target] - transfer)
          Metabolism.hunger[eid] = Math.max(0, Metabolism.hunger[eid] - 0.2)  // satiate hunger
          huntingTargets.delete(eid)  // consumed, find new target next tick
        }
      }
    }

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
