export interface BuildingType {
  id: string
  name: string
  tier: number
  materialsRequired: Array<{ materialId: number; quantity: number }>
  size: [number, number, number]  // x, y, z in meters
  provides: string[]              // capabilities: 'shelter', 'forge', 'lab', etc.
  maxOccupants: number
  structuralStrength: number      // kN/m² load rating (real structural engineering values)
  maintenanceRate: number         // HP lost per simulation day without repair
}

export interface PlacedBuilding {
  id: number
  typeId: string
  position: [number, number, number]
  rotation: number          // radians around Y axis
  health: number            // 0-100
  occupants: number[]       // entity IDs currently inside
  storage: Record<number, number>  // materialId → quantity
  constructedAt: number     // sim time
  lastMaintainedAt: number  // sim time
}

export class BuildingSystem {
  private buildings: Map<number, PlacedBuilding> = new Map()
  private nextId = 1

  /**
   * Place a building of the given type.
   * Returns the placed building on success, null if type is unknown.
   */
  place(typeId: string, pos: [number, number, number], rot: number, simTime = 0): PlacedBuilding | null {
    const type = BUILDING_TYPES.find(t => t.id === typeId)
    if (!type) return null

    const building: PlacedBuilding = {
      id: this.nextId++,
      typeId,
      position: [...pos] as [number, number, number],
      rotation: rot,
      health: 100,
      occupants: [],
      storage: {},
      constructedAt: simTime,
      lastMaintainedAt: simTime,
    }
    this.buildings.set(building.id, building)
    return building
  }

  demolish(buildingId: number): void {
    this.buildings.delete(buildingId)
  }

  damage(buildingId: number, amount: number): void {
    const b = this.buildings.get(buildingId)
    if (!b) return
    b.health = Math.max(0, b.health - amount)
    if (b.health <= 0) {
      // Collapse — eject occupants
      b.occupants = []
      this.buildings.delete(buildingId)
    }
  }

  repair(buildingId: number, amount: number): void {
    const b = this.buildings.get(buildingId)
    if (!b) return
    b.health = Math.min(100, b.health + amount)
  }

  /** Find the first building whose footprint overlaps pos within radius meters. */
  getBuildingAt(pos: [number, number, number], radius: number): PlacedBuilding | null {
    for (const b of this.buildings.values()) {
      const dx = b.position[0] - pos[0]
      const dz = b.position[2] - pos[2]
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= radius) return b
    }
    return null
  }

  enterBuilding(buildingId: number, entityId: number): boolean {
    const b = this.buildings.get(buildingId)
    if (!b) return false
    const type = BUILDING_TYPES.find(t => t.id === b.typeId)
    if (!type) return false
    if (b.occupants.length >= type.maxOccupants) return false
    if (!b.occupants.includes(entityId)) b.occupants.push(entityId)
    return true
  }

  exitBuilding(buildingId: number, entityId: number): void {
    const b = this.buildings.get(buildingId)
    if (!b) return
    b.occupants = b.occupants.filter(id => id !== entityId)
  }

  storeItem(buildingId: number, materialId: number, quantity: number): boolean {
    const b = this.buildings.get(buildingId)
    if (!b) return false
    b.storage[materialId] = (b.storage[materialId] ?? 0) + quantity
    return true
  }

  retrieveItem(buildingId: number, materialId: number, quantity: number): boolean {
    const b = this.buildings.get(buildingId)
    if (!b) return false
    const stored = b.storage[materialId] ?? 0
    if (stored < quantity) return false
    b.storage[materialId] = stored - quantity
    if (b.storage[materialId] <= 0) delete b.storage[materialId]
    return true
  }

  /**
   * Tick structural integrity.
   * Buildings lose health proportional to maintenanceRate.
   * dtSimDays: simulation days elapsed since last tick.
   */
  tickStructuralIntegrity(dtSimDays: number): void {
    for (const b of this.buildings.values()) {
      const type = BUILDING_TYPES.find(t => t.id === b.typeId)
      if (!type) continue
      b.health = Math.max(0, b.health - type.maintenanceRate * dtSimDays)
      if (b.health <= 0) {
        b.occupants = []
        this.buildings.delete(b.id)
      }
    }
  }

  getBuilding(id: number): PlacedBuilding | undefined {
    return this.buildings.get(id)
  }

  getAllBuildings(): PlacedBuilding[] {
    return Array.from(this.buildings.values())
  }

  getBuildingsProviding(capability: string): PlacedBuilding[] {
    return this.getAllBuildings().filter(b => {
      const type = BUILDING_TYPES.find(t => t.id === b.typeId)
      return type?.provides.includes(capability)
    })
  }

  get count(): number {
    return this.buildings.size
  }

  /** Restore placed buildings from a serialized list (e.g. from DB). */
  loadBuildings(buildings: PlacedBuilding[]): void {
    this.buildings = new Map(buildings.map(b => [b.id, { ...b }]))
    this.nextId = buildings.reduce((max, b) => Math.max(max, b.id + 1), 1)
  }
}

// ── Material IDs (mirrored from Inventory.ts) ─────────────────────────────────
const M = {
  STONE: 1, WOOD: 3, BARK: 4, CLAY: 8, BRONZE: 13, IRON_ORE: 14, IRON: 15, STEEL: 16,
  GLASS: 18, BRICK: 19, MORTAR: 20, ROPE: 23, LEATHER: 24,
  COPPER: 25, SILICON: 32, WIRE: 34, PLASTIC: 35, RUBBER: 36,
} as const

/**
 * Building types spanning tiers 0-9.
 * Structural strength values follow real building codes (kN/m²):
 *   Earth/thatch: ~1, Stone: ~2-5, Reinforced concrete: 5-50, Steel frame: 50-500
 */
export const BUILDING_TYPES: BuildingType[] = [
  // ── Tier 0: Stone Age ─────────────────────────────────────────────────────
  {
    id: 'lean_to', name: 'Lean-To Shelter', tier: 0,
    materialsRequired: [{ materialId: M.WOOD, quantity: 8 }, { materialId: M.BARK, quantity: 4 }],
    size: [3, 2, 3], provides: ['shelter', 'sleep'],
    maxOccupants: 2, structuralStrength: 0.5, maintenanceRate: 2,
  },
  {
    // Slice 7: primitive stone furnace (enclosed stone space) — no iron required.
    // Real basis: earliest copper smelting furnaces were clay/stone pits ~3500 BCE.
    id: 'stone_furnace', name: 'Stone Furnace', tier: 0,
    materialsRequired: [{ materialId: M.STONE, quantity: 20 }, { materialId: M.CLAY, quantity: 10 }],
    size: [2, 2, 2], provides: ['furnace', 'smelting', 'metal_smelting'],
    maxOccupants: 1, structuralStrength: 2.0, maintenanceRate: 0.5,
  },
  {
    id: 'pit_house', name: 'Pit House', tier: 0,
    materialsRequired: [{ materialId: M.WOOD, quantity: 20 }, { materialId: M.CLAY, quantity: 10 }],
    size: [4, 2, 4], provides: ['shelter', 'sleep', 'storage'],
    maxOccupants: 6, structuralStrength: 1.0, maintenanceRate: 1,
  },
  {
    id: 'campfire_pit', name: 'Campfire Pit', tier: 0,
    materialsRequired: [{ materialId: M.STONE, quantity: 8 }],
    size: [2, 1, 2], provides: ['fire', 'cooking', 'warmth'],
    maxOccupants: 8, structuralStrength: 2.0, maintenanceRate: 0.5,
  },

  // ── Tier 1: Bronze Age ────────────────────────────────────────────────────
  {
    id: 'mud_brick_house', name: 'Mud Brick House', tier: 1,
    materialsRequired: [{ materialId: M.CLAY, quantity: 50 }, { materialId: M.WOOD, quantity: 15 }],
    size: [6, 3, 6], provides: ['shelter', 'sleep', 'storage', 'warmth'],
    maxOccupants: 8, structuralStrength: 1.5, maintenanceRate: 0.8,
  },
  {
    id: 'pottery_kiln', name: 'Pottery Kiln', tier: 1,
    materialsRequired: [{ materialId: M.CLAY, quantity: 30 }, { materialId: M.STONE, quantity: 10 }],
    size: [3, 2, 3], provides: ['kiln', 'pottery', 'smelting_basic'],
    maxOccupants: 2, structuralStrength: 3.0, maintenanceRate: 0.3,
  },
  {
    id: 'granary', name: 'Granary', tier: 1,
    materialsRequired: [{ materialId: M.WOOD, quantity: 30 }, { materialId: M.CLAY, quantity: 20 }],
    size: [5, 4, 5], provides: ['food_storage', 'preservation'],
    maxOccupants: 1, structuralStrength: 1.5, maintenanceRate: 0.5,
  },
  {
    id: 'dock', name: 'Dock', tier: 1,
    materialsRequired: [{ materialId: M.WOOD, quantity: 40 }, { materialId: M.ROPE, quantity: 10 }],
    size: [10, 1, 20], provides: ['boat_storage', 'trade_port'],
    maxOccupants: 20, structuralStrength: 1.0, maintenanceRate: 1.5,
  },

  // ── Tier 2: Iron Age ──────────────────────────────────────────────────────
  {
    // M7: Blast furnace — reaches 1000°C+ via double-chamber charcoal charge.
    // Real basis: pre-industrial bloomery / blast furnace designs (4th c. BCE).
    // Fe₂O₃ + 3C → 2Fe + 3CO₂ begins at ~800°C; usable iron at 1000°C+.
    id: 'blast_furnace', name: 'Blast Furnace', tier: 2,
    materialsRequired: [
      { materialId: M.STONE,    quantity: 8  },
      { materialId: M.IRON_ORE, quantity: 4  },
      { materialId: M.CLAY,     quantity: 2  },
    ],
    size: [3, 3, 3], provides: ['blast_furnace', 'iron_smelting', 'metal_smelting'],
    maxOccupants: 1, structuralStrength: 3.5, maintenanceRate: 0.4,
  },
  {
    id: 'stone_house', name: 'Stone House', tier: 2,
    materialsRequired: [{ materialId: M.STONE, quantity: 80 }, { materialId: M.WOOD, quantity: 20 }],
    size: [7, 4, 7], provides: ['shelter', 'sleep', 'storage', 'defense'],
    maxOccupants: 10, structuralStrength: 3.0, maintenanceRate: 0.2,
  },
  {
    id: 'smelting_furnace', name: 'Smelting Furnace', tier: 2,
    materialsRequired: [{ materialId: M.STONE, quantity: 40 }, { materialId: M.CLAY, quantity: 20 }, { materialId: M.IRON, quantity: 5 }],
    size: [4, 3, 4], provides: ['furnace', 'metal_smelting', 'iron_working'],
    maxOccupants: 3, structuralStrength: 4.0, maintenanceRate: 0.4,
  },
  {
    id: 'marketplace', name: 'Marketplace', tier: 2,
    materialsRequired: [{ materialId: M.STONE, quantity: 60 }, { materialId: M.WOOD, quantity: 30 }],
    size: [20, 3, 20], provides: ['trade', 'market', 'currency_exchange'],
    maxOccupants: 100, structuralStrength: 2.0, maintenanceRate: 0.3,
  },
  {
    id: 'barracks', name: 'Barracks', tier: 2,
    materialsRequired: [{ materialId: M.STONE, quantity: 100 }, { materialId: M.WOOD, quantity: 40 }],
    size: [15, 4, 10], provides: ['military_training', 'garrison', 'defense'],
    maxOccupants: 50, structuralStrength: 3.0, maintenanceRate: 0.3,
  },

  // ── Tier 3: Classical ─────────────────────────────────────────────────────
  {
    id: 'library', name: 'Library', tier: 3,
    materialsRequired: [{ materialId: M.STONE, quantity: 120 }, { materialId: M.WOOD, quantity: 60 }],
    size: [15, 8, 12], provides: ['knowledge_storage', 'research_bonus', 'writing'],
    maxOccupants: 30, structuralStrength: 3.5, maintenanceRate: 0.2,
  },
  {
    id: 'aqueduct', name: 'Aqueduct Segment', tier: 3,
    materialsRequired: [{ materialId: M.STONE, quantity: 200 }],
    size: [20, 8, 3], provides: ['water_supply', 'sanitation'],
    maxOccupants: 0, structuralStrength: 5.0, maintenanceRate: 0.15,
  },
  {
    id: 'amphitheatre', name: 'Amphitheatre', tier: 3,
    materialsRequired: [{ materialId: M.STONE, quantity: 500 }],
    size: [80, 20, 80], provides: ['entertainment', 'social_cohesion', 'civic'],
    maxOccupants: 5000, structuralStrength: 4.0, maintenanceRate: 0.1,
  },
  {
    id: 'hospital_ancient', name: 'Healing House', tier: 3,
    materialsRequired: [{ materialId: M.STONE, quantity: 80 }, { materialId: M.WOOD, quantity: 30 }],
    size: [12, 4, 10], provides: ['medicine', 'healing', 'surgery_basic'],
    maxOccupants: 20, structuralStrength: 3.0, maintenanceRate: 0.3,
  },

  // ── Tier 4: Medieval ──────────────────────────────────────────────────────
  {
    id: 'windmill', name: 'Windmill', tier: 4,
    materialsRequired: [{ materialId: M.STONE, quantity: 60 }, { materialId: M.WOOD, quantity: 80 }],
    size: [6, 20, 6], provides: ['power_mechanical', 'grain_milling', 'water_pumping'],
    maxOccupants: 3, structuralStrength: 3.0, maintenanceRate: 1.0,
  },
  {
    id: 'watermill', name: 'Watermill', tier: 4,
    materialsRequired: [{ materialId: M.STONE, quantity: 80 }, { materialId: M.WOOD, quantity: 60 }, { materialId: M.IRON, quantity: 10 }],
    size: [8, 6, 8], provides: ['power_mechanical', 'grain_milling', 'lumber_mill'],
    maxOccupants: 4, structuralStrength: 4.0, maintenanceRate: 0.8,
  },
  {
    id: 'printing_house', name: 'Printing House', tier: 4,
    materialsRequired: [{ materialId: M.WOOD, quantity: 60 }, { materialId: M.IRON, quantity: 20 }],
    size: [10, 5, 8], provides: ['printing', 'knowledge_distribution', 'research_bonus'],
    maxOccupants: 10, structuralStrength: 2.5, maintenanceRate: 0.3,
  },
  {
    id: 'observatory', name: 'Observatory', tier: 4,
    materialsRequired: [{ materialId: M.STONE, quantity: 150 }, { materialId: M.GLASS, quantity: 20 }],
    size: [8, 15, 8], provides: ['astronomy', 'research_bonus', 'navigation_aid'],
    maxOccupants: 5, structuralStrength: 4.0, maintenanceRate: 0.2,
  },
  {
    id: 'castle', name: 'Castle', tier: 4,
    materialsRequired: [{ materialId: M.STONE, quantity: 1000 }, { materialId: M.IRON, quantity: 100 }],
    size: [40, 20, 40], provides: ['defense', 'garrison', 'government', 'shelter'],
    maxOccupants: 200, structuralStrength: 6.0, maintenanceRate: 0.1,
  },

  // ── Tier 5: Industrial ────────────────────────────────────────────────────
  {
    id: 'factory', name: 'Factory', tier: 5,
    materialsRequired: [{ materialId: M.BRICK, quantity: 500 }, { materialId: M.IRON, quantity: 200 }, { materialId: M.GLASS, quantity: 50 }],
    size: [30, 10, 20], provides: ['manufacturing', 'mass_production', 'power_steam'],
    maxOccupants: 200, structuralStrength: 5.0, maintenanceRate: 0.5,
  },
  {
    id: 'train_station', name: 'Train Station', tier: 5,
    materialsRequired: [{ materialId: M.BRICK, quantity: 300 }, { materialId: M.STEEL, quantity: 100 }, { materialId: M.GLASS, quantity: 40 }],
    size: [50, 12, 30], provides: ['logistics', 'fast_transport', 'trade_node'],
    maxOccupants: 500, structuralStrength: 5.0, maintenanceRate: 0.4,
  },
  {
    id: 'power_plant_steam', name: 'Steam Power Plant', tier: 5,
    materialsRequired: [{ materialId: M.BRICK, quantity: 400 }, { materialId: M.STEEL, quantity: 200 }, { materialId: M.COPPER, quantity: 50 }],
    size: [25, 15, 20], provides: ['power_electric', 'grid_node'],
    maxOccupants: 30, structuralStrength: 6.0, maintenanceRate: 0.6,
  },
  {
    id: 'hospital_modern', name: 'Hospital', tier: 5,
    materialsRequired: [{ materialId: M.BRICK, quantity: 400 }, { materialId: M.STEEL, quantity: 100 }, { materialId: M.GLASS, quantity: 80 }],
    size: [30, 12, 25], provides: ['medicine', 'surgery', 'healing', 'disease_control'],
    maxOccupants: 200, structuralStrength: 5.0, maintenanceRate: 0.3,
  },

  // ── Tier 6: Modern ────────────────────────────────────────────────────────
  {
    id: 'skyscraper', name: 'Skyscraper', tier: 6,
    materialsRequired: [{ materialId: M.STEEL, quantity: 2000 }, { materialId: M.GLASS, quantity: 500 }, { materialId: M.COPPER, quantity: 200 }],
    size: [30, 200, 30], provides: ['shelter', 'offices', 'housing', 'commerce'],
    maxOccupants: 2000, structuralStrength: 50.0, maintenanceRate: 0.1,
  },
  {
    id: 'nuclear_plant', name: 'Nuclear Power Plant', tier: 6,
    materialsRequired: [{ materialId: M.STEEL, quantity: 3000 }, { materialId: M.COPPER, quantity: 500 }],
    size: [100, 60, 100], provides: ['power_nuclear', 'grid_node', 'high_power'],
    maxOccupants: 500, structuralStrength: 30.0, maintenanceRate: 0.05,
  },
  {
    id: 'research_lab', name: 'Research Laboratory', tier: 6,
    materialsRequired: [{ materialId: M.STEEL, quantity: 500 }, { materialId: M.GLASS, quantity: 200 }, { materialId: M.SILICON, quantity: 50 }],
    size: [20, 6, 20], provides: ['research', 'research_bonus', 'tech_advancement'],
    maxOccupants: 50, structuralStrength: 10.0, maintenanceRate: 0.15,
  },
  {
    id: 'airport', name: 'Airport', tier: 6,
    materialsRequired: [{ materialId: M.STEEL, quantity: 1000 }, { materialId: M.GLASS, quantity: 300 }, { materialId: M.RUBBER, quantity: 200 }],
    size: [300, 15, 200], provides: ['air_transport', 'global_logistics', 'trade_hub'],
    maxOccupants: 10000, structuralStrength: 15.0, maintenanceRate: 0.2,
  },

  // ── Tier 7: Information Age ───────────────────────────────────────────────
  {
    id: 'data_center', name: 'Data Centre', tier: 7,
    materialsRequired: [{ materialId: M.STEEL, quantity: 500 }, { materialId: M.SILICON, quantity: 200 }, { materialId: M.COPPER, quantity: 300 }],
    size: [30, 5, 30], provides: ['computing', 'ai_research', 'internet_node', 'data_storage'],
    maxOccupants: 20, structuralStrength: 10.0, maintenanceRate: 0.1,
  },
  {
    id: 'space_launch_complex', name: 'Space Launch Complex', tier: 7,
    materialsRequired: [{ materialId: M.STEEL, quantity: 5000 }, { materialId: M.COPPER, quantity: 1000 }],
    size: [200, 80, 200], provides: ['rocketry', 'space_access', 'satellite_launch'],
    maxOccupants: 2000, structuralStrength: 20.0, maintenanceRate: 0.3,
  },
  {
    id: 'biotech_lab', name: 'Biotechnology Laboratory', tier: 7,
    materialsRequired: [{ materialId: M.STEEL, quantity: 300 }, { materialId: M.GLASS, quantity: 150 }, { materialId: M.PLASTIC, quantity: 100 }],
    size: [15, 5, 15], provides: ['genetics_research', 'pharma', 'synthetic_biology'],
    maxOccupants: 40, structuralStrength: 8.0, maintenanceRate: 0.15,
  },

  // ── Tier 8: Fusion Age ────────────────────────────────────────────────────
  {
    id: 'fusion_plant', name: 'Fusion Power Plant', tier: 8,
    materialsRequired: [{ materialId: M.STEEL, quantity: 10000 }, { materialId: M.COPPER, quantity: 2000 }, { materialId: M.SILICON, quantity: 500 }],
    size: [150, 50, 150], provides: ['power_fusion', 'unlimited_power', 'grid_node'],
    maxOccupants: 200, structuralStrength: 40.0, maintenanceRate: 0.02,
  },
  {
    id: 'nanotech_lab', name: 'Nanotechnology Lab', tier: 8,
    materialsRequired: [{ materialId: M.STEEL, quantity: 1000 }, { materialId: M.SILICON, quantity: 800 }],
    size: [20, 6, 20], provides: ['nanotechnology', 'molecular_assembly', 'self_repair'],
    maxOccupants: 30, structuralStrength: 15.0, maintenanceRate: 0.05,
  },
  {
    id: 'arcology', name: 'Arcology', tier: 8,
    materialsRequired: [{ materialId: M.STEEL, quantity: 50000 }, { materialId: M.GLASS, quantity: 10000 }, { materialId: M.SILICON, quantity: 5000 }],
    size: [500, 500, 500], provides: ['shelter', 'housing', 'food_production', 'power_fusion', 'research'],
    maxOccupants: 100000, structuralStrength: 100.0, maintenanceRate: 0.01,
  },

  // ── Tier 9: Simulation Age ────────────────────────────────────────────────
  {
    id: 'simulation_node', name: 'Simulation Node', tier: 9,
    materialsRequired: [{ materialId: M.SILICON, quantity: 100000 }],
    size: [1000, 100, 1000], provides: ['universe_simulation', 'reality_control', 'compute_substrate'],
    maxOccupants: 1000, structuralStrength: 500.0, maintenanceRate: 0.001,
  },
]
