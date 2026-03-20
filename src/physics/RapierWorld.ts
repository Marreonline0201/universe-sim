// ── RapierWorld ────────────────────────────────────────────────────────────────
// Physics singleton using @dimforge/rapier3d-compat.
//
// Architecture:
//  • World gravity = (0,0,0) — we apply radial gravity in PlayerController
//  • Planet = static trimesh collider built from generatePlanetGeometry(60)
//  • Player = kinematic position-based body + capsule collider + KCC
//
// Scientific foundation:
//  Newton's law: F = GMm/r² toward center.  For our planet, g ≈ 9.81 m/s² radially
//  inward.  The KCC resolves collision geometry; gravity direction is computed
//  per-body as  a = -9.81 * normalize(position).

import RAPIER from '@dimforge/rapier3d-compat'
import { generatePlanetGeometry } from '../world/SpherePlanet'

export interface PhysicsPlayer {
  body:       RAPIER.RigidBody
  collider:   RAPIER.Collider
  controller: RAPIER.KinematicCharacterController
}

class RapierWorldManager {
  private _world:  RAPIER.World | null = null
  private _player: PhysicsPlayer | null = null
  private _ready = false

  async init(spawnX: number, spawnY: number, spawnZ: number): Promise<void> {
    await RAPIER.init()

    // Zero world gravity — gravity is applied per-body as a radial force
    this._world = new RAPIER.World({ x: 0, y: 0, z: 0 })

    // ── Planet: static trimesh collider ──────────────────────────────────────
    // Lower resolution (60 segs) is sufficient for physics; render uses 64+.
    // generatePlanetGeometry returns indexed Float32Array + Uint32Array — exactly
    // what Rapier's trimesh() expects.
    const geo      = generatePlanetGeometry(60)
    const posAttr  = geo.getAttribute('position')
    const idxAttr  = geo.getIndex()!
    const vertices = new Float32Array(posAttr.array)
    const rawIdx   = idxAttr.array instanceof Uint32Array
      ? idxAttr.array
      : new Uint32Array(idxAttr.array)

    // generatePlanetGeometry produces outward-facing normals (correct winding).
    // Rapier's one-sided trimesh collides on the front face (normal side) —
    // a player outside the sphere is on the front face and collides correctly.
    //
    // Cube-sphere faces store duplicate vertices at their shared edges (each face
    // has its own vertex buffer). These seams create micro-gaps in the physics mesh
    // that can cause fall-through. We merge vertices that are within 0.01m of each
    // other before building the trimesh collider.
    const eps = 0.01  // merge threshold in metres
    const GRID = 512  // spatial hash grid size
    const snapCoord = (v: number) => Math.floor(v / eps)

    // Build vertex-merge map: for each vertex, find or create a canonical index
    const vertexCount  = vertices.length / 3
    const mergeMap     = new Int32Array(vertexCount)
    const hashMap      = new Map<number, number[]>()

    for (let i = 0; i < vertexCount; i++) {
      const vx = vertices[i * 3], vy = vertices[i * 3 + 1], vz = vertices[i * 3 + 2]
      const gx = snapCoord(vx), gy = snapCoord(vy), gz = snapCoord(vz)
      // Check 2×2×2 neighbourhood to handle snapping boundary cases
      let found = -1
      outer:
      for (let dx = 0; dx <= 1 && found < 0; dx++) {
        for (let dy = 0; dy <= 1 && found < 0; dy++) {
          for (let dz = 0; dz <= 1 && found < 0; dz++) {
            const key = ((gx + dx) * GRID + (gy + dy)) * GRID + (gz + dz)
            const bucket = hashMap.get(key)
            if (!bucket) continue
            for (const cand of bucket) {
              const cx = vertices[cand * 3], cy = vertices[cand * 3 + 1], cz = vertices[cand * 3 + 2]
              if (Math.abs(cx - vx) < eps && Math.abs(cy - vy) < eps && Math.abs(cz - vz) < eps) {
                found = cand; break outer
              }
            }
          }
        }
      }
      if (found >= 0) {
        mergeMap[i] = found
      } else {
        mergeMap[i] = i
        const key = (gx * GRID + gy) * GRID + gz
        const bucket = hashMap.get(key)
        if (bucket) bucket.push(i)
        else hashMap.set(key, [i])
      }
    }

    // Re-index triangles through mergeMap and skip degenerate triangles
    const rawIdxArr = rawIdx instanceof Uint32Array ? rawIdx : new Uint32Array(rawIdx)
    const mergedTris: number[] = []
    for (let i = 0; i < rawIdxArr.length; i += 3) {
      const a = mergeMap[rawIdxArr[i]]
      const b = mergeMap[rawIdxArr[i + 1]]
      const c = mergeMap[rawIdxArr[i + 2]]
      if (a !== b && b !== c && a !== c) {
        mergedTris.push(a, b, c)
      }
    }
    const indices = new Uint32Array(mergedTris)

    const planetBody = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this._world.createCollider(
      RAPIER.ColliderDesc.trimesh(vertices, indices)
        .setFriction(0.8)
        .setRestitution(0.0),
      planetBody,
    )

    // ── Player: kinematic body + capsule ─────────────────────────────────────
    // Capsule: halfHeight=0.6m, radius=0.3m → full height ~1.8m.
    // Body origin = player center ≈ 0.9m above feet.
    const body = this._world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(spawnX, spawnY, spawnZ),
    )
    const collider = this._world.createCollider(
      RAPIER.ColliderDesc.capsule(0.6, 0.3)
        .setFriction(0.0)       // movement is controller-driven, not friction-based
        .setRestitution(0.0),
      body,
    )

    // ── KinematicCharacterController ─────────────────────────────────────────
    // 0.01m offset: small gap between capsule and geometry to avoid tunneling.
    const controller = this._world.createCharacterController(0.01)
    controller.setApplyImpulsesToDynamicBodies(false)
    controller.setSlideEnabled(true)
    controller.setMaxSlopeClimbAngle(50 * Math.PI / 180)  // max slope the character can walk up
    controller.setMinSlopeSlideAngle(30 * Math.PI / 180)  // slopes steeper than this → slide off
    controller.enableAutostep(0.5, 0.2, true)             // step up ledges up to 0.5m

    // NOTE: We intentionally do NOT call enableSnapToGround here.
    // Rapier's snap-to-ground assumes world-Y is "up", but on a sphere the
    // surface normal changes at every position.  Instead, we rely on gravity
    // (radial toward center) to keep the player on the ground naturally.

    this._player = { body, collider, controller }
    this._ready  = true
  }

  isReady():  boolean             { return this._ready }
  getPlayer(): PhysicsPlayer | null { return this._player }
  getWorld():  RAPIER.World | null  { return this._world }

  /** Advance the physics simulation by dt seconds. */
  step(dt: number): void {
    if (!this._world || !this._ready) return
    this._world.timestep = Math.min(dt, 0.05)  // clamp to avoid instability
    this._world.step()
  }
}

export const rapierWorld = new RapierWorldManager()
