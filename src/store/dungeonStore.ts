// ── dungeonStore.ts ───────────────────────────────────────────────────────────
// M40 Track C: Dungeon Progression — Zustand store that mirrors dungeonState singleton
// for React component subscriptions.
// M47 Track C: Floor tracking added.

import { create } from 'zustand'
import { dungeonState } from '../game/DungeonSystem'
import type { TrapState } from '../game/DungeonSystem'
import {
  getCurrentFloor,
  advanceFloor as floorSystemAdvance,
  resetDungeonProgress,
} from '../game/DungeonFloorSystem'

interface DungeonStoreState {
  activeDungeon: string | null
  roomsCleared: number
  totalRooms: number
  miniBossAlive: boolean
  miniBossHp: number
  miniBossMaxHp: number
  miniBossName: string
  activeTraps: TrapState[]
  // M47 Track C: floor progression
  currentFloor: number
  advanceFloor: () => void
  resetFloor: () => void
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
  currentFloor: 1,

  advanceFloor: () => {
    floorSystemAdvance()
    set({ currentFloor: getCurrentFloor() })
  },

  resetFloor: () => {
    resetDungeonProgress()
    set({ currentFloor: 1 })
  },

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
      currentFloor: getCurrentFloor(),
    })
  },
}))
