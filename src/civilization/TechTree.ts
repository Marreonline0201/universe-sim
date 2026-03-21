export interface TechNode {
  id: string
  name: string
  tier: number             // 0-9
  prerequisites: string[]
  epCost: number           // evolution points / research points
  researchTime: number     // simulation seconds
  description: string
  unlocks: string[]        // ability/building/item IDs
  historicalAnalog: string // real-world equivalent
}

/**
 * 10 civilization tiers with 150 tech nodes:
 *   0: Stone Age       — fire, tools, shelter, language
 *   1: Bronze Age      — metallurgy, agriculture, writing, pottery
 *   2: Iron Age        — advanced metals, roads, currency, mathematics
 *   3: Classical       — science, philosophy, engineering, medicine
 *   4: Medieval        — water/wind power, optics, printing, trade
 *   5: Industrial      — steam, electricity, chemistry, railroads
 *   6: Modern          — nuclear, computing, genetics, aviation
 *   7: Information     — AI, internet, biotechnology, space
 *   8: Fusion          — fusion energy, nanotechnology, megastructures
 *   9: Simulation      — can create sub-universes, control physical constants
 */
export class TechTree {
  private researched = new Set<string>()
  private inProgress: Map<string, { startTime: number; endTime: number }> = new Map()
  private _godMode = false

  setGodMode(on: boolean) { this._godMode = on }
  isGodMode() { return this._godMode }

  /**
   * Start researching a node. Returns true on success.
   * In god mode: bypasses prerequisites and completes instantly.
   */
  startResearch(nodeId: string, simTime: number): boolean {
    const node = TECH_NODES.find(n => n.id === nodeId)
    if (!node) return false
    if (this.researched.has(nodeId)) return false
    if (this.inProgress.has(nodeId)) return false
    if (this._godMode) {
      // Instant research — no prerequisites, no wait
      this.researched.add(nodeId)
      return true
    }
    for (const req of node.prerequisites) {
      if (!this.researched.has(req)) return false
    }
    this.inProgress.set(nodeId, {
      startTime: simTime,
      endTime: simTime + node.researchTime,
    })
    return true
  }

  /**
   * Advance research. Call every tick with current sim time.
   * Returns array of newly completed node IDs.
   */
  tickResearch(simTime: number): string[] {
    const completed: string[] = []
    for (const [nodeId, progress] of this.inProgress) {
      if (simTime >= progress.endTime) {
        this.researched.add(nodeId)
        this.inProgress.delete(nodeId)
        completed.push(nodeId)
      }
    }
    return completed
  }

  isResearched(nodeId: string): boolean {
    return this.researched.has(nodeId)
  }

  /** Immediately mark a node as researched (used for world-event unlocks, e.g. Iron Age spreading). */
  markResearched(nodeId: string): void {
    this.researched.add(nodeId)
    this.inProgress.delete(nodeId)
  }

  isInProgress(nodeId: string): boolean {
    return this.inProgress.has(nodeId)
  }

  getProgress(nodeId: string, simTime: number): number {
    const p = this.inProgress.get(nodeId)
    if (!p) return 0
    const node = TECH_NODES.find(n => n.id === nodeId)
    if (!node || node.researchTime === 0) return 1
    return Math.min(1, (simTime - p.startTime) / node.researchTime)
  }

  /** Returns the highest fully-researched tier. */
  getCurrentTier(): number {
    let tier = 0
    for (const nodeId of this.researched) {
      const node = TECH_NODES.find(n => n.id === nodeId)
      if (node && node.tier > tier) tier = node.tier
    }
    return tier
  }

  /** Returns nodes all of whose prerequisites are researched and which haven't started. */
  getAvailable(): TechNode[] {
    return TECH_NODES.filter(n =>
      !this.researched.has(n.id) &&
      !this.inProgress.has(n.id) &&
      n.prerequisites.every(req => this.researched.has(req))
    )
  }

  getResearched(): TechNode[] {
    return TECH_NODES.filter(n => this.researched.has(n.id))
  }

  getResearchedIds(): string[] {
    return Array.from(this.researched)
  }

  /** Restore researched nodes from a saved list of IDs. */
  loadResearched(ids: string[]): void {
    this.researched = new Set(ids)
    // Remove any in-progress nodes that are now already researched
    for (const id of ids) this.inProgress.delete(id)
  }

  /** Serialize all in-progress research for persistence. */
  getInProgressData(): Array<{ nodeId: string; startTime: number; endTime: number }> {
    return Array.from(this.inProgress.entries()).map(([nodeId, { startTime, endTime }]) => ({
      nodeId, startTime, endTime,
    }))
  }

  /** Restore in-progress research from persisted data. */
  loadInProgress(data: Array<{ nodeId: string; startTime: number; endTime: number }>): void {
    this.inProgress = new Map(
      data
        .filter(d => !this.researched.has(d.nodeId))  // skip already-researched nodes
        .map(({ nodeId, startTime, endTime }) => [nodeId, { startTime, endTime }])
    )
  }

  getInProgress(): Array<TechNode & { progress: number }> {
    return []  // populated by caller with getProgress()
  }
}

// ── Tech Nodes — 150 nodes spanning tiers 0-9 ────────────────────────────────

export const TECH_NODES: TechNode[] = [
  // ── Tier 0: Stone Age ─────────────────────────────────────────────────────
  {
    id: 'fire', name: 'Fire Making', tier: 0,
    prerequisites: [], epCost: 10, researchTime: 100,
    description: 'Control fire for warmth, cooking, and light.',
    unlocks: ['cooking', 'torch', 'fire_hardening'],
    historicalAnalog: 'Homo erectus fire use ~1 Ma',
  },
  {
    id: 'stone_tools', name: 'Stone Knapping', tier: 0,
    prerequisites: [], epCost: 5, researchTime: 50,
    description: 'Shape flint and obsidian into sharp tools.',
    unlocks: ['stone_axe', 'stone_knife', 'scraper'],
    historicalAnalog: 'Oldowan tool industry ~2.6 Ma',
  },
  {
    id: 'shelter', name: 'Shelter Construction', tier: 0,
    prerequisites: ['stone_tools'], epCost: 8, researchTime: 200,
    description: 'Build simple shelters from branches and hides.',
    unlocks: ['lean_to', 'pit_house'],
    historicalAnalog: 'Terra Amata huts ~400 ka',
  },
  {
    id: 'hunting', name: 'Hunting', tier: 0,
    prerequisites: ['stone_tools'], epCost: 8, researchTime: 150,
    description: 'Coordinate to hunt large game.',
    unlocks: ['spear', 'trap', 'ambush_tactics'],
    historicalAnalog: 'Schöningen spears ~300 ka',
  },
  {
    id: 'gathering', name: 'Systematic Gathering', tier: 0,
    prerequisites: [], epCost: 3, researchTime: 30,
    description: 'Identify and collect edible plants, fungi, and insects.',
    unlocks: ['food_storage', 'plant_knowledge'],
    historicalAnalog: 'Archaic forager knowledge systems',
  },
  {
    id: 'language_basic', name: 'Proto-Language', tier: 0,
    prerequisites: [], epCost: 15, researchTime: 500,
    description: 'Develop a spoken proto-language enabling complex coordination.',
    unlocks: ['teaching', 'social_memory', 'naming'],
    historicalAnalog: 'Homo sapiens language emergence ~150 ka',
  },
  {
    id: 'clothing', name: 'Clothing', tier: 0,
    prerequisites: ['hunting'], epCost: 5, researchTime: 200,
    description: 'Craft clothing from hides and plant fibres.',
    unlocks: ['hide_armor', 'cold_climate_survival'],
    historicalAnalog: 'Neanderthal/sapiens clothing ~100 ka',
  },
  {
    id: 'rope_making', name: 'Rope Making', tier: 0,
    prerequisites: ['gathering'], epCost: 4, researchTime: 60,
    description: 'Twist plant fibres into rope — enables nets, traps, and construction.',
    unlocks: ['net', 'bow', 'lashing'],
    historicalAnalog: 'Ohalo II cord ~19 ka',
  },
  {
    id: 'bow_arrow', name: 'Bow and Arrow', tier: 0,
    prerequisites: ['rope_making', 'hunting'], epCost: 10, researchTime: 400,
    description: 'Ranged weapon that stores elastic energy.',
    unlocks: ['composite_bow', 'arrow_poison'],
    historicalAnalog: 'Sibudu Cave arrows ~64 ka',
  },
  {
    id: 'cooking', name: 'Cooking', tier: 0,
    prerequisites: ['fire'], epCost: 6, researchTime: 100,
    description: 'Heat-process food to increase caloric availability and kill pathogens.',
    unlocks: ['pottery', 'preservation', 'nutrition_bonus'],
    historicalAnalog: 'Cooked food ~1 Ma (Wonderwerk Cave)',
  },

  // ── Tier 1: Bronze Age ────────────────────────────────────────────────────
  {
    id: 'pottery', name: 'Pottery', tier: 1,
    prerequisites: ['fire', 'gathering'], epCost: 12, researchTime: 600,
    description: 'Fire clay vessels for storing food and liquid.',
    unlocks: ['kiln', 'fermentation', 'water_storage'],
    historicalAnalog: 'Jomon pottery ~16,000 BCE',
  },
  {
    id: 'agriculture', name: 'Agriculture', tier: 1,
    prerequisites: ['gathering', 'stone_tools'], epCost: 20, researchTime: 2000,
    description: 'Cultivate cereals and domesticate animals.',
    unlocks: ['plow', 'irrigation', 'selective_breeding', 'granary'],
    historicalAnalog: 'Fertile Crescent ~10,000 BCE',
  },
  {
    id: 'writing', name: 'Writing', tier: 1,
    prerequisites: ['language_basic'], epCost: 25, researchTime: 5000,
    description: 'Record information in a permanent symbolic medium.',
    unlocks: ['record_keeping', 'law_codex', 'mathematics_basic', 'long_distance_trade'],
    historicalAnalog: 'Sumerian cuneiform ~3200 BCE',
  },
  {
    id: 'metallurgy_copper', name: 'Copper Metallurgy', tier: 1,
    prerequisites: ['fire', 'pottery'], epCost: 18, researchTime: 3000,
    description: 'Extract and work copper from ores.',
    unlocks: ['copper_tools', 'copper_weapons', 'bronze_alloying'],
    historicalAnalog: 'Chalcolithic ~5000 BCE',
  },
  {
    id: 'bronze', name: 'Bronze Alloy', tier: 1,
    prerequisites: ['metallurgy_copper'], epCost: 20, researchTime: 4000,
    description: 'Alloy copper with tin for harder, more durable metal.',
    unlocks: ['bronze_sword', 'bronze_armor', 'bronze_tools'],
    historicalAnalog: 'Bronze Age ~3300 BCE',
  },
  {
    id: 'wheel', name: 'Wheel', tier: 1,
    prerequisites: ['stone_tools', 'agriculture'], epCost: 22, researchTime: 3500,
    description: 'Circular mechanical element enabling wheeled transport.',
    unlocks: ['cart', 'potter_wheel', 'mill'],
    historicalAnalog: 'Mesopotamian wheel ~3500 BCE',
  },
  {
    id: 'sailing', name: 'Sailing', tier: 1,
    prerequisites: ['rope_making', 'shelter'], epCost: 20, researchTime: 4000,
    description: 'Harness wind power for water travel.',
    unlocks: ['sailboat', 'coastal_trade', 'fishing_net'],
    historicalAnalog: 'Ancient Egyptian sailing ~3000 BCE',
  },
  {
    id: 'mathematics_basic', name: 'Basic Mathematics', tier: 1,
    prerequisites: ['writing'], epCost: 15, researchTime: 3000,
    description: 'Arithmetic, counting systems, and basic geometry.',
    unlocks: ['surveying', 'astronomy_basic', 'accounting'],
    historicalAnalog: 'Babylonian mathematics ~2000 BCE',
  },
  {
    id: 'medicine_herbal', name: 'Herbal Medicine', tier: 1,
    prerequisites: ['gathering', 'cooking'], epCost: 12, researchTime: 2000,
    description: 'Use plant extracts to treat wounds and illness.',
    unlocks: ['surgery_basic', 'midwifery', 'quarantine'],
    historicalAnalog: 'Ancient Egyptian medical papyri ~1550 BCE',
  },
  {
    id: 'masonry', name: 'Masonry', tier: 1,
    prerequisites: ['stone_tools', 'agriculture'], epCost: 18, researchTime: 5000,
    description: 'Cut and dress stone for durable buildings.',
    unlocks: ['stone_wall', 'temple', 'aqueduct_basic'],
    historicalAnalog: 'Megalithic construction ~4000 BCE',
  },
  {
    id: 'animal_husbandry', name: 'Animal Husbandry', tier: 1,
    prerequisites: ['agriculture'], epCost: 15, researchTime: 2500,
    description: 'Domesticate and breed animals for food, labour, and transport.',
    unlocks: ['draft_animal', 'dairy', 'wool', 'selective_breeding'],
    historicalAnalog: 'Cattle domestication ~8000 BCE',
  },

  // ── Tier 2: Iron Age ──────────────────────────────────────────────────────
  {
    id: 'iron_smelting', name: 'Iron Smelting', tier: 2,
    prerequisites: ['bronze', 'masonry'], epCost: 25, researchTime: 8000,
    description: 'Smelt iron ore using charcoal in a blast furnace.',
    unlocks: ['iron_tools', 'iron_sword', 'iron_plow', 'iron_armor'],
    historicalAnalog: 'Hittite iron ~1200 BCE',
  },
  {
    id: 'steel_making', name: 'Steel Making', tier: 2,
    prerequisites: ['iron_smelting'], epCost: 30, researchTime: 15000,
    description: 'Add precise carbon content to iron for harder, tougher steel.',
    unlocks: ['steel_sword', 'steel_armor', 'damascus_steel'],
    historicalAnalog: 'Wootz steel ~300 BCE',
  },
  {
    id: 'roads', name: 'Road Engineering', tier: 2,
    prerequisites: ['masonry', 'mathematics_basic'], epCost: 20, researchTime: 10000,
    description: 'Build paved roads enabling rapid troop and trade movement.',
    unlocks: ['trade_network', 'postal_system', 'military_logistics'],
    historicalAnalog: 'Roman road system ~300 BCE',
  },
  {
    id: 'coinage', name: 'Coinage', tier: 2,
    prerequisites: ['writing', 'metallurgy_copper'], epCost: 18, researchTime: 6000,
    description: 'Standardised metal coins as medium of exchange.',
    unlocks: ['banking', 'long_distance_trade', 'market_economy'],
    historicalAnalog: 'Lydian coinage ~600 BCE',
  },
  {
    id: 'advanced_mathematics', name: 'Advanced Mathematics', tier: 2,
    prerequisites: ['mathematics_basic'], epCost: 25, researchTime: 10000,
    description: 'Algebra, trigonometry, and the concept of zero.',
    unlocks: ['engineering_calculations', 'astronomy_advanced', 'cryptography_basic'],
    historicalAnalog: 'Hindu-Arabic mathematics ~500 CE',
  },
  {
    id: 'irrigation', name: 'Irrigation Engineering', tier: 2,
    prerequisites: ['agriculture', 'masonry'], epCost: 22, researchTime: 8000,
    description: 'Channel water to fields — dramatically increases food production.',
    unlocks: ['large_scale_farming', 'rice_cultivation', 'hydraulic_mill'],
    historicalAnalog: 'Mesopotamian irrigation ~6000 BCE',
  },
  {
    id: 'glassblowing', name: 'Glassblowing', tier: 2,
    prerequisites: ['metallurgy_copper', 'pottery'], epCost: 18, researchTime: 7000,
    description: 'Shape molten glass into vessels and lenses.',
    unlocks: ['glass_vessel', 'lens', 'mirror'],
    historicalAnalog: 'Phoenician glassblowing ~50 BCE',
  },
  {
    id: 'military_tactics', name: 'Military Tactics', tier: 2,
    prerequisites: ['roads', 'iron_smelting'], epCost: 20, researchTime: 5000,
    description: 'Formalised battlefield tactics and unit formations.',
    unlocks: ['phalanx', 'siege_weapons', 'naval_warfare'],
    historicalAnalog: 'Greek/Roman military doctrine ~500 BCE',
  },

  // ── Tier 3: Classical ─────────────────────────────────────────────────────
  {
    id: 'natural_philosophy', name: 'Natural Philosophy', tier: 3,
    prerequisites: ['writing', 'advanced_mathematics'], epCost: 30, researchTime: 20000,
    description: 'Systematic inquiry into the natural world — proto-science.',
    unlocks: ['hypothesis_method', 'astronomy_advanced', 'anatomy'],
    historicalAnalog: 'Greek natural philosophy ~500 BCE',
  },
  {
    id: 'engineering_classical', name: 'Classical Engineering', tier: 3,
    prerequisites: ['advanced_mathematics', 'masonry'], epCost: 28, researchTime: 15000,
    description: 'Arches, vaults, domes, and aqueducts — complex structural engineering.',
    unlocks: ['aqueduct', 'amphitheatre', 'bridge_stone', 'harbor'],
    historicalAnalog: 'Roman engineering ~100 BCE',
  },
  {
    id: 'medicine_anatomy', name: 'Anatomy & Surgery', tier: 3,
    prerequisites: ['medicine_herbal', 'natural_philosophy'], epCost: 25, researchTime: 18000,
    description: 'Systematic study of human body structure and surgical procedures.',
    unlocks: ['amputation', 'trephination', 'pharmacopoeia'],
    historicalAnalog: 'Galen / Hippocratic medicine ~200 CE',
  },
  {
    id: 'optics_basic', name: 'Basic Optics', tier: 3,
    prerequisites: ['glassblowing', 'natural_philosophy'], epCost: 22, researchTime: 12000,
    description: 'Understanding of refraction and reflection, enabling lenses and mirrors.',
    unlocks: ['magnifying_glass', 'spectacles', 'lighthouse'],
    historicalAnalog: 'Alhazen\'s Book of Optics ~1011 CE',
  },
  {
    id: 'astronomy', name: 'Astronomy', tier: 3,
    prerequisites: ['advanced_mathematics', 'natural_philosophy'], epCost: 25, researchTime: 20000,
    description: 'Predict planetary motions with mathematical models.',
    unlocks: ['calendar', 'navigation_celestial', 'telescope_concept'],
    historicalAnalog: 'Ptolemaic model / Islamic astronomy',
  },
  {
    id: 'law_codified', name: 'Codified Law', tier: 3,
    prerequisites: ['writing', 'coinage'], epCost: 20, researchTime: 15000,
    description: 'Written legal codes governing society.',
    unlocks: ['courts', 'property_rights', 'contract_enforcement'],
    historicalAnalog: 'Code of Hammurabi ~1754 BCE',
  },
  {
    id: 'philosophy', name: 'Philosophy', tier: 3,
    prerequisites: ['natural_philosophy', 'law_codified'], epCost: 22, researchTime: 20000,
    description: 'Formal logic, ethics, and epistemology.',
    unlocks: ['logic', 'ethics', 'political_theory'],
    historicalAnalog: 'Aristotle ~350 BCE',
  },

  // ── Tier 4: Medieval ──────────────────────────────────────────────────────
  {
    id: 'wind_power', name: 'Wind Power', tier: 4,
    prerequisites: ['engineering_classical', 'sailing'], epCost: 28, researchTime: 30000,
    description: 'Windmills grind grain and pump water using wind energy.',
    unlocks: ['windmill', 'wind_pump', 'mechanical_saw'],
    historicalAnalog: 'Persian windmill ~600 CE',
  },
  {
    id: 'water_power', name: 'Water Power', tier: 4,
    prerequisites: ['engineering_classical', 'irrigation'], epCost: 28, researchTime: 30000,
    description: 'Waterwheels convert flowing water into mechanical energy.',
    unlocks: ['watermill', 'trip_hammer', 'bellows'],
    historicalAnalog: 'Roman watermill ~27 BCE',
  },
  {
    id: 'printing', name: 'Printing Press', tier: 4,
    prerequisites: ['optics_basic', 'steel_making'], epCost: 30, researchTime: 40000,
    description: 'Movable-type press enables mass reproduction of text.',
    unlocks: ['mass_literacy', 'scientific_journal', 'newspaper'],
    historicalAnalog: 'Gutenberg press 1439 CE',
  },
  {
    id: 'telescope', name: 'Telescope', tier: 4,
    prerequisites: ['optics_basic', 'glassblowing'], epCost: 25, researchTime: 25000,
    description: 'Magnify distant objects — revolutionises astronomy.',
    unlocks: ['heliocentric_model', 'moons_of_jupiter', 'celestial_mechanics'],
    historicalAnalog: 'Galileo telescope 1609 CE',
  },
  {
    id: 'compass', name: 'Magnetic Compass', tier: 4,
    prerequisites: ['astronomy', 'mathematics_basic'], epCost: 20, researchTime: 15000,
    description: 'Use Earth\'s magnetic field for reliable navigation.',
    unlocks: ['deep_ocean_navigation', 'age_of_exploration'],
    historicalAnalog: 'Chinese compass ~1040 CE',
  },
  {
    id: 'gunpowder_tech', name: 'Gunpowder', tier: 4,
    prerequisites: ['medicine_herbal', 'iron_smelting'], epCost: 25, researchTime: 20000,
    description: 'Explosive compound of sulfur, charcoal, and saltpeter.',
    unlocks: ['cannon', 'musket', 'fireworks', 'mining_explosives'],
    historicalAnalog: 'Chinese gunpowder ~850 CE',
  },
  {
    id: 'mechanical_clock', name: 'Mechanical Clock', tier: 4,
    prerequisites: ['steel_making', 'optics_basic'], epCost: 22, researchTime: 25000,
    description: 'Escapement mechanism for precise timekeeping.',
    unlocks: ['longitude_navigation', 'factory_scheduling', 'scientific_experiment'],
    historicalAnalog: 'Verge escapement ~1300 CE',
  },
  {
    id: 'algebra', name: 'Algebra', tier: 4,
    prerequisites: ['advanced_mathematics', 'philosophy'], epCost: 28, researchTime: 20000,
    description: 'Symbolic manipulation of equations — foundation of modern mathematics.',
    unlocks: ['calculus', 'probability', 'cryptography'],
    historicalAnalog: 'Al-Khwarizmi ~830 CE',
  },

  // ── Tier 5: Industrial ────────────────────────────────────────────────────
  {
    id: 'scientific_method', name: 'Scientific Method', tier: 5,
    prerequisites: ['printing', 'telescope', 'algebra'], epCost: 40, researchTime: 60000,
    description: 'Formalise hypothesis, experiment, peer review, and falsification.',
    unlocks: ['systematic_science', 'patent_system', 'research_university'],
    historicalAnalog: 'Scientific Revolution ~1600 CE',
  },
  {
    id: 'calculus', name: 'Calculus', tier: 5,
    prerequisites: ['algebra', 'telescope'], epCost: 35, researchTime: 40000,
    description: 'Infinitesimal mathematics — model rates of change and areas.',
    unlocks: ['newtonian_mechanics', 'orbital_mechanics', 'fluid_dynamics'],
    historicalAnalog: 'Newton/Leibniz ~1670 CE',
  },
  {
    id: 'thermodynamics_classical', name: 'Classical Thermodynamics', tier: 5,
    prerequisites: ['scientific_method', 'calculus'], epCost: 38, researchTime: 50000,
    description: 'Laws of heat, work, and entropy.',
    unlocks: ['steam_engine', 'refrigeration', 'heat_pump'],
    historicalAnalog: 'Carnot / Clausius / Kelvin ~1820-1850 CE',
  },
  {
    id: 'steam_engine', name: 'Steam Engine', tier: 5,
    prerequisites: ['thermodynamics_classical', 'steel_making', 'water_power'], epCost: 45, researchTime: 80000,
    description: 'Convert heat from burning fuel into mechanical work.',
    unlocks: ['locomotive', 'steamship', 'factory_power', 'mine_pump'],
    historicalAnalog: 'Watt steam engine 1769 CE',
  },
  {
    id: 'industrial_chemistry', name: 'Industrial Chemistry', tier: 5,
    prerequisites: ['scientific_method', 'thermodynamics_classical'], epCost: 35, researchTime: 60000,
    description: 'Mass-produce chemicals: acids, alkalis, fertilisers, dyes.',
    unlocks: ['fertilizer', 'explosives_industrial', 'synthetic_dye', 'soap'],
    historicalAnalog: 'Leblanc process ~1791 CE',
  },
  {
    id: 'electromagnetism_classical', name: 'Classical Electromagnetism', tier: 5,
    prerequisites: ['scientific_method', 'calculus'], epCost: 42, researchTime: 70000,
    description: 'Maxwell\'s equations unify electricity, magnetism, and light.',
    unlocks: ['electric_motor', 'generator', 'telegraph', 'radio_concept'],
    historicalAnalog: 'Maxwell 1865 CE',
  },
  {
    id: 'germ_theory_formal', name: 'Germ Theory of Disease', tier: 5,
    prerequisites: ['scientific_method', 'optics_basic'], epCost: 30, researchTime: 40000,
    description: 'Microorganisms cause infectious diseases.',
    unlocks: ['vaccine', 'antiseptics', 'antibiotics_concept', 'public_health'],
    historicalAnalog: 'Pasteur / Koch ~1860-1880 CE',
  },
  {
    id: 'evolution_theory', name: 'Theory of Evolution', tier: 5,
    prerequisites: ['scientific_method', 'medicine_anatomy'], epCost: 35, researchTime: 50000,
    description: 'Natural selection drives change of species over time.',
    unlocks: ['genetics', 'ecology', 'selective_breeding_advanced'],
    historicalAnalog: 'Darwin 1859 CE',
  },

  // ── Tier 6: Modern ────────────────────────────────────────────────────────
  {
    id: 'quantum_physics', name: 'Quantum Physics', tier: 6,
    prerequisites: ['electromagnetism_classical', 'calculus'], epCost: 60, researchTime: 200000,
    description: 'Wave-particle duality, quantisation, and the uncertainty principle.',
    unlocks: ['semiconductor', 'laser', 'quantum_cryptography', 'nuclear_structure'],
    historicalAnalog: 'Bohr / Heisenberg / Schrödinger ~1900-1930 CE',
  },
  {
    id: 'relativity', name: 'Theory of Relativity', tier: 6,
    prerequisites: ['electromagnetism_classical', 'calculus'], epCost: 55, researchTime: 150000,
    description: 'Special and General Relativity — gravity = curvature of spacetime.',
    unlocks: ['nuclear_energy_concept', 'gps', 'gravitational_waves'],
    historicalAnalog: 'Einstein 1905/1915 CE',
  },
  {
    id: 'nuclear_fission', name: 'Nuclear Fission', tier: 6,
    prerequisites: ['quantum_physics', 'relativity'], epCost: 70, researchTime: 300000,
    description: 'Split heavy atomic nuclei to release enormous energy.',
    unlocks: ['nuclear_reactor', 'nuclear_weapon', 'radioisotope_thermoelectric'],
    historicalAnalog: 'Manhattan Project 1942-1945 CE',
  },
  {
    id: 'genetics', name: 'Molecular Genetics', tier: 6,
    prerequisites: ['evolution_theory', 'industrial_chemistry'], epCost: 55, researchTime: 250000,
    description: 'DNA structure, replication, and the genetic code.',
    unlocks: ['genetic_engineering_basic', 'pcr', 'sequencing'],
    historicalAnalog: 'Watson & Crick 1953 CE',
  },
  {
    id: 'transistor', name: 'Transistor', tier: 6,
    prerequisites: ['quantum_physics'], epCost: 50, researchTime: 200000,
    description: 'Solid-state switch that amplifies and switches electronic signals.',
    unlocks: ['integrated_circuit', 'computer_basic', 'radio_advanced'],
    historicalAnalog: 'Bell Labs transistor 1947 CE',
  },
  {
    id: 'rocketry', name: 'Rocketry', tier: 6,
    prerequisites: ['calculus', 'industrial_chemistry', 'steam_engine'], epCost: 60, researchTime: 300000,
    description: 'Reaction-propulsion capable of reaching orbital velocity.',
    unlocks: ['satellite', 'icbm', 'space_capsule'],
    historicalAnalog: 'V-2 / Sputnik 1942-1957 CE',
  },
  {
    id: 'materials_science_advanced', name: 'Advanced Materials Science', tier: 6,
    prerequisites: ['quantum_physics', 'industrial_chemistry'], epCost: 48, researchTime: 180000,
    description: 'Design materials with specific properties at the atomic level.',
    unlocks: ['composites', 'alloys_advanced', 'ceramics_advanced', 'polymers'],
    historicalAnalog: 'Post-WWII materials research',
  },

  // ── Tier 7: Information Age ───────────────────────────────────────────────
  {
    id: 'integrated_circuit', name: 'Integrated Circuit', tier: 7,
    prerequisites: ['transistor', 'materials_science_advanced'], epCost: 80, researchTime: 500000,
    description: 'Millions of transistors on a single chip — Moore\'s Law.',
    unlocks: ['microprocessor', 'memory_chip', 'dsp'],
    historicalAnalog: 'Kilby/Noyce IC 1958-1959 CE',
  },
  {
    id: 'internet', name: 'Global Computer Network', tier: 7,
    prerequisites: ['integrated_circuit', 'rocketry'], epCost: 90, researchTime: 700000,
    description: 'Packet-switched network connecting all computers globally.',
    unlocks: ['world_wide_web', 'cloud_computing', 'global_communication'],
    historicalAnalog: 'ARPANET 1969 / WWW 1991',
  },
  {
    id: 'genetic_engineering_advanced', name: 'Genetic Engineering', tier: 7,
    prerequisites: ['genetics', 'integrated_circuit'], epCost: 75, researchTime: 600000,
    description: 'Precisely edit genomes using CRISPR-Cas9 and synthetic biology.',
    unlocks: ['designer_organisms', 'gene_therapy', 'synthetic_biology', 'de_extinction'],
    historicalAnalog: 'CRISPR 2012 CE',
  },
  {
    id: 'artificial_intelligence', name: 'Artificial Intelligence', tier: 7,
    prerequisites: ['internet', 'integrated_circuit'], epCost: 100, researchTime: 1000000,
    description: 'Machine learning systems that exceed human performance on many cognitive tasks.',
    unlocks: ['autonomous_vehicles', 'protein_folding', 'drug_discovery_ai', 'agi_research'],
    historicalAnalog: 'Deep learning revolution ~2012 CE',
  },
  {
    id: 'space_station', name: 'Space Station', tier: 7,
    prerequisites: ['rocketry', 'integrated_circuit'], epCost: 85, researchTime: 800000,
    description: 'Permanent crewed outpost in Earth orbit.',
    unlocks: ['long_duration_spaceflight', 'space_manufacturing', 'solar_power_satellite'],
    historicalAnalog: 'ISS 1998 CE',
  },
  {
    id: 'renewable_energy', name: 'Advanced Renewable Energy', tier: 7,
    prerequisites: ['materials_science_advanced', 'integrated_circuit'], epCost: 70, researchTime: 500000,
    description: 'Grid-scale solar, wind, and storage systems.',
    unlocks: ['solar_grid', 'wind_grid', 'battery_storage', 'smart_grid'],
    historicalAnalog: 'Renewable energy transition ~2010-2030 CE',
  },
  {
    id: 'biotechnology', name: 'Biotechnology', tier: 7,
    prerequisites: ['genetic_engineering_advanced', 'artificial_intelligence'], epCost: 80, researchTime: 700000,
    description: 'Engineer living cells as factories and medicine.',
    unlocks: ['bioreactor', 'synthetic_meat', 'biofuel', 'mrna_vaccine'],
    historicalAnalog: 'Post-genomics biotech ~2000-2030 CE',
  },

  // ── Tier 8: Fusion Age ────────────────────────────────────────────────────
  {
    id: 'nuclear_fusion', name: 'Nuclear Fusion', tier: 8,
    prerequisites: ['nuclear_fission', 'materials_science_advanced', 'artificial_intelligence'], epCost: 150, researchTime: 5000000,
    description: 'Net-energy-positive fusion reactor — limitless clean energy.',
    unlocks: ['fusion_power_plant', 'fusion_rocket', 'helium3_mining'],
    historicalAnalog: 'ITER / commercial fusion ~2030-2060 CE (projected)',
  },
  {
    id: 'nanotechnology', name: 'Nanotechnology', tier: 8,
    prerequisites: ['materials_science_advanced', 'artificial_intelligence', 'biotechnology'], epCost: 140, researchTime: 8000000,
    description: 'Machines that manipulate matter at the molecular scale.',
    unlocks: ['molecular_assembler', 'nanomedecine', 'self_repairing_materials', 'computronium_basic'],
    historicalAnalog: 'Drexlerian nanotechnology (projected)',
  },
  {
    id: 'agi', name: 'Artificial General Intelligence', tier: 8,
    prerequisites: ['artificial_intelligence', 'nuclear_fusion'], epCost: 200, researchTime: 10000000,
    description: 'AI system matching or exceeding human cognitive ability across all domains.',
    unlocks: ['recursive_self_improvement', 'automated_science', 'brain_computer_interface'],
    historicalAnalog: 'AGI (projected ~2030-2080)',
  },
  {
    id: 'interplanetary_travel', name: 'Interplanetary Civilisation', tier: 8,
    prerequisites: ['nuclear_fusion', 'space_station', 'agi'], epCost: 180, researchTime: 15000000,
    description: 'Establish self-sufficient colonies on multiple planets and moons.',
    unlocks: ['terraforming', 'asteroid_mining', 'generation_ship'],
    historicalAnalog: 'Multi-planetary species (projected)',
  },
  {
    id: 'mind_upload', name: 'Mind Uploading', tier: 8,
    prerequisites: ['agi', 'nanotechnology', 'biotechnology'], epCost: 160, researchTime: 12000000,
    description: 'Transfer complete brain state to digital substrate.',
    unlocks: ['virtual_civilisation', 'consciousness_backup', 'digital_immortality'],
    historicalAnalog: 'Whole Brain Emulation (projected)',
  },
  {
    id: 'megastructure', name: 'Megastructure Engineering', tier: 8,
    prerequisites: ['interplanetary_travel', 'nanotechnology', 'agi'], epCost: 200, researchTime: 50000000,
    description: 'Self-replicating machines build planetary-scale structures.',
    unlocks: ['dyson_swarm', 'ringworld_concept', 'bishop_ring'],
    historicalAnalog: 'Kardashev Type II civilisation (projected)',
  },

  // ── Tier 9: Simulation Age ────────────────────────────────────────────────
  {
    id: 'dyson_sphere_tech', name: 'Dyson Sphere', tier: 9,
    prerequisites: ['megastructure', 'nuclear_fusion', 'agi'], epCost: 500, researchTime: 1000000000,
    description: 'Capture the total energy output of a star.',
    unlocks: ['stellar_engineering', 'kardashev_type_2', 'interstellar_laser'],
    historicalAnalog: 'Kardashev Type II (projected)',
  },
  {
    id: 'matrioshka_brain_tech', name: 'Matrioshka Brain', tier: 9,
    prerequisites: ['dyson_sphere_tech', 'mind_upload', 'nanotechnology'], epCost: 1000, researchTime: 10000000000,
    description: 'Convert an entire stellar system into a computer of maximal computational power.',
    unlocks: ['universe_simulation', 'post_scarcity', 'superintelligence'],
    historicalAnalog: 'Hypothetical computation megastructure',
  },
  {
    id: 'warp_drive_tech', name: 'Alcubierre Warp Drive', tier: 9,
    prerequisites: ['nuclear_fusion', 'agi', 'dyson_sphere_tech'], epCost: 800, researchTime: 5000000000,
    description: 'Bend spacetime to travel faster than light within a local metric bubble.',
    unlocks: ['interstellar_travel', 'galactic_colonisation'],
    historicalAnalog: 'Alcubierre metric 1994 (theoretical)',
  },
  {
    id: 'universe_simulation_tech', name: 'Universe Simulation', tier: 9,
    prerequisites: ['matrioshka_brain_tech', 'warp_drive_tech'], epCost: 2000, researchTime: 100000000000,
    description: 'Run a complete simulation of a universe with self-aware inhabitants.',
    unlocks: ['sub_universe_creation', 'simulation_control', 'infinite_worlds'],
    historicalAnalog: 'Bostrom Simulation Argument (hypothetical)',
  },
  {
    id: 'physical_constants_control', name: 'Physical Constants Control', tier: 9,
    prerequisites: ['universe_simulation_tech'], epCost: 5000, researchTime: 1000000000000,
    description: 'Modify the fundamental constants of this layer of reality.',
    unlocks: ['reality_rewrite', 'universe_upgrade', 'escape_simulation'],
    historicalAnalog: 'Hypothetical post-Singularity capability',
  },
]
