/**
 * ChemistryGameplay.ts
 * M18 Track C — Bridges the Arrhenius ReactionEngine to player-visible gameplay.
 *
 * Monitors the local simulation grid for chemistry events and produces
 * gameplay effects:
 *   1. Fermentation: glucose -> ethanol + CO2. Rewards alcohol items.
 *   2. Acid rain: SO2/NO2 + H2O -> sulfuric/nitric acid. Corrodes player health.
 *   3. Photosynthesis: CO2 + H2O + light -> glucose + O2. Increases local O2.
 *   4. Combustion exhaust: exothermic reactions near player raise local temperature.
 *
 * Called once per game tick from GameLoop (~60Hz, but chemistry events are
 * sampled at 2Hz via internal accumulator to avoid per-frame overhead).
 *
 * Scientific basis: Fidelity tier B — reactions use real Arrhenius parameters
 * but gameplay effects are approximate (e.g., "acid rain damage" is simplified).
 */

import type { LocalSimManager } from '../engine/LocalSimManager'
import type { Inventory } from '../player/Inventory'
import { MAT } from '../player/Inventory'
import { useGameStore } from '../store/gameStore'

// ── Chemistry event types ────────────────────────────────────────────────────
export interface ChemistryEvent {
  type: 'fermentation' | 'acid_rain' | 'photosynthesis' | 'combustion_heat'
  intensity: number  // 0-1 normalized
  x: number
  y: number
  z: number
}

// ── Module state ─────────────────────────────────────────────────────────────
let _accumulator = 0
const SAMPLE_INTERVAL = 0.5  // seconds — sample chemistry effects at 2Hz
const _recentEvents: ChemistryEvent[] = []
const MAX_EVENTS = 8

// Molecule IDs from ReactionEngine (must match MOL constants)
const MOL_C2H5OH = 111   // ethanol
const MOL_GLUCOSE = 140
const MOL_CO2 = 30
const MOL_H2SO4 = 50
const MOL_HNO3 = 51
const MOL_O2 = 2
const MOL_SO2 = 36
const MOL_NO2 = 33

// Grid cell chemistry slot constants (matches LocalSimManager)
const CHEM_OFFSET = 7
const QUANT_OFFSET = 15

/** Get the most recent chemistry events for HUD display. */
export function getRecentChemistryEvents(): readonly ChemistryEvent[] {
  return _recentEvents
}

/** Clear accumulated events (call on respawn or scene transition). */
export function clearChemistryEvents(): void {
  _recentEvents.length = 0
  _accumulator = 0
}

/**
 * Main tick — called from GameLoop each frame.
 * Accumulates dt and samples chemistry effects at SAMPLE_INTERVAL.
 *
 * @param dt        Frame delta (seconds)
 * @param simMgr    Local simulation grid manager (may be null early in init)
 * @param px py pz  Player world position
 * @param inventory Player inventory for granting items
 * @param health    Current player health (0-1)
 * @returns Health delta (negative = damage from acid rain, positive = healing from clean air)
 */
export function tickChemistryGameplay(
  dt: number,
  simMgr: LocalSimManager | null,
  px: number, py: number, pz: number,
  inventory: Inventory,
  health: number,
): number {
  if (!simMgr) return 0

  _accumulator += dt
  if (_accumulator < SAMPLE_INTERVAL) return 0
  _accumulator -= SAMPLE_INTERVAL

  // Clear old events
  _recentEvents.length = 0

  let healthDelta = 0
  const grid = (simMgr as any).engine?.grid
  if (!grid) return 0

  // Sample a small region around the player (3x3x3 = 27 cells)
  // Convert world position to grid coordinates
  const origin = (simMgr as any).gridOrigin
  if (!origin) return 0

  const cellSize = 1.0
  const gx = Math.floor((px - origin.x) / cellSize)
  const gy = Math.floor((py - origin.y) / cellSize)
  const gz = Math.floor((pz - origin.z) / cellSize)

  let totalEthanol = 0
  let totalAcid = 0
  let totalO2 = 0
  let totalCO2 = 0
  let maxTemp = -999

  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = gx + dx
        const cy = gy + dy
        const cz = gz + dz

        // Bounds check
        if (cx < 0 || cy < 0 || cz < 0) continue
        if (cx >= grid.sizeX || cy >= grid.sizeY || cz >= grid.sizeZ) continue

        // Read cell chemistry
        for (let slot = 0; slot < 8; slot++) {
          const chemId = grid.getChemical(cx, cy, cz, slot)
          const quantity = grid.getQuantity(cx, cy, cz, slot)
          if (chemId === 0 || quantity < 1e-6) continue

          if (chemId === MOL_C2H5OH) totalEthanol += quantity
          if (chemId === MOL_H2SO4 || chemId === MOL_HNO3) totalAcid += quantity
          if (chemId === MOL_O2) totalO2 += quantity
          if (chemId === MOL_CO2) totalCO2 += quantity
        }

        const temp = grid.getTemperature(cx, cy, cz)
        if (temp > maxTemp) maxTemp = temp
      }
    }
  }

  // ── 1. Fermentation detection ───────────────────────────────────────────
  // If ethanol concentration exceeds threshold, grant alcohol item
  if (totalEthanol > 0.5) {
    const intensity = Math.min(1, totalEthanol / 5)
    _recentEvents.push({
      type: 'fermentation',
      intensity,
      x: px, y: py, z: pz,
    })
    // Every 10 seconds of fermentation accumulation → one alcohol unit
    // (SAMPLE_INTERVAL is 0.5s, so this fires roughly every 20 ticks)
    if (Math.random() < intensity * 0.05) {
      inventory.addItem({
        itemId: 0,
        materialId: MAT.COOKED_MEAT, // TODO: add MAT.ALCOHOL when available
        quantity: 1,
        quality: 0.8,
      })
    }
  }

  // ── 2. Acid rain detection ──────────────────────────────────────────────
  // Sulfuric/nitric acid near player corrodes health
  if (totalAcid > 0.1) {
    const intensity = Math.min(1, totalAcid / 2)
    _recentEvents.push({
      type: 'acid_rain',
      intensity,
      x: px, y: py, z: pz,
    })
    // Acid damage: up to 2% health per sample interval
    healthDelta -= intensity * 0.02
  }

  // ── 3. Photosynthesis detection ─────────────────────────────────────────
  // High O2 and low CO2 indicates active photosynthesis nearby
  if (totalO2 > 2 && totalCO2 < 1) {
    const intensity = Math.min(1, totalO2 / 10)
    _recentEvents.push({
      type: 'photosynthesis',
      intensity,
      x: px, y: py, z: pz,
    })
    // Fresh air: slight health regen boost (0.5% per sample)
    healthDelta += intensity * 0.005
  }

  // ── 4. Combustion heat detection ────────────────────────────────────────
  // Extreme temperature near player from exothermic reactions
  if (maxTemp > 200) {
    const intensity = Math.min(1, (maxTemp - 200) / 800)
    _recentEvents.push({
      type: 'combustion_heat',
      intensity,
      x: px, y: py, z: pz,
    })
    // Heat damage: up to 3% health per sample interval at 1000°C
    if (maxTemp > 300) {
      healthDelta -= intensity * 0.03
    }
  }

  // Trim events to max
  while (_recentEvents.length > MAX_EVENTS) _recentEvents.shift()

  return healthDelta
}
