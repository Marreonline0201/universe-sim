// ── InterplanetaryTransitSystem.ts ────────────────────────────────────────────
// M14 Track A: Physical interplanetary travel — player boards orbital capsule
// and physically transits to a destination planet.
//
// Transit model (Fidelity tier C — Creative):
//   A 20-second cinematic shows the player in transit between planets.
//   Stars stream past. The destination planet grows from a point to a sphere.
//   On arrival the player is spawned on the destination planet surface.
//
// Architecture:
//   - transitStore (Zustand) owns transit state
//   - TransitOverlay.tsx renders the 20s cinematic fullscreen
//   - DestinationPlanet.tsx renders the foreign planet as a separate Three.js scene
//   - SceneRoot wires F key at launch_pad + orbital_capsule to beginTransit()
//   - Server receives INTERPLANETARY_TRANSIT_LAUNCHED, responds with
//     TRANSIT_ARRIVED after validating (client trusts server timing)

import { SYSTEM_PLANETS } from './OrbitalMechanicsSystem'
import type { PlanetDef } from './OrbitalMechanicsSystem'
import { inventory } from './GameSingletons'
import { ITEM } from '../player/Inventory'
import { useUiStore } from '../store/uiStore'
import { getWorldSocket } from '../net/useWorldSocket'
import { useTransitStore } from '../store/transitStore'

export const TRANSIT_DURATION_SEC = 20   // 20 real-seconds transit animation
export const DESTINATION_SEED_OFFSET = 0x14000000  // offset from planet seed for world gen

/** Choose the destination planet for transit — nearest to 1.0 AU that isn't home. */
export function getTransitDestination(): PlanetDef {
  // Prefer Aethon (0.7 AU rocky) as the primary transit destination for M14.
  // It has resources (iron, silicate, frozen water) making it interesting to explore.
  return SYSTEM_PLANETS.find(p => p.name === 'Aethon') ?? SYSTEM_PLANETS[0]
}

/**
 * Attempt to launch an interplanetary transit from a launch_pad.
 * Player must have ORBITAL_CAPSULE (itemId 66) in inventory.
 * Returns true if transit was initiated.
 */
export function beginInterplanetaryTransit(
  padPosition: [number, number, number],
  currentPlanet: string = 'Home',
): boolean {
  // Check for orbital capsule
  let capsuleSlot = -1
  for (let i = 0; i < inventory.slotCount; i++) {
    const slot = inventory.getSlot(i)
    if (slot && slot.itemId === ITEM.ORBITAL_CAPSULE) { capsuleSlot = i; break }
  }

  if (capsuleSlot < 0) {
    useUiStore.getState().addNotification(
      'No Orbital Capsule in inventory. Craft one first (Recipe: 5x Circuit Board + 10x Steel Ingot).',
      'warning'
    )
    return false
  }

  // If already on a destination planet, allow return to home
  const destination = currentPlanet === 'Home'
    ? getTransitDestination()
    : null  // returning home

  // Consume capsule
  inventory.removeItem(capsuleSlot, 1)

  // Begin transit animation on client
  useTransitStore.getState().beginTransit({
    fromPlanet:  currentPlanet,
    toPlanet:    destination?.name ?? 'Home',
    destinationSeed: destination?.seed ?? 0,
    padPosition,
  })

  // Notify server
  try {
    const ws = getWorldSocket()
    if (ws) {
      ws.send({
        type: 'INTERPLANETARY_TRANSIT_LAUNCHED',
        fromPlanet:  currentPlanet,
        toPlanet:    destination?.name ?? 'Home',
        destinationSeed: destination?.seed ?? 0,
      })
    }
  } catch {}

  useUiStore.getState().addNotification(
    destination
      ? `Orbital capsule launched! Transiting to ${destination.name} (${destination.semiMajorAU} AU)...`
      : 'Returning to home planet...',
    'discovery'
  )

  return true
}

/** Called when transit animation completes — spawn player on destination planet. */
export function finalizeTransit(): void {
  const state = useTransitStore.getState()
  useTransitStore.getState().arriveAtDestination()

  // Notify server of arrival
  try {
    const ws = getWorldSocket()
    if (ws) {
      ws.send({
        type: 'TRANSIT_ARRIVED',
        planet: state.toPlanet,
      })
    }
  } catch {}
}
