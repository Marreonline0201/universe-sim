export interface InventorySlot {
  itemId: number
  materialId: number
  quantity: number
  quality: number  // 0-1
}

export interface CraftingRecipe {
  id: number
  name: string
  tier: number  // civilization tier required (0-9)
  inputs: Array<{ materialId: number; quantity: number }>
  output: { itemId: number; quantity: number }
  knowledgeRequired: string[]  // discovery IDs player must have
  time: number  // seconds to craft
}

const SLOT_COUNT = 40

export class Inventory {
  private slots: (InventorySlot | null)[] = new Array(SLOT_COUNT).fill(null)
  private knownRecipes: Set<number> = new Set()

  /**
   * Add an item to the first available slot, or stack onto an existing slot
   * with the same itemId + materialId + quality.
   * Returns true if the item was accepted, false if inventory is full.
   */
  addItem(slot: InventorySlot): boolean {
    // Try to stack
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = this.slots[i]
      if (s && s.itemId === slot.itemId && s.materialId === slot.materialId && Math.abs(s.quality - slot.quality) < 0.01) {
        s.quantity += slot.quantity
        return true
      }
    }
    // Find empty slot
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { ...slot }
        return true
      }
    }
    return false
  }

  /**
   * Remove `quantity` items from the given slot index.
   * Returns true if successful, false if not enough items.
   */
  removeItem(slotIndex: number, quantity: number): boolean {
    const s = this.slots[slotIndex]
    if (!s || s.quantity < quantity) return false
    s.quantity -= quantity
    if (s.quantity <= 0) this.slots[slotIndex] = null
    return true
  }

  /**
   * Attempt to craft a recipe.
   * Checks: recipe known, all inputs present in sufficient quantity, tier met.
   * Consumes inputs and adds output.
   */
  craft(recipeId: number, currentTier = 0): boolean {
    const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId)
    if (!recipe) return false
    if (recipe.knowledgeRequired.length > 0 && !this.knownRecipes.has(recipeId)) return false
    if (currentTier < recipe.tier) return false

    // Verify all inputs available
    for (const input of recipe.inputs) {
      if (this.findItem(input.materialId) === -1) return false
      const slot = this.slots[this.findItem(input.materialId)]
      if (!slot || slot.quantity < input.quantity) return false
    }

    // Consume inputs
    for (const input of recipe.inputs) {
      let remaining = input.quantity
      for (let i = 0; i < SLOT_COUNT && remaining > 0; i++) {
        const s = this.slots[i]
        if (s && s.materialId === input.materialId) {
          const take = Math.min(s.quantity, remaining)
          s.quantity -= take
          remaining  -= take
          if (s.quantity <= 0) this.slots[i] = null
        }
      }
    }

    // Add output
    return this.addItem({
      itemId: recipe.output.itemId,
      materialId: recipe.output.itemId,
      quantity: recipe.output.quantity,
      quality: 0.7,
    })
  }

  discoverRecipe(recipeId: number): void {
    this.knownRecipes.add(recipeId)
  }

  getSlot(i: number): InventorySlot | null {
    return this.slots[i] ?? null
  }

  /** Returns slot index of first slot containing materialId, or -1. */
  findItem(materialId: number): number {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (this.slots[i]?.materialId === materialId) return i
    }
    return -1
  }

  /** Returns true if any slot contains an item with the given itemId. */
  hasItemById(itemId: number): boolean {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (this.slots[i]?.itemId === itemId) return true
    }
    return false
  }

  getKnownRecipes(): number[] {
    return Array.from(this.knownRecipes)
  }

  /** Returns all non-null slots with their indices */
  listItems(): Array<{ index: number; slot: InventorySlot }> {
    const result: Array<{ index: number; slot: InventorySlot }> = []
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = this.slots[i]
      if (s) result.push({ index: i, slot: s })
    }
    return result
  }
}

// ── Material IDs ─────────────────────────────────────────────────────────────
// (align with chemistry engine MaterialRegistry)
export const MAT = {
  STONE: 1, FLINT: 2, WOOD: 3, BARK: 4, LEAF: 5, BONE: 6, HIDE: 7,
  CLAY: 8, SAND: 9, CHARCOAL: 10, COPPER_ORE: 11, TIN_ORE: 12,
  BRONZE: 13, IRON_ORE: 14, IRON: 15, STEEL: 16,
  COAL: 17, GLASS: 18, BRICK: 19, MORTAR: 20,
  FIBER: 21, CLOTH: 22, ROPE: 23, LEATHER: 24,
  COPPER: 25, SILVER: 26, GOLD: 27,
  SULFUR: 28, SALTPETER: 29, CHARCOAL_POWDER: 30,
  GUNPOWDER: 31, SILICON: 32, CIRCUIT: 33, WIRE: 34,
  PLASTIC: 35, RUBBER: 36, FUEL: 37, LUBRICANT: 38,
  URANIUM: 39, PLUTONIUM: 40,
} as const

// ── Item IDs ──────────────────────────────────────────────────────────────────
export const ITEM = {
  STONE_TOOL: 1, KNIFE: 2, SPEAR: 3, AXE: 4, BOW: 5, ARROW: 6,
  SHELTER: 7, FIRE: 8, TORCH: 9,
  CLAY_POT: 10, KILN: 11, FURNACE: 12, FORGE: 13,
  BRONZE_SWORD: 14, BRONZE_ARMOR: 15, IRON_SWORD: 16, STEEL_SWORD: 17,
  WHEEL: 18, CART: 19, BOAT: 20, PLOW: 21,
  WINDMILL: 22, WATERMILL: 23, PRINTING_PRESS: 24,
  STEAM_ENGINE: 25, LOCOMOTIVE: 26, STEAMSHIP: 27,
  DYNAMO: 28, TELEGRAPH: 29, LIGHTBULB: 30,
  INTERNAL_COMBUSTION: 31, CAR: 32, AIRPLANE: 33,
  RADIO: 34, RADAR: 35, NUCLEAR_REACTOR: 36,
  COMPUTER: 37, SATELLITE: 38, ROCKET: 39,
  FUSION_REACTOR: 40, NANOBOT: 41, QUANTUM_COMPUTER: 42,
  WARP_DRIVE: 43, DYSON_SPHERE: 44, MATRIOSHKA_BRAIN: 45,
  SIMULATION_ENGINE_ITEM: 46,
} as const

// ── Crafting Recipes ─────────────────────────────────────────────────────────
// 50+ recipes spanning tiers 0-9

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // ── Tier 0: Stone Age ─────────────────────────────────────────────────────
  {
    id: 1, name: 'Stone Tool', tier: 0, time: 5,
    inputs: [{ materialId: MAT.STONE, quantity: 2 }, { materialId: MAT.FLINT, quantity: 1 }],
    output: { itemId: ITEM.STONE_TOOL, quantity: 1 },
    knowledgeRequired: [],
  },
  {
    id: 2, name: 'Knife', tier: 0, time: 8,
    inputs: [{ materialId: MAT.FLINT, quantity: 2 }, { materialId: MAT.BONE, quantity: 1 }],
    output: { itemId: ITEM.KNIFE, quantity: 1 },
    knowledgeRequired: ['tool_use'],
  },
  {
    id: 3, name: 'Spear', tier: 0, time: 10,
    inputs: [{ materialId: MAT.FLINT, quantity: 1 }, { materialId: MAT.WOOD, quantity: 2 }, { materialId: MAT.FIBER, quantity: 1 }],
    output: { itemId: ITEM.SPEAR, quantity: 1 },
    knowledgeRequired: ['tool_use'],
  },
  {
    id: 4, name: 'Stone Axe', tier: 0, time: 12,
    inputs: [{ materialId: MAT.STONE, quantity: 3 }, { materialId: MAT.WOOD, quantity: 1 }, { materialId: MAT.FIBER, quantity: 2 }],
    output: { itemId: ITEM.AXE, quantity: 1 },
    knowledgeRequired: ['tool_use'],
  },
  {
    id: 5, name: 'Rope', tier: 0, time: 15,
    inputs: [{ materialId: MAT.FIBER, quantity: 5 }],
    output: { itemId: MAT.ROPE, quantity: 1 },
    knowledgeRequired: [],
  },
  {
    id: 6, name: 'Fire', tier: 0, time: 20,
    inputs: [{ materialId: MAT.FLINT, quantity: 1 }, { materialId: MAT.WOOD, quantity: 3 }],
    output: { itemId: ITEM.FIRE, quantity: 1 },
    knowledgeRequired: ['fire_making'],
  },
  {
    id: 7, name: 'Torch', tier: 0, time: 5,
    inputs: [{ materialId: MAT.WOOD, quantity: 1 }, { materialId: MAT.BARK, quantity: 1 }],
    output: { itemId: ITEM.TORCH, quantity: 2 },
    knowledgeRequired: ['fire_making'],
  },
  {
    id: 8, name: 'Bow', tier: 0, time: 30,
    inputs: [{ materialId: MAT.WOOD, quantity: 2 }, { materialId: MAT.FIBER, quantity: 3 }, { materialId: MAT.BONE, quantity: 1 }],
    output: { itemId: ITEM.BOW, quantity: 1 },
    knowledgeRequired: ['tool_use', 'ranged_weapons'],
  },
  {
    id: 9, name: 'Arrow (×10)', tier: 0, time: 15,
    inputs: [{ materialId: MAT.FLINT, quantity: 3 }, { materialId: MAT.WOOD, quantity: 2 }, { materialId: MAT.LEAF, quantity: 1 }],
    output: { itemId: ITEM.ARROW, quantity: 10 },
    knowledgeRequired: ['ranged_weapons'],
  },
  {
    id: 10, name: 'Clay Pot', tier: 0, time: 60,
    inputs: [{ materialId: MAT.CLAY, quantity: 4 }],
    output: { itemId: ITEM.CLAY_POT, quantity: 1 },
    knowledgeRequired: ['pottery'],
  },

  // ── Tier 1: Bronze Age ────────────────────────────────────────────────────
  {
    id: 11, name: 'Kiln', tier: 1, time: 300,
    inputs: [{ materialId: MAT.CLAY, quantity: 20 }, { materialId: MAT.STONE, quantity: 10 }, { materialId: MAT.WOOD, quantity: 5 }],
    output: { itemId: ITEM.KILN, quantity: 1 },
    knowledgeRequired: ['pottery', 'fire_making'],
  },
  {
    id: 12, name: 'Brick', tier: 1, time: 120,
    inputs: [{ materialId: MAT.CLAY, quantity: 8 }, { materialId: MAT.SAND, quantity: 2 }],
    output: { itemId: ITEM.CLAY_POT, quantity: 4 },   // reuse id, represents brick block
    knowledgeRequired: ['pottery'],
  },
  {
    id: 13, name: 'Bronze', tier: 1, time: 180,
    inputs: [{ materialId: MAT.COPPER_ORE, quantity: 3 }, { materialId: MAT.TIN_ORE, quantity: 1 }, { materialId: MAT.CHARCOAL, quantity: 2 }],
    output: { itemId: MAT.BRONZE, quantity: 1 },
    knowledgeRequired: ['metallurgy', 'smelting'],
  },
  {
    id: 14, name: 'Bronze Sword', tier: 1, time: 120,
    inputs: [{ materialId: MAT.BRONZE, quantity: 3 }, { materialId: MAT.WOOD, quantity: 1 }],
    output: { itemId: ITEM.BRONZE_SWORD, quantity: 1 },
    knowledgeRequired: ['metallurgy', 'weapon_smithing'],
  },
  {
    id: 15, name: 'Bronze Armor', tier: 1, time: 300,
    inputs: [{ materialId: MAT.BRONZE, quantity: 8 }, { materialId: MAT.LEATHER, quantity: 4 }],
    output: { itemId: ITEM.BRONZE_ARMOR, quantity: 1 },
    knowledgeRequired: ['metallurgy', 'armor_smithing'],
  },
  {
    id: 16, name: 'Plow', tier: 1, time: 180,
    inputs: [{ materialId: MAT.WOOD, quantity: 6 }, { materialId: MAT.BRONZE, quantity: 2 }, { materialId: MAT.ROPE, quantity: 2 }],
    output: { itemId: ITEM.PLOW, quantity: 1 },
    knowledgeRequired: ['agriculture'],
  },
  {
    id: 17, name: 'Boat', tier: 1, time: 600,
    inputs: [{ materialId: MAT.WOOD, quantity: 20 }, { materialId: MAT.ROPE, quantity: 5 }, { materialId: MAT.CLOTH, quantity: 3 }],
    output: { itemId: ITEM.BOAT, quantity: 1 },
    knowledgeRequired: ['navigation', 'carpentry'],
  },

  // ── Tier 2: Iron Age ──────────────────────────────────────────────────────
  {
    id: 18, name: 'Furnace', tier: 2, time: 600,
    inputs: [{ materialId: MAT.STONE, quantity: 30 }, { materialId: MAT.CLAY, quantity: 10 }, { materialId: MAT.IRON_ORE, quantity: 5 }],
    output: { itemId: ITEM.FURNACE, quantity: 1 },
    knowledgeRequired: ['metallurgy', 'iron_smelting'],
  },
  {
    id: 19, name: 'Iron Sword', tier: 2, time: 200,
    inputs: [{ materialId: MAT.IRON, quantity: 4 }, { materialId: MAT.WOOD, quantity: 1 }, { materialId: MAT.LEATHER, quantity: 1 }],
    output: { itemId: ITEM.IRON_SWORD, quantity: 1 },
    knowledgeRequired: ['iron_smelting', 'weapon_smithing'],
  },
  {
    id: 20, name: 'Wheel', tier: 2, time: 300,
    inputs: [{ materialId: MAT.WOOD, quantity: 8 }, { materialId: MAT.IRON, quantity: 2 }],
    output: { itemId: ITEM.WHEEL, quantity: 2 },
    knowledgeRequired: ['mechanics', 'carpentry'],
  },
  {
    id: 21, name: 'Cart', tier: 2, time: 400,
    inputs: [{ materialId: MAT.WOOD, quantity: 12 }, { materialId: MAT.IRON, quantity: 4 }, { materialId: MAT.ROPE, quantity: 3 }],
    output: { itemId: ITEM.CART, quantity: 1 },
    knowledgeRequired: ['mechanics', 'carpentry'],
  },

  // ── Tier 3: Classical ─────────────────────────────────────────────────────
  {
    id: 22, name: 'Forge', tier: 3, time: 900,
    inputs: [{ materialId: MAT.STONE, quantity: 50 }, { materialId: MAT.IRON, quantity: 20 }, { materialId: MAT.CLAY, quantity: 15 }],
    output: { itemId: ITEM.FORGE, quantity: 1 },
    knowledgeRequired: ['iron_smelting', 'engineering'],
  },
  {
    id: 23, name: 'Steel Sword', tier: 3, time: 300,
    inputs: [{ materialId: MAT.STEEL, quantity: 4 }, { materialId: MAT.WOOD, quantity: 1 }, { materialId: MAT.LEATHER, quantity: 2 }],
    output: { itemId: ITEM.STEEL_SWORD, quantity: 1 },
    knowledgeRequired: ['steel_making', 'weapon_smithing'],
  },
  {
    id: 24, name: 'Glass', tier: 3, time: 120,
    inputs: [{ materialId: MAT.SAND, quantity: 10 }, { materialId: MAT.CHARCOAL, quantity: 3 }],
    output: { itemId: MAT.GLASS, quantity: 1 },
    knowledgeRequired: ['glassblowing'],
  },
  {
    id: 25, name: 'Windmill', tier: 3, time: 1200,
    inputs: [{ materialId: MAT.WOOD, quantity: 30 }, { materialId: MAT.CLOTH, quantity: 10 }, { materialId: MAT.STONE, quantity: 20 }],
    output: { itemId: ITEM.WINDMILL, quantity: 1 },
    knowledgeRequired: ['mechanics', 'wind_power'],
  },
  {
    id: 26, name: 'Watermill', tier: 3, time: 1500,
    inputs: [{ materialId: MAT.WOOD, quantity: 40 }, { materialId: MAT.IRON, quantity: 10 }, { materialId: MAT.STONE, quantity: 30 }],
    output: { itemId: ITEM.WATERMILL, quantity: 1 },
    knowledgeRequired: ['mechanics', 'hydraulics'],
  },

  // ── Tier 4: Medieval ──────────────────────────────────────────────────────
  {
    id: 27, name: 'Printing Press', tier: 4, time: 3600,
    inputs: [{ materialId: MAT.IRON, quantity: 20 }, { materialId: MAT.WOOD, quantity: 15 }, { materialId: MAT.COPPER, quantity: 5 }],
    output: { itemId: ITEM.PRINTING_PRESS, quantity: 1 },
    knowledgeRequired: ['mechanics', 'writing', 'optics'],
  },

  // ── Tier 5: Industrial ────────────────────────────────────────────────────
  {
    id: 28, name: 'Steam Engine', tier: 5, time: 7200,
    inputs: [{ materialId: MAT.STEEL, quantity: 30 }, { materialId: MAT.COPPER, quantity: 15 }, { materialId: MAT.COAL, quantity: 10 }],
    output: { itemId: ITEM.STEAM_ENGINE, quantity: 1 },
    knowledgeRequired: ['thermodynamics', 'metallurgy', 'mechanics'],
  },
  {
    id: 29, name: 'Locomotive', tier: 5, time: 14400,
    inputs: [{ materialId: MAT.STEEL, quantity: 80 }, { materialId: MAT.COPPER, quantity: 30 }, { materialId: MAT.COAL, quantity: 20 }],
    output: { itemId: ITEM.LOCOMOTIVE, quantity: 1 },
    knowledgeRequired: ['steam_power', 'engineering'],
  },
  {
    id: 30, name: 'Steamship', tier: 5, time: 18000,
    inputs: [{ materialId: MAT.STEEL, quantity: 120 }, { materialId: MAT.COPPER, quantity: 40 }, { materialId: MAT.COAL, quantity: 30 }],
    output: { itemId: ITEM.STEAMSHIP, quantity: 1 },
    knowledgeRequired: ['steam_power', 'navigation', 'engineering'],
  },
  {
    id: 31, name: 'Dynamo', tier: 5, time: 3600,
    inputs: [{ materialId: MAT.COPPER, quantity: 20 }, { materialId: MAT.IRON, quantity: 15 }, { materialId: MAT.RUBBER, quantity: 5 }],
    output: { itemId: ITEM.DYNAMO, quantity: 1 },
    knowledgeRequired: ['electromagnetism', 'mechanics'],
  },
  {
    id: 32, name: 'Telegraph', tier: 5, time: 1800,
    inputs: [{ materialId: MAT.COPPER, quantity: 10 }, { materialId: MAT.IRON, quantity: 5 }, { materialId: MAT.RUBBER, quantity: 3 }],
    output: { itemId: ITEM.TELEGRAPH, quantity: 1 },
    knowledgeRequired: ['electromagnetism', 'communication'],
  },
  {
    id: 33, name: 'Lightbulb', tier: 5, time: 900,
    inputs: [{ materialId: MAT.GLASS, quantity: 2 }, { materialId: MAT.COPPER, quantity: 1 }, { materialId: MAT.WIRE, quantity: 2 }],
    output: { itemId: ITEM.LIGHTBULB, quantity: 3 },
    knowledgeRequired: ['electromagnetism', 'glassblowing'],
  },
  {
    id: 34, name: 'Gunpowder', tier: 5, time: 120,
    inputs: [{ materialId: MAT.SULFUR, quantity: 1 }, { materialId: MAT.SALTPETER, quantity: 2 }, { materialId: MAT.CHARCOAL_POWDER, quantity: 1 }],
    output: { itemId: MAT.GUNPOWDER, quantity: 1 },
    knowledgeRequired: ['chemistry', 'alchemy'],
  },

  // ── Tier 6: Modern ────────────────────────────────────────────────────────
  {
    id: 35, name: 'Internal Combustion Engine', tier: 6, time: 7200,
    inputs: [{ materialId: MAT.STEEL, quantity: 50 }, { materialId: MAT.RUBBER, quantity: 20 }, { materialId: MAT.FUEL, quantity: 10 }],
    output: { itemId: ITEM.INTERNAL_COMBUSTION, quantity: 1 },
    knowledgeRequired: ['thermodynamics', 'chemistry', 'mechanics'],
  },
  {
    id: 36, name: 'Automobile', tier: 6, time: 21600,
    inputs: [{ materialId: MAT.STEEL, quantity: 150 }, { materialId: MAT.RUBBER, quantity: 40 }, { materialId: MAT.GLASS, quantity: 10 }],
    output: { itemId: ITEM.CAR, quantity: 1 },
    knowledgeRequired: ['internal_combustion', 'engineering'],
  },
  {
    id: 37, name: 'Airplane', tier: 6, time: 43200,
    inputs: [{ materialId: MAT.STEEL, quantity: 200 }, { materialId: MAT.RUBBER, quantity: 60 }, { materialId: MAT.FUEL, quantity: 30 }],
    output: { itemId: ITEM.AIRPLANE, quantity: 1 },
    knowledgeRequired: ['aerodynamics', 'internal_combustion', 'engineering'],
  },
  {
    id: 38, name: 'Radio', tier: 6, time: 3600,
    inputs: [{ materialId: MAT.COPPER, quantity: 8 }, { materialId: MAT.GLASS, quantity: 4 }, { materialId: MAT.RUBBER, quantity: 2 }],
    output: { itemId: ITEM.RADIO, quantity: 1 },
    knowledgeRequired: ['electromagnetism', 'communication', 'electronics'],
  },
  {
    id: 39, name: 'Nuclear Reactor', tier: 6, time: 864000,
    inputs: [{ materialId: MAT.STEEL, quantity: 500 }, { materialId: MAT.URANIUM, quantity: 50 }, { materialId: MAT.COPPER, quantity: 100 }],
    output: { itemId: ITEM.NUCLEAR_REACTOR, quantity: 1 },
    knowledgeRequired: ['nuclear_physics', 'engineering', 'materials_science'],
  },

  // ── Tier 7: Information Age ───────────────────────────────────────────────
  {
    id: 40, name: 'Computer', tier: 7, time: 86400,
    inputs: [{ materialId: MAT.SILICON, quantity: 30 }, { materialId: MAT.COPPER, quantity: 20 }, { materialId: MAT.PLASTIC, quantity: 10 }],
    output: { itemId: ITEM.COMPUTER, quantity: 1 },
    knowledgeRequired: ['electronics', 'semiconductor_physics', 'logic'],
  },
  {
    id: 41, name: 'Circuit Board', tier: 7, time: 3600,
    inputs: [{ materialId: MAT.SILICON, quantity: 5 }, { materialId: MAT.COPPER, quantity: 8 }, { materialId: MAT.PLASTIC, quantity: 3 }],
    output: { itemId: MAT.CIRCUIT, quantity: 1 },
    knowledgeRequired: ['electronics', 'semiconductor_physics'],
  },
  {
    id: 42, name: 'Satellite', tier: 7, time: 2592000,
    inputs: [{ materialId: MAT.STEEL, quantity: 300 }, { materialId: MAT.SILICON, quantity: 100 }, { materialId: MAT.FUEL, quantity: 200 }],
    output: { itemId: ITEM.SATELLITE, quantity: 1 },
    knowledgeRequired: ['aerospace', 'electronics', 'orbital_mechanics'],
  },
  {
    id: 43, name: 'Rocket', tier: 7, time: 7776000,
    inputs: [{ materialId: MAT.STEEL, quantity: 800 }, { materialId: MAT.FUEL, quantity: 500 }, { materialId: MAT.SILICON, quantity: 200 }],
    output: { itemId: ITEM.ROCKET, quantity: 1 },
    knowledgeRequired: ['aerospace', 'orbital_mechanics', 'propulsion'],
  },

  // ── Tier 8: Fusion Age ────────────────────────────────────────────────────
  {
    id: 44, name: 'Fusion Reactor', tier: 8, time: 31536000,
    inputs: [{ materialId: MAT.STEEL, quantity: 2000 }, { materialId: MAT.COPPER, quantity: 500 }, { materialId: MAT.SILICON, quantity: 300 }],
    output: { itemId: ITEM.FUSION_REACTOR, quantity: 1 },
    knowledgeRequired: ['nuclear_physics', 'plasma_physics', 'superconductivity'],
  },
  {
    id: 45, name: 'Nanobot Assembler', tier: 8, time: 63072000,
    inputs: [{ materialId: MAT.SILICON, quantity: 500 }, { materialId: MAT.GOLD, quantity: 100 }, { materialId: MAT.PLASTIC, quantity: 200 }],
    output: { itemId: ITEM.NANOBOT, quantity: 1 },
    knowledgeRequired: ['nanotechnology', 'molecular_assembly', 'AI'],
  },
  {
    id: 46, name: 'Quantum Computer', tier: 8, time: 157680000,
    inputs: [{ materialId: MAT.SILICON, quantity: 1000 }, { materialId: MAT.GOLD, quantity: 50 }, { materialId: MAT.COPPER, quantity: 200 }],
    output: { itemId: ITEM.QUANTUM_COMPUTER, quantity: 1 },
    knowledgeRequired: ['quantum_mechanics', 'cryogenics', 'AI'],
  },
  {
    id: 47, name: 'Warp Drive', tier: 8, time: 315360000,
    inputs: [{ materialId: MAT.STEEL, quantity: 5000 }, { materialId: MAT.PLUTONIUM, quantity: 100 }, { materialId: MAT.SILICON, quantity: 2000 }],
    output: { itemId: ITEM.WARP_DRIVE, quantity: 1 },
    knowledgeRequired: ['exotic_matter', 'general_relativity', 'fusion_power'],
  },

  // ── Tier 9: Simulation Age ────────────────────────────────────────────────
  {
    id: 48, name: 'Dyson Sphere (partial)', tier: 9, time: 3153600000,
    inputs: [{ materialId: MAT.STEEL, quantity: 999999 }, { materialId: MAT.SILICON, quantity: 999999 }, { materialId: MAT.COPPER, quantity: 999999 }],
    output: { itemId: ITEM.DYSON_SPHERE, quantity: 1 },
    knowledgeRequired: ['megastructure_engineering', 'stellar_engineering', 'self_replicating_machines'],
  },
  {
    id: 49, name: 'Matrioshka Brain', tier: 9, time: 31536000000,
    inputs: [{ materialId: MAT.SILICON, quantity: 999999 }, { materialId: MAT.GOLD, quantity: 999999 }, { materialId: MAT.URANIUM, quantity: 999999 }],
    output: { itemId: ITEM.MATRIOSHKA_BRAIN, quantity: 1 },
    knowledgeRequired: ['computronium', 'dyson_sphere', 'superintelligence'],
  },
  {
    id: 50, name: 'Simulation Engine', tier: 9, time: 315360000000,
    inputs: [{ materialId: MAT.SILICON, quantity: 999999 }, { materialId: MAT.GOLD, quantity: 999999 }, { materialId: MAT.PLUTONIUM, quantity: 999999 }],
    output: { itemId: ITEM.SIMULATION_ENGINE_ITEM, quantity: 1 },
    knowledgeRequired: ['matrioshka_brain', 'simulation_hypothesis', 'reality_engineering'],
  },
]
