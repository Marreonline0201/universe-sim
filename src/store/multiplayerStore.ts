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
  state?: string
  hunger?: number
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

  // Bootstrap phase — world is still forming, players cannot yet join
  bootstrapPhase: boolean
  bootstrapProgress: number
  setBootstrapState: (phase: boolean, progress: number) => void

  // Server-authoritative depleted node IDs — merged with local gatheredNodeIds in SceneRoot
  depletedNodes: Set<number>
  setDepletedNodes: (ids: number[]) => void
  addDepletedNode: (id: number) => void
  removeDepletedNode: (id: number) => void
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

  bootstrapPhase: false,
  bootstrapProgress: 0,
  setBootstrapState: (phase, progress) => set({ bootstrapPhase: phase, bootstrapProgress: progress }),

  depletedNodes: new Set<number>(),
  setDepletedNodes: (ids) => set({ depletedNodes: new Set(ids) }),
  addDepletedNode: (id) =>
    set((s) => {
      const next = new Set(s.depletedNodes)
      next.add(id)
      return { depletedNodes: next }
    }),
  removeDepletedNode: (id) =>
    set((s) => {
      const next = new Set(s.depletedNodes)
      next.delete(id)
      return { depletedNodes: next }
    }),
}))
