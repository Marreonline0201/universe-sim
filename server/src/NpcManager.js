// ── NpcManager ─────────────────────────────────────────────────────────────────
// Server-side NPC simulation with basic survival behaviour state machine.
// States: wander → gather (hungry) → eat → wander
//                → rest → wander
//                → socialize → wander

const NPC_COUNT    = 50
const WANDER_SPEED = 1.5   // m/s
const GATHER_SPEED = 2.2   // m/s (faster when hungry)
const WANDER_RADIUS = 200  // soft boundary radius
const HUNGER_RATE  = 0.0008 // per tick — full hunger in ~125s real time

export class NpcManager {
  constructor() {
    this.npcs = []
    for (let i = 0; i < NPC_COUNT; i++) {
      this.npcs.push({
        id: i,
        x: (Math.random() - 0.5) * WANDER_RADIUS * 2,
        y: 0.9,
        z: (Math.random() - 0.5) * WANDER_RADIUS * 2,
        heading:    Math.random() * Math.PI * 2,
        nextTurnIn: 2 + Math.random() * 8,
        // Survival stats
        hunger:     Math.random() * 0.4,   // start partially hungry
        // State machine
        state:       'wander',             // wander | gather | eat | rest | socialize
        stateTimer:  0,
        targetX:     0,
        targetZ:     0,
        socialTarget: -1,                  // id of NPC to socialize with
      })
    }
  }

  tick(dtSec) {
    for (const npc of this.npcs) {
      this._update(npc, dtSec)
    }
  }

  _update(npc, dt) {
    npc.hunger = Math.min(1, npc.hunger + HUNGER_RATE)
    npc.stateTimer -= dt

    switch (npc.state) {
      case 'wander':
        this._wander(npc, dt)
        // Prioritise food when hungry enough
        if (npc.hunger > 0.65 && Math.random() < 0.03) {
          this._enterGather(npc)
        // Occasional rest
        } else if (Math.random() < 0.004) {
          npc.state = 'rest'
          npc.stateTimer = 3 + Math.random() * 6
        // Socialise with a nearby NPC
        } else if (Math.random() < 0.003) {
          const partner = this._nearest(npc, 25)
          if (partner) {
            npc.state = 'socialize'
            npc.socialTarget = partner.id
            npc.stateTimer = 4 + Math.random() * 6
          }
        }
        break

      case 'gather':
        this._moveToward(npc, npc.targetX, npc.targetZ, GATHER_SPEED, dt)
        {
          const dx = npc.x - npc.targetX
          const dz = npc.z - npc.targetZ
          if (dx * dx + dz * dz < 4) {
            // Arrived — eat
            npc.state = 'eat'
            npc.stateTimer = 3 + Math.random() * 4
          } else if (npc.stateTimer <= 0) {
            // Couldn't reach food — try a new spot
            this._enterGather(npc)
          }
        }
        break

      case 'eat':
        // Stationary
        if (npc.stateTimer <= 0) {
          npc.hunger = Math.max(0, npc.hunger - 0.75)
          npc.state = 'wander'
        }
        break

      case 'rest':
        // Stationary
        if (npc.stateTimer <= 0) {
          npc.state = 'wander'
        }
        break

      case 'socialize':
        {
          const partner = this.npcs[npc.socialTarget]
          if (partner && npc.stateTimer > 0) {
            this._moveToward(npc, partner.x, partner.z, WANDER_SPEED * 0.6, dt)
          } else {
            npc.state = 'wander'
            npc.socialTarget = -1
          }
        }
        break
    }
  }

  _wander(npc, dt) {
    npc.nextTurnIn -= dt
    if (npc.nextTurnIn <= 0) {
      npc.heading += (Math.random() - 0.5) * Math.PI
      npc.nextTurnIn = 2 + Math.random() * 8
    }
    npc.x += Math.sin(npc.heading) * WANDER_SPEED * dt
    npc.z += Math.cos(npc.heading) * WANDER_SPEED * dt
    // Soft boundary
    const dist = Math.sqrt(npc.x * npc.x + npc.z * npc.z)
    if (dist > WANDER_RADIUS) {
      npc.heading = Math.atan2(-npc.x, -npc.z) + (Math.random() - 0.5) * 0.5
    }
  }

  _moveToward(npc, tx, tz, speed, dt) {
    const dx = tx - npc.x
    const dz = tz - npc.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > 0.1) {
      npc.heading = Math.atan2(dx, dz)
      npc.x += (dx / dist) * speed * dt
      npc.z += (dz / dist) * speed * dt
    }
  }

  _enterGather(npc) {
    npc.state = 'gather'
    npc.stateTimer = 25  // give up after 25s
    // Target a random nearby spot (simulates foraging area)
    const angle = Math.random() * Math.PI * 2
    const dist  = 20 + Math.random() * 60
    npc.targetX = npc.x + Math.cos(angle) * dist
    npc.targetZ = npc.z + Math.sin(angle) * dist
    // Keep within world boundary
    npc.targetX = Math.max(-WANDER_RADIUS, Math.min(WANDER_RADIUS, npc.targetX))
    npc.targetZ = Math.max(-WANDER_RADIUS, Math.min(WANDER_RADIUS, npc.targetZ))
  }

  _nearest(npc, maxRange) {
    const r2 = maxRange * maxRange
    for (const other of this.npcs) {
      if (other.id === npc.id || other.state === 'socialize') continue
      const dx = other.x - npc.x
      const dz = other.z - npc.z
      if (dx * dx + dz * dz < r2) return other
    }
    return null
  }

  getAll() {
    return this.npcs.map(n => ({
      id:     n.id,
      x:      n.x,
      y:      n.y,
      z:      n.z,
      state:  n.state,
      hunger: n.hunger,
    }))
  }
}
