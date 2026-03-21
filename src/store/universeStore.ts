// ── universeStore.ts ──────────────────────────────────────────────────────────
// M14 Track C: Tracks all known universe instances received from the server.
// Updated on WORLD_SNAPSHOT and VELAR_GATEWAY_ACTIVATED broadcasts.

import { create } from 'zustand'
import { useEffect } from 'react'

export interface UniverseEntry {
  seed:        number
  name:        string
  origin?:     string
  playerCount: number
  techLevel:   number
}

interface UniverseState {
  universes:    Map<number, UniverseEntry>
  setUniverses: (list: UniverseEntry[]) => void
  upsertUniverse: (entry: UniverseEntry) => void
}

export const useUniverseStore = create<UniverseState>((set) => ({
  universes: new Map([[42, { seed: 42, name: 'Home Universe', playerCount: 0, techLevel: 0 }]]),

  setUniverses: (list) => set(() => {
    const map = new Map<number, UniverseEntry>()
    for (const u of list) map.set(u.seed, u)
    // Always ensure home universe is present
    if (!map.has(42)) map.set(42, { seed: 42, name: 'Home Universe', playerCount: 0, techLevel: 0 })
    return { universes: map }
  }),

  upsertUniverse: (entry) => set((s) => {
    const next = new Map(s.universes)
    next.set(entry.seed, entry)
    return { universes: next }
  }),
}))

/**
 * Hook: subscribes to 'universes-updated' window events dispatched by WorldSocket.
 * Call once at a high level in the component tree (e.g. App.tsx).
 */
export function useUniverseSync() {
  useEffect(() => {
    const handler = (e: Event) => {
      const list = (e as CustomEvent).detail as UniverseEntry[]
      if (Array.isArray(list)) {
        useUniverseStore.getState().setUniverses(list)
      }
    }
    window.addEventListener('universes-updated', handler)
    return () => window.removeEventListener('universes-updated', handler)
  }, [])
}
