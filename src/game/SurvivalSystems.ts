// ── SurvivalSystems.ts ────────────────────────────────────────────────────────
// Slice 4: Food cooking via sim-grid thermodynamics
// Slice 5: Wound infection + herb treatment
// Slice 6: Sleep / stamina restoration (bedroll + shelter)
// Slice 7: Furnace smelting (copper ore + charcoal → copper metal)
// P2-5:   Building physics — wood structures burn at >300C adjacent fire cells
//
// All logic here is called from SceneRoot's GameLoop useFrame.

import { terrainHeightAt } from '../world/SpherePlanet'
import * as THREE from 'three'
import { MAT, ITEM } from '../player/Inventory'
import type { Inventory } from '../player/Inventory'
import type { LocalSimManager } from '../engine/LocalSimManager'
import type { BuildingSystem } from '../civilization/BuildingSystem'
import { BUILDING_TYPES } from '../civilization/BuildingSystem'
import { usePlayerStore } from '../store/playerStore'
import { useUiStore } from '../store/uiStore'
import { Metabolism, Health } from '../ecs/world'
// M33 Track B: food buff activation on eat
import { consumeFood } from './FoodBuffSystem'

// ── M5: Death System ──────────────────────────────────────────────────────────
//
// Death cause priority (highest → lowest):
//   combat      — killed by creature or player attack (health dropped by external damage)
//   infection   — septic wound (bacteriaCount > SEPSIS_THRESHOLD drove health to 0)
//   hypothermia — ambient temperature below 0°C drained health to 0
//   starvation  — hunger reached 1.0 or thirst reached 1.0 and drained health to 0
//   drowning    — reserved for future water damage system (health 0 while submerged)
//
// The last-damage-source tracker lets us attribute cause correctly.

export type DeathCause = 'starvation' | 'infection' | 'combat' | 'drowning' | 'hypothermia'

// Set by external damage sources (creature bite, player attack) each frame they deal damage.
// Cleared at the start of each death check. Used to determine combat kills.
let _lastDamageSourceWasCombat = false
let _lastDamageWasInfection    = false
// Cold damage flag persists across frames (not reset each tick) so death check
// can see it even though hypothermia ticks happen after the death check in the game loop.
// Cleared only on respawn via resetColdDamageFlag().
let _coldDamageThisLife = false

export function markCombatDamage(): void {
  _lastDamageSourceWasCombat = true
}

export function markInfectionDamage(): void {
  _lastDamageWasInfection = true
}

export function markColdDamage(): void {
  _coldDamageThisLife = true
}

/** Call on respawn to clear the cross-frame cold damage flag. */
export function resetColdDamageFlag(): void {
  _coldDamageThisLife = false
}

/** Determine death cause from current player state. Call just before clearing health. */
export function determinDeathCause(
  ps: { hunger: number; thirst: number; wounds: Array<{ bacteriaCount: number }> }
): DeathCause {
  if (_lastDamageSourceWasCombat) return 'combat'
  if (_lastDamageWasInfection || ps.wounds.some(w => w.bacteriaCount > 80)) return 'infection'
  if (_coldDamageThisLife) return 'hypothermia'
  if (ps.hunger >= 0.99 || ps.thirst >= 0.99) return 'starvation'
  return 'starvation'  // fallback
}

/** Reset per-frame damage-source flags (call at start of GameLoop tick). */
export function resetDamageFlags(): void {
  _lastDamageSourceWasCombat = false
  _lastDamageWasInfection    = false
  // NOTE: _coldDamageThisLife is NOT reset here — it persists until respawn.
}

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

// Cached cooking slot indices for faster iteration (regenerated each frame)
let _cookingSlotsCache: number[] = []

export function tickFoodCooking(
  dt: number,
  inv: Inventory,
  simMgr: LocalSimManager | null,
  px: number, py: number, pz: number,
): void {
  if (!simMgr) return

  // Rebuild cooking slot cache from current inventory state
  _cookingSlotsCache.length = 0
  for (let i = 0; i < inv.slotCount; i++) {
    const slot = inv.getSlot(i)
    if (slot && slot.itemId === 0 && (slot.materialId === MAT.RAW_MEAT || slot.materialId === MAT.FISH)) {
      _cookingSlotsCache.push(i)
    }
  }

  // Sample temperature once per frame (optimization: single sim lookup)
  const nearTemp = simMgr.getTemperatureAt(px, py, pz)
  const isHotEnough = nearTemp >= COOK_TEMP_C
  const addNotification = useUiStore.getState().addNotification

  // Clear progress for slots that are no longer cooking
  for (const [slotIdx] of cookingProgress) {
    const slot = inv.getSlot(slotIdx)
    if (!slot || slot.itemId !== 0 || (slot.materialId !== MAT.RAW_MEAT && slot.materialId !== MAT.FISH)) {
      cookingProgress.delete(slotIdx)
    }
  }

  // Process cooking slots
  for (const i of _cookingSlotsCache) {
    const slot = inv.getSlot(i)!
    if (!isHotEnough) {
      if (cookingProgress.has(i)) cookingProgress.delete(i)
      continue
    }

    const prev = cookingProgress.get(i) ?? 0
    const next = prev + dt
    cookingProgress.set(i, next)

    if (next >= COOK_DURATION_S) {
      // Food is cooked — convert raw food to cooked meat
      cookingProgress.delete(i)
      const qty = slot.quantity
      const isRawMeat = slot.materialId === MAT.RAW_MEAT
      
      // Remove raw food from this slot
      inv.removeItem(i, qty)
      // Add cooked meat (fish also becomes cooked meat for simplicity)
      inv.addItem({ itemId: 0, materialId: MAT.COOKED_MEAT, quantity: qty, quality: 0.9 })
      addNotification(
        `✓ ${qty > 1 ? qty + '× ' : ''}${isRawMeat ? 'Meat' : 'Fish'} cooked! [E] to eat`,
        'discovery'
      )
      // Auto-unlock cooking knowledge
      usePlayerStore.getState().addDiscovery('fire_making')
    } else if (Math.floor(prev) < Math.floor(next)) {
      // Tick notification once per second to reduce spam
      const pct = Math.round((next / COOK_DURATION_S) * 100)
      addNotification(`🔥 Cooking... ${pct}%`, 'info')
    }
  }
}

// Eat cooked meat from inventory → restore hunger bar
export function tryEatFood(inv: Inventory, entityId: number): boolean {
  // ── M30 Track B: Alcohol / Mead drink effects ──────────────────────────
  // Check for drinkable fermented beverages before cooked meat
  const alcoholSlot = inv.findItem(MAT.ALCOHOL)
  if (alcoholSlot >= 0) {
    inv.removeItem(alcoholSlot, 1)
    const psA = usePlayerStore.getState()
    // Alcohol: +8 warmth, +5 hunger restore
    psA.addWarmth(8)
    const newHungerA = Math.max(0, psA.hunger - 0.05)
    psA.updateVitals({ hunger: newHungerA })
    Metabolism.hunger[entityId] = newHungerA
    useUiStore.getState().addNotification('Drank grain spirit — warmth restored', 'info')
    return true
  }

  const meadSlot = inv.findItem(MAT.MEAD)
  if (meadSlot >= 0) {
    inv.removeItem(meadSlot, 1)
    const psM = usePlayerStore.getState()
    // Mead: +12 warmth, +10 hunger restore
    psM.addWarmth(12)
    const newHungerM = Math.max(0, psM.hunger - 0.10)
    psM.updateVitals({ hunger: newHungerM })
    Metabolism.hunger[entityId] = newHungerM
    useUiStore.getState().addNotification('Drank mead — warmth and hunger restored', 'info')
    return true
  }

  // ── M33 Track B: Cooked buff foods ───────────────────────────────────────
  // Check for buff foods before falling through to plain cooked meat.
  // consumeFood is imported lazily to avoid circular dependency concerns.
  const buffFoodOrder = [MAT.HEARTY_STEW, MAT.HERBAL_TEA, MAT.BERRY_JAM, MAT.MUSHROOM_SOUP, MAT.COOKED_FISH]
  for (const fid of buffFoodOrder) {
    const bSlot = inv.findItem(fid)
    if (bSlot >= 0) {
      inv.removeItem(bSlot, 1)
      // Apply hunger restore + buff
      const psB = usePlayerStore.getState()
      const newHungerB = Math.max(0, psB.hunger - HUNGER_RESTORE)
      psB.updateVitals({ hunger: newHungerB })
      Metabolism.hunger[entityId] = newHungerB
      // Activate buff via FoodBuffSystem
      consumeFood(fid)
      const buffNames: Record<number, string> = {
        [MAT.COOKED_FISH]:   'Well Fed (+HP regen 2min)',
        [MAT.MUSHROOM_SOUP]: 'Steady Footing (+speed 90s)',
        [MAT.BERRY_JAM]:     'Sugar Rush (+speed 60s)',
        [MAT.HERBAL_TEA]:    'Warmth Brew (+warmth 2.5min)',
        [MAT.HEARTY_STEW]:   'Full Meal (HP + warmth + speed 4min)',
      }
      useUiStore.getState().addNotification(
        `✓ ${buffNames[fid] ?? 'Ate food — buff active!'}`,
        'discovery'
      )
      return true
    }
  }

  // Find first cooked meat slot
  const slotIdx = inv.findItem(MAT.COOKED_MEAT)
  if (slotIdx < 0) return false

  inv.removeItem(slotIdx, 1)

  // Restore hunger in both React store and ECS array
  const ps = usePlayerStore.getState()
  const newHunger = Math.max(0, ps.hunger - HUNGER_RESTORE)
  ps.updateVitals({ hunger: newHunger })
  Metabolism.hunger[entityId] = newHunger
  const hungerPct = Math.round(newHunger * 100)
  // Activate Strength Fed buff for COOKED_MEAT
  consumeFood(MAT.COOKED_MEAT)
  useUiStore.getState().addNotification(
    hungerPct > 50 ? `✓ Ate cooked meat (Strength Fed)` : hungerPct > 25 ? `✓ Ate! Still hungry...` : `✓ Ate, but very hungry`,
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

export function tickWoundSystem(dt: number, entityId: number): void {
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
    markInfectionDamage()
    // Write directly to ECS — GameLoop overwrites playerStore from ECS every frame
    Health.current[entityId] = Math.max(0, Health.current[entityId] - healthDrain * Health.max[entityId])
  }

  // Remove healed wounds (bacteria < 0.5) — only when needed to avoid spurious re-renders
  if (ps.wounds.some(w => w.bacteriaCount <= 0.5)) {
    ps.clearHealedWounds()
  }
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

export function tickSleepSystem(dt: number, entityId: number): void {
  const ps = usePlayerStore.getState()
  if (!ps.isSleeping) return

  const newFatigue = Math.max(0, ps.fatigue - FATIGUE_RESTORE_RATE * dt)
  ps.updateVitals({ fatigue: newFatigue })
  Metabolism.fatigue[entityId] = newFatigue

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
      'Need a Bedroll (craft from 3 Fiber + 2 Wood) or shelter to sleep.',
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

// ── M7/M8: Blast Furnace Iron & Steel Smelting System ────────────────────────
//
// Iron chemistry:  Fe₂O₃ + 3C → 2Fe + 3CO₂
// Steel chemistry: Fe + C → Fe-C (carburization)
//   Carbon content determines grade:
//     0.2–2.1% C → steel (strong, flexible)
//     >2.1% C    → cast iron (brittle, cheap)
//
// Controlled by charcoal:iron_ingot ratio at ≥1200°C in blast_furnace:
//   Standard iron smelt: 3× iron_ore + 4× charcoal → iron_ingot   (≥1000°C)
//   Steel run (ratio 1:4): 1× iron_ingot + 1× charcoal → hot_steel_ingot   (≥1200°C)
//   Cast iron (ratio 1:2): 1× iron_ingot + 2× charcoal → cast_iron_ingot   (≥1200°C)
//
// hot_steel_ingot must be quenched (player near water cell) within 30s
// or it becomes soft_steel (50% quality penalty). See tickQuenching().
//
// Quality system (tool quality property, 0.0-1.0):
//   smithingXp < 100  → novice:      quality 0.50–0.70
//   smithingXp < 300  → experienced: quality 0.80–0.95
//   smithingXp ≥ 300  → master:      quality 0.95–1.00

const BLAST_TEMP_C          = 1000   // °C — minimum for Fe₂O₃ iron reduction
const STEEL_TEMP_C          = 1200   // °C — minimum for carburization (steel/cast iron)
const BLAST_ORE_REQUIRED    = 3      // iron_ore units per iron smelt run
const BLAST_CHARCOAL_REQ    = 4      // charcoal units for iron smelt
// Steel run: 1 iron_ingot + 1 charcoal → hot_steel_ingot  (1:4 ratio → 0.8% C = steel)
const STEEL_INGOT_REQ       = 1
const STEEL_CHARCOAL_REQ    = 1      // 1:4 effective (1 iron_ingot = ~4 unit-mass)
// Cast iron run: 1 iron_ingot + 2 charcoal → cast_iron_ingot (1:2 ratio → 2.4% C)
const CAST_IRON_CHARCOAL_REQ = 2
const BLAST_SMITCHING_XP    = 25     // XP per iron smelt
const STEEL_SMITCHING_XP    = 40     // XP per steel/cast-iron smelt (harder process)
const QUENCH_WINDOW_S       = 30     // seconds player has to quench hot_steel

// Per-furnace cooldown (prevents multi-trigger per frame)
const _blastInProgress = new Set<number>()

/** Compute ingot quality from smithingXp. Steel reaches max quality at lower XP threshold. */
function ironQualityFromXp(smithingXp: number): number {
  if (smithingXp >= 300) {
    return 0.95 + Math.random() * 0.05
  } else if (smithingXp >= 100) {
    return 0.80 + (Math.random() * 0.15)
  } else {
    return 0.50 + (Math.random() * 0.20)
  }
}

/** Steel reaches master quality at 60% of the iron XP threshold (better material). */
function steelQualityFromXp(smithingXp: number): number {
  if (smithingXp >= 180) {  // master threshold = 300 * 0.6
    return 0.95 + Math.random() * 0.05
  } else if (smithingXp >= 60) {  // experienced = 100 * 0.6
    return 0.85 + (Math.random() * 0.10)
  } else {
    return 0.60 + (Math.random() * 0.20)
  }
}

export function tickBlastFurnaceSmelting(
  inv: Inventory,
  simMgr: LocalSimManager | null,
  buildings: Array<{ id: number; position: [number, number, number]; typeId: string }>,
  px: number, py: number, pz: number
): void {
  if (!simMgr) return

  for (const b of buildings) {
    if (b.typeId !== 'blast_furnace') continue
    if (_blastInProgress.has(b.id)) continue

    // Player must be within 6m of blast furnace
    const dx = px - b.position[0]
    const dy = py - b.position[1]
    const dz = pz - b.position[2]
    if (dx * dx + dy * dy + dz * dz > 36) continue

    // Get all hot cells once — reused for both iron and steel temperature checks
    const hotCellsIron  = simMgr.getHotCells(BLAST_TEMP_C)
    const ironReached   = hotCellsIron.some(cell => {
      const cx = cell.wx - b.position[0]
      const cy = cell.wy - b.position[1]
      const cz = cell.wz - b.position[2]
      return cx * cx + cy * cy + cz * cz < 16
    })
    if (!ironReached) continue

    // Check for steel-grade temperature (1200°C+)
    const hotCellsSteel = simMgr.getHotCells(STEEL_TEMP_C)
    const steelTempReached = hotCellsSteel.some(cell => {
      const cx = cell.wx - b.position[0]
      const cy = cell.wy - b.position[1]
      const cz = cell.wz - b.position[2]
      return cx * cx + cy * cy + cz * cz < 16
    })

    const ps = usePlayerStore.getState()

    // ── Path A: Steel carburization (1200°C+, iron_ingot + charcoal) ─────────
    //
    // Priority: if furnace is at 1200°C and player has iron_ingot, attempt steel first.
    // Ratio hint shown in notification so player understands the chemistry.
    if (steelTempReached) {
      const hasIronIngot  = inv.countMaterial(MAT.IRON_INGOT)  >= STEEL_INGOT_REQ
      const charcoalCount = inv.countMaterial(MAT.CHARCOAL)

      if (hasIronIngot && charcoalCount >= STEEL_CHARCOAL_REQ) {
        // Determine output by charcoal:iron ratio
        // 1 charcoal per iron_ingot → steel (0.8% C, within 0.2–2.1% steel range)
        // 2 charcoal per iron_ingot → cast iron (2.4% C, above 2.1% cast iron threshold)
        const isCastIron = charcoalCount >= CAST_IRON_CHARCOAL_REQ

        // Consume iron ingot
        let ingotRemain = STEEL_INGOT_REQ
        for (let i = 0; i < inv.slotCount && ingotRemain > 0; i++) {
          const s = inv.getSlot(i)
          if (s && s.itemId === 0 && s.materialId === MAT.IRON_INGOT) {
            const take = Math.min(s.quantity, ingotRemain)
            inv.removeItem(i, take)
            ingotRemain -= take
          }
        }
        // Consume charcoal (more for cast iron)
        const charReqThisRun = isCastIron ? CAST_IRON_CHARCOAL_REQ : STEEL_CHARCOAL_REQ
        let charRemain = charReqThisRun
        for (let i = 0; i < inv.slotCount && charRemain > 0; i++) {
          const s = inv.getSlot(i)
          if (s && s.itemId === 0 && s.materialId === MAT.CHARCOAL) {
            const take = Math.min(s.quantity, charRemain)
            inv.removeItem(i, take)
            charRemain -= take
          }
        }

        const quality = steelQualityFromXp(ps.smithingXp)
        ps.addSmithingXp(STEEL_SMITCHING_XP)
        ps.addDiscovery('steel_making')
        inv.discoverRecipe(71)  // steel sword
        inv.discoverRecipe(72)  // steel chestplate
        inv.discoverRecipe(73)  // steel crossbow
        inv.discoverRecipe(74)  // cast iron pot
        inv.discoverRecipe(75)  // cast iron door

        if (isCastIron) {
          // Cast iron — directly produced, no quenching needed (no martensitic phase)
          inv.addItem({ itemId: 0, materialId: MAT.CAST_IRON_INGOT, quantity: 1, quality: quality * 0.75 })
          useUiStore.getState().addNotification(
            'Cast iron produced! Fe + 2C → 2.4% carbon — brittle but cheap. Craft a Cast Iron Pot or Door.',
            'discovery'
          )
        } else {
          // Steel — produce HOT steel first; player must quench within 30s
          inv.addItem({ itemId: 0, materialId: MAT.HOT_STEEL_INGOT, quantity: 1, quality })
          // Start quench countdown
          ps.setQuenchTimer(QUENCH_WINDOW_S)
          useUiStore.getState().addNotification(
            `Hot steel ingot produced! Fe + 0.8% C (carburization). QUENCH in water within ${QUENCH_WINDOW_S}s or lose quality! Run to ocean/river.`,
            'warning'
          )
        }

        _blastInProgress.add(b.id)
        setTimeout(() => _blastInProgress.delete(b.id), 5000)
        continue
      }

      // At 1200°C but missing iron_ingot — give ratio hint
      if (!hasIronIngot && inv.countMaterial(MAT.IRON_ORE) >= BLAST_ORE_REQUIRED) {
        useUiStore.getState().addNotification(
          'Blast furnace at 1200°C — steel temperature! Ratio hint: 1 charcoal:1 iron_ingot = steel (0.8% C) | 2 charcoal:1 iron_ingot = cast iron (2.4% C).',
          'info'
        )
      }
    }

    // ── Path B: Standard iron reduction (1000°C+, iron_ore + charcoal) ───────
    //
    // Only runs if not already handled by steel path above.
    const hasOre      = inv.countMaterial(MAT.IRON_ORE) >= BLAST_ORE_REQUIRED
    const hasCharcoal = inv.countMaterial(MAT.CHARCOAL)  >= BLAST_CHARCOAL_REQ
    if (!hasOre || !hasCharcoal) {
      useUiStore.getState().addNotification(
        'Blast furnace at temperature! Need 3× Iron Ore + 4× Charcoal to smelt iron. Or add Iron Ingot for steel (1200°C required).',
        'info'
      )
      _blastInProgress.add(b.id)
      setTimeout(() => _blastInProgress.delete(b.id), 8000)
      continue
    }

    // Consume iron ore
    let oreRemain = BLAST_ORE_REQUIRED
    for (let i = 0; i < inv.slotCount && oreRemain > 0; i++) {
      const s = inv.getSlot(i)
      if (s && s.itemId === 0 && s.materialId === MAT.IRON_ORE) {
        const take = Math.min(s.quantity, oreRemain)
        inv.removeItem(i, take)
        oreRemain -= take
      }
    }
    // Consume charcoal
    let charRemain2 = BLAST_CHARCOAL_REQ
    for (let i = 0; i < inv.slotCount && charRemain2 > 0; i++) {
      const s = inv.getSlot(i)
      if (s && s.itemId === 0 && s.materialId === MAT.CHARCOAL) {
        const take = Math.min(s.quantity, charRemain2)
        inv.removeItem(i, take)
        charRemain2 -= take
      }
    }

    const quality = ironQualityFromXp(ps.smithingXp)
    const qualityLabel = quality >= 0.95 ? 'master' : quality >= 0.80 ? 'fine' : 'rough'

    inv.addItem({ itemId: 0, materialId: MAT.IRON_INGOT, quantity: 1, quality })

    ps.addSmithingXp(BLAST_SMITCHING_XP)
    ps.addDiscovery('iron_smelting')
    inv.discoverRecipe(68)  // iron knife
    inv.discoverRecipe(69)  // iron axe
    inv.discoverRecipe(70)  // iron pickaxe

    _blastInProgress.add(b.id)
    setTimeout(() => _blastInProgress.delete(b.id), 5000)

    useUiStore.getState().addNotification(
      `Iron smelting complete! Fe₂O₃ + 3C → 2Fe + 3CO₂. Got ${qualityLabel} iron ingot (quality: ${(quality * 100).toFixed(0)}%). Heat to 1200°C with iron_ingot for steel!`,
      'discovery'
    )
  }
}

// ── M8: Quenching System ──────────────────────────────────────────────────────
//
// Real metallurgy: quenching (rapid cooling) locks martensite crystal structure
// in steel, producing hardness. Without quenching, carbon diffuses back out and
// the steel remains soft (ferrite-pearlite microstructure, lower hardness).
//
// Game mechanic:
//   - hot_steel_ingot in inventory → player has QUENCH_WINDOW_S seconds
//   - If player walks within QUENCH_WATER_RADIUS of an ocean/river cell
//     (sim grid water cells at y ≤ WATER_Y_THRESHOLD), auto-quench triggers
//   - Quenched: hot_steel_ingot → steel_ingot (full quality preserved)
//   - Expired:  hot_steel_ingot → soft_steel  (quality * 0.50 penalty)

const QUENCH_WATER_RADIUS   = 3.0   // metres to water cell
const WATER_Y_THRESHOLD     = 1.5   // sim grid y ≤ this = water cell

/** Returns true if the player is standing at or near ocean/water surface.
 *  On a sphere (PLANET_RADIUS=4000), water detection uses terrain height:
 *  terrainHeightAt(dir) ≤ 0 means the tile is ocean/sea. */
function isNearWater(
  px: number, py: number, pz: number,
  _simMgr: LocalSimManager
): boolean {
  const len = Math.sqrt(px * px + py * py + pz * pz)
  if (len < 1) return false  // at origin — shouldn't happen
  const dir = new THREE.Vector3(px / len, py / len, pz / len)
  // terrainHeightAt ≤ 0 → ocean (below sea level in terrain noise)
  return terrainHeightAt(dir) <= 0
}

export function tickQuenching(
  inv: Inventory,
  simMgr: LocalSimManager | null,
  px: number, py: number, pz: number,
  inRiver = false,
): void {
  // God mode: skip all quench mechanics — removeItem is a no-op in god mode,
  // so hot_steel_ingot would never be consumed and the missed-quench notification
  // would fire every frame (B-15).
  if (inv.isGodMode()) return

  const ps = usePlayerStore.getState()

  // Find hot_steel_ingot in inventory
  const hotSlotIdx = inv.findItem(MAT.HOT_STEEL_INGOT)

  if (hotSlotIdx < 0) {
    // No hot steel in inventory — clear any stale timer
    if (ps.quenchSecondsRemaining !== null) {
      ps.setQuenchTimer(null)
    }
    return
  }

  const hotSlot = inv.getSlot(hotSlotIdx)
  if (!hotSlot) return

  // If timer has expired → convert to soft_steel
  // tickQuenchTimer sets quenchSecondsRemaining to null when it reaches 0,
  // so a null value here means the window closed without quenching.
  if (ps.quenchSecondsRemaining === null) {
    const softenedQuality = hotSlot.quality * 0.50
    inv.removeItem(hotSlotIdx, hotSlot.quantity)
    inv.addItem({ itemId: 0, materialId: MAT.SOFT_STEEL, quantity: hotSlot.quantity, quality: softenedQuality })
    ps.setQuenchTimer(null)
    useUiStore.getState().addNotification(
      'Steel missed quench window — became soft steel (50% quality). Quench next batch in water within 30s!',
      'warning'
    )
    return
  }

  // Check if player is near water (ocean or river) → auto-quench
  if (inRiver || (simMgr && isNearWater(px, py, pz, simMgr))) {
    const quality = hotSlot.quality  // preserve full quality
    inv.removeItem(hotSlotIdx, hotSlot.quantity)
    inv.addItem({ itemId: 0, materialId: MAT.STEEL_INGOT, quantity: hotSlot.quantity, quality })
    ps.setQuenchTimer(null)
    // Award additional smithing XP for successful quench
    ps.addSmithingXp(15)
    ps.addDiscovery('steel_making')
    inv.discoverRecipe(71)
    inv.discoverRecipe(72)
    inv.discoverRecipe(73)
    useUiStore.getState().addNotification(
      `Steel quenched! Martensitic hardening complete. Quality: ${(quality * 100).toFixed(0)}%. Now craft Steel Sword or Chestplate!`,
      'discovery'
    )
  }
}

// ── M8: Armor Damage Absorption ──────────────────────────────────────────────
//
// Steel Chestplate (ITEM.STEEL_CHESTPLATE = 53): absorbs 40% of all incoming
// damage when equipped in the armor slot.
// Call from GameLoop before applying damage to the player.
// Returns the effective damage after absorption (pass-through if no armor).
//
// STEEL_CHESTPLATE itemId = 53 (numeric literal used to avoid circular import
// since EquipSystem.ts imports from Inventory.ts which imports from this file's
// scope indirectly — keeping this file's imports minimal).

const STEEL_CHESTPLATE_ITEM_ID    = 53   // ITEM.STEEL_CHESTPLATE
const STEEL_CHESTPLATE_ABSORPTION = 0.40 // 40% damage reduction

export function applyArmorAbsorptionSync(rawDamage: number, inv: Inventory): number {
  const ps = usePlayerStore.getState()
  if (ps.equippedArmorSlot === null) return rawDamage
  const armorSlot = inv.getSlot(ps.equippedArmorSlot)
  if (!armorSlot || armorSlot.itemId !== STEEL_CHESTPLATE_ITEM_ID) return rawDamage
  return rawDamage * (1 - STEEL_CHESTPLATE_ABSORPTION)
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
