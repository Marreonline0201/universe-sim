import { create } from 'zustand'

export type PanelId = 'inventory' | 'crafting' | 'journal' | 'character' | 'map' | 'settings' | 'build' | 'science' | 'dialogue' | 'skills' | 'quests' | 'achievements' | 'fishing'

export interface Notification {
  id: number
  message: string
  type: 'info' | 'discovery' | 'warning' | 'error'
  createdAt: number
}

let _notifId = 0

interface UiState {
  activePanel: PanelId | null
  openPanel: (id: PanelId) => void
  closePanel: () => void
  togglePanel: (id: PanelId) => void

  notifications: Notification[]
  addNotification: (message: string, type?: Notification['type']) => void
  dismissNotification: (id: number) => void
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
}))
