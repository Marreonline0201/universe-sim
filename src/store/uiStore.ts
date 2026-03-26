import { create } from 'zustand'

export type PanelId = 'inventory' | 'crafting' | 'journal' | 'character' | 'map' | 'settings' | 'build' | 'science' | 'dialogue' | 'skills' | 'quests' | 'achievements' | 'fishing' | 'merchant' | 'players' | 'home' | 'factions' | 'buildings' | 'progression' | 'alchemy' | 'tradepost' | 'forge' | 'housing' | 'pet' | 'worldevents' | 'traderoutes' | 'bestiary' | 'titles' | 'forecast' | 'cavefeatures' | 'relationships' | 'factionwars' | 'seasonal' | 'bountboard' | 'discoveries' | 'merchantguild' | 'npcschedule' | 'resources' | 'threats' | 'factionstanding' | 'recipescan' | 'npcroutes' | 'codex' | 'showcase' | 'weatherevents' | 'market' | 'titleprogress' | 'craftmastery' | 'statsdash' | 'worldboss' | 'combos' | 'dungeon' | 'economy' | 'factionrep' | 'trophies' | 'blueprints' | 'npcmemory' | 'chronicle' | 'playerhouse' | 'talentree' | 'npcemotions' | 'questboard' | 'playertitles' | 'eventcalendar' | 'tradenetwork' | 'worldhistory' | 'achievejournal' | 'settlementrel'

// ── M32 Track C: Fast travel ──────────────────────────────────────────────────
export interface FastTravelTarget {
  type: 'settlement' | 'waypoint'
  name: string
  x: number
  z: number
  cost: number          // gold cost (already computed)
  waypointIndex?: number  // only for waypoint type
}

export function computeFastTravelCost(
  playerX: number, playerZ: number,
  targetX: number, targetZ: number,
): number {
  const dist = Math.sqrt((targetX - playerX) ** 2 + (targetZ - playerZ) ** 2)
  if (dist <= 50) return 0
  return Math.max(10, Math.round(dist / 100 * 5))
}

export interface Notification {
  id: number
  message: string
  type: 'info' | 'discovery' | 'warning' | 'error'
  createdAt: number
}

export interface MapWaypoint {
  x: number
  z: number
}

let _notifId = 0

// Minimap zoom levels (world-radius in meters shown on half the canvas)
export const MINIMAP_ZOOM_LEVELS = [100, 200, 400] as const
export type MinimapZoom = typeof MINIMAP_ZOOM_LEVELS[number]

interface UiState {
  activePanel: PanelId | null
  openPanel: (id: PanelId) => void
  closePanel: () => void
  togglePanel: (id: PanelId) => void

  notifications: Notification[]
  addNotification: (message: string, type?: Notification['type']) => void
  dismissNotification: (id: number) => void

  // Minimap waypoints (up to 5)
  waypoints: MapWaypoint[]
  addWaypoint: (wp: MapWaypoint) => void
  removeWaypoint: (index: number) => void

  // Minimap zoom
  minimapZoom: MinimapZoom
  setMinimapZoom: (zoom: MinimapZoom) => void
  cycleMinimapZoomIn: () => void
  cycleMinimapZoomOut: () => void

  // Fog of war — visited cells persist across map open/close
  visitedCells: string[]
  addVisitedCell: (key: string) => void

  // M32 Track C: Discovered settlements (by settlement id as string)
  discoveredSettlements: Set<string>
  discoverSettlement: (id: string) => void
  isSettlementDiscovered: (id: string) => boolean

  // M32 Track C: Fast travel confirmation dialog
  fastTravelTarget: FastTravelTarget | null
  setFastTravelTarget: (t: FastTravelTarget | null) => void

  // M32 Track C: Screen fade overlay (fade-to-black for travel animation)
  travelFading: boolean
  setTravelFading: (v: boolean) => void

  // M44 Track B: Housing panel
  housingOpen: boolean
  toggleHousing: () => void

  // M45 Track A: Pet panel
  petOpen: boolean
  togglePet: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: null,
  openPanel: (id) => set({ activePanel: id }),
  closePanel: () => set({ activePanel: null }),
  togglePanel: (id) =>
    set((s) => ({ activePanel: s.activePanel === id ? null : id })),

  notifications: [],
  addNotification: (message, type = 'info') => {
    const notif: Notification = { id: ++_notifId, message, type, createdAt: Date.now() }
    set((s) => ({ notifications: [...s.notifications, notif] }))
    // Auto-dismiss after 4 s
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter(n => n.id !== notif.id) }))
    }, 4_000)
  },
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) })),

  waypoints: [],
  addWaypoint: (wp) =>
    set((s) => ({
      waypoints: s.waypoints.length >= 5
        ? [...s.waypoints.slice(1), wp]
        : [...s.waypoints, wp],
    })),
  removeWaypoint: (index) =>
    set((s) => ({ waypoints: s.waypoints.filter((_, i) => i !== index) })),

  minimapZoom: 200,
  setMinimapZoom: (zoom) => set({ minimapZoom: zoom }),
  cycleMinimapZoomIn: () =>
    set((s) => {
      const idx = MINIMAP_ZOOM_LEVELS.indexOf(s.minimapZoom)
      const next = MINIMAP_ZOOM_LEVELS[Math.max(0, idx - 1)]
      return { minimapZoom: next }
    }),
  cycleMinimapZoomOut: () =>
    set((s) => {
      const idx = MINIMAP_ZOOM_LEVELS.indexOf(s.minimapZoom)
      const next = MINIMAP_ZOOM_LEVELS[Math.min(MINIMAP_ZOOM_LEVELS.length - 1, idx + 1)]
      return { minimapZoom: next }
    }),

  visitedCells: [],
  addVisitedCell: (key) =>
    set((s) => {
      if (s.visitedCells.includes(key)) return s
      return { visitedCells: [...s.visitedCells, key] }
    }),

  // M32 Track C: Settlement discovery
  discoveredSettlements: new Set<string>(),
  discoverSettlement: (id) =>
    set((s) => {
      if (s.discoveredSettlements.has(id)) return s
      const next = new Set(s.discoveredSettlements)
      next.add(id)
      return { discoveredSettlements: next }
    }),
  isSettlementDiscovered: (id) =>
    useUiStore.getState().discoveredSettlements.has(id),

  // M32 Track C: Fast travel dialog
  fastTravelTarget: null,
  setFastTravelTarget: (t) => set({ fastTravelTarget: t }),

  // M32 Track C: Fade overlay
  travelFading: false,
  setTravelFading: (v) => set({ travelFading: v }),

  // M44 Track B: Housing panel
  housingOpen: false,
  toggleHousing: () =>
    set((s) => ({ activePanel: s.activePanel === 'housing' ? null : 'housing', housingOpen: s.activePanel !== 'housing' })),

  // M45 Track A: Pet panel
  petOpen: false,
  togglePet: () =>
    set((s) => ({ activePanel: s.activePanel === 'pet' ? null : 'pet', petOpen: s.activePanel !== 'pet' })),
}))
