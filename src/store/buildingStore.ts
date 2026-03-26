// ── buildingStore.ts ──────────────────────────────────────────────────────────
// M36 Track C: Settlement Building Upgrades
// Client-side Zustand store tracking building donation progress and completions.

import { create } from 'zustand'
import {
  type BuildingType,
  type SettlementBuilding,
  ALL_BUILDING_TYPES,
  BUILDING_DEFS,
  buildingKey,
  isBuildingComplete,
} from '../game/BuildingSystem'
import { inventory } from '../game/GameSingletons'
// M42 Track C: Reputation gain on donation
import { useReputationStore } from './reputationStore'

// ── Announcement queue ─────────────────────────────────────────────────────────

export interface BuildingAnnouncement {
  id: string
  settlementName: string
  buildingName: string
  timestamp: number
}

// ── Store interface ────────────────────────────────────────────────────────────

interface BuildingState {
  /** key = `${settlementId}_${buildingType}` */
  buildings: Map<string, SettlementBuilding>

  /** Pending completion announcements shown in HUD */
  announcements: BuildingAnnouncement[]

  /** Donate qty of matId toward a building. Consumes from player inventory.
   *  Returns true if any items were accepted, false if nothing could be donated
   *  (already complete, wrong material, or player doesn't have the items). */
  donateToBuilding: (
    settlementId: number,
    settlementName: string,
    type: BuildingType,
    matId: number,
    qty: number,
  ) => boolean

  getBuildingProgress: (settlementId: number, type: BuildingType) => number
  isBuildingComplete: (settlementId: number, type: BuildingType) => boolean
  getBuilding: (settlementId: number, type: BuildingType) => SettlementBuilding | null

  /** Returns all building types available for a settlement's civLevel. */
  getAvailableBuildings: (civLevel: number) => BuildingType[]

  /** Returns all completed building types for a settlement. */
  getCompletedBuildings: (settlementId: number) => BuildingType[]

  dismissAnnouncement: (id: string) => void
}

// ── Store implementation ───────────────────────────────────────────────────────

export const useBuildingStore = create<BuildingState>((set, get) => ({
  buildings: new Map(),
  announcements: [],

  donateToBuilding: (settlementId, settlementName, type, matId, qty) => {
    const def = BUILDING_DEFS[type]

    // Validate material is part of this building's requirements
    const req = def.donationRequirements.find(r => r.matId === matId)
    if (!req) return false

    // Don't accept donations for completed buildings
    const key = buildingKey(settlementId, type)
    const existing = get().buildings.get(key)
    if (existing?.completed) return false

    // How many are still needed
    const alreadyDonated = existing?.donated[matId] ?? 0
    const stillNeeded = Math.max(0, req.qty - alreadyDonated)
    if (stillNeeded === 0) return false

    // How many can the player actually donate?
    const toConsume = Math.min(qty, stillNeeded)
    if (toConsume <= 0) return false

    // Find matching inventory slot and consume
    const slotIdx = inventory.findItem(matId)
    if (slotIdx === -1) return false
    const slot = inventory.getSlot(slotIdx)
    if (!slot || slot.quantity < toConsume) {
      // Try with what they have
      const available = slot?.quantity ?? 0
      if (available <= 0) return false
      const actualConsume = Math.min(available, stillNeeded)
      inventory.removeItemForce(slotIdx, actualConsume)
      set(state => {
        const next = new Map(state.buildings)
        const b = getOrCreateBuilding(next, settlementId, type)
        b.donated[matId] = (b.donated[matId] ?? 0) + actualConsume
        maybeComplete(b, next, state.announcements, settlementName)
        return { buildings: next, announcements: state.announcements }
      })
      return true
    }

    inventory.removeItemForce(slotIdx, toConsume)

    set(state => {
      const next = new Map(state.buildings)
      const b = getOrCreateBuilding(next, settlementId, type)
      b.donated[matId] = (b.donated[matId] ?? 0) + toConsume

      const newAnnouncements = [...state.announcements]
      if (!b.completed && isBuildingComplete(b)) {
        b.completed = true
        b.completedAt = Date.now()
        newAnnouncements.push({
          id: `${key}_${Date.now()}`,
          settlementName,
          buildingName: def.name,
          timestamp: Date.now(),
        })
      }

      return { buildings: next, announcements: newAnnouncements }
    })

    // M39 Track B: Cooperative building — broadcast donation to party members
    try {
      const { usePartyStore } = require('../store/partyStore') as typeof import('./partyStore')
      const party = usePartyStore.getState().party
      if (party && party.members.length >= 2) {
        recordPartyDonation(key)
        const bAfter = get().buildings.get(key)
        if (bAfter) {
          const totalNeeded = def.donationRequirements.reduce((s, r) => s + r.qty, 0)
          const totalDone = def.donationRequirements.reduce((s, r) => s + Math.min(bAfter.donated[r.matId] ?? 0, r.qty), 0)
          getWorldSocket()?.send({
            type: 'PARTY_DONATION',
            buildingType: type,
            buildingName: def.name,
            matId,
            qty: toConsume,
            current: totalDone,
            needed: totalNeeded,
            settlementId,
            settlementName,
          } as any)
        }
      }
    } catch { /* party system not loaded */ }

    // M42 Track C: Donation → reputation gain
    useReputationStore.getState().addPoints(settlementId, settlementName, 25)

    return true
  },

  getBuildingProgress: (settlementId, type) => {
    const key = buildingKey(settlementId, type)
    const b = get().buildings.get(key)
    if (!b) return 0
    const def = BUILDING_DEFS[type]
    let totalReq = 0, totalDone = 0
    for (const req of def.donationRequirements) {
      totalReq  += req.qty
      totalDone += Math.min(b.donated[req.matId] ?? 0, req.qty)
    }
    if (totalReq === 0) return 100
    return Math.floor((totalDone / totalReq) * 100)
  },

  isBuildingComplete: (settlementId, type) => {
    const key = buildingKey(settlementId, type)
    return get().buildings.get(key)?.completed ?? false
  },

  getBuilding: (settlementId, type) => {
    return get().buildings.get(buildingKey(settlementId, type)) ?? null
  },

  getAvailableBuildings: (civLevel) => {
    return ALL_BUILDING_TYPES.filter(t => BUILDING_DEFS[t].tierRequired <= civLevel)
  },

  getCompletedBuildings: (settlementId) => {
    const result: BuildingType[] = []
    for (const [key, b] of get().buildings) {
      if (b.settlementId === settlementId && b.completed) {
        result.push(b.type)
      }
    }
    return result
  },

  dismissAnnouncement: (id) => {
    set(state => ({
      announcements: state.announcements.filter(a => a.id !== id),
    }))
  },
}))

// ── Internal helpers ───────────────────────────────────────────────────────────

function getOrCreateBuilding(
  map: Map<string, SettlementBuilding>,
  settlementId: number,
  type: BuildingType,
): SettlementBuilding {
  const key = buildingKey(settlementId, type)
  let b = map.get(key)
  if (!b) {
    b = { type, settlementId, donated: {}, completed: false, completedAt: 0 }
    map.set(key, b)
  }
  return b
}

function maybeComplete(
  b: SettlementBuilding,
  _map: Map<string, SettlementBuilding>,
  announcements: BuildingAnnouncement[],
  settlementName: string,
): void {
  if (!b.completed && isBuildingComplete(b)) {
    b.completed = true
    b.completedAt = Date.now()
    const def = BUILDING_DEFS[b.type]
    announcements.push({
      id: `${b.settlementId}_${b.type}_${Date.now()}`,
      settlementName,
      buildingName: def.name,
      timestamp: Date.now(),
    })
  }
}
