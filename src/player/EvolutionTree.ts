/**
 * Evolution Points (EP) system.
 *
 * The player earns EP by:
 *   - Surviving (time-based trickle)
 *   - Reproducing (per offspring)
 *   - Making discoveries
 *   - Killing predators / escaping death
 *
 * EP can be spent to bias mutations in the player organism's genome.
 * Each node applies a targeted change to specific genome bits.
 */

export interface EvolutionNode {
  id: string
  name: string
  description: string
  epCost: number
  prerequisites: string[]
  category: 'body' | 'metabolism' | 'senses' | 'locomotion' | 'defense' | 'neural' | 'social' | 'civilization'
  // Which genome bits this node modifies and to what value
  genomeBitMod: { startBit: number; count: number; targetValue: number }
}

export class EvolutionTree {
  private points = 0
  private unlocked = new Set<string>()

  addPoints(ep: number): void {
    this.points = Math.max(0, this.points + ep)
  }

  get currentPoints(): number {
    return this.points
  }

  /**
   * Attempt to unlock a node. Returns true on success.
   * Fails if insufficient EP or prerequisites not met.
   */
  unlock(nodeId: string): boolean {
    const node = EVOLUTION_NODES.find(n => n.id === nodeId)
    if (!node) return false
    if (this.unlocked.has(nodeId)) return false
    if (this.points < node.epCost) return false
    for (const req of node.prerequisites) {
      if (!this.unlocked.has(req)) return false
    }
    this.points -= node.epCost
    this.unlocked.add(nodeId)
    return true
  }

  isUnlocked(nodeId: string): boolean {
    return this.unlocked.has(nodeId)
  }

  /** Returns nodes whose prerequisites are all met and that haven't been unlocked. */
  getAvailable(): EvolutionNode[] {
    return EVOLUTION_NODES.filter(n =>
      !this.unlocked.has(n.id) &&
      n.prerequisites.every(req => this.unlocked.has(req))
    )
  }

  getUnlocked(): EvolutionNode[] {
    return EVOLUTION_NODES.filter(n => this.unlocked.has(n.id))
  }

  getUnlockedIds(): string[] {
    return Array.from(this.unlocked)
  }

  /** Restore unlocked nodes from a saved list of IDs. */
  loadUnlocked(ids: string[]): void {
    this.unlocked = new Set(ids)
  }

  /**
   * Compute the cumulative genome modifications from all unlocked nodes.
   * Returns an array of bit modifications to apply.
   */
  getGenomeModifications(): Array<{ startBit: number; count: number; targetValue: number }> {
    return this.getUnlocked().map(n => n.genomeBitMod)
  }
}

// ── Node definitions ──────────────────────────────────────────────────────────
// 50+ nodes spanning all trait categories.
// Genome bit layout matches GenomeEncoder.ts.

export const EVOLUTION_NODES: EvolutionNode[] = [
  // ── Body plan ─────────────────────────────────────────────────────────────
  {
    id: 'bilateral_symmetry', name: 'Bilateral Symmetry', category: 'body',
    description: 'Reorganise body into a mirror-image bilateral plan — prerequisite for directed locomotion.',
    epCost: 5, prerequisites: [],
    genomeBitMod: { startBit: 0, count: 4, targetValue: 1 },  // bodySymmetry = 1 (bilateral)
  },
  {
    id: 'extra_segment', name: 'Additional Body Segment', category: 'body',
    description: 'Grow an extra body segment, increasing organ space and eventual size.',
    epCost: 3, prerequisites: ['bilateral_symmetry'],
    genomeBitMod: { startBit: 4, count: 4, targetValue: 4 },  // segmentCount = 4
  },
  {
    id: 'four_limbs', name: 'Four Limbs', category: 'body',
    description: 'Develop four dedicated limbs for locomotion and manipulation.',
    epCost: 8, prerequisites: ['bilateral_symmetry'],
    genomeBitMod: { startBit: 8, count: 4, targetValue: 4 },  // limbCount = 4
  },
  {
    id: 'grasping_hands', name: 'Grasping Appendages', category: 'body',
    description: 'Evolve limbs capable of fine manipulation — prerequisite for tool use.',
    epCost: 10, prerequisites: ['four_limbs'],
    genomeBitMod: { startBit: 12, count: 4, targetValue: 5 },  // appendageType = 5 (legs/hands)
  },
  {
    id: 'upright_posture', name: 'Upright Posture', category: 'body',
    description: 'Free the forelimbs from locomotion, enabling complex tool use.',
    epCost: 12, prerequisites: ['grasping_hands'],
    genomeBitMod: { startBit: 52, count: 4, targetValue: 9 },  // walkSpeed = 9
  },
  {
    id: 'size_increase_1', name: 'Size Increase I', category: 'body',
    description: 'Grow to medium body size for better thermal regulation and predator resistance.',
    epCost: 6, prerequisites: [],
    genomeBitMod: { startBit: 28, count: 4, targetValue: 8 },  // sizeClass = 8 (small)
  },
  {
    id: 'size_increase_2', name: 'Size Increase II', category: 'body',
    description: 'Reach large body size.',
    epCost: 10, prerequisites: ['size_increase_1'],
    genomeBitMod: { startBit: 28, count: 4, targetValue: 12 },  // sizeClass = 12 (medium-large)
  },
  {
    id: 'fins', name: 'Fins', category: 'body',
    description: 'Develop fins for efficient swimming.',
    epCost: 5, prerequisites: [],
    genomeBitMod: { startBit: 12, count: 4, targetValue: 4 },  // appendageType = 4 (fins)
  },
  {
    id: 'wings', name: 'Wings', category: 'body',
    description: 'Develop wings capable of sustained flight.',
    epCost: 15, prerequisites: ['bilateral_symmetry', 'size_increase_1'],
    genomeBitMod: { startBit: 12, count: 4, targetValue: 6 },  // appendageType = 6 (wings)
  },

  // ── Metabolism ────────────────────────────────────────────────────────────
  {
    id: 'endothermy', name: 'Endothermy (Warm Blood)', category: 'metabolism',
    description: 'Generate body heat internally — survive cold climates, sustain higher activity levels.',
    epCost: 12, prerequisites: ['bilateral_symmetry'],
    genomeBitMod: { startBit: 16, count: 4, targetValue: 10 },  // metabolicRate = 10 (high)
  },
  {
    id: 'efficient_digestion', name: 'Efficient Digestion', category: 'metabolism',
    description: 'Extract more energy from food — reduce hunger rate.',
    epCost: 6, prerequisites: [],
    genomeBitMod: { startBit: 24, count: 4, targetValue: 1 },  // dietaryType = 1 (heterotroph)
  },
  {
    id: 'omnivory', name: 'Omnivory', category: 'metabolism',
    description: 'Digest both plant and animal matter — more flexible food sources.',
    epCost: 8, prerequisites: ['efficient_digestion'],
    genomeBitMod: { startBit: 24, count: 4, targetValue: 2 },  // dietaryType = 2 (mixotroph)
  },
  {
    id: 'fat_reserves', name: 'Fat Reserves', category: 'metabolism',
    description: 'Store more energy as adipose tissue — survive longer without food.',
    epCost: 4, prerequisites: [],
    genomeBitMod: { startBit: 16, count: 4, targetValue: 6 },  // moderate metabolicRate (efficient storage)
  },

  // ── Senses ────────────────────────────────────────────────────────────────
  {
    id: 'light_dark_vision', name: 'Light / Dark Vision', category: 'senses',
    description: 'Primitive photoreceptors detect light and shadow.',
    epCost: 3, prerequisites: [],
    genomeBitMod: { startBit: 32, count: 4, targetValue: 1 },  // visionType = 1
  },
  {
    id: 'colour_vision', name: 'Colour Vision', category: 'senses',
    description: 'Trichromatic vision enables recognition of fruits, mates, and threats.',
    epCost: 6, prerequisites: ['light_dark_vision'],
    genomeBitMod: { startBit: 32, count: 4, targetValue: 2 },  // visionType = 2
  },
  {
    id: 'camera_eyes', name: 'Camera Eyes', category: 'senses',
    description: 'High-resolution focused image formation — maximum visual acuity.',
    epCost: 10, prerequisites: ['colour_vision'],
    genomeBitMod: { startBit: 32, count: 4, targetValue: 6 },  // visionType = 6
  },
  {
    id: 'extended_vision_range', name: 'Extended Vision Range', category: 'senses',
    description: 'See clearly at long distances — better predator detection and hunting.',
    epCost: 5, prerequisites: ['light_dark_vision'],
    genomeBitMod: { startBit: 36, count: 4, targetValue: 12 },  // visionRange = 12 (~24m)
  },
  {
    id: 'hearing', name: 'Hearing', category: 'senses',
    description: 'Detect vibrations in air — locate predators and communicate.',
    epCost: 4, prerequisites: [],
    genomeBitMod: { startBit: 40, count: 4, targetValue: 3 },  // hearing = 3 (ultrasonic)
  },
  {
    id: 'full_spectrum_hearing', name: 'Full Spectrum Hearing', category: 'senses',
    description: 'Hear from infrasound to ultrasound.',
    epCost: 8, prerequisites: ['hearing'],
    genomeBitMod: { startBit: 40, count: 4, targetValue: 4 },  // hearing = 4
  },
  {
    id: 'keen_olfaction', name: 'Keen Olfaction', category: 'senses',
    description: 'Extraordinarily sensitive chemical sensing — track prey across kilometres.',
    epCost: 5, prerequisites: [],
    genomeBitMod: { startBit: 44, count: 4, targetValue: 12 },  // olfaction = 12
  },

  // ── Locomotion ────────────────────────────────────────────────────────────
  {
    id: 'fast_swim', name: 'Fast Swimming', category: 'locomotion',
    description: 'Streamlined body for high-speed aquatic movement.',
    epCost: 5, prerequisites: [],
    genomeBitMod: { startBit: 48, count: 4, targetValue: 12 },  // swimSpeed = 12
  },
  {
    id: 'fast_walk', name: 'Fast Walking', category: 'locomotion',
    description: 'Long, powerful legs for running prey down.',
    epCost: 7, prerequisites: ['four_limbs'],
    genomeBitMod: { startBit: 52, count: 4, targetValue: 12 },  // walkSpeed = 12
  },
  {
    id: 'flight', name: 'Powered Flight', category: 'locomotion',
    description: 'Sustained flight capability.',
    epCost: 15, prerequisites: ['wings'],
    genomeBitMod: { startBit: 56, count: 4, targetValue: 10 },  // flySpeed = 10
  },
  {
    id: 'burrowing', name: 'Burrowing', category: 'locomotion',
    description: 'Dig tunnels for shelter and ambush hunting.',
    epCost: 5, prerequisites: [],
    genomeBitMod: { startBit: 60, count: 4, targetValue: 8 },  // burrowSpeed = 8
  },

  // ── Defense ────────────────────────────────────────────────────────────────
  {
    id: 'thick_hide', name: 'Thick Hide', category: 'defense',
    description: 'Dense skin provides basic protection from bites and claws.',
    epCost: 4, prerequisites: [],
    genomeBitMod: { startBit: 64, count: 1, targetValue: 1 },  // hasArmor bit
  },
  {
    id: 'armor_plating', name: 'Armour Plating', category: 'defense',
    description: 'Hard bony or chitinous plates provide serious defence.',
    epCost: 10, prerequisites: ['thick_hide'],
    genomeBitMod: { startBit: 68, count: 4, targetValue: 10 },  // armorThickness = 10
  },
  {
    id: 'venom', name: 'Venom', category: 'defense',
    description: 'Produce a toxic compound delivered through bite or sting.',
    epCost: 8, prerequisites: [],
    genomeBitMod: { startBit: 65, count: 1, targetValue: 1 },  // hasVenom
  },
  {
    id: 'potent_venom', name: 'Potent Venom', category: 'defense',
    description: 'Highly concentrated neurotoxin — incapacitates prey rapidly.',
    epCost: 10, prerequisites: ['venom'],
    genomeBitMod: { startBit: 72, count: 4, targetValue: 14 },  // venomPotency = 14
  },
  {
    id: 'camouflage', name: 'Camouflage', category: 'defense',
    description: 'Dynamic skin patterning for concealment.',
    epCost: 7, prerequisites: [],
    genomeBitMod: { startBit: 67, count: 1, targetValue: 1 },  // hasCamouflage
  },
  {
    id: 'claws', name: 'Claws', category: 'defense',
    description: 'Sharp retractable claws for hunting and climbing.',
    epCost: 5, prerequisites: [],
    genomeBitMod: { startBit: 76, count: 4, targetValue: 1 },  // weaponType = 1 (claws)
  },
  {
    id: 'teeth', name: 'Teeth', category: 'defense',
    description: 'Differentiated teeth for biting, tearing, and grinding.',
    epCost: 4, prerequisites: [],
    genomeBitMod: { startBit: 76, count: 4, targetValue: 3 },  // weaponType = 3 (teeth)
  },

  // ── Neural ────────────────────────────────────────────────────────────────
  {
    id: 'neural_level_1', name: 'Instinct Brain (Level 1)', category: 'neural',
    description: 'Develop a centralised nervous system capable of learned behaviours.',
    epCost: 10, prerequisites: [],
    genomeBitMod: { startBit: 96, count: 8, targetValue: 40 },  // neuralComplexity = 40 (Level 1)
  },
  {
    id: 'neural_level_2', name: 'Learning Brain (Level 2)', category: 'neural',
    description: 'Limbic system enables associative learning and memory.',
    epCost: 20, prerequisites: ['neural_level_1'],
    genomeBitMod: { startBit: 96, count: 8, targetValue: 90 },  // neuralComplexity = 90 (Level 2)
  },
  {
    id: 'neural_level_3', name: 'Reasoning Brain (Level 3)', category: 'neural',
    description: 'Expanded neocortex supports causal reasoning and planning.',
    epCost: 40, prerequisites: ['neural_level_2'],
    genomeBitMod: { startBit: 96, count: 8, targetValue: 160 },  // Level 3
  },
  {
    id: 'neural_level_4', name: 'Abstract Brain (Level 4)', category: 'neural',
    description: 'Language areas enable symbolic thought, culture and technology.',
    epCost: 80, prerequisites: ['neural_level_3'],
    genomeBitMod: { startBit: 96, count: 8, targetValue: 220 },  // Level 4
  },
  {
    id: 'large_memory', name: 'Large Memory', category: 'neural',
    description: 'Expanded hippocampus stores many more episodic memories.',
    epCost: 8, prerequisites: ['neural_level_1'],
    genomeBitMod: { startBit: 104, count: 8, targetValue: 200 },  // memoryCapacity = 200
  },
  {
    id: 'fast_learner', name: 'Fast Learner', category: 'neural',
    description: 'High synaptic plasticity — learn new skills quickly.',
    epCost: 10, prerequisites: ['neural_level_2'],
    genomeBitMod: { startBit: 112, count: 8, targetValue: 200 },  // learningRate = 200
  },
  {
    id: 'curiosity', name: 'Curiosity Drive', category: 'neural',
    description: 'Intrinsic motivation to explore and discover new things.',
    epCost: 8, prerequisites: ['neural_level_2'],
    genomeBitMod: { startBit: 120, count: 8, targetValue: 200 },  // curiosityDrive = 200
  },

  // ── Social ────────────────────────────────────────────────────────────────
  {
    id: 'pack_behavior', name: 'Pack Behaviour', category: 'social',
    description: 'Coordinate with a small group for hunting and defence.',
    epCost: 8, prerequisites: ['neural_level_1'],
    genomeBitMod: { startBit: 128, count: 4, targetValue: 3 },  // socialStructure = 3 (pack)
  },
  {
    id: 'tribal', name: 'Tribal Organisation', category: 'social',
    description: 'Form tribes of 20-150 individuals with division of labour.',
    epCost: 15, prerequisites: ['pack_behavior', 'neural_level_3'],
    genomeBitMod: { startBit: 128, count: 4, targetValue: 6 },  // socialStructure = 6 (tribal)
  },
  {
    id: 'cooperation', name: 'High Cooperation', category: 'social',
    description: 'Strong drive to cooperate for mutual benefit.',
    epCost: 10, prerequisites: ['pack_behavior'],
    genomeBitMod: { startBit: 144, count: 8, targetValue: 200 },  // cooperationDrive = 200
  },
  {
    id: 'altruism', name: 'Kin Altruism', category: 'social',
    description: 'Sacrifice personal fitness for genetic relatives.',
    epCost: 8, prerequisites: ['pack_behavior'],
    genomeBitMod: { startBit: 152, count: 8, targetValue: 180 },  // altruism = 180
  },
  {
    id: 'complex_language', name: 'Complex Language', category: 'social',
    description: 'Full grammar and large vocabulary enabling cultural transmission.',
    epCost: 20, prerequisites: ['neural_level_3', 'tribal'],
    genomeBitMod: { startBit: 176, count: 8, targetValue: 230 },  // grammarComplexity = 230
  },
  {
    id: 'cultural_transmission', name: 'Cultural Transmission', category: 'social',
    description: 'Pass learned knowledge across generations rapidly.',
    epCost: 15, prerequisites: ['complex_language'],
    genomeBitMod: { startBit: 184, count: 8, targetValue: 220 },  // culturalTransmission = 220
  },

  // ── Civilization ──────────────────────────────────────────────────────────
  {
    id: 'tool_use_basic', name: 'Basic Tool Use', category: 'civilization',
    description: 'Use found objects as tools.',
    epCost: 10, prerequisites: ['neural_level_2', 'grasping_hands'],
    genomeBitMod: { startBit: 224, count: 8, targetValue: 60 },  // toolUseSophistication = 60
  },
  {
    id: 'tool_making', name: 'Tool Making', category: 'civilization',
    description: 'Craft tools from raw materials.',
    epCost: 15, prerequisites: ['tool_use_basic'],
    genomeBitMod: { startBit: 224, count: 8, targetValue: 130 },  // toolUseSophistication = 130
  },
  {
    id: 'advanced_tools', name: 'Advanced Tool Use', category: 'civilization',
    description: 'Use and manufacture complex multi-component tools and machines.',
    epCost: 25, prerequisites: ['tool_making', 'neural_level_4'],
    genomeBitMod: { startBit: 224, count: 8, targetValue: 200 },
  },
  {
    id: 'abstract_reasoning', name: 'Abstract Reasoning', category: 'civilization',
    description: 'Mathematical and logical reasoning beyond immediate perception.',
    epCost: 30, prerequisites: ['neural_level_4'],
    genomeBitMod: { startBit: 232, count: 8, targetValue: 220 },  // abstractReasoning = 220
  },
  {
    id: 'technology_drive', name: 'Technology Drive', category: 'civilization',
    description: 'Intrinsic desire to invent and innovate.',
    epCost: 20, prerequisites: ['abstract_reasoning'],
    genomeBitMod: { startBit: 248, count: 8, targetValue: 200 },  // technologyDrive = 200
  },
  {
    id: 'cultural_knowledge', name: 'Cultural Knowledge Capacity', category: 'civilization',
    description: 'Capacity to accumulate and transmit civilization-scale knowledge.',
    epCost: 25, prerequisites: ['cultural_transmission', 'abstract_reasoning'],
    genomeBitMod: { startBit: 240, count: 8, targetValue: 210 },  // culturalKnowledge = 210
  },
]
