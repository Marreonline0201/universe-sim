/**
 * GameLoopPeriodicTasks — registers all timer-based periodic systems with
 * the GameLoopScheduler.
 *
 * Extracted from GameLoop.ts to eliminate 25+ useRef timer declarations and
 * their identical increment/threshold/reset patterns.
 *
 * Each task was previously a block like:
 *   timerRef.current += dt
 *   if (timerRef.current >= INTERVAL) { timerRef.current = 0; tickFoo(simSeconds) }
 */

import { gameLoopScheduler } from './GameLoopScheduler'
import { useWeatherStore } from '../store/weatherStore'
import { useGameStore } from '../store/gameStore'
import { FACTION_IDS } from './FactionSystem'
// M52 Track A: Faction war events
import { tickFactionWars } from './FactionWarSystem'

// ── System imports (same as GameLoop used) ─────────────────────────────────

// M50 Track B: Weather forecast
import { updateForecasts } from './WeatherForecastSystem'
// M54 Track A: Merchant guild periodic refresh
import { refreshContracts } from './MerchantGuildSystem'
// M54 Track B: Bounty board
import { tickBountyBoard } from './BountyBoardSystem'
// M55 Track B: Resource depletion & respawn
import { tickResourceRespawn } from './ResourceDepletionSystem'
// M56 Track A: Dynamic NPC trade routes
import { tickTradeRoutes } from './TradeRouteSystem'
// M57 Track A: Achievement Showcase milestones
import { checkAndUpdateMilestones } from './AchievementShowcaseSystem'
// M58 Track C: Pet advancement
import { addPetXp } from './PetAdvancementSystem'
// M59 Track A: Weather event system
import { tickWeatherEvents } from './WeatherEventSystem'
// M59 Track B: Title progression
import { checkTitles } from './TitleProgressionSystem'
// M59 Track C: Market price system
import { tickMarketPrices } from './MarketPriceSystem'
// M60 Track B: World boss spawn system
import { tickWorldBoss } from './WorldBossSystem'
// M61 Track B: Settlement economy system
import { tickSettlementEconomy } from './SettlementEconomySystem'
// M65 Track B: Dynamic quest board
import { tickQuestBoard } from './DynamicQuestBoardSystem'
// M65 Track C: NPC emotion system
import { tickEmotions } from './NPCEmotionSystem'
// M66 Track C: Resource Trading Network
import { tickTradeNetwork } from './ResourceTradingNetwork'
// M67 Track C: Settlement relations system
import { tickRelations } from './SettlementRelationsSystem'
// M68 Track B: NPC Daily Schedule System
import { tickSchedule } from './NPCScheduleSystem'
// M68 Track C: Expedition system
import { tickExpeditions } from './ExpeditionSystem'
// M66 Track A: World event scheduler
import { tickScheduler } from './WorldEventSchedulerSystem'

/**
 * Register all periodic tasks with the scheduler. Call once during
 * GameLoop initialization (replaces 20+ useRef timer declarations).
 *
 * Tasks that need player position or other per-frame state are NOT here —
 * they remain in GameLoop's useFrame because they depend on frame-local data.
 * This file only contains tasks that need simSeconds (or nothing).
 */
export function registerPeriodicTasks(): void {
  // ── Every 1s ─────────────────────────────────────────────────────────────

  // M66 Track A: World event scheduler (was every-frame, 1s resolution is sufficient)
  gameLoopScheduler.register('world-event-scheduler', 1, (simSeconds) => {
    tickScheduler(simSeconds)
  })

  // ── Every 5s ─────────────────────────────────────────────────────────────

  // M55 Track B: Resource respawn
  gameLoopScheduler.register('resource-respawn', 5, (simSeconds) => {
    tickResourceRespawn(simSeconds)
  })

  // M65 Track C: NPC emotion decay
  gameLoopScheduler.register('npc-emotion-decay', 5, (simSeconds) => {
    tickEmotions(simSeconds)
  })

  // ── Every 10s ────────────────────────────────────────────────────────────

  // M67 Track C: Settlement relations
  gameLoopScheduler.register('settlement-relations', 10, (simSeconds) => {
    tickRelations(simSeconds, 10)
  })

  // M66 Track C: Resource trading network
  gameLoopScheduler.register('trade-network', 10, (simSeconds) => {
    tickTradeNetwork(simSeconds)
  })

  // M68 Track C: Expeditions
  gameLoopScheduler.register('expeditions', 10, (simSeconds) => {
    tickExpeditions(simSeconds)
  })

  // M68 Track B: NPC daily schedules
  gameLoopScheduler.register('npc-schedules', 10, (simSeconds) => {
    tickSchedule(simSeconds)
  })

  // ── Every 15s ────────────────────────────────────────────────────────────

  // M59 Track A: Weather events
  gameLoopScheduler.register('weather-events', 15, (simSeconds) => {
    tickWeatherEvents(simSeconds)
  })

  // ── Every 20s ────────────────────────────────────────────────────────────

  // M59 Track C: Market prices
  gameLoopScheduler.register('market-prices', 20, (simSeconds) => {
    tickMarketPrices(simSeconds)
  })

  // ── Every 30s ────────────────────────────────────────────────────────────

  // M56 Track A: NPC trade routes
  gameLoopScheduler.register('trade-routes', 30, (simSeconds) => {
    tickTradeRoutes(simSeconds)
  })

  // M57 Track A: Achievement showcase milestones
  gameLoopScheduler.register('achievement-milestones', 30, () => {
    checkAndUpdateMilestones()
  })

  // M58 Track C: Pet XP (addPetXp takes amount only)
  gameLoopScheduler.register('pet-xp', 30, () => {
    addPetXp(10)
  })

  // M59 Track B: Title progression
  gameLoopScheduler.register('title-progression', 30, () => {
    checkTitles()
  })

  // M60 Track B: World boss
  gameLoopScheduler.register('world-boss', 30, (simSeconds) => {
    tickWorldBoss(simSeconds)
  })

  // ── Every 60s ────────────────────────────────────────────────────────────

  // M50 Track B: Weather forecast refresh (needs current weather from store)
  gameLoopScheduler.register('weather-forecast', 60, (simSeconds) => {
    const wStore = useWeatherStore.getState()
    const currentWeather = wStore.getPlayerWeather()?.state ?? 'CLEAR'
    updateForecasts(simSeconds, currentWeather)
  })

  // M54 Track A: Merchant guild contract refresh
  gameLoopScheduler.register('merchant-guild', 60, (simSeconds) => {
    refreshContracts(simSeconds)
  })

  // M54 Track B: Bounty board
  gameLoopScheduler.register('bounty-board', 60, (simSeconds) => {
    tickBountyBoard(simSeconds)
  })

  // M61 Track B: Settlement economy
  gameLoopScheduler.register('settlement-economy', 60, (simSeconds) => {
    tickSettlementEconomy(simSeconds)
  })

  // M65 Track B: Dynamic quest board
  gameLoopScheduler.register('quest-board', 60, (simSeconds) => {
    tickQuestBoard(simSeconds)
  })

  // ── Every 120s ───────────────────────────────────────────────────────────

  // M52 Track A: Faction war system (every 120 sim-seconds)
  gameLoopScheduler.register('faction-wars', 120, (simSeconds) => {
    tickFactionWars(simSeconds, FACTION_IDS)
  })

  // NOTE: Seasonal events (tickSeasonalEvents) intentionally NOT here —
  // it runs every frame in GameLoop with dt for season progress accumulation.
}
