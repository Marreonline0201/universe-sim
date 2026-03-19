// ── NpcManager ─────────────────────────────────────────────────────────────────
// 50 server-side NPCs with simple random-walk behaviour.
// Ticked at 10 Hz. Placeholder for full NPC migration.

const NPC_COUNT = 50
const WANDER_SPEED = 1.5 // m/s
const WANDER_RADIUS = 200

export class NpcManager {
  constructor() {
    this.npcs = []
    for (let i = 0; i < NPC_COUNT; i++) {
      this.npcs.push({
        id: i,
        x: (Math.random() - 0.5) * WANDER_RADIUS * 2,
        y: 0.9,
        z: (Math.random() - 0.5) * WANDER_RADIUS * 2,
        // Current heading in radians
        heading: Math.random() * Math.PI * 2,
        // Seconds until next heading change
        nextTurnIn: 2 + Math.random() * 8,
      })
    }
  }

  /**
   * Advance all NPC positions.
   * @param {number} dtSec  Wall-clock delta in seconds (10Hz → ~0.1)
   */
  tick(dtSec) {
    for (const npc of this.npcs) {
      npc.nextTurnIn -= dtSec
      if (npc.nextTurnIn <= 0) {
        npc.heading += (Math.random() - 0.5) * Math.PI
        npc.nextTurnIn = 2 + Math.random() * 8
      }

      npc.x += Math.sin(npc.heading) * WANDER_SPEED * dtSec
      npc.z += Math.cos(npc.heading) * WANDER_SPEED * dtSec

      // Soft boundary — turn back toward origin if too far
      const dist = Math.sqrt(npc.x * npc.x + npc.z * npc.z)
      if (dist > WANDER_RADIUS) {
        npc.heading = Math.atan2(-npc.x, -npc.z) + (Math.random() - 0.5) * 0.5
      }
    }
  }

  getAll() {
    return this.npcs.map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z }))
  }
}
