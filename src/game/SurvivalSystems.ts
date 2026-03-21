// ── SurvivalSystems.ts ────────────────────────────────────────────────────────
// Slice 4: Food cooking via sim-grid thermodynamics
// Slice 5: Wound infection + herb treatment
// Slice 6: Sleep / stamina restoration (bedroll + shelter)
// Slice 7: Furnace smelting (copper ore + charcoal → copper metal)
// P2-5:   Building physics — wood structures burn at >300C adjacent fire cells
//
// All logic here is called from SceneRoot's GameLoop useFrame.

import { MAT, ITEM } from '../player/Inventory'
import type { Inventory } from '../player/Inventory'
import type { LocalSimManager } from '../engine/LocalSimManager'
import type { BuildingSystem } from '../civilization/BuildingSystem'
import { BUILDING_TYPES } from '../civilization/BuildingSystem'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'

// ── Slice 4: Food Cooking System ─────────────────────────────────────────────
//
// Physics basis: proteins denature above ~70°C (Maillard reaction starts ~140°C).
// We use 80°C as the cooking threshold for gameplay clarity while remaining
// physically grounded (well within the real denaturation range).
//
// Cooking state: tracked per inventory slot by slot index.
// When a raw food slot is within 3m of a sim grid cell exceeding COOK_TEMP_C,
// cookTime accumulates. After COOK_DURATION_S seconds the raw food converts
// to cooked food and hunger restore is unlocked.

const COOK_TEMP_C       = 80    // °C minimum to cook food
const COOK_DURATION_S   = 8     // seconds of sustained heat needed
const HUNGER_RESTORE    = 0.35  // fraction of hunger bar restored per cooked meal

// Map from inventory slot index → accumulated cook time (seconds)
export const cookingProgress = new Map<number, number>()

export function tickFoodCooking(
  dt: number,
  inv: Inventory,
  simMgr: LocalSimManager | null,
  px: number, py: number, pz: number,
): void {
  if (!simMgr) return

  // Find all raw meat slots in inventory
  for (let i = 0; i < inv.slotCount; i++) {
    const slot = inv.getSlot(i)
    if (!slot || slot.itemId !== 0 || slot.materialId !== MAT.RAW_MEAT) {
      // Remove stale cooking progress if slot no longer holds raw meat
      cookingProgress.delete(i)
      continue
    }

    // Sample temperature near player position (player holding food)
    const nearTemp = simMgr.getTemperatureAt(px, py, pz)

    if (nearTemp >= COOK_TEMP_C) {
      const prev = cookingProgress.get(i) ?? 0
      const next = prev + dt
      cookingProgress.set(i, next)

      if (next >= COOK_DURATION_S) {
        // Food is cooked — convert raw meat to cooked meat
        cookingProgress.delete(i)
        const qty = slot.quantity
        // Remove raw meat from this slot
        inv.removeItem(i, qty)
        // Add cooked meat
        inv.addItem({ itemId: 0, materialId: MAT.COOKED_MEAT, quantity: qty, quality: 0.9 })
        useUiStore.getState().addNotification(
          `${qty > 1 ? qty + 'x ' : ''}Meat cooked! Press [F] near cooked meat to eat.`,
          'discovery'
        )
        // Auto-unlock cooking knowledge
        usePlayerStore.getState().addDiscovery('fire_making')
      } else if (Math.floor(prev) < Math.floor(next)) {
        // Tick notification once per second
        const pct = Math.round((next / COOK_DURATION_S) * 100)
        useUiStore.getState().addNotification(`Cooking... ${pct}%`, 'info')
      }
    } else {
      // Not hot enough — reset progress (food cools down)
      if (cookingProgress.has(i)) cookingProgress.delete(i)
    }
  }
}

// Eat cooked meat from inventory → restore hunger bar
export function tryEatFood(inv: Inventory): boolean {
  // Find first cooked meat slot
  const slotIdx = inv.findItem(MAT.COOKED_MEAT)
  if (slotIdx < 0) return false

  inv.removeItem(slotIdx, 1)

  // Restore hunger
  const ps = usePlayerStore.getState()
  const newHunger = Math.max(0, ps.hunger - HUNGER_RESTORE)
  ps.updateVitals({ hunger: newHunger })
  useUiStore.getState().addNotification(
    `Ate cooked meat — hunger reduced to ${Math.round(newHunger * 100)}%`,
    'info'
  )
  return true
}

// ── Slice 5: Wound + Infection System ────────────────────────────────────────
//
// Biology basis: bacterial logistic growth (dN/dt = rN(1-N/K)).
// Herbs (LEAF material) contain tannins/terpenes that reduce bacterial growth rate.
// We model this as a direct bacteria count reduction on application.

// Bacteria reduction when herb applied (simulates antiseptic effect)
const HERB_BACTERIA_REDUCTION = 30
// Sepsis threshold — bacteria at max level drains health
const SEPSIS_THRESHOLD = 80

export function tickWoundSystem(dt: number): void {
  const ps = usePlayerStore.getState()
  if (ps.wounds.length === 0) return

  // Tick bacterial growth on all wounds
  ps.tickWounds(dt)

  // Sepsis: wounds with high bacteria drain health
  let healthDrain = 0
  for (const w of ps.wounds) {
    if (w.bacteriaCount > SEPSIS_THRESHOLD) {
      healthDrain += 0.003 * dt * (w.bacteriaCount / 100)
    }
  }
  if (healthDrain > 0) {
    const newHealth = Math.max(0, ps.health - healthDrain)
    ps.updateVitals({ health: newHealth })
  }

  // Remove healed wounds (bacteria < 0.5)
  ps.clearHealedWounds()
}

// Apply herb to first active wound
export function tryApplyHerb(inv: Inventory): boolean {
  const ps = usePlayerStore.getState()
  if (ps.wounds.length === 0) {
    useUiStore.getState().addNotification('No active wounds to treat.', 'warning')
    return false
  }

  // Check inventory for LEAF (herb)
  const herbSlot = inv.findItem(MAT.LEAF)
  if (herbSlot < 0) {
    useUiStore.getState().addNotification('Need Leaf (herb) in inventory to treat wound.', 'warning')
    return false
  }

  inv.removeItem(herbSlot, 1)

  // Apply to most infected wound first
  const mostInfected = ps.wounds.reduce(
    (worst, w) => w.bacteriaCount > worst.bacteriaCount ? w : worst,
    ps.wounds[0]
  )
  ps.treatWound(mostInfected.id, HERB_BACTERIA_REDUCTION)

  const remaining = Math.max(0, mostInfected.bacteriaCount - HERB_BACTERIA_REDUCTION)
  useUiStore.getState().addNotification(
    `Herb applied — bacteria reduced to ${remaining.toFixed(0)}/100`,
    'discovery'
  )
  return true
}

// Call on player taking damage — creates a wound
export function inflictWound(severity: number): void {
  usePlayerStore.getState().addWound(severity)
  useUiStore.getState().addNotification(
    `Wound received! Apply leaf herb to prevent infection.`,
    'warning'
  )
}

// ── Slice 6: Sleep / Stamina Restoration System ───────────────────────────────
//
// Scientific basis: Sleep restores adenosine clearance and glycogen reserves.
// We model this as fatigue reduction over 30 real seconds (minimum meaningful rest).
// Stamina (1-fatigue) increases at 0.02/s during sleep.

const SLEEP_DURATION_S     = 30     // minimum sleep for full benefit
const FATIGUE_RESTORE_RATE = 0.02   // fatigue reduction per real second of sleep

// Returns true if player is currently in range of a placed bedroll or shelter
export function isNearSleepSite(
  px: number, py: number, pz: number,
  buildings: Array<{ position: [number, number, number]; typeId: string }>
): boolean {
  const SLEEP_RADIUS = 8  // metres
  for (const b of buildings) {
    const shelterTypes = ['lean_to', 'pit_house', 'mud_brick_house', 'stone_house']
    if (!shelterTypes.includes(b.typeId)) continue
    const dx = px - b.position[0]
    const dy = py - b.position[1]
    const dz = pz - b.position[2]
    if (dx * dx + dy * dy + dz * dz < SLEEP_RADIUS * SLEEP_RADIUS) return true
  }
  // Also allow sleep if bedroll item placed (bedrollPlaced flag set in inventory equip)
  return usePlayerStore.getState().bedrollPlaced
}

export function tickSleepSystem(dt: number): void {
  const ps = usePlayerStore.getState()
  if (!ps.isSleeping) return

  const newFatigue = Math.max(0, ps.fatigue - FATIGUE_RESTORE_RATE * dt)
  ps.updateVitals({ fatigue: newFatigue })

  // Check if sleep complete
  const elapsed = ps.sleepStartTime !== null
    ? (Date.now() - ps.sleepStartTime) / 1000
    : 0

  if (elapsed >= SLEEP_DURATION_S && newFatigue <= 0.01) {
    ps.stopSleep()
    useUiStore.getState().addNotification(
      'You wake up rested. Stamina restored.',
      'discovery'
    )
  }
}

export function tryStartSleep(
  inv: Inventory,
  buildings: Array<{ position: [number, number, number]; typeId: string }>,
  px: number, py: number, pz: number
): boolean {
  const ps = usePlayerStore.getState()

  if (ps.isSleeping) {
    // Already sleeping — wake up
    ps.stopSleep()
    useUiStore.getState().addNotification('You wake up early.', 'info')
    return false
  }

  // Require bedroll in inventory OR near a shelter
  const hasBedroll = inv.hasItemById(ITEM.BEDROLL)
  const nearShelter = isNearSleepSite(px, py, pz, buildings)

  if (!hasBedroll && !nearShelter) {
    useUiStore.getState().addNotification(
      'Need a Bedroll (craft from 3 Hide + 4 Fiber) or shelter to sleep.',
      'warning'
    )
    return false
  }

  if (hasBedroll) {
    // Place bedroll (consumed from inventory, placed as persistent site)
    const bedrollSlot = inv.listItems().find(({ slot }) => slot.itemId === ITEM.BEDROLL)
    if (bedrollSlot) {
      inv.removeItem(bedrollSlot.index, 1)
      ps.setBedrollPlaced(true)
    }
  }

  ps.startSleep()
  useUiStore.getState().addNotification(
    'Sleeping... stamina restoring. Press [Z] to wake up early.',
    'info'
  )
  return true
}

// ── Slice 7: Furnace Smelting System ─────────────────────────────────────────
//
// Chemistry basis: Cu₂S + C (heat) → Cu + SO₂
// Copper melting point: 1085°C. We require sim grid cells near the furnace
// building to reach SMELT_TEMP_C before the reaction proceeds.
//
// Player workflow:
//   1. Place 'smelting_furnace' building (40 stone + 20 clay + 5 iron ore)
//   2. Gather copper ore (≥3) + charcoal (≥2) in inventory
//   3. Place copper ore in furnace building (F key when adjacent to furnace)
//   4. Light fire inside furnace (flint strike)
//   5. Sim grid temperature rises → auto-smelts when threshold reached
//   6. Copper metal appears in inventory

// Copper reduction reaction threshold. Cu₂S + C reaction starts at ~500°C.
// We use 500°C — the lower bound of the real chalcopyrite reduction range —
// as it is achievable with the sim fire system while remaining physically correct.
const SMELT_TEMP_C       = 500    // °C — copper ore reduction threshold
const SMELT_ORE_REQUIRED = 3      // copper ore units per smelt run
const SMELT_CHARCOAL_REQ = 2      // charcoal units consumed as fuel
const SMELT_OUTPUT       = 1      // copper metal units produced

// Tracks whether a smelt run is in progress (per furnace building ID)
const _smeltInProgress = new Set<number>()

export function tickFurnaceSmelting(
  inv: Inventory,
  simMgr: LocalSimManager | null,
  buildings: Array<{ id: number; position: [number, number, number]; typeId: string }>,
  px: number, py: number, pz: number
): void {
  if (!simMgr) return

  for (const b of buildings) {
    if (b.typeId !== 'smelting_furnace' && b.typeId !== 'stone_furnace') continue
    if (_smeltInProgress.has(b.id)) continue

    // Check proximity: player must be within 6m of furnace to load/unload
    const dx = px - b.position[0]
    const dy = py - b.position[1]
    const dz = pz - b.position[2]
    if (dx * dx + dy * dy + dz * dz > 36) continue  // 6m radius

    // Check sim grid temperature near furnace — scan hot cells for any cell
    // within 4m of the furnace that exceeds SMELT_TEMP_C.
    // This handles the case where the fire is placed next to the furnace rather
    // than exactly at its center coordinate.
    const hotCells = simMgr.getHotCells(SMELT_TEMP_C)
    const furnaceReached = hotCells.some(cell => {
      const cx = cell.wx - b.position[0]
      const cy = cell.wy - b.position[1]
      const cz = cell.wz - b.position[2]
      return cx * cx + cy * cy + cz * cz < 16  // 4m radius from furnace
    })
    if (!furnaceReached) continue

    // Temperature threshold met — check for ore and charcoal in inventory
    const hasOre     = inv.countMaterial(MAT.COPPER_ORE) >= SMELT_ORE_REQUIRED
    const hasCharcoal = inv.countMaterial(MAT.CHARCOAL) >= SMELT_CHARCOAL_REQ
    if (!hasOre || !hasCharcoal) continue

    // Consume inputs
    let oreRemain = SMELT_ORE_REQUIRED
    for (let i = 0; i < inv.slotCount && oreRemain > 0; i++) {
      const s = inv.getSlot(i)
      if (s && s.itemId === 0 && s.materialId === MAT.COPPER_ORE) {
        const take = Math.min(s.quantity, oreRemain)
        inv.removeItem(i, take)
        oreRemain -= take
      }
    }
    let charcoalRemain = SMELT_CHARCOAL_REQ
    for (let i = 0; i < inv.slotCount && charcoalRemain > 0; i++) {
      const s = inv.getSlot(i)
      if (s && s.itemId === 0 && s.materialId === MAT.CHARCOAL) {
        const take = Math.min(s.quantity, charcoalRemain)
        inv.removeItem(i, take)
        charcoalRemain -= take
      }
    }

    // Produce copper
    inv.addItem({ itemId: 0, materialId: MAT.COPPER, quantity: SMELT_OUTPUT, quality: 0.85 })
    // Also unlock copper knife recipe
    inv.discoverRecipe(66)

    // Mark smelting done for this furnace (prevent multi-trigger per frame)
    _smeltInProgress.add(b.id)
    setTimeout(() => _smeltInProgress.delete(b.id), 5000)  // re-arm after 5s

    useUiStore.getState().addNotification(
      `Smelting complete! Copper ore → Copper metal. Now craft a Copper Knife (open Craft panel).`,
      'discovery'
    )
    usePlayerStore.getState().addDiscovery('smelting')
  }
}

// ── P2-5: Building Physics — Fire Damage ──────────────────────────────────────
//
// Scientific basis: Wood ignites at ~300°C (autoignition temperature in air
// is 250–300°C for dried timber, per fire science literature). We use 300°C
// as the threshold. Buildings constructed primarily from organic materials
// (wood, fiber, bark, hide) are combustible. Stone/clay structures are not.
//
// Damage model: 2 HP/s for each hot cell (>300°C) within 4m of the building.
// A building at full health (100 HP) will burn down in 50 real seconds under
// a single fire cell — fast enough to feel dangerous, slow enough to fight.
//
// Called from GameLoop useFrame every frame. Rate-limited to 10Hz via internal
// timer to reduce computation (checking hot cells every 100ms is sufficient).

const FIRE_DAMAGE_TEMP_C  = 300   // °C — wood autoignition threshold
const FIRE_DAMAGE_RATE    = 2.0   // HP/s per adjacent fire cell
const FIRE_CHECK_RADIUS   = 4.0   // metres — fire cell must be this close to damage building

// Set of building type IDs that are combustible (contain organic materials)
const COMBUSTIBLE_TYPE_IDS = new Set<string>([
  'lean_to', 'pit_house', 'longhouse',
  // Any type whose materialsRequired include wood, fiber, bark, or hide
  // Pre-computed at startup for performance (no per-frame iteration over BUILDING_TYPES)
])

// Build combustibility set from BUILDING_TYPES materials at module load time
const COMBUSTIBLE_MATERIAL_IDS = new Set<number>([MAT.WOOD, MAT.FIBER, MAT.BARK, MAT.HIDE])
for (const bt of BUILDING_TYPES) {
  if (bt.materialsRequired.some(r => COMBUSTIBLE_MATERIAL_IDS.has(r.materialId as number))) {
    COMBUSTIBLE_TYPE_IDS.add(bt.id)
  }
}

let _fireCheckAccum = 0  // accumulator for 10Hz rate limiting

export function tickBuildingPhysics(
  dt: number,
  buildingSystem: BuildingSystem,
  simMgr: LocalSimManager | null,
): void {
  if (!simMgr) return

  _fireCheckAccum += dt
  if (_fireCheckAccum < 0.1) return  // only check 10x per second
  _fireCheckAccum = 0

  const hotCells = simMgr.getHotCells(FIRE_DAMAGE_TEMP_C)
  if (hotCells.length === 0) return

  const buildings = buildingSystem.getAllBuildings()
  const burnedIds: number[] = []

  for (const b of buildings) {
    if (!COMBUSTIBLE_TYPE_IDS.has(b.typeId)) continue

    // Count how many hot cells are within FIRE_CHECK_RADIUS of this building
    let hotCellsNearby = 0
    for (const cell of hotCells) {
      const dx = cell.wx - b.position[0]
      const dy = cell.wy - b.position[1]
      const dz = cell.wz - b.position[2]
      if (dx * dx + dy * dy + dz * dz <= FIRE_CHECK_RADIUS * FIRE_CHECK_RADIUS) {
        hotCellsNearby++
      }
    }

    if (hotCellsNearby > 0) {
      // Apply fire damage — multiply by 0.1 because we're calling at 10Hz not 1Hz
      const damage = FIRE_DAMAGE_RATE * hotCellsNearby * 0.1
      buildingSystem.damage(b.id, damage)

      // Check if building is still alive after damage
      const remaining = buildingSystem.getAllBuildings().find(x => x.id === b.id)
      if (!remaining) {
        burnedIds.push(b.id)
      }
    }
  }

  if (burnedIds.length > 0) {
    useUiStore.getState().addNotification(
      `A structure burned down! Build with stone or clay for fire resistance.`,
      'warning'
    )
  }
}
