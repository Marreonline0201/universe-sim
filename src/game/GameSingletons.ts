// ── GameSingletons ─────────────────────────────────────────────────────────────
// Single import point for all stateful game-system class instances.
// These are module-level singletons — created once, shared everywhere.
// UI panels read from these; game engine writes to these.

import { Inventory } from '../player/Inventory'
import { DiscoveryJournal } from '../player/DiscoveryJournal'
import { CivilizationTracker } from '../civilization/CivilizationTracker'
import { BuildingSystem } from '../civilization/BuildingSystem'
import { QuestSystem } from './QuestSystem'
import { CombatSystem } from './CombatSystem'
import { AchievementSystem } from './AchievementSystem'
import { TutorialSystem } from './TutorialSystem'

export const inventory       = new Inventory()
export const journal         = new DiscoveryJournal()
export const civTracker      = new CivilizationTracker()
export const buildingSystem  = new BuildingSystem()
export const questSystem     = new QuestSystem()
export const combatSystem      = new CombatSystem()
export const achievementSystem = new AchievementSystem()
export const tutorialSystem    = new TutorialSystem()
