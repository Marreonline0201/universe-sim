export interface InventorySlot {
  itemId: number
  materialId: number
  quantity: number
  quality: number  // 0-1
  rarity?: number  // 0=Common, 1=Uncommon, 2=Rare, 3=Epic, 4=Legendary (defaults to 0)
}

// ── Rarity System ──────────────────────────────────────────────────────────
export const RARITY = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 } as const
export type RarityTier = 0 | 1 | 2 | 3 | 4

export const RARITY_NAMES: Record<RarityTier, string> = {
  0: 'Common', 1: 'Uncommon', 2: 'Rare', 3: 'Epic', 4: 'Legendary',
}

export const RARITY_COLORS: Record<RarityTier, string> = {
  0: '#9d9d9d', 1: '#1eff00', 2: '#0070dd', 3: '#a335ee', 4: '#ff8000',
}

/** Roll rarity for a crafted item based on recipe tier + crafting skill level (0-10). */
export function rollCraftRarity(recipeTier: number, craftingSkillLevel: number): RarityTier {
  if (recipeTier <= 1) return 0
  const r = Math.random() * 100
  const bonus = craftingSkillLevel * 2 // +2% per skill level to non-Common
  if (recipeTier <= 3) {
    // Tier 2-3: 80% Common, 15% Uncommon, 5% Rare (before bonus)
    if (r < 5 + bonus * 0.5) return 2
    if (r < 20 + bonus) return 1
    return 0
  }
  // Tier 4+: 50% Common, 30% Uncommon, 15% Rare, 4% Epic, 1% Legendary
  if (r < 1 + bonus * 0.2) return 4
  if (r < 5 + bonus * 0.5) return 3
  if (r < 20 + bonus) return 2
  if (r < 50 + bonus * 1.5) return 1
  return 0
}

export interface CraftingRecipe {
  id: number
  name: string
  tier: number  // civilization tier required (0-9)
  inputs: Array<{ materialId: number; quantity: number }>
  output: { itemId: number; quantity: number; isMaterial?: boolean }
  knowledgeRequired: string[]  // discovery IDs player must have
  time: number  // seconds to craft
  requiresCampfire?: boolean  // M33: cooking recipes require proximity to a campfire/fire
}

const SLOT_COUNT = 40

// MATERIAL_OUTPUT_IDS was the old discriminator — replaced by recipe.output.isMaterial flag.
// MAT and ITEM IDs share the same numeric space (both 1-46), so set-based lookup caused
// items whose IDs collided with material IDs to be stored as raw materials. The explicit
// isMaterial flag on each recipe output is the correct fix.
// Kept here only for reference; no longer consulted by craft().
const MATERIAL_OUTPUT_IDS = new Set([10, 13, 15, 16, 18, 19, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 37, 40, 41])

export class Inventory {
  private slots: (InventorySlot | null)[] = new Array(SLOT_COUNT).fill(null)
  private knownRecipes: Set<number> = new Set()
  private _godMode = false

  /** Admin god mode: removeItem never depletes, addItem never fails. */
  setGodMode(on: boolean) { this._godMode = on }
  isGodMode() { return this._godMode }

  /**
   * Check if an item can be added to the inventory WITHOUT actually adding it.
   * Used by craft() to validate output can fit before consuming inputs (B-19 fix).
   */
  canAddItem(slot: InventorySlot): boolean {
    // Try to stack onto existing matching slot (rarity must also match)
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      if (s && s.itemId === slot.itemId && s.materialId === slot.materialId && Math.abs(s.quality - slot.quality) < 0.01 && (s.rarity ?? 0) === (slot.rarity ?? 0)) {
        return true  // Can stack
      }
    }
    // Find empty slot within current size
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        return true  // Empty slot available
      }
    }
    // God mode: expand slots beyond the normal 40-slot limit
    if (this._godMode) {
      return true
    }
    return false  // No space available
  }

  /**
   * Add an item to the first available slot, or stack onto an existing slot
   * with the same itemId + materialId + quality.
   * Returns true if the item was accepted, false if inventory is full.
   */
  addItem(slot: InventorySlot): boolean {
    // Try to stack onto existing matching slot (rarity must also match)
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      if (s && s.itemId === slot.itemId && s.materialId === slot.materialId && Math.abs(s.quality - slot.quality) < 0.01 && (s.rarity ?? 0) === (slot.rarity ?? 0)) {
        s.quantity += slot.quantity
        return true
      }
    }
    // Find empty slot within current size
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { ...slot }
        return true
      }
    }
    // God mode: expand slots beyond the normal 40-slot limit
    if (this._godMode) {
      this.slots.push({ ...slot })
      return true
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
    if (this._godMode) return true   // god mode: items never actually consumed
    s.quantity -= quantity
    if (s.quantity <= 0) this.slots[slotIndex] = null
    return true
  }

  /**
   * Attempt to craft a recipe.
   * Checks: recipe known, all inputs present in sufficient quantity, tier met.
   * Consumes inputs and adds output.
   * FIXED (B-19): Validates output can fit BEFORE consuming inputs to prevent resource loss.
   * NOTE (M28-C3): Recipe lookup moved to caller so CRAFTING_RECIPES can live in a
   * separate chunk (CraftingRecipes.ts) and not inflate the main bundle.
   */
  craft(recipe: CraftingRecipe | undefined, currentTier = 0): boolean {
    if (!recipe) return false

    if (!this._godMode) {
      // Normal mode: require recipe knowledge, tier, and materials
      if (recipe.knowledgeRequired.length > 0 && !this.knownRecipes.has(recipeId)) return false
      if (currentTier < recipe.tier) return false
      for (const input of recipe.inputs) {
        if (this.countMaterial(input.materialId) < input.quantity) return false
      }
    }

    // B-19 FIX: Validate output can fit BEFORE consuming inputs
    const isMaterialOutput = recipe.output.isMaterial === true
    const outputSlot: InventorySlot = {
      itemId:     isMaterialOutput ? 0 : recipe.output.itemId,
      materialId: isMaterialOutput ? recipe.output.itemId : 0,
      quantity:   recipe.output.quantity,
      quality:    0.7,
    }
    if (!this.canAddItem(outputSlot)) {
      return false  // Output won't fit; abort without consuming inputs
    }

    // Consume inputs (skipped in god mode — materials never depleted)
    // Only consume raw-material slots (itemId === 0) — never consume equipped items.
    if (!this._godMode) {
      for (const input of recipe.inputs) {
        let remaining = input.quantity
        for (let i = 0; i < this.slots.length && remaining > 0; i++) {
          const s = this.slots[i]
          if (s && s.itemId === 0 && s.materialId === input.materialId) {
            const take = Math.min(s.quantity, remaining)
            s.quantity -= take
            remaining  -= take
            if (s.quantity <= 0) this.slots[i] = null
          }
        }
      }
    }

    // Add output (now guaranteed to succeed because we validated above)
    return this.addItem(outputSlot)
  }

  /** Remove items unconditionally — used for Drop (bypasses god mode protection). */
  dropItem(slotIndex: number, quantity: number): boolean {
    const s = this.slots[slotIndex]
    if (!s || s.quantity < quantity) return false
    s.quantity -= quantity
    if (s.quantity <= 0) this.slots[slotIndex] = null
    return true
  }

  /** Remove items for building/crafting — bypasses god mode so resources are always consumed. */
  removeItemForce(slotIndex: number, quantity: number): boolean {
    const s = this.slots[slotIndex]
    if (!s || s.quantity < quantity) return false
    s.quantity -= quantity
    if (s.quantity <= 0) this.slots[slotIndex] = null
    return true
  }

  discoverRecipe(recipeId: number): void {
    this.knownRecipes.add(recipeId)
  }

  /** Restore inventory from a serialized slot list (e.g. from DB). Clears current slots first. */
  loadSlots(items: Array<{ index: number; slot: InventorySlot }>): void {
    const needed = items.reduce((max, { index }) => Math.max(max, index + 1), SLOT_COUNT)
    this.slots = new Array(Math.max(needed, SLOT_COUNT)).fill(null)
    for (const { index, slot } of items) {
      this.slots[index] = { ...slot }
    }
  }

  /** Restore known recipes from a serialized list. */
  loadKnownRecipes(ids: number[]): void {
    this.knownRecipes = new Set(ids)
  }

  getSlot(i: number): InventorySlot | null {
    return this.slots[i] ?? null
  }

  get slotCount(): number {
    return this.slots.length
  }

  /** Returns slot index of first raw-material slot containing materialId, or -1.
   *  Skips slots with itemId > 0 (those are manufactured items, not raw materials). */
  findItem(materialId: number): number {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]
      if (s && s.materialId === materialId && s.itemId === 0) return i
    }
    return -1
  }

  /** Returns total quantity of a raw material across all slots. */
  countMaterial(materialId: number): number {
    let total = 0
    for (const s of this.slots) {
      if (s && s.itemId === 0 && s.materialId === materialId) total += s.quantity
    }
    return total
  }

  /** Returns true if any slot contains an item with the given itemId. */
  hasItemById(itemId: number): boolean {
    for (let i = 0; i < this.slots.length; i++) {
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
    for (let i = 0; i < this.slots.length; i++) {
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
  URANIUM: 39, PLUTONIUM: 40, COOKED_MEAT: 41,
  RAW_MEAT: 42, IRON_INGOT: 43,
  // ── M8: Steel Age ────────────────────────────────────────────────────────
  STEEL_INGOT: 44,       // quenched, full-quality steel (0.2–2.1% C)
  CAST_IRON_INGOT: 45,   // brittle cast iron (>2.1% C) — cheaper but weaker
  HOT_STEEL_INGOT: 46,   // intermediate: must be quenched within 30s
  SOFT_STEEL: 47,        // hot steel that missed quench window (50% quality penalty)
  // ── M9: Animal drops ─────────────────────────────────────────────────────
  WOLF_PELT: 57,         // skinned from killed wolf — crafting: warm clothing
  BOAR_TUSK: 58,         // dropped by boar on death — crafting: tusk tools
  // ── M10: Trade economy + sailing ─────────────────────────────────────────
  COPPER_COIN: 59,       // currency — minted from copper ingots, universal exchange medium
  FISH: 60,              // caught by fishing_rod — food source and trade commodity
  SALT: 61,              // gathered/traded at coastal settlements — preserves food
  GRAIN: 62,             // produced by plains settlements — staple food
  // ── M11: Civilization Age ────────────────────────────────────────────────
  GLASS_INGOT: 63,       // sand+heat processed glass ingot — telescope lens substrate
  MUSKET_BALL: 64,       // iron-cast ammunition for musket — 10 per craft
  // ── M12: Space Age ───────────────────────────────────────────────────────
  ROCKET_FUEL: 65,       // coal+sulfur+saltpeter refined propellant — launch pad feedstock
  CIRCUIT_BOARD: 66,     // iron+copper+gold semiconductor substrate — electronics foundation
  NUCLEAR_FUEL: 67,      // enriched uranium pellets — nuclear_reactor feedstock
  // ── M13: Velar Contact ───────────────────────────────────────────────────
  HYDROGEN: 68,          // electrolysis product (H2O → H2 + ½O2). First hydrogen fuel.
  // ── M14: Interstellar Travel ─────────────────────────────────────────────
  VELAR_CRYSTAL: 69,     // exotic crystalline material from Velar probe data — gateway component
  // ── M15: Velar Civilization ─────────────────────────────────────────────
  VELAR_ALLOY: 70,       // Velar-transmuted steel — trade item, used in Velar Fabricator
  QUANTUM_CORE: 71,      // Velar-recrystallized silicon — advanced CPU for Velar tech
  // ── M30 Track B: Fermentation system ────────────────────────────────────
  ALCOHOL: 72,           // fermented grain spirit — restores 5 warmth, reduces pain
  MEAD: 73,              // honey wine — restores 8 warmth, 10 hunger
  VINEGAR: 74,           // over-fermented alcohol — preservative, crafting ingredient
  // ── M31 Track C: Ranged combat ───────────────────────────────────────────
  ARROW_AMMO: 75,        // crafted arrows — consumed per bow shot, stackable raw material
  // ── M33 Track B: Cooking + Food Buffs ────────────────────────────────────
  RAW_FISH: 76,          // caught via fishing rod (extends FISH with buff-system support)
  COOKED_FISH: 77,       // cooked RAW_FISH at campfire — grants Well Fed buff (hp regen)
  MUSHROOM: 78,          // gatherable in cave/forest biome — cooking ingredient
  MUSHROOM_SOUP: 79,     // 2x mushroom at campfire — Steady Footing buff (+10% speed)
  BERRY_JAM: 80,         // 3x berry at campfire — Sugar Rush buff (+15% speed, short)
  BERRY: 81,             // gatherable berry — used in jam, tea, stew
  HERBAL_TEA: 82,        // 2x berry + 1x mushroom at campfire — Warmth Brew buff
  HEARTY_STEW: 83,       // cooked_meat + mushroom + berry at campfire — Full Meal buff
  // ── M33 Track C: Cave treasure chests ────────────────────────────────────
  LOCKPICK: 90,          // thin iron pick — opens locked treasure chests; consumed on use
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
  BEDROLL: 47, COPPER_KNIFE: 48,
  IRON_KNIFE: 49, IRON_AXE: 50, IRON_PICKAXE: 51,
  // ── M8: Steel Age tools & items ──────────────────────────────────────────
  STEEL_SWORD_M8: 52,    // 2.5× iron damage, reaches max quality at lower smithingXp
  STEEL_CHESTPLATE: 53,  // armor: absorbs 40% incoming damage, equippable in armor slot
  STEEL_CROSSBOW: 54,    // ranged, ballistic arc, 30m effective range
  CAST_IRON_POT: 55,     // cooking vessel: cooks food 2× faster than campfire
  CAST_IRON_DOOR: 56,    // building component: fire-resistant, high HP
  // ── M9: Hunting gear ─────────────────────────────────────────────────────
  BONE_NEEDLE: 57,       // crafting component: bone → bone_needle → leather_armor
  LEATHER_ARMOR: 58,     // light armor: 10% damage reduction, lighter than steel
  // ── M10: Sailing + Navigation ─────────────────────────────────────────────
  RAFT: 59,              // basic water vessel: moves with wind + paddle force
  SAILING_BOAT: 60,      // advanced vessel: can tack upwind up to 45° off wind
  COMPASS: 61,           // navigation tool: shows cardinal directions on HUD
  FISHING_ROD: 62,       // cast from water or riverbank — F key to fish
  // ── M11: Civilization Age ────────────────────────────────────────────────
  MUSKET: 63,            // first ranged firearm — iron barrel + gunpowder charge, 8s reload
  TELESCOPE: 64,         // astronomy instrument — reveals moon, planets, L6 teaser
  // ── M12: Space Age ───────────────────────────────────────────────────────
  // Note: SATELLITE (38) and ROCKET (39) already exist in Tier 7 stubs above.
  // Reuse those IDs — M12 makes them craftable via new recipes 98-99.
  // New M12-specific items that don't conflict:
  ARTILLERY_SHELL: 65,   // ballistic projectile — ArtillerySystem splash damage radius 8m
  // ── M13: Velar Contact ───────────────────────────────────────────────────
  ORBITAL_CAPSULE: 66,   // interplanetary probe vehicle — recipes 100
  // ── M14: Interstellar Travel ─────────────────────────────────────────────
  VELAR_KEY: 67,         // quantum-resonance key — activates the Velar Gateway (recipe 105)
  // ── M15: Velar Civilization ─────────────────────────────────────────────
  VELAR_BEACON: 68,      // resonance marker — broadcasts home universe coordinates across Lattice
  VELAR_FABRICATOR: 69,  // advanced crafting station — unlocks Velar-tier fabrication
  GRAVITY_LENS: 70,      // Velar-tier tool — reduces resource weight, enables deep-core mining
  // ── M31 Track C: Weapon tier scaling ─────────────────────────────────────
  DIAMOND_BLADE: 71,     // Tier 3 weapon — 55 damage, 0.45s cooldown
  QUANTUM_BLADE: 72,     // Tier 4+ weapon — 80 damage, 0.35s cooldown
} as const