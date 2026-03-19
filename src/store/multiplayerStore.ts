import { create } from 'zustand'

export interface RemotePlayer {
  userId: string
  username: string
  x: number
  y: number
  z: number
  health: number
}

export interface RemoteNpc {
  id: number
  x: number
  y: number
  z: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface MultiplayerState {
  connectionStatus: ConnectionStatus
  setConnectionStatus: (s: ConnectionStatus) => void

  remotePlayers: Map<string, RemotePlayer>
  setRemotePlayers: (players: RemotePlayer[]) => void
  upsertRemotePlayer: (player: RemotePlayer) => void
  removeRemotePlayer: (userId: string) => void

  remoteNpcs: RemoteNpc[]
  setRemoteNpcs: (npcs: RemoteNpc[]) => void

  // Latest server-authoritative time (used to sync SimClock)
  serverSimTime: number
  serverTimeScale: number
  serverPaused: boolean
  setServerWorld: (simTime: number, timeScale: number, paused: boolean) => void
}

export const useMultiplayerStore = create<MultiplayerState>((set) => ({
  connectionStatus: 'disconnected',
  setConnectionStatus: (s) => set({ connectionStatus: s }),

  remotePlayers: new Map(),
  setRemotePlayers: (players) => {
    const map = new Map<string, RemotePlayer>()
    for (const p of players) map.set(p.userId, p)
    set({ remotePlayers: map })
  },
  upsertRemotePlayer: (player) =>
    set((s) => {
      const next = new Map(s.remotePlayers)
      next.set(player.userId, player)
      return { remotePlayers: next }
    }),
  removeRemotePlayer: (userId) =>
    set((s) => {
      const next = new Map(s.remotePlayers)
      next.delete(userId)
      return { remotePlayers: next }
    }),

  remoteNpcs: [],
  setRemoteNpcs: (npcs) => set({ remoteNpcs: npcs }),

  serverSimTime: 0,
  serverTimeScale: 1,
  serverPaused: false,
  setServerWorld: (simTime, timeScale, paused) =>
    set({ serverSimTime: simTime, serverTimeScale: timeScale, serverPaused: paused }),
}))
