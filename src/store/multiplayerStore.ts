import { create } from 'zustand'

export interface RemotePlayer {
  userId: string
  username: string
  x: number
  y: number
  z: number
  health: number
  warmth?: number       // M29: warmth% for inspect panel
  murderCount?: number  // M5: criminal record — skull icon shown when > 0
  lastMovedAt?: number  // M29: timestamp of last position change (ms) for AFK detection
  equippedWeapon?: string // M29: visible weapon name for inspect panel
  // M37 Track C: Title / progression fields
  title?: string        // equipped title name (e.g. "Warrior")
  titleColor?: string   // title hex color
  totalLevel?: number   // sum of all skill levels (0–70)
  gold?: number         // player's current gold
  prestigeCount?: number // prestige count
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

  // M29 Track C: per-player ping in ms (estimated from update interval)
  playerPings: Map<string, number>
  setPlayerPing: (userId: string, pingMs: number) => void

  remoteNpcs: RemoteNpc[]
  setRemoteNpcs: (npcs: RemoteNpc[]) => void

  // Latest server-authoritative time (used to sync SimClock)
  serverSimTime: number
  serverTimeScale: number
  serverPaused: boolean
  serverWorldSeed: number
  serverWorldReady: boolean
  setServerWorld: (simTime: number, timeScale: number, paused: boolean, worldSeed?: number) => void

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
      const existing = s.remotePlayers.get(player.userId)
      // Track last-moved time for AFK detection
      const moved = !existing || existing.x !== player.x || existing.y !== player.y || existing.z !== player.z
      next.set(player.userId, { ...player, lastMovedAt: moved ? Date.now() : (existing?.lastMovedAt ?? Date.now()) })
      return { remotePlayers: next }
    }),
  removeRemotePlayer: (userId) =>
    set((s) => {
      const next = new Map(s.remotePlayers)
      next.delete(userId)
      return { remotePlayers: next }
    }),

  playerPings: new Map(),
  setPlayerPing: (userId, pingMs) =>
    set((s) => {
      const next = new Map(s.playerPings)
      next.set(userId, pingMs)
      return { playerPings: next }
    }),

  remoteNpcs: [],
  setRemoteNpcs: (npcs) => set({ remoteNpcs: npcs }),

  serverSimTime: 0,
  serverTimeScale: 1,
  serverPaused: false,
  serverWorldSeed: 42,
  serverWorldReady: false,
  setServerWorld: (simTime, timeScale, paused, worldSeed) =>
    set({
      serverSimTime: simTime,
      serverTimeScale: timeScale,
      serverPaused: paused,
      serverWorldReady: true,
      ...(worldSeed !== undefined ? { serverWorldSeed: worldSeed } : {}),
    }),

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
