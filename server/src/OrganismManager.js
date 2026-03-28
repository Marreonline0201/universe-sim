// ── OrganismManager.js ───────────────────────────────────────────────────────
// Server-authoritative organism simulation running at 6 Hz.
// ES module (server uses "type":"module"). No Three.js / React deps.
//
// Each tick:
//   1. Energy economy (autotrophs gain, heterotrophs lose)
//   2. Natural death (energy <= 0 or old age > 50000 ticks)
//   3. Stochastic selection death (random < 0.002 per tick)
//   4. Reproduction (energy > 0.8 and random < 0.01, pop cap 300)
//   5. Wander (5-20 m per tick on sphere surface)
//
// Broadcasts ORGANISM_UPDATE every tick to all connected clients via index.js.

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed) {
  let s = seed >>> 0
  return function () {
    s |= 0
    s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Sphere-surface movement ──────────────────────────────────────────────────

function moveOnSphere(x, y, z, radius, dx, dz) {
  const nx = x + dx
  const nz = z + dz
  const len = Math.sqrt(nx * nx + y * y + nz * nz)
  if (len < 1) return { x, y, z }  // guard against degenerate case
  return {
    x: (nx / len) * radius,
    y: (y  / len) * radius,
    z: (nz / len) * radius,
  }
}

// ── OrganismManager ──────────────────────────────────────────────────────────

class OrganismManager {
  constructor() {
    /** @type {Map<number, {id:number, x:number, y:number, z:number, speciesId:number, energy:number, size:number, age:number, dietType:number, wanderAngle:number}>} */
    this._organisms = new Map()
    this._nextId = 1
    this._nextSpeciesId = 1
    this._births = []   // events accumulated since last flushEvents()
    this._deaths = []   // events accumulated since last flushEvents()
    this._rng = mulberry32(42)  // replaced in seed()
    this.PLANET_RADIUS = 4000
  }

  // ── Seed ─────────────────────────────────────────────────────────────────

  /**
   * Spawn 80 primordial organisms at random positions on the planet surface.
   * Uses a seeded PRNG so positions are deterministic given the same worldSeed.
   *
   * @param {number} worldSeed
   */
  seed(worldSeed) {
    this._rng = mulberry32(worldSeed >>> 0)
    this._nextId = 1
    this._nextSpeciesId = 1
    this._organisms.clear()
    this._births = []
    this._deaths = []

    const COUNT = 80
    const r = this.PLANET_RADIUS

    for (let i = 0; i < COUNT; i++) {
      // Random point on sphere surface via spherical coords
      // lat in [-30°, +30°] (equatorial band — warm, light-rich)
      const lat = (this._rng() - 0.5) * (Math.PI / 3)
      const lon = this._rng() * Math.PI * 2
      const cosLat = Math.cos(lat)
      const x = r * cosLat * Math.cos(lon)
      const y = r * Math.sin(lat)
      const z = r * cosLat * Math.sin(lon)

      const org = {
        id:          this._nextId++,
        x, y, z,
        speciesId:   1,           // all primordials belong to species 1
        energy:      0.5,
        size:        8 + this._rng() * 12,  // 8-20 m
        age:         0,
        dietType:    0,           // autotroph
        wanderAngle: this._rng() * Math.PI * 2,
      }
      this._organisms.set(org.id, org)
    }

    console.log(`[OrganismManager] Seeded ${COUNT} primordial organisms (worldSeed=${worldSeed})`)
  }

  // ── Main tick ─────────────────────────────────────────────────────────────

  /**
   * Run one organism simulation tick (called at 6 Hz by server).
   *
   * @param {number} simTimeSec  Current server simulation time in seconds
   * @returns {{ births: Array, deaths: Array }}
   */
  tick(simTimeSec) {
    const rng = this._rng
    const r   = this.PLANET_RADIUS
    const toRemove = []
    const toAdd    = []

    // Day/night cycle: 1 full day = 600 real-seconds of sim time
    const dayPhase    = (simTimeSec % 600) / 600
    const sunIntensity = Math.max(0, Math.cos(dayPhase * Math.PI * 2))
    const lightLevel  = 30 + sunIntensity * 220  // 30-250

    for (const org of this._organisms.values()) {
      org.age++

      // ── 1. Energy economy ──────────────────────────────────────────────
      switch (org.dietType) {
        case 0:  // autotroph — gains from light
          org.energy = Math.min(1.0, org.energy + 0.005 * (lightLevel / 250))
          break
        case 1:  // heterotroph — burns energy over time
          org.energy = Math.max(0, org.energy - 0.003)
          break
        case 2:  // mixotroph — partial photosynthesis
          org.energy = Math.min(1.0, org.energy + 0.002 * (lightLevel / 250))
          break
        case 3:  // chemoautotroph — moderate gain from chemical energy
          org.energy = Math.min(1.0, org.energy + 0.003)
          break
      }

      // ── 2. Death: energy depleted or old age ──────────────────────────
      if (org.energy <= 0 || org.age > 50000) {
        toRemove.push(org.id)
        continue
      }

      // ── 3. Stochastic selection death ─────────────────────────────────
      if (rng() < 0.002) {
        toRemove.push(org.id)
        continue
      }

      // ── 4. Reproduction ───────────────────────────────────────────────
      if (org.energy > 0.8 && this._organisms.size + toAdd.length < 300 && rng() < 0.01) {
        // Determine species (10% chance of mutation → new species)
        let childSpeciesId = org.speciesId
        if (rng() < 0.1) {
          childSpeciesId = this._nextSpeciesId++
        }

        // Offset child position ±50 m on sphere surface
        const angle   = rng() * Math.PI * 2
        const dist    = rng() * 50
        const child   = {
          id:          this._nextId++,
          x: org.x, y: org.y, z: org.z,
          speciesId:   childSpeciesId,
          energy:      0.5,
          size:        org.size * (0.9 + rng() * 0.2),
          age:         0,
          dietType:    org.dietType,
          wanderAngle: rng() * Math.PI * 2,
        }
        const moved = moveOnSphere(org.x, org.y, org.z, r, Math.cos(angle) * dist, Math.sin(angle) * dist)
        child.x = moved.x
        child.y = moved.y
        child.z = moved.z

        // Parent pays energy cost
        org.energy *= 0.5

        toAdd.push(child)
      }

      // ── 5. Wander ─────────────────────────────────────────────────────
      const speed  = 5 + rng() * 15  // 5-20 m per tick
      // Gradually change wander direction (random walk)
      org.wanderAngle += (rng() - 0.5) * 0.4
      const dx = Math.cos(org.wanderAngle) * speed
      const dz = Math.sin(org.wanderAngle) * speed
      const moved = moveOnSphere(org.x, org.y, org.z, r, dx, dz)
      org.x = moved.x
      org.y = moved.y
      org.z = moved.z
    }

    // ── Apply removals ────────────────────────────────────────────────────
    for (const id of toRemove) {
      this._organisms.delete(id)
      this._deaths.push(id)
    }

    // ── Apply births ──────────────────────────────────────────────────────
    for (const child of toAdd) {
      this._organisms.set(child.id, child)
      this._births.push({
        id:        child.id,
        x:         child.x,
        y:         child.y,
        z:         child.z,
        speciesId: child.speciesId,
        size:      child.size,
      })
    }

    return this.flushEvents()
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  /**
   * Return compact position array: [[id, x, y, z, energy, speciesId], ...]
   */
  getPositions() {
    const out = []
    for (const org of this._organisms.values()) {
      out.push([org.id, org.x, org.y, org.z, org.energy, org.speciesId])
    }
    return out
  }

  /**
   * Drain and return accumulated birth/death events since last call.
   * @returns {{ births: Array, deaths: Array }}
   */
  flushEvents() {
    const births = this._births.splice(0)
    const deaths = this._deaths.splice(0)
    return { births, deaths }
  }

  /** Current organism count */
  count() {
    return this._organisms.size
  }
}

export { OrganismManager }
