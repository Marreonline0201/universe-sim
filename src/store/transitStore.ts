// ── transitStore.ts ───────────────────────────────────────────────────────────
// M14 Track A: Manages interplanetary transit state.
// Transit phases: idle → launching (20s animation) → arrived (destination planet)
// When arrived: renders DestinationPlanet instead of home planet.

import { create } from 'zustand'

export type TransitPhase = 'idle' | 'launching' | 'arrived'

interface TransitState {
  phase:           TransitPhase
  fromPlanet:      string    // 'Home' or planet name
  toPlanet:        string    // 'Home' or planet name
  destinationSeed: number    // seed for procedural planet generation
  padPosition:     [number, number, number]
  transitProgress: number    // 0–1 during launching phase

  // Actions
  beginTransit: (args: {
    fromPlanet:  string
    toPlanet:    string
    destinationSeed: number
    padPosition: [number, number, number]
  }) => void
  setTransitProgress: (p: number) => void
  arriveAtDestination: () => void
  returnHome: () => void
}

export const useTransitStore = create<TransitState>((set) => ({
  phase:           'idle',
  fromPlanet:      'Home',
  toPlanet:        'Home',
  destinationSeed: 0,
  padPosition:     [0, 0, 0],
  transitProgress: 0,

  beginTransit: ({ fromPlanet, toPlanet, destinationSeed, padPosition }) => set({
    phase: 'launching',
    fromPlanet,
    toPlanet,
    destinationSeed,
    padPosition,
    transitProgress: 0,
  }),

  setTransitProgress: (p) => set({ transitProgress: Math.min(1, Math.max(0, p)) }),

  arriveAtDestination: () => set((s) => ({
    phase: 'arrived',
    transitProgress: 1,
    // If returning home, go back to idle
    ...(s.toPlanet === 'Home' ? { phase: 'idle' as TransitPhase, fromPlanet: 'Home', toPlanet: 'Home', destinationSeed: 0 } : {}),
  })),

  returnHome: () => set({
    phase: 'idle',
    fromPlanet: 'Home',
    toPlanet:   'Home',
    destinationSeed: 0,
    transitProgress: 0,
  }),
}))
