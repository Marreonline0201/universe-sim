// ── FishingDepthSystem ─────────────────────────────────────────────────────────
// M45 Track C — Depth-based fishing: shallow / medium / deep tiers, rare fish
// Integrates with existing FishingSystem (FishResult, rollSpecies) without replacing it.

import { MAT } from '../player/Inventory'

// ── Types ──────────────────────────────────────────────────────────────────────

export type FishDepth = 'shallow' | 'medium' | 'deep'

export interface FishEntry {
  name: string
  matId: number
  /** Relative weight for weighted random selection */
  weight: number
  /** Minimum depth required to catch this fish */
  minDepth: FishDepth
  rare: boolean
  /** Base gold value when sold to a merchant */
  goldValue: number
}

// ── Fish table ─────────────────────────────────────────────────────────────────
// Uses only MAT constants that exist in Inventory.ts.
// Depth tiers:
//   shallow — available at all depths
//   medium  — available at medium + deep
//   deep    — available only at deep

export const FISH_TABLE: FishEntry[] = [
  // ── Shallow (common) ───────────────────────────────────────────────────────
  { name: 'Sardine',       matId: MAT.SARDINE,      weight: 40, minDepth: 'shallow', rare: false, goldValue: 2  },
  { name: 'Bass',          matId: MAT.BASS,         weight: 30, minDepth: 'shallow', rare: false, goldValue: 5  },
  { name: 'River Trout',   matId: MAT.RAW_FISH,     weight: 20, minDepth: 'shallow', rare: false, goldValue: 4  },
  { name: 'Minnow',        matId: MAT.FISH,         weight: 25, minDepth: 'shallow', rare: false, goldValue: 1  },

  // ── Medium ─────────────────────────────────────────────────────────────────
  { name: 'Salmon',        matId: MAT.SALMON,       weight: 18, minDepth: 'medium',  rare: false, goldValue: 12 },
  { name: 'Tuna',          matId: MAT.TUNA,         weight: 10, minDepth: 'medium',  rare: false, goldValue: 20 },
  { name: 'Cave Fish',     matId: MAT.CAVE_FISH,    weight: 8,  minDepth: 'medium',  rare: false, goldValue: 15 },
  { name: 'Silver Perch',  matId: MAT.RAW_FISH,     weight: 12, minDepth: 'medium',  rare: false, goldValue: 8  },

  // ── Deep (rare & legendary) ────────────────────────────────────────────────
  { name: 'Golden Fish',       matId: MAT.GOLDEN_FISH, weight: 1,   minDepth: 'deep', rare: true, goldValue: 500 },
  { name: 'Ancient Leviathan', matId: MAT.GOLDEN_FISH, weight: 0.5, minDepth: 'deep', rare: true, goldValue: 250 },
  { name: 'Abyssal Eel',       matId: MAT.DEEP_CORAL,  weight: 2,   minDepth: 'deep', rare: true, goldValue: 120 },
  { name: 'Deep Tuna',         matId: MAT.TUNA,        weight: 6,   minDepth: 'deep', rare: false, goldValue: 40 },
]

// ── Depth state (module-level mutable) ────────────────────────────────────────

export let currentDepth: FishDepth = 'shallow'

export function setFishingDepth(depth: FishDepth): void {
  currentDepth = depth
}

// ── Depth ordering helper ──────────────────────────────────────────────────────

const DEPTH_RANK: Record<FishDepth, number> = { shallow: 0, medium: 1, deep: 2 }

/** Returns the subset of the fish table accessible at the given depth. */
function poolForDepth(depth: FishDepth): FishEntry[] {
  const rank = DEPTH_RANK[depth]
  return FISH_TABLE.filter(f => DEPTH_RANK[f.minDepth] <= rank)
}

// ── rollFish ───────────────────────────────────────────────────────────────────

/**
 * Roll for a fish catch at the given depth.
 *
 * - Returns null ~20% of the time (no catch).
 * - `hasFishingRod` boosts deep fish weight by 30%.
 */
export function rollFish(depth: FishDepth, hasFishingRod: boolean): FishEntry | null {
  // 20% no-catch
  if (Math.random() < 0.2) return null

  let pool = poolForDepth(depth)

  // Rod bonus: deep fish weight +30%
  if (hasFishingRod) {
    pool = pool.map(f =>
      f.minDepth === 'deep'
        ? { ...f, weight: f.weight * 1.3 }
        : f
    )
  }

  const total = pool.reduce((s, f) => s + f.weight, 0)
  let r = Math.random() * total
  for (const f of pool) {
    r -= f.weight
    if (r <= 0) return f
  }
  return pool[pool.length - 1]
}
