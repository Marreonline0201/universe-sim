import { create } from 'zustand'

export type PanelId = 'inventory' | 'crafting' | 'journal' | 'character' | 'map' | 'settings' | 'build' | 'science' | 'dialogue' | 'skills' | 'quests' | 'achievements' | 'fishing' | 'merchant'

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
}))
