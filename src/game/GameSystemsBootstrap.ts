// ── M69 Track A: Consolidated game-system initializer ─────────────────────────
// All game systems are initialized from a single entry point so Vite can
// code-split the entire game-logic layer away from the initial bundle.
// App.tsx dynamically imports this module after mount.

import { initWorldEventLogger } from './WorldEventLogger'
import { initCaveFeatures } from './CaveFeatureSystem'
import { initJournalSystem } from './JournalSystem'
import { initNPCRelationshipSystem } from './NPCRelationshipSystem'
import { initRecipeDiscovery } from './RecipeDiscoverySystem'
import { initBountyBoard } from './BountyBoardSystem'
import { initMerchantGuildSystem, refreshContracts } from './MerchantGuildSystem'
import { initResourceDepletion } from './ResourceDepletionSystem'
import { initWorldThreatSystem } from './WorldThreatSystem'
import { initTradeRouteSystem } from './TradeRouteSystem'
import { initAchievementShowcase, checkAndUpdateMilestones } from './AchievementShowcaseSystem'
import { initWeatherEffectsSystem } from './WeatherEffectsSystem'
import { initWeatherEventSystem } from './WeatherEventSystem'
import { initLoreSystem } from './LoreSystem'
import { initHousingUpgrades } from './HousingUpgradeSystem'
import { initPetAdvancement } from './PetAdvancementSystem'
import { initTitleProgressionSystem } from './TitleProgressionSystem'
import { initMarketPriceSystem } from './MarketPriceSystem'
import { initCraftingMastery } from './CraftingMasterySystem'
import { initWorldBossSystem } from './WorldBossSystem'
import { initSkillComboSystem } from './SkillComboSystem'
import { initDungeonDelveSystem } from './DungeonDelveSystem'
import { initSettlementEconomy } from './SettlementEconomySystem'
import { initFactionReputationSystem } from './FactionReputationSystem'
import { initBlueprintSystem } from './BlueprintUnlockSystem'
import { initNPCMemorySystem } from './NPCMemorySystem'
import { initWorldChronicle } from './WorldChronicleSystem'
import { initSeasonalEventSystem } from './SeasonalEventSystem'
import { initPlayerHousing } from './PlayerHousingSystem'
import { initTalentTree } from './TalentTreeSystem'
import { initDynamicQuestBoard } from './DynamicQuestBoardSystem'
import { initNPCEmotionSystem } from './NPCEmotionSystem'
import { initPlayerTitleSystem } from './PlayerTitleSystem'
import { initWorldEventScheduler } from './WorldEventSchedulerSystem'
import { initResourceTradingNetwork } from './ResourceTradingNetwork'
import { initWorldHistoryCodex } from './WorldHistoryCodexSystem'
import { initPlayerAchievementJournal } from './PlayerAchievementJournalSystem'
import { initSettlementRelations } from './SettlementRelationsSystem'
import { initRecipeBook } from './RecipeBookSystem'
import { initExpeditionSystem } from './ExpeditionSystem'
import { initNPCScheduleSystem } from './NPCScheduleSystem'

/**
 * Initialize all game systems. Called once after the game scene mounts.
 * @param civTier - current civilization tier for tier-gated systems
 */
export function bootstrapGameSystems(civTier: number = 0): void {
  initWorldEventLogger()
  initCaveFeatures()
  initJournalSystem()
  initNPCRelationshipSystem()
  initRecipeDiscovery()
  initBountyBoard(civTier)
  initMerchantGuildSystem()
  refreshContracts(civTier)
  initResourceDepletion()
  initWorldThreatSystem()
  initTradeRouteSystem()
  initAchievementShowcase()
  checkAndUpdateMilestones()
  initWeatherEffectsSystem()
  initWeatherEventSystem()
  initLoreSystem()
  initHousingUpgrades()
  initPetAdvancement()
  initTitleProgressionSystem()
  initMarketPriceSystem()
  initCraftingMastery()
  initWorldBossSystem()
  initSkillComboSystem()
  initDungeonDelveSystem()
  initSettlementEconomy()
  initFactionReputationSystem()
  initBlueprintSystem()
  initNPCMemorySystem()
  initWorldChronicle()
  initSeasonalEventSystem()
  initPlayerHousing()
  initTalentTree()
  initDynamicQuestBoard(civTier)
  initNPCEmotionSystem()
  initPlayerTitleSystem()
  initWorldEventScheduler()
  initResourceTradingNetwork()
  initWorldHistoryCodex()
  initPlayerAchievementJournal()
  initSettlementRelations()
  initRecipeBook()
  initExpeditionSystem()
  initNPCScheduleSystem()
}
