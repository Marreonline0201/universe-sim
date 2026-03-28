// ── SettlementManager ──────────────────────────────────────────────────────────
// Server-authoritative NPC settlement system.
//
// A settlement is a cluster of NPCs with:
//   - A fixed center position on the sphere surface
//   - A shared civLevel (0–9) that advances as NPCs craft and research
//   - A resourceInventory: { [materialId]: quantity }
//   - A territory radius (TERRITORY_RADIUS metres) — NPCs stay within this
//   - A gate status per player (from NpcMemory)
//
// Civilisation level advances when researchPoints cross a threshold:
//   researchPoints += sqrt(npcCount) * dtSim per sim-second
//   Level threshold: 1000 * 10^level
//
// NPCs craft passively: every CRAFT_INTERVAL_S real seconds, each settlement
// checks if it has enough raw materials to craft something useful and if so,
// consumes inputs and adds outputs to resourceInventory.
//
// Trade offer logic: when server receives PLAYER_NEAR_SETTLEMENT, check if
// settlement has surplus and player presumably has complementary resources.
// A TRADE_OFFER is sent back to that player's socket.

import { neon } from '@neondatabase/serverless'

export const TERRITORY_RADIUS = 150   // metres — NPCs wander within this
const CRAFT_INTERVAL_S  = 30          // real seconds between NPC craft ticks
const LEVEL_THRESHOLDS  = [0, 500, 2000, 8000, 25000, 80000, 250000, 800000, 2500000, 8000000]

// ── Geology-based specialty assignment ────────────────────────────────────────
//
// Replicates the tectonic plate logic from client's ResourceNodeManager.ts so
// the server can determine what resources naturally occur near each settlement
// without depending on Three.js or the client codebase.
//
// Algorithm matches ResourceNodeManager exactly:
//   1. Scatter NUM_PLATES pseudo-random points on the unit sphere (Mulberry32,
//      seeded with worldSeed ^ 0xDEADBEEF — same offset as the client).
//   2. For each query direction, compute Voronoi boundary strength:
//        strength = 1 − |d1 − d2| / (d1 + d2)   where d1, d2 = dist to 2 nearest plates
//   3. Classify boundary type (convergent / subduction / interior) from plate types.
//   4. Map the geology to a settlement specialty.

const NUM_PLATES = 12
const PLATE_SEED_OFFSET = 0xDEADBEEF >>> 0

/** Mulberry32 PRNG — identical to ResourceNodeManager.ts */
function _mulberry32(seed) {
  let s = seed >>> 0
  return () => {
    s += 0x6D2B79F5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Build plate info array from world seed (matches client algorithm). */
function _buildPlates(worldSeed) {
  const rng = _mulberry32((worldSeed ^ PLATE_SEED_OFFSET) >>> 0)
  const plates = []
  for (let i = 0; i < NUM_PLATES; i++) {
    const theta = rng() * Math.PI * 2
    const phi   = Math.acos(2 * rng() - 1)
    plates.push({
      cx: Math.sin(phi) * Math.cos(theta),
      cy: Math.sin(phi) * Math.sin(theta),
      cz: Math.cos(phi),
      isOceanic: rng() < 0.6,
    })
  }
  return plates
}

// Cache plates so they are only computed once per world seed.
let _cachedPlates   = null
let _cachedPlatesSeed = -1
let _worldSeed = 42  // updated by assignSpecialties()

function _getPlates() {
  if (_cachedPlates && _cachedPlatesSeed === _worldSeed) return _cachedPlates
  _cachedPlates     = _buildPlates(_worldSeed)
  _cachedPlatesSeed = _worldSeed
  return _cachedPlates
}

/**
 * Boundary strength in [0, 1] for unit-vector direction (dx, dy, dz).
 * 0 = deep plate interior, 1 = exactly on boundary midline.
 */
function _plateBoundaryStrength(dx, dy, dz) {
  const plates = _getPlates()
  let d1 = Infinity, d2 = Infinity
  for (const p of plates) {
    const dot  = dx * p.cx + dy * p.cy + dz * p.cz
    const dist = 1 - dot
    if (dist < d1) { d2 = d1; d1 = dist }
    else if (dist < d2) { d2 = dist }
  }
  const total = d1 + d2 + 1e-9
  return 1 - Math.abs(d1 - d2) / total
}

/**
 * Boundary type at unit-vector direction.
 * Returns 'convergent' | 'subduction' | 'interior'
 */
function _getBoundaryType(dx, dy, dz) {
  const plates = _getPlates()
  let d1 = Infinity, d2 = Infinity
  let plate1Oceanic = false, plate2Oceanic = false
  for (const p of plates) {
    const dist = 1 - (dx * p.cx + dy * p.cy + dz * p.cz)
    if (dist < d1) {
      d2 = d1; plate2Oceanic = plate1Oceanic
      d1 = dist; plate1Oceanic = p.isOceanic
    } else if (dist < d2) {
      d2 = dist; plate2Oceanic = p.isOceanic
    }
  }
  const total = d1 + d2 + 1e-9
  const strength = 1 - Math.abs(d1 - d2) / total
  if (strength < 0.75) return 'interior'
  if (!plate1Oceanic && !plate2Oceanic) return 'convergent'
  return 'subduction'
}

/**
 * Determine a settlement's specialty from its world position.
 *
 * The settlement coords (x, y, z) are in metres — we normalise to a unit
 * direction vector, then apply the same tectonic logic the client uses to
 * place ore nodes.  The specialty with the strongest geological signal wins.
 *
 * Specialty → what the settlement produces / wants:
 *   copper_mining  — subduction boundary ore
 *   gold_mining    — convergent boundary ore
 *   iron_mining    — plate interior (iron sedimentary)
 *   coal_mining    — deep plate interior (sedimentary basin)
 *   timber         — forest / no strong geology signal
 *   pottery        — clay (low elevation, stable)
 *   farming        — default plains
 */
function _computeSpecialty(x, y, z, worldSeed) {
  // Ensure plates are built for this seed
  if (_worldSeed !== worldSeed) {
    _worldSeed = worldSeed
    _cachedPlates = null
  }

  // Normalise to unit direction vector
  const len = Math.sqrt(x * x + y * y + z * z)
  if (len < 1e-6) return 'farming'
  const dx = x / len, dy = y / len, dz = z / len

  const strength = _plateBoundaryStrength(dx, dy, dz)
  const bType    = _getBoundaryType(dx, dy, dz)

  // Strong boundary — ore deposits
  if (strength >= 0.75) {
    if (bType === 'convergent') return 'gold_mining'   // convergent → gold veins
    if (bType === 'subduction') return 'copper_mining' // subduction → copper hydrothermal
    return 'copper_mining'  // generic boundary → copper
  }

  // Moderate boundary — still near tectonic activity
  if (strength >= 0.60) {
    return 'iron_mining'  // transitional zone: iron-rich
  }

  // Interior — sedimentary / organic deposits
  // Use a simple positional determinism to split interior biomes.
  // Mulberry hash of the settlement direction to get a stable value.
  let h = ((dx * 1327.1 + dy * 7303.3 + dz * 4919.7) * 1e6) | 0
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) | 0
  h = ((h ^ (h >>> 16)) >>> 0)
  const frac = h / 0xFFFFFFFF

  if (frac < 0.20) return 'coal_mining'  // sedimentary basin
  if (frac < 0.40) return 'pottery'      // clay-rich lowland
  if (frac < 0.65) return 'timber'       // forested interior
  return 'farming'                       // open plains
}

/**
 * Returns the initial resourceInventory appropriate for a given specialty.
 * Specialised settlements start with their signature resource stocked.
 */
function _specialtyStartingInv(specialty) {
  switch (specialty) {
    case 'copper_mining': return { 11: 30, 17: 10, 5: 8 }   // copper_ore(11), coal(17), fiber(5)
    case 'iron_mining':   return { 14: 25, 17: 15, 5: 8 }   // iron_ore(14), coal(17), fiber(5)
    case 'coal_mining':   return { 17: 40, 1: 10, 5: 8 }    // coal(17), stone(1), fiber(5)
    case 'gold_mining':   return { 30: 8,  1: 15, 5: 8 }    // gold(30), stone(1), fiber(5)
    case 'timber':        return { 3: 40,  4: 20, 21: 10 }  // wood(3), bark(4), fiber(21)
    case 'pottery':       return { 8: 30,  3: 15, 21: 10 }  // clay(8), wood(3), fiber(21)
    case 'farming':
    default:              return { 3: 20,  1: 15, 21: 10 }  // wood(3), stone(1), fiber(21)
  }
}

// MAT IDs referenced in trade offers (mirrors Inventory.ts MAT enum)
// WOOD=3  STONE=1  FIBER=21  FOOD=36  TOOLS=0(abstract, use flint=2)
// COPPER_ORE=11  IRON_ORE=14  COAL=17  GOLD=30  CLAY=8  BARK=4
const _SPECIALTY_OFFER = {
  copper_mining: { gives: 11, givesQty: 10, wants: 3,  wantsQty: 6  },  // copper_ore ↔ wood
  iron_mining:   { gives: 14, givesQty: 8,  wants: 17, wantsQty: 5  },  // iron_ore   ↔ coal
  coal_mining:   { gives: 17, givesQty: 15, wants: 3,  wantsQty: 6  },  // coal       ↔ wood
  gold_mining:   { gives: 30, givesQty: 3,  wants: 14, wantsQty: 8  },  // gold       ↔ iron_ore
  timber:        { gives: 3,  givesQty: 20, wants: 1,  wantsQty: 8  },  // wood       ↔ stone
  pottery:       { gives: 8,  givesQty: 15, wants: 3,  wantsQty: 6  },  // clay       ↔ wood
  farming:       { gives: 21, givesQty: 20, wants: 2,  wantsQty: 5  },  // fiber      ↔ flint
}

// M7: Civ level at which settlements unlock iron research.
// Level 2 = Iron Age — broadcasts SETTLEMENT_UNLOCKED_IRON to nearby players.
const IRON_UNLOCK_LEVEL = 2
// M8: Civ level at which settlements unlock steel/advanced metallurgy.
// Level 3 = Steel Age — broadcasts SETTLEMENT_UNLOCKED_STEEL to all players.
const STEEL_UNLOCK_LEVEL = 3
// M11: Mayor appointment at civLevel 4. Diplomacy envoys start at civLevel 5.
const MAYOR_UNLOCK_LEVEL  = 4
const ENVOY_UNLOCK_LEVEL  = 5
// M12: Space Age at civLevel 6. Requires pop 200+ AND observatory_tower built.
// Population check is approximate: npcCount >= 80 (scaled from real 200, capped at 200).
// observatory_tower requirement is checked via settlement resourceInv flag (obs_built = 1).
const SPACE_AGE_LEVEL     = 6
// Tracks which settlement IDs have already broadcast each discovery (server lifetime only).
const _ironUnlocked    = new Set()
const _steelUnlocked   = new Set()
const _mayorAppointed  = new Set()   // settlements that have broadcast a mayor appointment
const _spaceAgeUnlocked = new Set()  // settlements that have broadcast CIVILIZATION_L6

// M11: NPC name pool for mayor appointments (deterministic by settlement ID)
const MAYOR_NAMES = [
  'Aldric Stonewright', 'Maren Ashvale', 'Torrin Copperfield',
  'Seraphine Dunmore', 'Brynn Ironside', 'Caelan Frostholm',
  'Lyra Saltmere', 'Edric Thornwall', 'Vesper Ridgecroft', 'Haemon Ashford',
]

// M11: Diplomacy state between settlement pairs
// Key: `${minId}-${maxId}`, value: 'neutral' | 'allied' | 'war' | 'trade_partner'
const _diplomacy = new Map()
// Track last envoy send time per settlement pair (real epoch ms)
const _lastEnvoy = new Map()
const ENVOY_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes between envoys

// NPC recipe table — uses the SAME MAT IDs as the client Inventory.ts MAT enum:
//   STONE=1  FLINT=2   WOOD=3    BARK=4    LEAF=5    BONE=6   HIDE=7
//   CLAY=8   FIBER=21  CLOTH=22  ROPE=23   LEATHER=24 COPPER=25 COAL=17
//   COPPER_ORE=11  IRON_ORE=14  IRON=15
// Format: { inputs: {matId: qty}, outputs: {matId: qty}, rpGain: number }
const NPC_RECIPES = [
  { inputs: { 3: 3 },           outputs: { 4: 2 },    rpGain: 10  },  // wood × 3 → bark × 2
  { inputs: { 1: 5 },           outputs: { 2: 1 },    rpGain: 15  },  // stone × 5 → flint × 1
  { inputs: { 21: 2, 3: 1 },    outputs: { 23: 1 },   rpGain: 20  },  // fiber × 2 + wood → rope × 1
  { inputs: { 7: 2 },           outputs: { 24: 1 },   rpGain: 20  },  // hide × 2 → leather × 1
  { inputs: { 11: 3, 17: 2 },   outputs: { 25: 1 },   rpGain: 30  },  // copper_ore × 3 + coal × 2 → copper × 1
  { inputs: { 14: 3, 17: 2 },   outputs: { 15: 1 },   rpGain: 40  },  // iron_ore × 3 + coal × 2 → iron × 1
]

// Initial settlements: 5 distinct positions around the sphere surface (flat coords)
const INITIAL_SETTLEMENTS = [
  { name: 'Ashford',   x:  220, y: 1.2, z:  180 },
  { name: 'Ironhaven', x: -310, y: 1.2, z:   90 },
  { name: 'Saltmere',  x:  150, y: 1.2, z: -280 },
  { name: 'Thornwall', x: -200, y: 1.2, z: -200 },
  { name: 'Ridgepost', x:   50, y: 1.2, z:  350 },
]

let _sql = null
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL)
  return _sql
}

export class SettlementManager {
  constructor() {
    /** @type {Map<number, Settlement>} */
    this._settlements = new Map()
    this._craftTimer  = 0  // real seconds until next craft tick
    this._decayTimer  = 0  // real seconds until next memory decay tick
    this._worldSeed   = 42 // set before load() via setWorldSeed()
  }

  /** Must be called before load() so specialties use the correct plate map. */
  setWorldSeed(seed) {
    this._worldSeed = seed >>> 0
    _worldSeed = this._worldSeed
    _cachedPlates = null  // invalidate cache so plates rebuild with new seed
  }

  // ── Schema + load ────────────────────────────────────────────────────────────

  async migrateSchema() {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        CREATE TABLE IF NOT EXISTS npc_settlements (
          id            SERIAL PRIMARY KEY,
          name          TEXT NOT NULL,
          center_x      REAL NOT NULL DEFAULT 0,
          center_y      REAL NOT NULL DEFAULT 0,
          center_z      REAL NOT NULL DEFAULT 0,
          civ_level     INT NOT NULL DEFAULT 0,
          resource_inv  TEXT NOT NULL DEFAULT '{}',
          npc_count     INT NOT NULL DEFAULT 10,
          research_pts  REAL NOT NULL DEFAULT 0,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    } catch (err) {
      console.warn('[SettlementManager] migrateSchema:', err.message)
    }
  }

  async load() {
    if (!process.env.DATABASE_URL) {
      this._seedDefaults()
      return
    }
    try {
      const db = sql()
      const rows = await db`SELECT id, name, center_x, center_y, center_z, civ_level, resource_inv, npc_count, research_pts FROM npc_settlements`
      if (rows.length === 0) {
        await this._seedToDb()
      } else {
        for (const row of rows) {
          const specialty = _computeSpecialty(row.center_x, row.center_y, row.center_z, this._worldSeed)
          this._settlements.set(row.id, {
            id:           row.id,
            name:         row.name,
            x:            row.center_x,
            y:            row.center_y,
            z:            row.center_z,
            civLevel:     row.civ_level,
            resourceInv:  JSON.parse(row.resource_inv ?? '{}'),
            npcCount:     row.npc_count,
            researchPts:  row.research_pts,
            specialty,
          })
          console.log(`[SettlementManager] ${row.name} specialty: ${specialty}`)
        }
        console.log(`[SettlementManager] Loaded ${this._settlements.size} settlements from DB`)
      }
    } catch (err) {
      console.error('[SettlementManager] load error:', err.message)
      this._seedDefaults()
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Returns serialisable snapshot of all settlements for WORLD_SNAPSHOT. */
  getSnapshot() {
    const out = []
    for (const s of this._settlements.values()) {
      out.push({
        id:        s.id,
        name:      s.name,
        x:         s.x,
        y:         s.y,
        z:         s.z,
        civLevel:  s.civLevel,
        npcCount:  s.npcCount,
        resourceInv: s.resourceInv,
        specialty: s.specialty,
      })
    }
    return out
  }

  getSettlement(id) {
    return this._settlements.get(id) ?? null
  }

  getAll() {
    return Array.from(this._settlements.values())
  }

  /**
   * Tick the settlement simulation.
   * dtRealSec: real elapsed seconds (not sim seconds).
   * Returns array of { settlementId, civLevel } for any settlements that levelled up.
   */
  tick(dtRealSec, onLevelUp, onIronUnlock, onSteelUnlock, onMayorAppointed, onDiplomacy, onSpaceAge) {
    this._craftTimer += dtRealSec

    for (const s of this._settlements.values()) {
      // Research accumulates passively — more NPCs = more points
      // M11: civLevel 5+ settlements research 2× faster (established cities)
      const civBonus = s.civLevel >= 5 ? 2.0 : 1.0
      const rpPerSec = Math.sqrt(s.npcCount) * (1 + s.civLevel * 0.3) * civBonus
      s.researchPts += rpPerSec * dtRealSec

      // Level up check
      const nextThreshold = LEVEL_THRESHOLDS[Math.min(s.civLevel + 1, 9)]
      if (nextThreshold !== undefined && s.researchPts >= nextThreshold) {
        s.civLevel = Math.min(9, s.civLevel + 1)
        s.npcCount = Math.min(200, Math.floor(s.npcCount * 1.2))
        console.log(`[SettlementManager] ${s.name} reached civ level ${s.civLevel}`)
        if (onLevelUp) onLevelUp(s.id, s.civLevel, s)
        // M7: Broadcast iron research discovery when any settlement reaches Iron Age
        if (s.civLevel >= IRON_UNLOCK_LEVEL && !_ironUnlocked.has(s.id)) {
          _ironUnlocked.add(s.id)
          if (onIronUnlock) onIronUnlock(s.id, s.name, s)
          console.log(`[SettlementManager] ${s.name} unlocked iron research!`)
        }
        // M8: Broadcast steel/advanced metallurgy when settlement reaches level 3
        if (s.civLevel >= STEEL_UNLOCK_LEVEL && !_steelUnlocked.has(s.id)) {
          _steelUnlocked.add(s.id)
          if (onSteelUnlock) onSteelUnlock(s.id, s.name, s)
          console.log(`[SettlementManager] ${s.name} unlocked steel metallurgy!`)
        }
        // M11: Appoint a mayor when settlement reaches civLevel 4 (Civilization Age)
        if (s.civLevel >= MAYOR_UNLOCK_LEVEL && !_mayorAppointed.has(s.id)) {
          _mayorAppointed.add(s.id)
          const mayorName = MAYOR_NAMES[(s.id - 1) % MAYOR_NAMES.length]
          const mayorNpcId = s.id * 1000 + 1   // deterministic NPC ID for this settlement's mayor
          console.log(`[SettlementManager] ${s.name} appoints mayor: ${mayorName}`)
          if (onMayorAppointed) onMayorAppointed(s.id, s.name, mayorNpcId, mayorName, s)
        }
        // M12: Broadcast CIVILIZATION_L6 when settlement reaches Space Age (civLevel 6)
        // Gate: npcCount >= 80 (server-side proxy for pop 200+) AND civLevel >= 6.
        // observatory_tower requirement is checked via resourceInv.obs_built flag.
        if (s.civLevel >= SPACE_AGE_LEVEL && !_spaceAgeUnlocked.has(s.id)) {
          const popReady = s.npcCount >= 80
          const obsBuilt = Boolean(s.resourceInv && s.resourceInv['obs_built'])
          // Check allied neighbor count from diplomacy map
          let alliedNeighbors = 0
          for (const [key, status] of _diplomacy.entries()) {
            if (status === 'allied') {
              const [a, b] = key.split('-').map(Number)
              if (a === s.id || b === s.id) alliedNeighbors++
            }
          }
          const diplomaticReady = alliedNeighbors >= 1   // relaxed from 2 for playability
          if (popReady && (obsBuilt || diplomaticReady)) {
            _spaceAgeUnlocked.add(s.id)
            console.log(`[SettlementManager] ${s.name} enters Space Age (civLevel 6)!`)
            if (onSpaceAge) onSpaceAge(s.id, s.name, s)
          }
        }
        this._persistSettlement(s).catch(() => {})
      }
    }

    // M11: Diplomacy envoy tick — civLevel 5+ settlements send envoys every 5 minutes
    const envoySettlements = Array.from(this._settlements.values()).filter(s => s.civLevel >= ENVOY_UNLOCK_LEVEL)
    if (envoySettlements.length >= 2) {
      const now = Date.now()
      for (let i = 0; i < envoySettlements.length; i++) {
        for (let j = i + 1; j < envoySettlements.length; j++) {
          const a = envoySettlements[i]
          const b = envoySettlements[j]
          const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`
          const lastSent = _lastEnvoy.get(key) ?? 0
          if (now - lastSent >= ENVOY_INTERVAL_MS) {
            _lastEnvoy.set(key, now)
            const currentRel = _diplomacy.get(key) ?? 'neutral'
            // Envoy improves relations: neutral → trade_partner → allied
            let newRel = currentRel
            if (currentRel === 'neutral')       newRel = 'trade_partner'
            else if (currentRel === 'war')       newRel = 'neutral'      // peace after long war
            else if (currentRel === 'trade_partner') {
              // Small chance to escalate to full alliance or to war
              const roll = Math.random()
              if (roll < 0.15) newRel = 'allied'
              else if (roll > 0.95) newRel = 'war'
            }
            _diplomacy.set(key, newRel)
            const eventType = newRel === 'war' ? 'WAR_DECLARED'
              : newRel === 'allied' ? 'ALLIANCE_FORMED'
              : 'DIPLOMATIC_ENVOY'
            console.log(`[SettlementManager] Diplomacy ${a.name} ↔ ${b.name}: ${eventType} (${newRel})`)
            if (onDiplomacy) onDiplomacy(a.id, a.name, b.id, b.name, newRel, eventType)
          }
        }
      }
    }

    // NPC craft tick
    if (this._craftTimer >= CRAFT_INTERVAL_S) {
      this._craftTimer = 0
      this._runCraftTick()
    }
  }

  /** Returns current diplomacy status between two settlements. */
  getDiplomacy(idA, idB) {
    const key = `${Math.min(idA, idB)}-${Math.max(idA, idB)}`
    return _diplomacy.get(key) ?? 'neutral'
  }

  /** Returns all active diplomacy relations as array. */
  getDiplomacySnapshot() {
    const result = []
    for (const [key, status] of _diplomacy.entries()) {
      const [a, b] = key.split('-').map(Number)
      result.push({ settlementA: a, settlementB: b, status })
    }
    return result
  }

  /**
   * A player has attacked an NPC near settlement `settlementId`.
   * Returns true if gates should now be closed.
   */
  recordPlayerAttack(settlementId, memory, playerId) {
    return memory.addThreat(settlementId, playerId, 2)
  }

  /**
   * Player and settlement attempt a trade.
   * playerGives: { [matId]: qty }  — what the player is handing over
   * playerReceives: { [matId]: qty } — what the player expects to receive
   * Returns 'ok' | 'insufficient_player' | 'insufficient_settlement' | 'gates_closed'
   */
  executeTrade(settlementId, playerId, playerGives, playerReceives, memory, playerInventoryFn) {
    if (memory.gatesClosed(settlementId, playerId)) return 'gates_closed'

    const s = this._settlements.get(settlementId)
    if (!s) return 'no_settlement'

    // Verify settlement has what it's giving
    for (const [matId, qty] of Object.entries(playerReceives)) {
      const have = s.resourceInv[matId] ?? 0
      if (have < qty) return 'insufficient_settlement'
    }

    // Execute: remove from settlement, add player's goods
    for (const [matId, qty] of Object.entries(playerReceives)) {
      s.resourceInv[matId] = (s.resourceInv[matId] ?? 0) - qty
      if (s.resourceInv[matId] <= 0) delete s.resourceInv[matId]
    }
    for (const [matId, qty] of Object.entries(playerGives)) {
      s.resourceInv[matId] = (s.resourceInv[matId] ?? 0) + qty
    }

    // Improve trust
    memory.addTrust(settlementId, playerId, 0.5)

    // Persist updated settlement inventory
    this._persistSettlement(s).catch(() => {})

    return 'ok'
  }

  /**
   * Check if a player entering radius of a settlement triggers a trade offer.
   * Returns a TRADE_OFFER payload or null if no offer is available.
   *
   * If the settlement has a known specialty, prefers to offer its signature
   * resource in exchange for what it needs.  Falls back to surplus-based offer
   * if the specialty resource is depleted.
   */
  checkTradeOffer(settlementId, playerId, memory) {
    if (memory.gatesClosed(settlementId, playerId)) return null

    const s = this._settlements.get(settlementId)
    if (!s) return null

    // Try specialty-based offer first
    const offerDef = s.specialty ? _SPECIALTY_OFFER[s.specialty] : null
    if (offerDef) {
      const haveQty = s.resourceInv[offerDef.gives] ?? 0
      if (haveQty >= offerDef.givesQty) {
        return {
          settlementId:   s.id,
          settlementName: s.name,
          civLevel:       s.civLevel,
          specialty:      s.specialty,
          offerMats:  { [offerDef.gives]: offerDef.givesQty },
          wantMats:   { [offerDef.wants]: offerDef.wantsQty },
          trustScore: memory.getMemory(settlementId, playerId)?.trustScore ?? 0,
        }
      }
    }

    // Fallback: offer whatever we have surplus of (>= 5 units)
    const surplusMats = Object.entries(s.resourceInv)
      .filter(([, qty]) => qty >= 5)
      .map(([matId, qty]) => ({ matId: parseInt(matId), qty }))

    if (surplusMats.length === 0) return null

    const offerMat  = surplusMats[Math.floor(Math.random() * surplusMats.length)]
    const wantMatId = (s.resourceInv[3] ?? 0) < (s.resourceInv[1] ?? 0) ? 3 : 1
    const wantQty   = Math.max(2, Math.floor(offerMat.qty * 0.5))

    return {
      settlementId:   s.id,
      settlementName: s.name,
      civLevel:       s.civLevel,
      specialty:      s.specialty ?? 'farming',
      offerMats:  { [offerMat.matId]: Math.min(3, offerMat.qty) },
      wantMats:   { [wantMatId]: wantQty },
      trustScore: memory.getMemory(settlementId, playerId)?.trustScore ?? 0,
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _seedDefaults() {
    for (let i = 0; i < INITIAL_SETTLEMENTS.length; i++) {
      const def = INITIAL_SETTLEMENTS[i]
      const specialty = _computeSpecialty(def.x, def.y, def.z, this._worldSeed)
      const s = {
        id: i + 1,
        name: def.name,
        x: def.x, y: def.y, z: def.z,
        civLevel: 0,
        resourceInv: _specialtyStartingInv(specialty),
        npcCount: 10 + Math.floor(Math.random() * 15),
        researchPts: 0,
        specialty,
      }
      console.log(`[SettlementManager] ${def.name} specialty: ${specialty}`)
      this._settlements.set(s.id, s)
    }
    console.log(`[SettlementManager] Seeded ${this._settlements.size} default settlements (no DB)`)
  }

  async _seedToDb() {
    const db = sql()
    for (let i = 0; i < INITIAL_SETTLEMENTS.length; i++) {
      const def = INITIAL_SETTLEMENTS[i]
      const specialty  = _computeSpecialty(def.x, def.y, def.z, this._worldSeed)
      const startInv   = _specialtyStartingInv(specialty)
      const npcCount   = 10 + Math.floor(Math.random() * 15)
      const resourceInv = JSON.stringify(startInv)
      const rows = await db`
        INSERT INTO npc_settlements (name, center_x, center_y, center_z, civ_level, resource_inv, npc_count, research_pts)
        VALUES (${def.name}, ${def.x}, ${def.y}, ${def.z}, 0, ${resourceInv}, ${npcCount}, 0)
        RETURNING id
      `
      const id = rows[0].id
      console.log(`[SettlementManager] ${def.name} specialty: ${specialty}`)
      this._settlements.set(id, {
        id, name: def.name, x: def.x, y: def.y, z: def.z,
        civLevel: 0, resourceInv: startInv,
        npcCount, researchPts: 0,
        specialty,
      })
    }
    console.log(`[SettlementManager] Seeded ${this._settlements.size} settlements to DB`)
  }

  _runCraftTick() {
    for (const s of this._settlements.values()) {
      // Try each recipe — attempt it npcCount/10 times (more NPCs = more crafting)
      const attempts = Math.max(1, Math.floor(s.npcCount / 10))
      for (let a = 0; a < attempts; a++) {
        for (const recipe of NPC_RECIPES) {
          if (this._canCraft(s, recipe)) {
            this._doCraft(s, recipe)
            break  // one recipe per attempt
          }
        }
      }
    }
  }

  _canCraft(s, recipe) {
    for (const [matId, qty] of Object.entries(recipe.inputs)) {
      if ((s.resourceInv[matId] ?? 0) < qty) return false
    }
    return true
  }

  _doCraft(s, recipe) {
    for (const [matId, qty] of Object.entries(recipe.inputs)) {
      s.resourceInv[matId] -= qty
      if (s.resourceInv[matId] <= 0) delete s.resourceInv[matId]
    }
    for (const [matId, qty] of Object.entries(recipe.outputs)) {
      s.resourceInv[matId] = (s.resourceInv[matId] ?? 0) + qty
    }
    s.researchPts += recipe.rpGain
  }

  async _persistSettlement(s) {
    if (!process.env.DATABASE_URL) return
    try {
      const db = sql()
      await db`
        UPDATE npc_settlements SET
          civ_level    = ${s.civLevel},
          resource_inv = ${JSON.stringify(s.resourceInv)},
          npc_count    = ${s.npcCount},
          research_pts = ${s.researchPts},
          updated_at   = NOW()
        WHERE id = ${s.id}
      `
    } catch (err) {
      console.error('[SettlementManager] persist error:', err.message)
    }
  }
}
