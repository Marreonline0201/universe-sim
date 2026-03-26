// ── BuildingSystem.ts ─────────────────────────────────────────────────────────
// M36 Track C: Settlement Building Upgrades
// Defines donatable building types, costs, and service benefits.
// Players donate materials via NPC dialogue; buildings improve settlement services.

import { MAT } from '../player/Inventory'

// ── Building types ─────────────────────────────────────────────────────────────

export type BuildingType =
  | 'barracks'    // Requires: 30 Wood + 20 Stone. Unlocks: combat training
  | 'library'     // Requires: 20 Wood + 10 Paper (cloth as parchment). Unlocks: craft XP, skill books
  | 'market'      // Requires: 25 Wood + 15 Iron. Unlocks: expanded merchant, lower prices
  | 'watchtower'  // Requires: 20 Wood + 10 Stone. Bonus: +50% raid detection range
  | 'healer_hut'  // Requires: 15 Wood + 5 Rope + 5 Herbal (mushroom). Unlocks: HP restoration
  | 'forge'       // Requires: 20 Stone + 15 Iron + 5 Coal. Unlocks: weapon upgrade service

export const ALL_BUILDING_TYPES: BuildingType[] = [
  'barracks', 'library', 'market', 'watchtower', 'healer_hut', 'forge',
]

// ── Donation requirement entry ─────────────────────────────────────────────────

export interface DonationRequirement {
  matId: number
  qty: number
  label: string
}

// ── Building definition ────────────────────────────────────────────────────────

export interface BuildingDef {
  name: string
  icon: string
  description: string
  donationRequirements: DonationRequirement[]
  benefit: string
  tierRequired: number  // minimum settlement civLevel to build
}

// ── Building state ─────────────────────────────────────────────────────────────

export interface SettlementBuilding {
  type: BuildingType
  settlementId: number
  /** Per-material donation progress: key = matId, value = donated qty so far */
  donated: Record<number, number>
  completed: boolean
  completedAt: number  // epoch ms, 0 if not yet complete
}

// ── Building definitions ───────────────────────────────────────────────────────

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  barracks: {
    name: 'Barracks',
    icon: '⚔',
    description: 'A training hall for guards. Enables combat experience purchases.',
    donationRequirements: [
      { matId: MAT.WOOD,  qty: 30, label: 'Wood'  },
      { matId: MAT.STONE, qty: 20, label: 'Stone' },
    ],
    benefit: 'Guard Captain offers: 50 gold → +100 Combat XP',
    tierRequired: 1,
  },
  library: {
    name: 'Library',
    icon: '📚',
    description: 'A repository of knowledge. Scholars teach advanced crafting.',
    donationRequirements: [
      { matId: MAT.WOOD,  qty: 20, label: 'Wood'  },
      { matId: MAT.CLOTH, qty: 10, label: 'Cloth (Parchment)' },
    ],
    benefit: 'Scholar offers: 40 gold → +80 Crafting XP',
    tierRequired: 1,
  },
  market: {
    name: 'Market',
    icon: '🏪',
    description: 'An open pavilion for trade. Merchants expand their wares and lower prices.',
    donationRequirements: [
      { matId: MAT.WOOD, qty: 25, label: 'Wood' },
      { matId: MAT.IRON, qty: 15, label: 'Iron' },
    ],
    benefit: 'Merchant gains −20% prices and +5 more items',
    tierRequired: 0,
  },
  watchtower: {
    name: 'Watchtower',
    icon: '🗼',
    description: 'A tall stone tower. Warns the settlement of raids much earlier.',
    donationRequirements: [
      { matId: MAT.WOOD,  qty: 20, label: 'Wood'  },
      { matId: MAT.STONE, qty: 10, label: 'Stone' },
    ],
    benefit: '+50% raid detection range for this settlement',
    tierRequired: 0,
  },
  healer_hut: {
    name: "Healer's Hut",
    icon: '💉',
    description: 'A small clinic where a healer restores health for a modest fee.',
    donationRequirements: [
      { matId: MAT.WOOD,     qty: 15, label: 'Wood'     },
      { matId: MAT.ROPE,     qty: 5,  label: 'Rope'     },
      { matId: MAT.MUSHROOM, qty: 5,  label: 'Mushrooms (Herbal)' },
    ],
    benefit: 'Healer offers: 5 gold → Restore full HP',
    tierRequired: 0,
  },
  forge: {
    name: 'Forge',
    icon: '🔥',
    description: 'A smithing forge. The blacksmith can upgrade weapons to the next tier.',
    donationRequirements: [
      { matId: MAT.STONE, qty: 20, label: 'Stone' },
      { matId: MAT.IRON,  qty: 15, label: 'Iron'  },
      { matId: MAT.COAL,  qty: 5,  label: 'Coal'  },
    ],
    benefit: 'Blacksmith offers: 10 Iron + 20 gold → +1 weapon tier',
    tierRequired: 2,
  },
}

// ── Helper: compute overall % progress for a building ─────────────────────────

export function getBuildingProgressPct(building: SettlementBuilding): number {
  const def = BUILDING_DEFS[building.type]
  let totalRequired = 0
  let totalDonated  = 0
  for (const req of def.donationRequirements) {
    totalRequired += req.qty
    totalDonated  += Math.min(building.donated[req.matId] ?? 0, req.qty)
  }
  if (totalRequired === 0) return 100
  return Math.floor((totalDonated / totalRequired) * 100)
}

/** Returns how many of a specific material still need to be donated. */
export function remainingForMat(building: SettlementBuilding, matId: number): number {
  const def = BUILDING_DEFS[building.type]
  const req = def.donationRequirements.find(r => r.matId === matId)
  if (!req) return 0
  const already = building.donated[matId] ?? 0
  return Math.max(0, req.qty - already)
}

/** Check if every requirement is fully met. */
export function isBuildingComplete(building: SettlementBuilding): boolean {
  const def = BUILDING_DEFS[building.type]
  for (const req of def.donationRequirements) {
    if ((building.donated[req.matId] ?? 0) < req.qty) return false
  }
  return true
}

/** Key used in the buildings Map: "settlementId_buildingType" */
export function buildingKey(settlementId: number, type: BuildingType): string {
  return `${settlementId}_${type}`
}
