/**
 * GameLoopPeriodicTasks — registers timer-based periodic systems.
 * RPG systems removed. Only core simulation tasks remain.
 */

import { gameLoopScheduler } from './GameLoopScheduler'
import { useWeatherStore } from '../store/weatherStore'

export function registerPeriodicTasks(): void {
  // Weather sector update every 10s
  gameLoopScheduler.register('weather-update', 10, (_simSeconds) => {
    // Weather store is updated by the server/weather system
  })
}
