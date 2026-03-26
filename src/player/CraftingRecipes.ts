import { MAT, ITEM, type CraftingRecipe } from './Inventory'


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
    output: { itemId: MAT.ROPE, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
  },
  {
    // B-10 fix: renamed from "Fire" to "Campfire Kit" — the crafted item is a
    // placeable fire you equip and left-click to ignite, not an instant effect.
    id: 6, name: 'Campfire Kit', tier: 0, time: 20,
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
    // M31 Track C: Bow — Tier 1 ranged weapon. 3x Wood + 2x Fiber → 1x Bow
    // Right-click to fire arrow (projectile). 25 damage + 5 per archery (combat) skill.
    id: 8, name: 'Bow', tier: 0, time: 30,
    inputs: [{ materialId: MAT.WOOD, quantity: 3 }, { materialId: MAT.FIBER, quantity: 2 }],
    output: { itemId: ITEM.BOW, quantity: 1 },
    knowledgeRequired: ['tool_use'],
  },
  {
    // M31 Track C: Arrow — 1x Wood + 1x Stone → 5x Arrows (MAT.ARROW_AMMO)
    id: 9, name: 'Arrow (×5)', tier: 0, time: 15,
    inputs: [{ materialId: MAT.WOOD, quantity: 1 }, { materialId: MAT.STONE, quantity: 1 }],
    output: { itemId: MAT.ARROW_AMMO, quantity: 5, isMaterial: true },
    knowledgeRequired: [],
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
    output: { itemId: MAT.BRICK, quantity: 4, isMaterial: true },
    knowledgeRequired: ['pottery'],
  },
  {
    id: 13, name: 'Bronze', tier: 1, time: 180,
    inputs: [{ materialId: MAT.COPPER_ORE, quantity: 3 }, { materialId: MAT.TIN_ORE, quantity: 1 }, { materialId: MAT.CHARCOAL, quantity: 2 }],
    output: { itemId: MAT.BRONZE, quantity: 1, isMaterial: true },
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
    output: { itemId: MAT.GLASS, quantity: 1, isMaterial: true },
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
    output: { itemId: MAT.GUNPOWDER, quantity: 1, isMaterial: true },
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
    output: { itemId: MAT.CIRCUIT, quantity: 1, isMaterial: true },
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

  // ── Missing production chain recipes ──────────────────────────────────────
  // These fill the gaps in the material progression — without them mid/late
  // game crafting is completely blocked even in normal mode.
  {
    id: 51, name: 'Charcoal', tier: 0, time: 30,
    inputs: [{ materialId: MAT.WOOD, quantity: 3 }],
    output: { itemId: MAT.CHARCOAL, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },
  {
    id: 52, name: 'Leather', tier: 0, time: 20,
    inputs: [{ materialId: MAT.HIDE, quantity: 2 }],
    output: { itemId: MAT.LEATHER, quantity: 1, isMaterial: true },
    knowledgeRequired: ['tool_use'],
  },
  {
    id: 53, name: 'Cloth', tier: 0, time: 25,
    inputs: [{ materialId: MAT.FIBER, quantity: 5 }],
    output: { itemId: MAT.CLOTH, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
  },
  {
    id: 54, name: 'Smelt Copper', tier: 1, time: 120,
    inputs: [{ materialId: MAT.COPPER_ORE, quantity: 3 }, { materialId: MAT.CHARCOAL, quantity: 2 }],
    output: { itemId: MAT.COPPER, quantity: 1, isMaterial: true },
    knowledgeRequired: ['metallurgy', 'smelting'],
  },
  {
    id: 55, name: 'Smelt Iron', tier: 2, time: 180,
    inputs: [{ materialId: MAT.IRON_ORE, quantity: 4 }, { materialId: MAT.CHARCOAL, quantity: 3 }],
    output: { itemId: MAT.IRON, quantity: 1, isMaterial: true },
    knowledgeRequired: ['iron_smelting'],
  },
  {
    id: 56, name: 'Smelt Steel', tier: 3, time: 240,
    inputs: [{ materialId: MAT.IRON, quantity: 4 }, { materialId: MAT.COAL, quantity: 2 }],
    output: { itemId: MAT.STEEL, quantity: 1, isMaterial: true },
    knowledgeRequired: ['steel_making'],
  },
  {
    id: 57, name: 'Copper Wire', tier: 5, time: 60,
    inputs: [{ materialId: MAT.COPPER, quantity: 2 }],
    output: { itemId: MAT.WIRE, quantity: 3, isMaterial: true },
    knowledgeRequired: ['electromagnetism'],
  },

  // ── Additional material production recipes ─────────────────────────────────
  {
    id: 58, name: 'Charcoal Powder', tier: 5, time: 15,
    inputs: [{ materialId: MAT.CHARCOAL, quantity: 2 }],
    output: { itemId: MAT.CHARCOAL_POWDER, quantity: 1, isMaterial: true },
    knowledgeRequired: ['chemistry'],
  },
  {
    id: 59, name: 'Silicon', tier: 6, time: 300,
    inputs: [{ materialId: MAT.SAND, quantity: 8 }, { materialId: MAT.CHARCOAL, quantity: 3 }],
    output: { itemId: MAT.SILICON, quantity: 1, isMaterial: true },
    knowledgeRequired: ['semiconductor_physics', 'chemistry'],
  },
  {
    id: 60, name: 'Fuel', tier: 5, time: 180,
    inputs: [{ materialId: MAT.COAL, quantity: 3 }],
    output: { itemId: MAT.FUEL, quantity: 1, isMaterial: true },
    knowledgeRequired: ['thermodynamics', 'chemistry'],
  },
  {
    id: 61, name: 'Plastic', tier: 6, time: 240,
    inputs: [{ materialId: MAT.FUEL, quantity: 2 }, { materialId: MAT.SILICON, quantity: 1 }],
    output: { itemId: MAT.PLASTIC, quantity: 2, isMaterial: true },
    knowledgeRequired: ['chemistry', 'materials_science'],
  },
  {
    id: 62, name: 'Plutonium', tier: 7, time: 86400,
    inputs: [{ materialId: MAT.URANIUM, quantity: 5 }],
    output: { itemId: MAT.PLUTONIUM, quantity: 1, isMaterial: true },
    knowledgeRequired: ['nuclear_physics', 'nuclear_engineering'],
  },
  {
    id: 63, name: 'Cooked Meat', tier: 0, time: 30,
    inputs: [{ materialId: MAT.RAW_MEAT, quantity: 2 }],
    output: { itemId: MAT.COOKED_MEAT, quantity: 2, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },
  // ── Slice 4: Cooking via fire thermodynamics ──────────────────────────────
  // Raw meat gathered from animals/bone nodes. Cooking is driven by the sim
  // grid temperature system (see FoodCookingSystem). This recipe is a fallback
  // crafting-panel route; the primary path is proximity-to-fire automatic cooking.
  {
    id: 64, name: 'Cook Meat (manual)', tier: 0, time: 20,
    inputs: [{ materialId: MAT.RAW_MEAT, quantity: 1 }],
    output: { itemId: MAT.COOKED_MEAT, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },
  // ── Slice 6 / M5: Bedroll — respawn anchor + sleep site ─────────────────
  // Recipe updated per M5 spec: 3x Fiber + 2x Wood (more accessible early-game).
  // Placing a bedroll records it as the player's personal respawn point in Neon DB.
  {
    id: 65, name: 'Bedroll', tier: 0, time: 15,
    inputs: [{ materialId: MAT.FIBER, quantity: 3 }, { materialId: MAT.WOOD, quantity: 2 }],
    output: { itemId: ITEM.BEDROLL, quantity: 1 },
    knowledgeRequired: [],
  },
  // ── Slice 7: Copper knife via smelting ───────────────────────────────────
  // Copper knife: smelted copper + bone handle. Requires copper from furnace smelting.
  {
    id: 66, name: 'Copper Knife', tier: 0, time: 30,
    inputs: [{ materialId: MAT.COPPER, quantity: 2 }, { materialId: MAT.BONE, quantity: 1 }],
    output: { itemId: ITEM.COPPER_KNIFE, quantity: 1 },
    knowledgeRequired: [],
  },

  // ── M7: Iron Age ─────────────────────────────────────────────────────────
  //
  // Fe₂O₃ + 3C → 2Fe + 3CO₂  (direct reduction at ≥1000°C in blast furnace)
  // Iron melting point: 1538°C. Blast furnace achieves 1000–1300°C via forced
  // air draft + high charcoal charge. Iron ingots are wrought iron (not cast).
  //
  // Blast Furnace: craftable structure using stone + iron_ore + clay.
  // The furnace building is placed via BuildPanel; smelting is automatic when
  // blast_furnace building is adjacent to a ≥1000°C sim grid fire cell.
  {
    // id 67 — blast furnace structure recipe (placed, not held)
    id: 67, name: 'Blast Furnace', tier: 2, time: 600,
    inputs: [
      { materialId: MAT.STONE,    quantity: 8 },
      { materialId: MAT.IRON_ORE, quantity: 4 },
      { materialId: MAT.CLAY,     quantity: 2 },
    ],
    output: { itemId: ITEM.FURNACE, quantity: 1 },
    knowledgeRequired: ['iron_smelting'],
  },
  {
    // id 68 — iron knife: 2 iron ingots + 1 wood handle
    // Damage: 18 (1.8× copper knife 10). Durability conceptually 3×.
    id: 68, name: 'Iron Knife', tier: 2, time: 45,
    inputs: [
      { materialId: MAT.IRON_INGOT, quantity: 2 },
      { materialId: MAT.WOOD,       quantity: 1 },
    ],
    output: { itemId: ITEM.IRON_KNIFE, quantity: 1 },
    knowledgeRequired: ['iron_smelting'],
  },
  {
    // id 69 — iron axe: 3 iron ingots + 2 wood
    // Trees fall in 2 hits (vs 3 for stone axe). harvestPower 5.
    id: 69, name: 'Iron Axe', tier: 2, time: 60,
    inputs: [
      { materialId: MAT.IRON_INGOT, quantity: 3 },
      { materialId: MAT.WOOD,       quantity: 2 },
    ],
    output: { itemId: ITEM.IRON_AXE, quantity: 1 },
    knowledgeRequired: ['iron_smelting'],
  },
  {
    // id 70 — iron pickaxe: required to mine iron_ore deposits.
    // Stone pickaxe (stone tool / axe) cannot penetrate iron ore — too hard.
    id: 70, name: 'Iron Pickaxe', tier: 2, time: 60,
    inputs: [
      { materialId: MAT.IRON_INGOT, quantity: 3 },
      { materialId: MAT.WOOD,       quantity: 2 },
    ],
    output: { itemId: ITEM.IRON_PICKAXE, quantity: 1 },
    knowledgeRequired: ['iron_smelting'],
  },

  // ── M8: Steel Age ─────────────────────────────────────────────────────────
  //
  // Real carburization chemistry: Fe + C → Fe-C (steel)
  // Carbon content by weight determines outcome:
  //   0.2–2.1% C  → steel (strong, flexible)
  //   >2.1% C     → cast iron (brittle, cheap)
  //
  // Controlled by charcoal:iron_ingot ratio in blast furnace:
  //   1:4 charcoal:iron_ingot  → steel (0.8% C target)
  //   1:2 charcoal:iron_ingot  → cast iron (2.4% C target)
  //
  // Steel requires quenching (rapid cooling in water) within 30 real seconds
  // to crystallise the martensitic microstructure. Missed quench = soft_steel
  // with a 50% quality penalty.

  {
    // id 71 — Steel Sword: premier melee weapon, 2.5× iron_knife damage
    id: 71, name: 'Steel Sword', tier: 2, time: 90,
    inputs: [
      { materialId: MAT.STEEL_INGOT, quantity: 3 },
      { materialId: MAT.WOOD,        quantity: 1 },
    ],
    output: { itemId: ITEM.STEEL_SWORD_M8, quantity: 1 },
    knowledgeRequired: ['iron_smelting', 'steel_making'],
  },
  {
    // id 72 — Steel Chestplate: absorbs 40% incoming damage
    id: 72, name: 'Steel Chestplate', tier: 2, time: 120,
    inputs: [
      { materialId: MAT.STEEL_INGOT, quantity: 6 },
    ],
    output: { itemId: ITEM.STEEL_CHESTPLATE, quantity: 1 },
    knowledgeRequired: ['iron_smelting', 'steel_making'],
  },
  {
    // id 73 — Steel Crossbow: ranged, 30m effective range, ballistic arc
    id: 73, name: 'Steel Crossbow', tier: 2, time: 150,
    inputs: [
      { materialId: MAT.STEEL_INGOT, quantity: 4 },
      { materialId: MAT.WOOD,        quantity: 3 },
      { materialId: MAT.FIBER,       quantity: 2 },
    ],
    output: { itemId: ITEM.STEEL_CROSSBOW, quantity: 1 },
    knowledgeRequired: ['iron_smelting', 'steel_making'],
  },
  {
    // id 74 — Cast Iron Pot: cooks food 2× faster than campfire
    id: 74, name: 'Cast Iron Pot', tier: 2, time: 60,
    inputs: [
      { materialId: MAT.CAST_IRON_INGOT, quantity: 2 },
    ],
    output: { itemId: ITEM.CAST_IRON_POT, quantity: 1 },
    knowledgeRequired: ['iron_smelting'],
  },
  {
    // id 75 — Cast Iron Door: fire-resistant building component, high HP
    id: 75, name: 'Cast Iron Door', tier: 2, time: 90,
    inputs: [
      { materialId: MAT.CAST_IRON_INGOT, quantity: 4 },
    ],
    output: { itemId: ITEM.CAST_IRON_DOOR, quantity: 1 },
    knowledgeRequired: ['iron_smelting'],
  },

  // ── M9: Hunting + Animal Processing ──────────────────────────────────────
  // New crafting chain: bone → bone_needle → leather_armor (with fiber + leather)
  // Leather already craftable from HIDE (recipe 52). Now also craftable from
  // animal-drop leather (MAT.LEATHER — same material ID, just new source).
  {
    // id 76 — Bone Needle: crafting component for leather armor
    id: 76, name: 'Bone Needle', tier: 0, time: 10,
    inputs: [
      { materialId: MAT.BONE, quantity: 1 },
    ],
    output: { itemId: ITEM.BONE_NEEDLE, quantity: 2 },
    knowledgeRequired: ['tool_use'],
  },
  {
    // id 77 — Leather Armor: 10% damage reduction, lighter than steel
    // Requires bone_needle (sewing) + leather (hide processing) + fiber (stitching)
    id: 77, name: 'Leather Armor', tier: 0, time: 45,
    inputs: [
      { materialId: MAT.LEATHER, quantity: 4 },
      { materialId: MAT.FIBER,   quantity: 3 },
    ],
    output: { itemId: ITEM.LEATHER_ARMOR, quantity: 1 },
    knowledgeRequired: ['tool_use'],
  },
  {
    // id 78 — Cook Raw Meat (via campfire proximity — this is the manual fallback)
    // Primary path: proximity to active fire auto-cooks via SurvivalSystems.
    // This manual recipe exists so players can cook without a placed campfire.
    id: 78, name: 'Cook Raw Meat (manual)', tier: 0, time: 15,
    inputs: [
      { materialId: MAT.RAW_MEAT, quantity: 1 },
    ],
    output: { itemId: MAT.COOKED_MEAT, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },
  {
    // id 79 — Leather from animal drop (wolf pelt → leather)
    // Wolf pelts and boar skin can also be processed into leather
    id: 79, name: 'Tan Wolf Pelt', tier: 0, time: 20,
    inputs: [
      { materialId: MAT.WOLF_PELT, quantity: 1 },
    ],
    output: { itemId: MAT.LEATHER, quantity: 1, isMaterial: true },
    knowledgeRequired: ['tool_use'],
  },
  {
    // id 80 — Boar Tusk Knife: alternative low-tier blade, no metal required
    id: 80, name: 'Tusk Knife', tier: 0, time: 12,
    inputs: [
      { materialId: MAT.BOAR_TUSK, quantity: 1 },
      { materialId: MAT.WOOD,      quantity: 1 },
    ],
    output: { itemId: ITEM.KNIFE, quantity: 1 },
    knowledgeRequired: ['tool_use'],
  },

  // ── M10 Track A: No crafting items (season is automatic) ──────────────────

  // ── M10 Track B: Sailing + Navigation + Fishing ───────────────────────────
  {
    // id 81 — Rope (3x fiber → 1 rope, accessible recipe — track B sailing prerequisite)
    // Duplicate route alongside recipe 5 (5x fiber → rope) — cheaper for boat building.
    id: 81, name: 'Rope (quick)', tier: 0, time: 10,
    inputs: [{ materialId: MAT.FIBER, quantity: 3 }],
    output: { itemId: MAT.ROPE, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
  },
  {
    // id 82 — Raft: 6x wood + 4x fiber + 2x rope
    id: 82, name: 'Raft', tier: 0, time: 120,
    inputs: [
      { materialId: MAT.WOOD,  quantity: 6 },
      { materialId: MAT.FIBER, quantity: 4 },
      { materialId: MAT.ROPE,  quantity: 2 },
    ],
    output: { itemId: ITEM.RAFT, quantity: 1 },
    knowledgeRequired: ['navigation', 'carpentry'],
  },
  {
    // id 83 — Sailing Boat: 8x wood + 4x iron_ingot + 6x rope
    id: 83, name: 'Sailing Boat', tier: 2, time: 300,
    inputs: [
      { materialId: MAT.WOOD,       quantity: 8 },
      { materialId: MAT.IRON_INGOT, quantity: 4 },
      { materialId: MAT.ROPE,       quantity: 6 },
    ],
    output: { itemId: ITEM.SAILING_BOAT, quantity: 1 },
    knowledgeRequired: ['navigation', 'carpentry', 'iron_smelting'],
  },
  {
    // id 84 — Compass: 1x iron_ingot → compass for HUD navigation
    id: 84, name: 'Compass', tier: 2, time: 45,
    inputs: [{ materialId: MAT.IRON_INGOT, quantity: 1 }],
    output: { itemId: ITEM.COMPASS, quantity: 1 },
    knowledgeRequired: ['iron_smelting', 'navigation'],
  },
  {
    // id 85 — Fishing Rod: 2x wood + 3x fiber
    id: 85, name: 'Fishing Rod', tier: 0, time: 20,
    inputs: [
      { materialId: MAT.WOOD,  quantity: 2 },
      { materialId: MAT.FIBER, quantity: 3 },
    ],
    output: { itemId: ITEM.FISHING_ROD, quantity: 1 },
    knowledgeRequired: [],
  },

  // ── M10 Track C: Currency + Trade Economy ─────────────────────────────────
  {
    // id 86 — Mint Copper Coins: 5x copper → 20x copper_coin at any anvil
    // (tier 0 but requires copper which is tier 1 — gate is materials, not tier)
    id: 86, name: 'Mint Copper Coins', tier: 0, time: 30,
    inputs: [{ materialId: MAT.COPPER, quantity: 5 }],
    output: { itemId: MAT.COPPER_COIN, quantity: 20, isMaterial: true },
    knowledgeRequired: ['metallurgy'],
  },
  {
    // id 87 — Cook Fish: raw fish → cooked fish (better nutrition than raw)
    id: 87, name: 'Cook Fish', tier: 0, time: 15,
    inputs: [{ materialId: MAT.FISH, quantity: 1 }],
    output: { itemId: MAT.COOKED_MEAT, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },

  // ── M11: Civilization Age — Gunpowder + Telescope ────────────────────────
  //
  // Gunpowder chemistry (Tier B — Approximate):
  //   KNO₃ (saltpeter) + C (charcoal) + S (sulfur) → rapid oxidation, N₂ + CO₂ + SO₂
  //   Historical ratio: 75% KNO₃, 15% C, 10% S by mass.
  //   Saltpeter (potassium nitrate) occurs naturally near nitrogen-rich organic matter:
  //   cave walls (bat guano), soil near animal pens, sheltered decomposition sites.
  //   Discovery is emergent: player combines these three at a furnace → explosion + gunpowder.
  //
  // Telescope optics (Tier B):
  //   Refracting telescope requires ground glass lenses (crown glass + lead glass).
  //   Simplification: glass ingot (processed from sand+heat) → lens grinding.
  //   Galileo's telescope (1609): 3× magnification. Here: reveals moon phase + planet hint.
  {
    // id 88 — Gunpowder: 2x saltpeter + 1x charcoal + 1x sulfur
    // Emergent discovery: these three together cause explosive reaction (not just crafting).
    // Furnace-adjacent crafting raises ambient temperature → KNO₃ oxidation begins.
    id: 88, name: 'Gunpowder', tier: 3, time: 30,
    inputs: [
      { materialId: MAT.SALTPETER,      quantity: 2 },
      { materialId: MAT.CHARCOAL,       quantity: 1 },
      { materialId: MAT.SULFUR,         quantity: 1 },
    ],
    output: { itemId: MAT.GUNPOWDER, quantity: 2, isMaterial: true },
    knowledgeRequired: ['chemistry'],
  },
  {
    // id 89 — Musket: 4x iron_ingot + 2x gunpowder → iron barrel + flintlock mechanism
    // First ranged weapon not requiring bowyer skill. Damage 80, reload 8s.
    // Historical basis: matchlock musket (16th c.) → flintlock (17th c.).
    // Iron barrel requires barrel drilling (implied by iron_ingot + furnace access).
    id: 89, name: 'Musket', tier: 3, time: 180,
    inputs: [
      { materialId: MAT.IRON_INGOT, quantity: 4 },
      { materialId: MAT.GUNPOWDER,  quantity: 2 },
      { materialId: MAT.WOOD,       quantity: 2 },
    ],
    output: { itemId: ITEM.MUSKET, quantity: 1 },
    knowledgeRequired: ['iron_smelting', 'chemistry'],
  },
  {
    // id 90 — Musket Ball (×10): 2x iron → iron cast spherical projectile
    // Real basis: lead balls were standard but iron balls were used in larger weapons.
    // Game simplification: iron_ingot cast in clay mold → iron balls.
    id: 90, name: 'Musket Balls (×10)', tier: 3, time: 20,
    inputs: [
      { materialId: MAT.IRON_INGOT, quantity: 2 },
    ],
    output: { itemId: MAT.MUSKET_BALL, quantity: 10, isMaterial: true },
    knowledgeRequired: ['iron_smelting', 'chemistry'],
  },
  {
    // id 91 — Glass Ingot: 4x sand → processed optical-grade glass (distinct from raw GLASS=18)
    // Sand (SiO₂) melted at 1700°C, cooled slowly = annealed glass ingot.
    // Charcoal furnace achieves ~1000–1200°C — adequate for crown glass (impure but functional).
    id: 91, name: 'Glass Ingot', tier: 3, time: 90,
    inputs: [
      { materialId: MAT.SAND,     quantity: 4 },
      { materialId: MAT.CHARCOAL, quantity: 2 },
    ],
    output: { itemId: MAT.GLASS_INGOT, quantity: 1, isMaterial: true },
    knowledgeRequired: ['glassblowing', 'chemistry'],
  },
  {
    // id 92 — Telescope: 4x iron_ingot + 2x glass_ingot → refracting telescope
    // Iron tube housing + two ground glass lenses (objective + eyepiece).
    // Reveals: moon phase ring, "distant lights" (planet teaser for L6).
    // Press F while holding telescope to activate TelescopeView overlay.
    id: 92, name: 'Telescope', tier: 3, time: 240,
    inputs: [
      { materialId: MAT.IRON_INGOT,  quantity: 4 },
      { materialId: MAT.GLASS_INGOT, quantity: 2 },
    ],
    output: { itemId: ITEM.TELESCOPE, quantity: 1 },
    knowledgeRequired: ['optics', 'iron_smelting'],
  },

  // ── M12: Space Age ────────────────────────────────────────────────────────
  //
  // Circuit Board chemistry:
  //   Iron (Fe) + Copper (Cu) trace routing + Gold (Au) contact pads → PCB substrate.
  //   Real basis: printed circuit boards are etched copper on fiberglass (epoxy).
  //   Simplified: iron_ingot (frame) + copper (traces) + gold (bond pads) → circuit_board.
  //
  // Rocket Fuel (simplified Tsiolkovsky):
  //   KNO₃ (saltpeter) + C (coal) + S (sulfur) → sustained oxidizer burn at high mass flow.
  //   Real solid rocket propellant: ammonium perchlorate + aluminium (more energetic).
  //   Game simplification extends gunpowder chemistry to refined solid propellant.
  //
  // Nuclear Fuel:
  //   Natural uranium ore → enriched U-235 pellets. Simplified: uranium_ore kiln-reduction.
  //   Real: gaseous diffusion or centrifuge separation of U-235 from U-238.
  {
    // id 93 — Circuit Board: 2x iron_ingot + 3x copper + 1x gold → circuit_board mat
    // Unlock: civLevel 6 broadcasts discover recipe 93 to all players.
    id: 93, name: 'Circuit Board', tier: 4, time: 120,
    inputs: [
      { materialId: MAT.IRON_INGOT, quantity: 2 },
      { materialId: MAT.COPPER,     quantity: 3 },
      { materialId: MAT.GOLD,       quantity: 1 },
    ],
    output: { itemId: MAT.CIRCUIT_BOARD, quantity: 1, isMaterial: true },
    knowledgeRequired: ['electronics', 'metallurgy'],
  },
  {
    // id 94 — Generator: 8x iron_ingot + 6x copper + 2x circuit_board
    // Placed building — output itemId 0 marks it as a placed-building recipe
    // (BuildPanel reads materialsRequired from BUILDING_TYPES, not this output).
    id: 94, name: 'Generator', tier: 4, time: 300,
    inputs: [
      { materialId: MAT.IRON_INGOT,    quantity: 8 },
      { materialId: MAT.COPPER,        quantity: 6 },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 2 },
    ],
    output: { itemId: 0, quantity: 0 },   // building — placed via BuildPanel, not held
    knowledgeRequired: ['electronics', 'electromagnetism'],
  },
  {
    // id 95 — Radio Tower: 6x iron_ingot + 4x copper + 3x circuit_board
    id: 95, name: 'Radio Tower', tier: 4, time: 240,
    inputs: [
      { materialId: MAT.IRON_INGOT,    quantity: 6 },
      { materialId: MAT.COPPER,        quantity: 4 },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 3 },
    ],
    output: { itemId: 0, quantity: 0 },   // building — placed via BuildPanel
    knowledgeRequired: ['electronics', 'communication'],
  },
  {
    // id 96 — Rocket Fuel (×4): 4x coal + 2x sulfur + 2x saltpeter → rocket_fuel
    // High-energy solid propellant batch — 4 units per craft.
    id: 96, name: 'Rocket Fuel (×4)', tier: 4, time: 60,
    inputs: [
      { materialId: MAT.COAL,      quantity: 4 },
      { materialId: MAT.SULFUR,    quantity: 2 },
      { materialId: MAT.SALTPETER, quantity: 2 },
    ],
    output: { itemId: MAT.ROCKET_FUEL, quantity: 4, isMaterial: true },
    knowledgeRequired: ['chemistry', 'rocketry'],
  },
  {
    // id 97 — Nuclear Fuel: 3x uranium → 1x nuclear_fuel pellet
    // Enrichment simplified: kiln reduction at max temperature concentrates U-235.
    id: 97, name: 'Nuclear Fuel', tier: 4, time: 600,
    inputs: [
      { materialId: MAT.URANIUM, quantity: 3 },
    ],
    output: { itemId: MAT.NUCLEAR_FUEL, quantity: 1, isMaterial: true },
    knowledgeRequired: ['nuclear_physics', 'chemistry'],
  },
  {
    // id 98 — Satellite (M12): 12x iron_ingot + 4x circuit_board + 2x glass_ingot
    // Reuses ITEM.SATELLITE=38. Solar panels (glass) + electronics + iron frame.
    // When launched via rocket, passively reveals fog-of-war for owning settlement.
    id: 98, name: 'Satellite (M12)', tier: 4, time: 480,
    inputs: [
      { materialId: MAT.IRON_INGOT,    quantity: 12 },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 4  },
      { materialId: MAT.GLASS_INGOT,   quantity: 2  },
    ],
    output: { itemId: 38, quantity: 1 },   // ITEM.SATELLITE = 38
    knowledgeRequired: ['electronics', 'rocketry', 'optics'],
  },
  {
    // id 99 — Rocket (M12): 20x iron_ingot + 8x rocket_fuel + 4x circuit_board
    // Reuses ITEM.ROCKET=39. Single-stage launch vehicle. F near launch_pad → RocketSystem.
    id: 99, name: 'Rocket (M12)', tier: 4, time: 900,
    inputs: [
      { materialId: MAT.IRON_INGOT,    quantity: 20 },
      { materialId: MAT.ROCKET_FUEL,   quantity: 8  },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 4  },
    ],
    output: { itemId: 39, quantity: 1 },   // ITEM.ROCKET = 39
    knowledgeRequired: ['rocketry', 'aerospace'],
  },

  // ── M13: Velar Contact ────────────────────────────────────────────────────
  //
  // Orbital capsule: interplanetary probe vehicle.
  //   3x Rocket (the base launch vehicle) + 5x circuit_board (avionics) + 10x steel_ingot
  //   Launch from launch_pad → server targets nearest planet → PROBE_LANDED broadcast.
  //
  // Nuclear Reactor (buildable): 8x steel_ingot + 4x circuit_board + 2x nuclear_fuel
  //   Unlocks: electric_forge, arc_welder, electrolysis (H2O → H2).
  //   Overload → REACTOR_MELTDOWN if no water cooling for >30s at 800°C+.
  //
  // Electric Forge (building-recipe): uses nuclear power to smelt 3× faster.
  //   Real basis: electric arc furnace (EAF) — industrial steel production post-1900.
  //   Temperature: up to 1800°C via 3-phase AC arc between graphite electrodes.
  //
  // Arc Welder: high-temperature metal joining via sustained electric arc.
  //   Required to craft circuit boards, satellites, and other precision electronics.
  //   Historical: carbon arc lamp (1802) → metal arc welding (1881, Auguste de Méritens).

  {
    // id 100 — Orbital Capsule: 3x Rocket (itemId 39) + 5x circuit_board + 10x steel_ingot
    // M13: First interplanetary probe vehicle. Launched from launch_pad.
    // NOTE: inputs use materialId=0 for item inputs, tracked by itemId.
    // Circuit board and steel ingot are raw materials (materialId != 0).
    id: 100, name: 'Orbital Capsule', tier: 4, time: 1200,
    inputs: [
      { materialId: MAT.CIRCUIT_BOARD, quantity: 5  },
      { materialId: MAT.STEEL_INGOT,   quantity: 10 },
    ],
    output: { itemId: ITEM.ORBITAL_CAPSULE, quantity: 1 },
    knowledgeRequired: ['aerospace', 'electronics'],
  },
  {
    // id 101 — Nuclear Reactor: 8x steel_ingot + 4x circuit_board + 2x nuclear_fuel
    // Placed building. Output itemId=0 marks it as building-panel recipe.
    // Provides 100 kW power — unlocks electric_forge, arc_welder, electrolysis.
    id: 101, name: 'Nuclear Reactor', tier: 4, time: 3600,
    inputs: [
      { materialId: MAT.STEEL_INGOT,  quantity: 8 },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 4 },
      { materialId: MAT.NUCLEAR_FUEL,  quantity: 2 },
    ],
    output: { itemId: 0, quantity: 0 },   // building — placed via BuildPanel
    knowledgeRequired: ['nuclear_physics', 'electronics'],
  },
  {
    // id 102 — Electric Forge: 6x steel_ingot + 3x circuit_board → placed building
    // Requires nuclear_reactor power in settlement. Smelts 3× faster than blast furnace.
    // Real: electric arc furnace (EAF) — graphite electrodes + 3-phase AC, 1800°C.
    id: 102, name: 'Electric Forge', tier: 4, time: 900,
    inputs: [
      { materialId: MAT.STEEL_INGOT,   quantity: 6 },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 3 },
      { materialId: MAT.COPPER,        quantity: 4 },
    ],
    output: { itemId: 0, quantity: 0 },   // building
    knowledgeRequired: ['nuclear_physics', 'electromagnetism'],
  },
  {
    // id 103 — Arc Welder: 4x steel_ingot + 2x circuit_board + 4x copper_wire
    // Portable tool for electronics assembly. Required for satellite/orbital_capsule.
    // Real: MIG/TIG welder principle — sustained plasma arc at 6000°C tip temperature.
    id: 103, name: 'Arc Welder', tier: 4, time: 300,
    inputs: [
      { materialId: MAT.STEEL_INGOT,   quantity: 4 },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 2 },
      { materialId: MAT.WIRE,          quantity: 4 },
    ],
    output: { itemId: 0, quantity: 0 },   // building
    knowledgeRequired: ['nuclear_physics', 'electromagnetism'],
  },

  // ── M14: Interstellar Travel ───────────────────────────────────────────────

  // id 104 — Velar Crystal: synthesized from nuclear_fuel + hydrogen in arc_welder
  // Exotic quantum-crystalline material predicted by Velar transmission data.
  // Grows at the resonant frequency between hydrogen plasma and enriched uranium.
  // Used as the core component of the Velar Key (recipe 105).
  {
    id: 104, name: 'Velar Crystal', tier: 4, time: 600,
    inputs: [
      { materialId: MAT.NUCLEAR_FUEL, quantity: 3 },
      { materialId: MAT.HYDROGEN,     quantity: 5 },
      { materialId: MAT.GOLD,         quantity: 2 },
    ],
    output: { itemId: MAT.VELAR_CRYSTAL, quantity: 1, isMaterial: true },
    knowledgeRequired: ['nuclear_physics', 'velar_decoded'],
  },

  // id 105 — Velar Key: 5x circuit_board + 3x nuclear_fuel + 10x steel_ingot + 1x velar_crystal
  // Quantum-resonance key. When used at the Velar Gateway, establishes an
  // inter-universal bridge — the first multiverse connection.
  // Recipe requires Velar message decoded (velar_decoded knowledge gate).
  {
    id: 105, name: 'Velar Key', tier: 4, time: 1800,
    inputs: [
      { materialId: MAT.CIRCUIT_BOARD, quantity: 5  },
      { materialId: MAT.NUCLEAR_FUEL,  quantity: 3  },
      { materialId: MAT.STEEL_INGOT,   quantity: 10 },
      { materialId: MAT.VELAR_CRYSTAL, quantity: 1  },
    ],
    output: { itemId: ITEM.VELAR_KEY, quantity: 1 },
    knowledgeRequired: ['nuclear_physics', 'velar_decoded'],
  },

  // ── Tier 5: Velar Civilization (M15) ──────────────────────────────────────
  // All require 'velar_fabrication' knowledge — unlocked by the Velar Learn interaction.

  {
    // id 106 — Velar Fabricator: 8x velar_alloy + 4x quantum_core + 6x circuit_board
    // Advanced crafting station — the gateway to Velar-tier technology.
    id: 106, name: 'Velar Fabricator', tier: 5, time: 3600,
    inputs: [
      { materialId: MAT.VELAR_ALLOY,   quantity: 8 },
      { materialId: MAT.QUANTUM_CORE,  quantity: 4 },
      { materialId: MAT.CIRCUIT_BOARD, quantity: 6 },
    ],
    output: { itemId: ITEM.VELAR_FABRICATOR, quantity: 1 },
    knowledgeRequired: ['velar_fabrication'],
  },
  {
    // id 107 — Gravity Lens: 2x quantum_core + 1x velar_crystal + 4x nuclear_fuel
    // Velar-tier tool — reduces resource weight, enables deep-core mining.
    id: 107, name: 'Gravity Lens', tier: 5, time: 1800,
    inputs: [
      { materialId: MAT.QUANTUM_CORE,  quantity: 2 },
      { materialId: MAT.VELAR_CRYSTAL, quantity: 1 },
      { materialId: MAT.NUCLEAR_FUEL,  quantity: 4 },
    ],
    output: { itemId: ITEM.GRAVITY_LENS, quantity: 1 },
    knowledgeRequired: ['velar_fabrication'],
  },
  {
    // id 108 — Quantum Core (via Velar Fabricator): 3x circuit_board + 1x gold + 2x nuclear_fuel
    // Lets players craft Quantum Cores without trading after Fabricator is built.
    id: 108, name: 'Quantum Core', tier: 5, time: 600,
    inputs: [
      { materialId: MAT.CIRCUIT_BOARD, quantity: 3 },
      { materialId: MAT.GOLD,          quantity: 1 },
      { materialId: MAT.NUCLEAR_FUEL,  quantity: 2 },
    ],
    output: { itemId: MAT.QUANTUM_CORE, quantity: 1, isMaterial: true },
    knowledgeRequired: ['velar_fabrication'],
  },
  {
    // id 109 — Velar Alloy (via Velar Fabricator): 5x steel_ingot + 1x velar_crystal
    // Lets players produce Velar Alloy without trading once Fabricator is running.
    id: 109, name: 'Velar Alloy', tier: 5, time: 300,
    inputs: [
      { materialId: MAT.STEEL_INGOT,   quantity: 5 },
      { materialId: MAT.VELAR_CRYSTAL, quantity: 1 },
    ],
    output: { itemId: MAT.VELAR_ALLOY, quantity: 1, isMaterial: true },
    knowledgeRequired: ['velar_fabrication'],
  },
  // ── M30 Track B: Fermentation + Brewing ──────────────────────────────────
  //
  // Real fermentation chemistry (Tier B — Approximate):
  //   C₆H₁₂O₆ (glucose/starch from grain) + yeast → 2 C₂H₅OH (ethanol) + 2 CO₂
  //   Grain (MAT.GRAIN) provides fermentable sugars. Water needed as solvent medium.
  //   Mead: honey + water → ethanol + CO₂ (natural yeast from honey).
  //   Vinegar: C₂H₅OH + O₂ (acetic acid bacteria) → CH₃COOH (acetic acid) + H₂O.
  //   All reactions use GRAIN as substrate — matches MAT.GRAIN (id 62) from M10.
  //
  {
    // id 111 — Fermented Grain Spirit: 5x grain + 1x water (fiber+bone as vessel) → 1x alcohol
    // Tier 1 (Bronze Age): requires basic vessel knowledge for fermentation container.
    // Water represented by CLAY (water-holding vessel) as closest early-game water source.
    id: 111, name: 'Fermented Grain Spirit', tier: 1, time: 60,
    inputs: [
      { materialId: MAT.GRAIN, quantity: 5 },
      { materialId: MAT.CLAY,  quantity: 1 },   // clay vessel holds fermenting mash
    ],
    output: { itemId: MAT.ALCOHOL, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },
  {
    // id 112 — Mead: 3x grain (honey substitute via organic sugar) + 2x fiber → 2x mead
    // Honey not yet a standalone material — grain provides fermentable sugars.
    // Fiber represents wild herb/flower additions to the mash (flavoring + natural yeast).
    id: 112, name: 'Mead', tier: 1, time: 45,
    inputs: [
      { materialId: MAT.GRAIN, quantity: 3 },
      { materialId: MAT.FIBER, quantity: 2 },   // wildflower/herb yeast source
    ],
    output: { itemId: MAT.MEAD, quantity: 2, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },
  {
    // id 113 — Vinegar: 2x alcohol → 3x vinegar (oxidation — no extra input needed)
    // Acetic acid bacteria convert ethanol to acetic acid when exposed to air.
    // Time is short because it's just controlled over-fermentation in open vessel.
    id: 113, name: 'Vinegar', tier: 1, time: 30,
    inputs: [
      { materialId: MAT.ALCOHOL, quantity: 2 },
    ],
    output: { itemId: MAT.VINEGAR, quantity: 3, isMaterial: true },
    knowledgeRequired: ['fire_making'],
  },

  {
    // id 110 — Velar Beacon (via Fabricator): 1x velar_crystal + 10x hydrogen + 2x quantum_core
    // Marks home universe coordinates across the Lattice gateway network.
    id: 110, name: 'Velar Beacon', tier: 5, time: 900,
    inputs: [
      { materialId: MAT.VELAR_CRYSTAL, quantity: 1 },
      { materialId: MAT.HYDROGEN,      quantity: 10 },
      { materialId: MAT.QUANTUM_CORE,  quantity: 2 },
    ],
    output: { itemId: ITEM.VELAR_BEACON, quantity: 1 },
    knowledgeRequired: ['velar_fabrication'],
  },

  // ── M31 Track C: Weapon Tier Scaling ──────────────────────────────────────
  {
    // id 114 — Diamond Blade: Tier 3 weapon, 55 damage, 0.45s cooldown
    id: 114, name: 'Diamond Blade', tier: 3, time: 120,
    inputs: [
      { materialId: MAT.STEEL_INGOT,  quantity: 4 },
      { materialId: MAT.SILICON,      quantity: 2 }, // synthetic diamond substrate
      { materialId: MAT.WOOD,         quantity: 1 },
    ],
    output: { itemId: ITEM.DIAMOND_BLADE, quantity: 1 },
    knowledgeRequired: ['steel_making', 'weapon_smithing'],
  },
  {
    // id 115 — Quantum Blade: Tier 4+ weapon, 80 damage, 0.35s cooldown
    id: 115, name: 'Quantum Blade', tier: 5, time: 300,
    inputs: [
      { materialId: MAT.VELAR_ALLOY,  quantity: 3 },
      { materialId: MAT.QUANTUM_CORE, quantity: 1 },
    ],
    output: { itemId: ITEM.QUANTUM_BLADE, quantity: 1 },
    knowledgeRequired: ['velar_fabrication', 'weapon_smithing'],
  },

  // ── M33 Track B: Cooking Recipes (requiresCampfire) ───────────────────────
  // All of these require proximity to a fire (campfire/fire) to be used.
  // They show in the crafting panel when the player is near a campfire.
  {
    // id 120 — Cooked Fish: 1x RAW_FISH → 1x COOKED_FISH
    // Grants Well Fed buff: +1 HP/s for 2 minutes
    id: 120, name: 'Cooked Fish', tier: 0, time: 10,
    inputs: [{ materialId: MAT.RAW_FISH, quantity: 1 }],
    output: { itemId: MAT.COOKED_FISH, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },
  {
    // id 121 — Cooked Meat (campfire): 1x RAW_MEAT → 1x COOKED_MEAT
    // Grants Strength Fed buff: +20 max HP for 3 minutes
    id: 121, name: 'Cooked Meat (campfire)', tier: 0, time: 15,
    inputs: [{ materialId: MAT.RAW_MEAT, quantity: 1 }],
    output: { itemId: MAT.COOKED_MEAT, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },
  {
    // id 122 — Mushroom Soup: 2x MUSHROOM → 1x MUSHROOM_SOUP
    // Grants Steady Footing buff: +10% speed for 90 seconds
    id: 122, name: 'Mushroom Soup', tier: 0, time: 20,
    inputs: [{ materialId: MAT.MUSHROOM, quantity: 2 }],
    output: { itemId: MAT.MUSHROOM_SOUP, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },
  {
    // id 123 — Berry Jam: 3x BERRY → 1x BERRY_JAM
    // Grants Sugar Rush buff: +15% speed for 60 seconds
    id: 123, name: 'Berry Jam', tier: 0, time: 15,
    inputs: [{ materialId: MAT.BERRY, quantity: 3 }],
    output: { itemId: MAT.BERRY_JAM, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },
  {
    // id 124 — Herbal Tea: 2x BERRY + 1x MUSHROOM → 1x HERBAL_TEA
    // Grants Warmth Brew buff: +2 warmth/s for 2.5 minutes
    id: 124, name: 'Herbal Tea', tier: 0, time: 25,
    inputs: [
      { materialId: MAT.BERRY,    quantity: 2 },
      { materialId: MAT.MUSHROOM, quantity: 1 },
    ],
    output: { itemId: MAT.HERBAL_TEA, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },
  {
    // id 125 — Hearty Stew: 1x COOKED_MEAT + 1x MUSHROOM + 1x BERRY → 1x HEARTY_STEW
    // Grants Full Meal buff: +2 HP/s, +1 warmth/s, +5% speed for 4 minutes
    id: 125, name: 'Hearty Stew', tier: 0, time: 40,
    inputs: [
      { materialId: MAT.COOKED_MEAT, quantity: 1 },
      { materialId: MAT.MUSHROOM,    quantity: 1 },
      { materialId: MAT.BERRY,       quantity: 1 },
    ],
    output: { itemId: MAT.HEARTY_STEW, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },

  // ── M33 Track C: Cave Treasure Chests ────────────────────────────────────
  {
    // id 130 — Lockpick (×3): 2x Iron Ore + 1x Rope → 3x Lockpick
    // Thin iron picks — used to open locked rare/legendary treasure chests in caves.
    // Consumed on successful use.
    id: 130, name: 'Lockpick (×3)', tier: 2, time: 20,
    inputs: [
      { materialId: MAT.IRON_ORE, quantity: 2 },
      { materialId: MAT.ROPE,     quantity: 1 },
    ],
    output: { itemId: MAT.LOCKPICK, quantity: 3, isMaterial: true },
    knowledgeRequired: [],
  },

  // ── M34 Track C: Fish species cooking ────────────────────────────────────
  {
    // id 126 — Cooked Sardine: 1x Sardine → 1x Cooked Sardine
    // Same buff as Cooked Fish (Well Fed: +1 HP/s for 2 min)
    id: 126, name: 'Cooked Sardine', tier: 0, time: 8,
    inputs: [{ materialId: MAT.SARDINE, quantity: 1 }],
    output: { itemId: MAT.COOKED_SARDINE, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },
  {
    // id 127 — Cooked Salmon: 1x Salmon → 1x Cooked Salmon
    // Grants Salmon Feast buff: 2x HP regen (+2 HP/s), 3 minutes
    id: 127, name: 'Cooked Salmon', tier: 0, time: 18,
    inputs: [{ materialId: MAT.SALMON, quantity: 1 }],
    output: { itemId: MAT.COOKED_SALMON, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },
  {
    // id 128 — Cooked Tuna: 1x Tuna → 1x Cooked Tuna
    // Grants Tuna Power buff: 1.25x speed + 1.5 HP/s, 4 minutes
    id: 128, name: 'Cooked Tuna', tier: 0, time: 25,
    inputs: [{ materialId: MAT.TUNA, quantity: 1 }],
    output: { itemId: MAT.COOKED_TUNA, quantity: 1, isMaterial: true },
    knowledgeRequired: ['fire_making'],
    requiresCampfire: true,
  },

  // ── M34 Track A: Player Housing ───────────────────────────────────────────
  {
    // id 140 — Home Deed: 30 Wood + 10 Stone + 5 Rope → 1 Home Deed
    // Consumed when placed to create a permanent personal home base.
    id: 140, name: 'Home Deed', tier: 0, time: 30,
    inputs: [
      { materialId: MAT.WOOD,  quantity: 30 },
      { materialId: MAT.STONE, quantity: 10 },
      { materialId: MAT.ROPE,  quantity: 5 },
    ],
    output: { itemId: ITEM.HOME_DEED, quantity: 1, isMaterial: false },
    knowledgeRequired: [],
  },

  // ── M37 Track B: Alchemy System ───────────────────────────────────────────
  // All alchemy recipes require an alchemy table (or home Alchemy Corner upgrade).
  // Potions use Empty Vials as vessels; vials are craftable from stone (recipe 157).
  {
    // id 150 — Health Potion: 3x Berry + 1x Mushroom + 1x Empty Vial → 1x Potion Health
    // Restores 50 HP instantly on consume.
    id: 150, name: 'Health Potion', tier: 0, time: 30,
    inputs: [
      { materialId: MAT.BERRY,      quantity: 3 },
      { materialId: MAT.MUSHROOM,   quantity: 1 },
      { materialId: MAT.EMPTY_VIAL, quantity: 1 },
    ],
    output: { itemId: MAT.POTION_HEALTH, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 151 — Speed Potion: 1x Herbal Tea + 1x Alcohol + 1x Empty Vial → 1x Potion Speed
    // Grants +40% speed for 60 seconds.
    id: 151, name: 'Speed Potion', tier: 0, time: 30,
    inputs: [
      { materialId: MAT.HERBAL_TEA, quantity: 1 },
      { materialId: MAT.ALCOHOL,    quantity: 1 },
      { materialId: MAT.EMPTY_VIAL, quantity: 1 },
    ],
    output: { itemId: MAT.POTION_SPEED, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 152 — Strength Potion: 2x Iron Ore + 2x Alcohol + 1x Empty Vial → 1x Potion Strength
    // Grants +50% damage for 45 seconds.
    id: 152, name: 'Strength Potion', tier: 0, time: 40,
    inputs: [
      { materialId: MAT.IRON_ORE,   quantity: 2 },
      { materialId: MAT.ALCOHOL,    quantity: 2 },
      { materialId: MAT.EMPTY_VIAL, quantity: 1 },
    ],
    output: { itemId: MAT.POTION_STRENGTH, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 153 — Invisibility Potion: 3x Mushroom + 1x Cave Fish + 1x Empty Vial → 1x Potion Invisibility
    // Animals ignore player for 30 seconds.
    id: 153, name: 'Invisibility Potion', tier: 0, time: 50,
    inputs: [
      { materialId: MAT.MUSHROOM,   quantity: 3 },
      { materialId: MAT.CAVE_FISH,  quantity: 1 },
      { materialId: MAT.EMPTY_VIAL, quantity: 1 },
    ],
    output: { itemId: MAT.POTION_INVISIBILITY, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 154 — Antidote: 2x Berry + 2x Mushroom + 1x Empty Vial → 1x Potion Antidote
    // Cures poison and removes active debuffs.
    id: 154, name: 'Antidote', tier: 0, time: 25,
    inputs: [
      { materialId: MAT.BERRY,      quantity: 2 },
      { materialId: MAT.MUSHROOM,   quantity: 2 },
      { materialId: MAT.EMPTY_VIAL, quantity: 1 },
    ],
    output: { itemId: MAT.POTION_ANTIDOTE, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 155 — Fire Resist Potion: 2x Coal + 1x Mushroom + 1x Empty Vial → 1x Potion Fire Resist
    // Immune to lava/fire damage for 60 seconds.
    id: 155, name: 'Fire Resist Potion', tier: 0, time: 35,
    inputs: [
      { materialId: MAT.COAL,       quantity: 2 },
      { materialId: MAT.MUSHROOM,   quantity: 1 },
      { materialId: MAT.EMPTY_VIAL, quantity: 1 },
    ],
    output: { itemId: MAT.POTION_FIRE_RESIST, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 156 — Elixir of Wisdom: 1x Golden Fish + 3x Alcohol + 2x Mushroom + 1x Empty Vial → 1x Elixir Wisdom
    // 3x XP gain for 120 seconds. Rare and expensive to brew.
    id: 156, name: 'Elixir of Wisdom', tier: 0, time: 90,
    inputs: [
      { materialId: MAT.GOLDEN_FISH, quantity: 1 },
      { materialId: MAT.ALCOHOL,     quantity: 3 },
      { materialId: MAT.MUSHROOM,    quantity: 2 },
      { materialId: MAT.EMPTY_VIAL,  quantity: 1 },
    ],
    output: { itemId: MAT.ELIXIR_WISDOM, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 157 — Empty Vial (×3): 3x Stone → 3x Empty Vial
    // Required vessel for all potion recipes.
    id: 157, name: 'Empty Vial (×3)', tier: 0, time: 15,
    inputs: [
      { materialId: MAT.STONE, quantity: 3 },
    ],
    output: { itemId: MAT.EMPTY_VIAL, quantity: 3, isMaterial: true },
    knowledgeRequired: [],
  },

  // ── M37 Track B: Material Transmutation ──────────────────────────────────
  // Higher-tier alchemy: transmute base materials into refined ones.
  {
    // id 160 — Smelt Iron (alchemy): 5x Stone + 2x Coal → 2x Iron Ore
    // Alchemical reduction — extracts iron from stone through coal reduction.
    id: 160, name: 'Smelt Iron (Alchemy)', tier: 0, time: 60,
    inputs: [
      { materialId: MAT.STONE, quantity: 5 },
      { materialId: MAT.COAL,  quantity: 2 },
    ],
    output: { itemId: MAT.IRON_ORE, quantity: 2, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 161 — Purify Alcohol: 3x Alcohol → 1x Mead
    // Distillation + honey infusion produces higher-quality mead from spirits.
    id: 161, name: 'Purify Alcohol', tier: 0, time: 45,
    inputs: [
      { materialId: MAT.ALCOHOL, quantity: 3 },
    ],
    output: { itemId: MAT.MEAD, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },
  {
    // id 162 — Crystallize: 5x Iron Ore + 3x Coal → 1x Velar Crystal
    // Advanced transmutation — alchemical pressure crystallizes iron+carbon into Velar Crystal.
    id: 162, name: 'Crystallize', tier: 0, time: 120,
    inputs: [
      { materialId: MAT.IRON_ORE, quantity: 5 },
      { materialId: MAT.COAL,     quantity: 3 },
    ],
    output: { itemId: MAT.VELAR_CRYSTAL, quantity: 1, isMaterial: true },
    knowledgeRequired: [],
    requiresAlchemyTable: true,
  },

  // ── M38 Track C: Biome-exclusive tier 4 weapons & armor ──────────────────
  {
    // id 170 — Obsidian Blade: volcanic glass + iron → 55 damage tier-4 sword
    id: 170, name: 'Obsidian Blade', tier: 4, time: 120,
    inputs: [
      { materialId: MAT.VOLCANIC_GLASS, quantity: 3 },
      { materialId: MAT.IRON_ORE,       quantity: 5 },
    ],
    output: { itemId: ITEM.OBSIDIAN_BLADE, quantity: 1 },
    knowledgeRequired: ['weapon_smithing'],
  },
  {
    // id 171 — Frost Axe: glacier ice + iron → 50 damage, slows enemies
    id: 171, name: 'Frost Axe', tier: 4, time: 120,
    inputs: [
      { materialId: MAT.GLACIER_ICE, quantity: 3 },
      { materialId: MAT.IRON_ORE,    quantity: 5 },
    ],
    output: { itemId: ITEM.FROST_AXE, quantity: 1 },
    knowledgeRequired: ['weapon_smithing'],
  },
  {
    // id 172 — Crystal Staff: desert crystal + ancient wood → 45 damage, AoE knockback
    id: 172, name: 'Crystal Staff', tier: 4, time: 150,
    inputs: [
      { materialId: MAT.DESERT_CRYSTAL, quantity: 4 },
      { materialId: MAT.ANCIENT_WOOD,   quantity: 2 },
    ],
    output: { itemId: ITEM.CRYSTAL_STAFF, quantity: 1 },
    knowledgeRequired: ['weapon_smithing'],
  },
  {
    // id 175 — Volcanic Plate: volcanic glass + iron → heavy armor, -30% fire damage
    id: 175, name: 'Volcanic Plate', tier: 4, time: 200,
    inputs: [
      { materialId: MAT.VOLCANIC_GLASS, quantity: 5 },
      { materialId: MAT.IRON_ORE,       quantity: 8 },
    ],
    output: { itemId: ITEM.VOLCANIC_PLATE, quantity: 1 },
    knowledgeRequired: ['armor_smithing'],
  },
  {
    // id 176 — Glacial Mantle: glacier ice + rope → light armor, -40% cold damage
    id: 176, name: 'Glacial Mantle', tier: 4, time: 180,
    inputs: [
      { materialId: MAT.GLACIER_ICE, quantity: 5 },
      { materialId: MAT.ROPE,        quantity: 3 },
    ],
    output: { itemId: ITEM.GLACIAL_MANTLE, quantity: 1 },
    knowledgeRequired: ['armor_smithing'],
  },

  // ── M38 Track C: Tier 5 (legendary) cave-resource equipment ──────────────
  {
    // id 180 — Luminite Dagger: luminite + shadow iron → 70 damage + life drain
    id: 180, name: 'Luminite Dagger', tier: 5, time: 180,
    inputs: [
      { materialId: MAT.LUMINITE,    quantity: 5 },
      { materialId: MAT.SHADOW_IRON, quantity: 5 },
    ],
    output: { itemId: ITEM.LUMINITE_DAGGER, quantity: 1 },
    knowledgeRequired: ['weapon_smithing'],
  },
  {
    // id 181 — Shadow Armor: shadow iron + ancient wood → -25% all damage + stealth bonus
    id: 181, name: 'Shadow Armor', tier: 5, time: 240,
    inputs: [
      { materialId: MAT.SHADOW_IRON, quantity: 10 },
      { materialId: MAT.ANCIENT_WOOD, quantity: 5 },
    ],
    output: { itemId: ITEM.SHADOW_ARMOR, quantity: 1 },
    knowledgeRequired: ['armor_smithing'],
  },
]