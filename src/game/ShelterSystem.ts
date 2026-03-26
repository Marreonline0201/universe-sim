/**
 * ShelterSystem.ts — M42 Track B
 * Determines if the player is currently sheltered from weather.
 * A player is sheltered if:
 * - They are inside a home base (within 8m of their home placement point)
 * - They are inside a cave entrance (within 5m of any cave entrance point)
 * - They are near a settlement building that provides cover (healer_hut, forge, library, tavern)
 */

export interface ShelterState {
  isSheltered: boolean
  shelterType: 'home' | 'cave' | 'building' | null
  shelterName: string
}

export const shelterState: ShelterState = {
  isSheltered: false,
  shelterType: null,
  shelterName: '',
}

export function updateShelterState(
  px: number, py: number, pz: number,
  homePosition: { x: number; z: number } | null,
  caveEntrances: Array<{ x: number; y: number; z: number }>,
  nearSettlementBuildings: string[]  // list of completed building types near player
): void {
  // Check home
  if (homePosition) {
    const dx = px - homePosition.x, dz = pz - homePosition.z
    if (dx * dx + dz * dz < 64) {
      shelterState.isSheltered = true
      shelterState.shelterType = 'home'
      shelterState.shelterName = 'Home'
      return
    }
  }
  // Check caves (use existing cave entrance data)
  for (const cave of caveEntrances) {
    const dx = px - cave.x, dy = py - cave.y, dz = pz - cave.z
    if (dx * dx + dy * dy + dz * dz < 25) {
      shelterState.isSheltered = true
      shelterState.shelterType = 'cave'
      shelterState.shelterName = 'Cave'
      return
    }
  }
  // Check settlement buildings
  const coverBuildings = ['healer_hut', 'forge', 'library', 'tavern']
  for (const b of nearSettlementBuildings) {
    if (coverBuildings.includes(b)) {
      shelterState.isSheltered = true
      shelterState.shelterType = 'building'
      shelterState.shelterName = b.replace(/_/g, ' ')
      return
    }
  }
  shelterState.isSheltered = false
  shelterState.shelterType = null
  shelterState.shelterName = ''
}
