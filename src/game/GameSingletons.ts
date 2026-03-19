// ── GameSingletons ─────────────────────────────────────────────────────────────
// Single import point for all stateful game-system class instances.
// These are module-level singletons — created once, shared everywhere.
// UI panels read from these; game engine writes to these.

import { Inventory } from '../player/Inventory'
import { EvolutionTree } from '../player/EvolutionTree'
import { DiscoveryJournal } from '../player/DiscoveryJournal'
import { TechTree } from '../civilization/TechTree'
import { CivilizationTracker } from '../civilization/CivilizationTracker'
import { BuildingSystem } from '../civilization/BuildingSystem'

export const inventory       = new Inventory()
export const evolutionTree   = new EvolutionTree()
export const journal         = new DiscoveryJournal()
export const techTree        = new TechTree()
export const civTracker      = new CivilizationTracker()
export const buildingSystem  = new BuildingSystem()
