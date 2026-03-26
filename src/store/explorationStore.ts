// ── explorationStore ─────────────────────────────────────────────────────────
// M43 Track C: World Map Exploration and Fog of War
//   - Persistent fog of war grid: 50-world-unit cells
//   - Exploration radius tracking: markExplored reveals cells within radius
//   - Named points of interest (discoveries) with types

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Map is divided into a grid of cells (each cell = 50 world units)
export const EXPLORATION_CELL_SIZE = 50

// Rough total map size for % calculation (world is large; 10000x10000 area = 200x200 cells = 40000)
const ESTIMATED_TOTAL_CELLS = 40000

export type DiscoveryType = 'cave' | 'settlement' | 'dungeon' | 'resource' | 'ruin'

export interface Discovery {
  id: string
  name: string
  x: number
  z: number
  type: DiscoveryType
}

interface ExplorationState {
  // Set of explored cell keys: `${cellX},${cellZ}`
  exploredCells: Set<string>
  // Named points of interest discovered by the player
  discoveries: Discovery[]

  // Marks all cells within radius (default 100 world units) as explored
  markExplored(worldX: number, worldZ: number, radius?: number): void

  isExplored(worldX: number, worldZ: number): boolean

  addDiscovery(d: { id: string; name: string; x: number; z: number; type: string }): void

  // rough % of map explored (cells / estimated total)
  getExplorationPercent(): number
}

// Serialized form stored in localStorage
interface PersistedExploration {
  exploredCells: string[]
  discoveries: Discovery[]
}

export const useExplorationStore = create<ExplorationState>()(
  persist(
    (set, get) => ({
      exploredCells: new Set<string>(),
      discoveries: [],

      markExplored(worldX: number, worldZ: number, radius = 100): void {
        const cells = get().exploredCells
        const cellRadius = Math.ceil(radius / EXPLORATION_CELL_SIZE)
        const centerCX = Math.floor(worldX / EXPLORATION_CELL_SIZE)
        const centerCZ = Math.floor(worldZ / EXPLORATION_CELL_SIZE)
        const radiusSq = (radius / EXPLORATION_CELL_SIZE) * (radius / EXPLORATION_CELL_SIZE)

        const toAdd: string[] = []
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
          for (let dz = -cellRadius; dz <= cellRadius; dz++) {
            if (dx * dx + dz * dz <= radiusSq) {
              const key = `${centerCX + dx},${centerCZ + dz}`
              if (!cells.has(key)) {
                toAdd.push(key)
              }
            }
          }
        }

        if (toAdd.length > 0) {
          set((s) => {
            const next = new Set(s.exploredCells)
            for (const k of toAdd) next.add(k)
            return { exploredCells: next }
          })
        }
      },

      isExplored(worldX: number, worldZ: number): boolean {
        const cx = Math.floor(worldX / EXPLORATION_CELL_SIZE)
        const cz = Math.floor(worldZ / EXPLORATION_CELL_SIZE)
        return get().exploredCells.has(`${cx},${cz}`)
      },

      addDiscovery(d: { id: string; name: string; x: number; z: number; type: string }): void {
        set((s) => {
          if (s.discoveries.some(existing => existing.id === d.id)) return s
          const typed: Discovery = {
            id: d.id,
            name: d.name,
            x: d.x,
            z: d.z,
            type: d.type as DiscoveryType,
          }
          return { discoveries: [...s.discoveries, typed] }
        })
      },

      getExplorationPercent(): number {
        const count = get().exploredCells.size
        return Math.min(100, Math.round((count / ESTIMATED_TOTAL_CELLS) * 100))
      },
    }),
    {
      name: 'exploration-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        exploredCells: Array.from(state.exploredCells),
        discoveries: state.discoveries,
      } as unknown as ExplorationState),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert the persisted array back to a Set
          const raw = state.exploredCells as unknown as string[]
          if (Array.isArray(raw)) {
            state.exploredCells = new Set(raw)
          } else {
            state.exploredCells = new Set()
          }
        }
      },
    },
  ),
)
