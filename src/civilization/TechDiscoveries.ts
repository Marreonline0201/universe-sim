// ── TechDiscoveries ───────────────────────────────────────────────────────────
// Maps tech node IDs → DISCOVERIES keys so the journal can be populated
// when research completes. Shared by SceneRoot (normal research) and
// TechTreePanel (god-mode instant research).

import type { DISCOVERIES } from '../player/DiscoveryJournal'

export const TECH_TO_DISCOVERY: Partial<Record<string, keyof typeof DISCOVERIES>> = {
  fire:                          'fire_making',
  stone_tools:                   'tool_use',
  wheel:                         'wheel',
  language_basic:                'language',
  agriculture:                   'agriculture',
  writing:                       'writing',
  sailing:                       'navigation',
  pottery:                       'alchemy',
  metallurgy_copper:             'smelting',
  medicine_herbal:               'medicine_basic',
  engineering_classical:         'mechanics',
  medicine_anatomy:              'medicine_basic',
  natural_philosophy:            'scientific_method',
  philosophy:                    'philosophy',
  germ_theory_formal:            'germ_theory',
  evolution_theory:              'evolution',
  thermodynamics_classical:      'thermodynamics',
  steam_engine:                  'steam_power',
  industrial_chemistry:          'chemistry',
  electromagnetism_classical:    'electromagnetism',
  quantum_physics:               'quantum_mechanics',
  relativity:                    'general_relativity',
  nuclear_fission:               'nuclear_physics',
  genetics:                      'genetics',
  genetic_engineering_advanced:  'genetic_engineering',
  transistor:                    'semiconductor_physics',
  integrated_circuit:            'electronics',
  rocketry:                      'aerospace',
  artificial_intelligence:       'AI',
  nuclear_fusion:                'plasma_physics',
  nanotechnology:                'nanotechnology',
  megastructure:                 'megastructure_engineering',
  dyson_sphere_tech:             'stellar_engineering',
  matrioshka_brain_tech:         'computronium',
  universe_simulation_tech:      'simulation_hypothesis',
  physical_constants_control:    'reality_engineering',
}
