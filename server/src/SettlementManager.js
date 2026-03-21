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
          })
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
   */
  checkTradeOffer(settlementId, playerId, memory) {
    if (memory.gatesClosed(settlementId, playerId)) return null

    const s = this._settlements.get(settlementId)
    if (!s) return null

    // Find a material the settlement has surplus of (>= 5 units)
    const surplusMats = Object.entries(s.resourceInv)
      .filter(([, qty]) => qty >= 5)
      .map(([matId, qty]) => ({ matId: parseInt(matId), qty }))

    if (surplusMats.length === 0) return null

    // Offer: settlement gives up to 3 of its surplus mat, wants wood (matId=3) or stone (matId=1)
    const offerMat = surplusMats[Math.floor(Math.random() * surplusMats.length)]
    const wantMatId = (s.resourceInv[3] ?? 0) < (s.resourceInv[1] ?? 0) ? 3 : 1
    const wantQty = Math.max(2, Math.floor(offerMat.qty * 0.5))

    return {
      settlementId: s.id,
      settlementName: s.name,
      civLevel: s.civLevel,
      offerMats:    { [offerMat.matId]: Math.min(3, offerMat.qty) },
      wantMats:     { [wantMatId]: wantQty },
      trustScore:   memory.getMemory(settlementId, playerId)?.trustScore ?? 0,
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _seedDefaults() {
    for (let i = 0; i < INITIAL_SETTLEMENTS.length; i++) {
      const def = INITIAL_SETTLEMENTS[i]
      const s = {
        id: i + 1,
        name: def.name,
        x: def.x, y: def.y, z: def.z,
        civLevel: 0,
        resourceInv: { 3: 20, 1: 15, 21: 10 },  // wood(3), stone(1), fiber(21)
        npcCount: 10 + Math.floor(Math.random() * 15),
        researchPts: 0,
      }
      this._settlements.set(s.id, s)
    }
    console.log(`[SettlementManager] Seeded ${this._settlements.size} default settlements (no DB)`)
  }

  async _seedToDb() {
    const db = sql()
    for (let i = 0; i < INITIAL_SETTLEMENTS.length; i++) {
      const def = INITIAL_SETTLEMENTS[i]
      const npcCount = 10 + Math.floor(Math.random() * 15)
      const resourceInv = JSON.stringify({ 3: 20, 1: 15, 21: 10 })
      const rows = await db`
        INSERT INTO npc_settlements (name, center_x, center_y, center_z, civ_level, resource_inv, npc_count, research_pts)
        VALUES (${def.name}, ${def.x}, ${def.y}, ${def.z}, 0, ${resourceInv}, ${npcCount}, 0)
        RETURNING id
      `
      const id = rows[0].id
      this._settlements.set(id, {
        id, name: def.name, x: def.x, y: def.y, z: def.z,
        civLevel: 0, resourceInv: { 3: 20, 1: 15, 21: 10 },
        npcCount, researchPts: 0,
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
