// ── dungeonStore.ts ───────────────────────────────────────────────────────────
// M40 Track C: Dungeon Progression — Zustand store that mirrors dungeonState singleton
// for React component subscriptions.

import { create } from 'zustand'
import { dungeonState } from '../game/DungeonSystem'
import type { TrapState } from '../game/DungeonSystem'

interface DungeonStoreState {
  activeDungeon: string | null
  roomsCleared: number
  totalRooms: number
  miniBossAlive: boolean
  miniBossHp: number
  miniBossMaxHp: number
  miniBossName: string
  activeTraps: TrapState[]
  sync: () => void
}

export const useDungeonStore = create<DungeonStoreState>((set) => ({
  activeDungeon: null,
  roomsCleared: 0,
  totalRooms: 0,
  miniBossAlive: false,
  miniBossHp: 0,
  miniBossMaxHp: 0,
  miniBossName: '',
  activeTraps: [],

  sync: () => {
    set({
      activeDungeon: dungeonState.activeDungeon,
      roomsCleared: dungeonState.roomsCleared.length,
      totalRooms: dungeonState.totalRooms,
      miniBossAlive: dungeonState.miniBossAlive,
      miniBossHp: dungeonState.miniBossHp,
      miniBossMaxHp: dungeonState.miniBossMaxHp,
      miniBossName: dungeonState.miniBossName,
      activeTraps: [...dungeonState.activeTraps],
    })
  },
}))
