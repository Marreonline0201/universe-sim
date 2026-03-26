// ── worldEventStore ──────────────────────────────────────────────────────────
// M48 Track C: Persistent world events log — a scrollable feed of notable things
// that have happened (sieges, weather, discoveries, kills, crafts, dungeon clears).

import { create } from 'zustand'

export type WorldEventCategory = 'combat' | 'weather' | 'settlement' | 'exploration' | 'crafting' | 'social'

export interface WorldEvent {
  id: string
  category: WorldEventCategory
  icon: string        // emoji
  title: string
  detail: string
  timestamp: number   // Date.now()
}

interface WorldEventStore {
  events: WorldEvent[]
  addEvent: (ev: Omit<WorldEvent, 'id' | 'timestamp'>) => void
  clearEvents: () => void
}

const MAX_EVENTS = 200

let _eventSeq = 0

export const useWorldEventStore = create<WorldEventStore>((set) => ({
  events: [],

  addEvent: (ev) => {
    const event: WorldEvent = {
      ...ev,
      id: `wev-${Date.now()}-${++_eventSeq}`,
      timestamp: Date.now(),
    }
    set((s) => ({
      events: s.events.length >= MAX_EVENTS
        ? [event, ...s.events.slice(0, MAX_EVENTS - 1)]
        : [event, ...s.events],
    }))
  },

  clearEvents: () => set({ events: [] }),
}))
