export interface Discovery {
  id: number
  name: string
  category: 'physics' | 'chemistry' | 'biology' | 'technology' | 'social' | 'cosmic'
  timestamp: number   // simulation time when discovered
  description: string
  unlocks: string[]   // discovery IDs or recipe IDs unlocked
}

export class DiscoveryJournal {
  private discoveries: Map<string, Discovery> = new Map()
  private newQueue: Discovery[] = []

  /**
   * Record a discovery. Returns true if it was new, false if already known.
   * Fires a notification for new discoveries.
   */
  record(discovery: Omit<Discovery, 'timestamp'>, simTime: number): boolean {
    const key = String(discovery.id)
    if (this.discoveries.has(key)) return false

    const full: Discovery = { ...discovery, timestamp: simTime }
    this.discoveries.set(key, full)
    this.newQueue.push(full)
    return true
  }

  has(id: string | number): boolean {
    return this.discoveries.has(String(id))
  }

  getAll(): Discovery[] {
    return Array.from(this.discoveries.values()).sort((a, b) => a.timestamp - b.timestamp)
  }

  getByCategory(cat: Discovery['category']): Discovery[] {
    return this.getAll().filter(d => d.category === cat)
  }

  /** Returns discoveries that should be shown as notifications (since last clearNew). */
  getNew(): Discovery[] {
    return [...this.newQueue]
  }

  clearNew(): void {
    this.newQueue = []
  }

  get count(): number {
    return this.discoveries.size
  }
}

// ── Pre-defined significant discoveries ──────────────────────────────────────
// id range: 1-999

export const DISCOVERIES: Record<string, Omit<Discovery, 'timestamp'>> = {
  // ── Physics ────────────────────────────────────────────────────────────────
  fire_making: {
    id: 1, name: 'Fire Making', category: 'physics',
    description: 'Discovered how to create fire by striking flint against iron pyrite.',
    unlocks: ['cooking', 'pottery', 'metallurgy'],
  },
  tool_use: {
    id: 2, name: 'Tool Use', category: 'technology',
    description: 'Learned to shape stone into cutting tools.',
    unlocks: ['weapon_smithing', 'carpentry', 'agriculture'],
  },
  wheel: {
    id: 3, name: 'The Wheel', category: 'technology',
    description: 'Discovered the mechanical advantage of the wheel and axle.',
    unlocks: ['mechanics', 'vehicle_design'],
  },
  mechanics: {
    id: 4, name: 'Simple Machines', category: 'physics',
    description: 'Understand levers, pulleys, inclined planes and their mechanical advantage.',
    unlocks: ['engineering', 'wind_power', 'hydraulics'],
  },
  thermodynamics: {
    id: 5, name: 'Thermodynamics', category: 'physics',
    description: 'Formulated the laws governing heat, work, and energy conversion.',
    unlocks: ['steam_power', 'heat_engines', 'refrigeration'],
  },
  electromagnetism: {
    id: 6, name: 'Electromagnetism', category: 'physics',
    description: 'Unified electricity and magnetism into a single theory (Maxwell\'s equations).',
    unlocks: ['electronics', 'communication', 'motors'],
  },
  nuclear_physics: {
    id: 7, name: 'Nuclear Physics', category: 'physics',
    description: 'Discovered atomic fission and the enormous energy locked in atomic nuclei.',
    unlocks: ['nuclear_power', 'nuclear_weapons', 'particle_physics'],
  },
  quantum_mechanics: {
    id: 8, name: 'Quantum Mechanics', category: 'physics',
    description: 'Uncovered the wave-particle duality and probabilistic nature of matter at small scales.',
    unlocks: ['semiconductor_physics', 'quantum_computing', 'lasers'],
  },
  general_relativity: {
    id: 9, name: 'General Relativity', category: 'physics',
    description: 'Understood gravity as the curvature of spacetime caused by mass and energy.',
    unlocks: ['orbital_mechanics', 'exotic_matter', 'time_dilation'],
  },
  plasma_physics: {
    id: 10, name: 'Plasma Physics', category: 'physics',
    description: 'Mastered the behaviour of ionised matter at extreme temperatures.',
    unlocks: ['fusion_power', 'magnetic_confinement'],
  },

  // ── Chemistry ──────────────────────────────────────────────────────────────
  alchemy: {
    id: 11, name: 'Alchemy', category: 'chemistry',
    description: 'Discovered that substances can be transformed through heat and combination.',
    unlocks: ['chemistry', 'metallurgy', 'medicine_basic'],
  },
  smelting: {
    id: 12, name: 'Smelting', category: 'chemistry',
    description: 'Learned to extract metals from ores using fire and flux.',
    unlocks: ['iron_smelting', 'steel_making', 'metallurgy'],
  },
  chemistry: {
    id: 13, name: 'Chemistry', category: 'chemistry',
    description: 'Discovered atomic theory and the systematic study of chemical reactions.',
    unlocks: ['organic_chemistry', 'materials_science', 'pharmacology'],
  },
  organic_chemistry: {
    id: 14, name: 'Organic Chemistry', category: 'chemistry',
    description: 'Uncovered the structure and reactivity of carbon-based compounds.',
    unlocks: ['plastics', 'fuels', 'pharmaceuticals'],
  },
  materials_science: {
    id: 15, name: 'Materials Science', category: 'chemistry',
    description: 'Learned to engineer materials with specific structural and electronic properties.',
    unlocks: ['composites', 'semiconductors', 'superconductivity'],
  },

  // ── Biology ────────────────────────────────────────────────────────────────
  agriculture: {
    id: 16, name: 'Agriculture', category: 'biology',
    description: 'Learned to cultivate plants and domesticate animals for food.',
    unlocks: ['selective_breeding', 'crop_rotation', 'irrigation'],
  },
  medicine_basic: {
    id: 17, name: 'Basic Medicine', category: 'biology',
    description: 'Discovered that wounds can be treated with herbs and that some diseases are contagious.',
    unlocks: ['pharmacology', 'surgery', 'germ_theory'],
  },
  germ_theory: {
    id: 18, name: 'Germ Theory', category: 'biology',
    description: 'Discovered that infectious diseases are caused by microorganisms.',
    unlocks: ['vaccination', 'antibiotics', 'sanitation'],
  },
  evolution: {
    id: 19, name: 'Theory of Evolution', category: 'biology',
    description: 'Discovered that species change over time through natural selection and genetic variation.',
    unlocks: ['selective_breeding', 'genetics', 'ecology'],
  },
  genetics: {
    id: 20, name: 'Genetics', category: 'biology',
    description: 'Decoded the hereditary mechanisms of DNA and gene expression.',
    unlocks: ['genetic_engineering', 'biotechnology', 'cloning'],
  },
  genetic_engineering: {
    id: 21, name: 'Genetic Engineering', category: 'biology',
    description: 'Learned to directly edit the genome of living organisms.',
    unlocks: ['designer_organisms', 'gene_therapy', 'synthetic_biology'],
  },
  nanotechnology: {
    id: 22, name: 'Nanotechnology', category: 'technology',
    description: 'Mastered the construction of machines at the molecular scale.',
    unlocks: ['molecular_assembly', 'nanomedecine', 'computronium'],
  },

  // ── Technology ─────────────────────────────────────────────────────────────
  writing: {
    id: 23, name: 'Writing', category: 'social',
    description: 'Developed a symbolic system to record language permanently.',
    unlocks: ['mathematics', 'law', 'history'],
  },
  mathematics: {
    id: 24, name: 'Mathematics', category: 'technology',
    description: 'Developed formal systems for counting, geometry, and algebraic reasoning.',
    unlocks: ['engineering', 'navigation', 'cryptography'],
  },
  navigation: {
    id: 25, name: 'Navigation', category: 'technology',
    description: 'Learned to use stars, maps, and instruments to navigate across oceans.',
    unlocks: ['cartography', 'astronomy', 'trade_networks'],
  },
  printing_press: {
    id: 26, name: 'Printing Press', category: 'technology',
    description: 'Invented a device to mass-produce written text.',
    unlocks: ['mass_communication', 'scientific_revolution'],
  },
  steam_power: {
    id: 27, name: 'Steam Power', category: 'technology',
    description: 'Harnessed steam pressure to do mechanical work at industrial scale.',
    unlocks: ['locomotives', 'factories', 'industrialisation'],
  },
  electronics: {
    id: 28, name: 'Electronics', category: 'technology',
    description: 'Learned to control electric current through circuits for computation and communication.',
    unlocks: ['transistors', 'radio', 'computers'],
  },
  semiconductor_physics: {
    id: 29, name: 'Semiconductor Physics', category: 'technology',
    description: 'Understood the quantum band structure of semiconductors and the transistor effect.',
    unlocks: ['integrated_circuits', 'solar_cells', 'LEDs'],
  },
  AI: {
    id: 30, name: 'Artificial Intelligence', category: 'technology',
    description: 'Built systems that can learn and reason autonomously.',
    unlocks: ['machine_learning', 'robotics', 'AGI'],
  },
  aerospace: {
    id: 31, name: 'Aerospace Engineering', category: 'technology',
    description: 'Mastered flight in atmosphere and the principles of orbital mechanics.',
    unlocks: ['satellite', 'rocket', 'space_station'],
  },
  orbital_mechanics: {
    id: 32, name: 'Orbital Mechanics', category: 'physics',
    description: 'Mastered the mathematics of trajectories in gravitational fields.',
    unlocks: ['interplanetary_travel', 'gravity_assist', 'lagrange_points'],
  },
  superconductivity: {
    id: 33, name: 'Superconductivity', category: 'physics',
    description: 'Discovered materials that conduct electricity with zero resistance below critical temperature.',
    unlocks: ['magnetic_levitation', 'fusion_magnets', 'lossless_transmission'],
  },
  exotic_matter: {
    id: 34, name: 'Exotic Matter', category: 'physics',
    description: 'Synthesised matter with negative energy density — prerequisite for warp drives.',
    unlocks: ['warp_drive', 'wormholes'],
  },

  // ── Social ─────────────────────────────────────────────────────────────────
  language: {
    id: 35, name: 'Language', category: 'social',
    description: 'Developed complex symbolic communication enabling abstract thought.',
    unlocks: ['writing', 'culture', 'trade'],
  },
  trade: {
    id: 36, name: 'Trade', category: 'social',
    description: 'Established exchange of goods between groups, creating economic surplus.',
    unlocks: ['currency', 'trade_networks', 'specialisation'],
  },
  law: {
    id: 37, name: 'Law & Governance', category: 'social',
    description: 'Created systems of rules and enforcement that allow large groups to cooperate.',
    unlocks: ['taxation', 'democracy', 'international_relations'],
  },
  philosophy: {
    id: 38, name: 'Philosophy', category: 'social',
    description: 'Developed systematic inquiry into ethics, epistemology, and metaphysics.',
    unlocks: ['scientific_method', 'logic', 'theology'],
  },
  scientific_method: {
    id: 39, name: 'Scientific Method', category: 'social',
    description: 'Formalised hypothesis, experiment, and falsification as the basis of knowledge.',
    unlocks: ['all_tier_3_research'],
  },

  // ── Cosmic ─────────────────────────────────────────────────────────────────
  stellar_engineering: {
    id: 40, name: 'Stellar Engineering', category: 'cosmic',
    description: 'Gained the ability to modify stars — beginning with Dyson swarms.',
    unlocks: ['dyson_sphere', 'stellar_lifting'],
  },
  megastructure_engineering: {
    id: 41, name: 'Megastructure Engineering', category: 'cosmic',
    description: 'Can build structures at planetary and stellar scales using self-replicating machines.',
    unlocks: ['ringworld', 'dyson_sphere', 'bishop_ring'],
  },
  self_replicating_machines: {
    id: 42, name: 'Self-Replicating Machines', category: 'cosmic',
    description: 'Built machines that can copy themselves using raw materials.',
    unlocks: ['von_neumann_probe', 'megastructure_engineering'],
  },
  simulation_hypothesis: {
    id: 43, name: 'Simulation Hypothesis', category: 'cosmic',
    description: 'Proven that the universe itself is a computation — and found the API.',
    unlocks: ['reality_engineering', 'simulation_engine'],
  },
  computronium: {
    id: 44, name: 'Computronium', category: 'cosmic',
    description: 'Discovered how to convert matter into maximally-efficient computing substrate.',
    unlocks: ['matrioshka_brain', 'mind_uploading'],
  },
  reality_engineering: {
    id: 45, name: 'Reality Engineering', category: 'cosmic',
    description: 'Can modify the fundamental constants of this simulation.',
    unlocks: ['simulation_engine', 'universe_seeding'],
  },
}
