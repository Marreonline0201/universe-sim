/**
 * ShelterSystem — stub (RPG shelter removed, keeping minimal state object
 * so VitalBars.tsx ShelterIndicator compiles without changes).
 */

export interface ShelterStateData {
  isSheltered: boolean
  shelterType: string | null
  shelterName: string
}

export const shelterState: ShelterStateData = {
  isSheltered: false,
  shelterType: null,
  shelterName: '',
}
