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
    controller.setMaxSlopeClimbAngle(55 * Math.PI / 180)  // max slope the character can walk up
    controller.setMinSlopeSlideAngle(65 * Math.PI / 180)  // only cliff-steep slopes slide (was 30°)
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

  /**
   * Add static colliders for resource nodes (trees, rocks, etc.) so the player
   * cannot walk through them.
   *
   * @param nodes  Array of { x, y, z, type } — world-space surface positions.
   *               type 'wood' → tall cylinder; everything else → sphere.
   */
  addNodeColliders(nodes: Array<{ x: number; y: number; z: number; type: string }>): void {
    const world = this._world
    if (!world) return

    for (const node of nodes) {
      // Surface normal at this node position = outward direction
      const len = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z)
      if (len < 1) continue
      const nx = node.x / len, ny = node.y / len, nz = node.z / len

      // Place the collider center slightly above the node origin so the
      // collision shape sits at ground level (node origin is already 0.8m below
      // actual terrain surface).
      const cx = node.x + nx * 1.5
      const cy = node.y + ny * 1.5
      const cz = node.z + nz * 1.5

      // Build a rotation that aligns the collider's local Y-axis with the
      // surface normal so capsules stand perpendicular to the sphere.
      // Rapier quaternion: (x, y, z, w)
      // Rotation from world-Y (0,1,0) → surface normal (nx, ny, nz)
      const dot = ny  // dot((0,1,0), (nx,ny,nz)) = ny
      let qx: number, qy: number, qz: number, qw: number
      if (dot < -0.9999) {
        // Anti-parallel — rotate 180° around X
        qx = 1; qy = 0; qz = 0; qw = 0
      } else {
        // cross((0,1,0), (nx,ny,nz)) = (nz, 0, -nx)
        const cx2 = nz, cy2 = 0, cz2 = -nx
        const s = Math.sqrt((1 + dot) * 2)
        const inv = 1 / s
        qx = cx2 * inv; qy = cy2 * inv; qz = cz2 * inv; qw = s / 2
      }

      const staticBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation({ x: qx, y: qy, z: qz, w: qw }),
      )

      if (node.type === 'wood') {
        // Tree trunk: capsule halfHeight=1.2m radius=0.35m (tree trunk in local Y)
        world.createCollider(
          RAPIER.ColliderDesc.capsule(1.2, 0.35).setFriction(0.8),
          staticBody,
        )
      } else if (node.type === 'stone' || node.type === 'flint' || node.type === 'copper_ore'
              || node.type === 'iron_ore' || node.type === 'coal' || node.type === 'tin_ore') {
        // Rock/ore: sphere radius=0.5m
        world.createCollider(
          RAPIER.ColliderDesc.ball(0.5).setFriction(0.9),
          staticBody,
        )
      }
      // bark, fiber, sand, sulfur, clay — intentionally no collider (too small/flat)
    }
  }

  /** Advance the physics simulation by dt seconds. */
  step(dt: number): void {
    if (!this._world || !this._ready) return
    this._world.timestep = Math.min(dt, 0.05)  // clamp to avoid instability
    this._world.step()
  }
}

export const rapierWorld = new RapierWorldManager()
