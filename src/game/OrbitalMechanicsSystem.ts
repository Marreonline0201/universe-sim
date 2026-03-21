// ── OrbitalMechanicsSystem.ts ─────────────────────────────────────────────────
// M13 Track B: Procedural planetary system + probe mechanics.
//
// Physics basis:
//   Kepler's Third Law: T² ∝ a³  (T = orbital period, a = semi-major axis)
//   For our star (1 solar mass): T(years) = a(AU)^1.5
//   Eccentricity e: orbit shape. Perihelion = a(1-e), Aphelion = a(1+e).
//   True anomaly ν: angular position in orbit, integrated each tick from mean anomaly.
//
// Planet system (seeded from 0xdeadbeef — consistent with NightSkyRenderer planet colors):
//   Aethon:  a=0.7 AU, e=0.05, rocky  (orange, 340K surface)
//   Velar:   a=2.1 AU, e=0.08, gas    (blue,   ~90K cloud tops)
//   Sulfis:  a=0.4 AU, e=0.12, volcanic (yellow, 700K surface)
//
// Orbital capsule:
//   Recipe 100: 3x ITEM.ROCKET + 5x CIRCUIT_BOARD + 10x STEEL_INGOT
//   Launched via launch_pad + orbital_capsule in inventory → server picks nearest planet.
//   Server broadcasts PROBE_LANDED {planetName, surfaceTemp, atmosphere, resources}.
//   Results are procedural but stable per planet seed.
//
// Planet data persists in Neon DB (planets table).

import { getWorldSocket } from '../net/useWorldSocket'
import { useUiStore } from '../store/uiStore'
import { inventory } from './GameSingletons'
import { MAT, ITEM } from '../player/Inventory'

// ── Seeded random (same LCG as NightSkyRenderer) ──────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

// ── Planet definitions ─────────────────────────────────────────────────────────

export interface PlanetDef {
  name:         string
  semiMajorAU:  number       // AU
  eccentricity: number
  color:        string       // hex
  type:         'rocky' | 'gas' | 'volcanic'
  seed:         number       // for procedural probe results
}

export const SYSTEM_PLANETS: PlanetDef[] = [
  { name: 'Aethon', semiMajorAU: 0.7, eccentricity: 0.05, color: '#ff9944', type: 'rocky',    seed: 0xae7401 },
  { name: 'Velar',  semiMajorAU: 2.1, eccentricity: 0.08, color: '#88bbff', type: 'gas',      seed: 0xe1a001 },
  { name: 'Sulfis', semiMajorAU: 0.4, eccentricity: 0.12, color: '#ffcc55', type: 'volcanic', seed: 0x501f01 },
]

// ── Probe result generation (deterministic per planet seed) ───────────────────

export interface ProbeResult {
  planetName:  string
  surfaceTemp: number    // Kelvin
  atmosphere:  string
  resources:   string[]
}

const ROCKY_RESOURCES  = ['iron_ore', 'silicate', 'frozen_water', 'copper_ore', 'titanium', 'basalt']
const GAS_RESOURCES    = ['methane', 'ammonia', 'hydrogen_gas', 'helium3', 'ice_crystals']
const VOLCANIC_RESOURCES = ['sulfur', 'iron_ore', 'obsidian', 'volcanic_ash', 'rare_earth']

export function generateProbeResult(planet: PlanetDef): ProbeResult {
  const rand = seededRand(planet.seed)

  let surfaceTemp: number
  let atmosphere: string
  let pool: string[]

  if (planet.type === 'rocky') {
    surfaceTemp = 220 + rand() * 280    // 220–500 K
    const co2 = (40 + rand() * 55).toFixed(0)
    const n2  = (100 - parseFloat(co2) - rand() * 5).toFixed(0)
    atmosphere = `CO2 ${co2}%, N2 ${n2}%`
    pool = ROCKY_RESOURCES
  } else if (planet.type === 'gas') {
    surfaceTemp = 60 + rand() * 120     // 60–180 K cloud tops
    atmosphere = `H2 ${(70 + rand() * 20).toFixed(0)}%, He ${(5 + rand() * 15).toFixed(0)}%, CH4 trace`
    pool = GAS_RESOURCES
  } else {
    surfaceTemp = 500 + rand() * 400    // 500–900 K
    atmosphere = `SO2 ${(60 + rand() * 30).toFixed(0)}%, CO2 ${(rand() * 30).toFixed(0)}%`
    pool = VOLCANIC_RESOURCES
  }

  // Pick 2–4 resources
  const count = 2 + Math.floor(rand() * 3)
  const shuffled = [...pool].sort(() => rand() - 0.5)
  const resources = shuffled.slice(0, count)

  return { planetName: planet.name, surfaceTemp: Math.round(surfaceTemp), atmosphere, resources }
}

// ── Orbital position calculation ───────────────────────────────────────────────

// AU to normalised sky-sphere radius (for rendering orbital ellipses)
// Our sky sphere has radius 400 units. 1 AU = 80 units at this scale.
export const AU_TO_UNITS = 80

/**
 * Compute planet's 2D orbital position in the X-Z plane at a given time.
 * Uses circular orbit approximation (eccentricity very small).
 * t: sim time in seconds. Returns {x, z} in sky-sphere units.
 */
export function getPlanetOrbitPos(planet: PlanetDef, tSec: number): { x: number; z: number } {
  // Kepler: T (years) = a^1.5
  const tYears = planet.semiMajorAU ** 1.5
  const tSecs  = tYears * 365.25 * 86400  // period in real seconds (game time)
  const angle  = (tSec / tSecs) * 2 * Math.PI

  const r = planet.semiMajorAU * AU_TO_UNITS * (1 - planet.eccentricity * Math.cos(angle))
  return {
    x: r * Math.cos(angle),
    z: r * Math.sin(angle),
  }
}

/**
 * Get points along the full orbital ellipse for Three.js Line rendering.
 * Returns array of [x,y,z] points (y=0, orbit in XZ plane).
 */
export function getOrbitEllipsePoints(planet: PlanetDef, segments = 64): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = []
  const a = planet.semiMajorAU * AU_TO_UNITS
  const e = planet.eccentricity
  const b = a * Math.sqrt(1 - e * e)  // semi-minor axis

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI
    pts.push([
      a * Math.cos(theta),
      0,
      b * Math.sin(theta),
    ])
  }
  return pts
}

// ── Orbital capsule launch ─────────────────────────────────────────────────────

/** Returns the nearest planet to launch (sorted by semi-major axis, closest to 1 AU). */
export function getNearestPlanet(): PlanetDef {
  return SYSTEM_PLANETS.reduce((best, p) => {
    const da = Math.abs(p.semiMajorAU - 1.0)
    const db = Math.abs(best.semiMajorAU - 1.0)
    return da < db ? p : best
  })
}

/**
 * Attempt to launch an orbital capsule from a launch_pad.
 * Consumes ITEM.ORBITAL_CAPSULE (itemId 66) from inventory.
 * Broadcasts ORBITAL_CAPSULE_LAUNCHED to server.
 * Server will broadcast PROBE_LANDED after a 5s delay.
 */
export function launchOrbitalCapsule(): boolean {
  // Find ORBITAL_CAPSULE in inventory (itemId 66)
  let capsuleSlot = -1
  for (let i = 0; i < inventory.slotCount; i++) {
    const slot = inventory.getSlot(i)
    if (slot && slot.itemId === 66) { capsuleSlot = i; break }
  }
  if (capsuleSlot < 0) {
    useUiStore.getState().addNotification(
      'No orbital capsule in inventory. Craft one first (3x Rocket + 5x Circuit Board + 10x Steel Ingot).',
      'warning'
    )
    return false
  }

  inventory.removeItem(capsuleSlot, 1)
  const planet = getNearestPlanet()

  try {
    const ws = getWorldSocket()
    if (ws) {
      ws.send({ type: 'ORBITAL_CAPSULE_LAUNCHED', targetPlanet: planet.name })
      console.log('[OrbitalMechanics] Orbital capsule launched → targeting', planet.name)
    }
  } catch {}

  useUiStore.getState().addNotification(
    `Orbital capsule launched toward ${planet.name}! Awaiting probe telemetry...`,
    'discovery'
  )
  return true
}
