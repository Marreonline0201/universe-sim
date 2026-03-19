// All real-world physics constants used throughout the simulation.
// Values from NIST 2022 CODATA unless otherwise noted.

export const PHYSICS = {
  G:  6.67430e-11,   // N·m²/kg²  — gravitational constant
  c:  299_792_458,   // m/s       — speed of light in vacuum
  h:  6.62607015e-34,// J·Hz⁻¹   — Planck constant
  hbar: 1.054571817e-34, // J·s   — reduced Planck constant (h/2π)
  k:  1.380649e-23,  // J/K       — Boltzmann constant
  sigma: 5.670374419e-8, // W/m²·K⁴ — Stefan-Boltzmann constant
  epsilon0: 8.8541878128e-12, // F/m — vacuum permittivity
  mu0: 1.25663706212e-6,     // H/m — vacuum permeability
  e:  1.602176634e-19, // C    — elementary charge
  me: 9.1093837015e-31,// kg   — electron rest mass
  mp: 1.67262192369e-27,//kg   — proton rest mass
  mn: 1.67492749804e-27,//kg   — neutron rest mass
  u:  1.66053906660e-27,//kg   — unified atomic mass unit (1 Da)
  Na: 6.02214076e23,  // /mol  — Avogadro number
  R:  8.314462618,    // J/mol·K — universal gas constant (= Na×k)
  F:  96485.33212,    // C/mol — Faraday constant
  atm: 101325,        // Pa    — standard atmosphere
  g_earth: 9.80665,   // m/s²  — standard gravity
  c_light_ns: 0.299792458, // m/ns — light travel per nanosecond
} as const

export const THERMO = {
  // Specific heats (J/kg·K) — real values
  Cp_water: 4186,
  Cp_ice:   2090,
  Cp_air:   1005,
  Cp_iron:  449,
  Cp_granite: 790,
  Cp_sand:  835,
  Cp_wood:  1700,
  Cp_copper: 385,
  // Latent heats (J/kg) — real values
  L_water_vaporization: 2_260_000,
  L_water_fusion:       334_000,
  L_nitrogen_vaporization: 199_000,
  // Thermal conductivity (W/m·K)
  k_iron:    80,
  k_copper:  400,
  k_granite: 2.9,
  k_water:   0.6,
  k_air:     0.026,
  k_ice:     2.2,
  k_wood:    0.12,
} as const

export const CHEMISTRY = {
  // Electronegativity scale (Pauling)
  // Real standard reduction potentials (V)
  // Real bond energies (kJ/mol)
  // Activation energies for key reactions (kJ/mol)
  Ea_combustion_methane: 190,    // kJ/mol
  Ea_photosynthesis: 114,         // kJ/mol (per CO2 fixed)
  Ea_rusting: 62,                 // kJ/mol (iron oxidation)
  Ea_fermentation: 85,            // kJ/mol
} as const

export const BIOLOGY = {
  // Real biological parameters
  ATP_energy: 30.5e3,       // J/mol — ATP hydrolysis free energy
  glucose_combustion: 2803e3,// J/mol — complete glucose oxidation
  mutation_rate_base: 1e-9,  // per base pair per generation (like real bacteria)
  dna_bp_per_gene: 1000,     // approximate bp per gene
  neuron_firing_rate_hz: 100,// Hz — max firing rate
  synapse_transmission_ms: 1,// ms — synaptic delay
} as const

export const SIMULATION = {
  // Grid
  CELL_SIZE_M: 1.0,          // 1 meter per grid cell (ground scale)
  GRID_CHUNK_SIZE: 64,       // cells per chunk per axis
  MAX_CHEMICALS_PER_CELL: 8, // max chemical species per cell
  // Time
  BASE_TICK_MS: 16.67,       // ~60fps target
  MAX_TIME_SCALE: 1e6,       // 1M× speed (for geological epochs)
  MIN_TIME_SCALE: 0.01,      // slow-mo for quantum events
  // AI
  VISION_RAYS: 32,           // raycasts per creature vision update
  MAX_MEMORY_EVENTS: 50,     // episodic memory capacity
  LLM_CONTEXT_TOKENS: 2000,  // max tokens for NPC prompt
} as const
