---
name: M59 Known Bugs
description: M59 audit findings — 2 critical bugs (WeatherEventSystem never receives weather updates, dead weather trigger types), 2 important bugs (lightning consequence misfire, wind/fog/sunny/thunder/snow triggers unreachable from server WeatherState)
type: project
---

M59 audit completed 2026-03-26.

## Critical

**BUG 1 — WeatherEventSystem._currentWeather is permanently stuck at 'clear'**
- File: `src/net/WorldSocket.ts` line ~455 (WEATHER_UPDATE handler)
- The handler calls `useWeatherStore.getState().updateSector(...)` but never dispatches a `weather-changed` CustomEvent.
- WeatherEventSystem listens for `weather-changed` to update `_currentWeather`. Since it never fires, `_currentWeather` never changes from its initial value of `'clear'`.
- Result: only events with `weatherTrigger: 'clear'` can ever fire (rainbow, night_frost, drought_warning, fog_of_war is blocked). All storm/rain/snow/fog/wind events are permanently unreachable.
- Fix: Add `window.dispatchEvent(new CustomEvent('weather-changed', { detail: { weather: msg.state.toLowerCase() } }))` inside the `WEATHER_UPDATE` handler, after updating the store.

**BUG 2 — WeatherState enum has no 'wind', 'fog', 'sunny', 'thunder', or 'snow' values**
- File: `src/store/weatherStore.ts` line 8
- Server WeatherState is: `'CLEAR' | 'CLOUDY' | 'RAIN' | 'STORM' | 'BLIZZARD' | 'TORNADO_WARNING' | 'VOLCANIC_ASH' | 'ACID_RAIN'`
- WeatherEventSystem triggers reference: 'wind', 'fog', 'sunny', 'thunder', 'snow' — none of which exist in the server enum.
- Events affected: wind_boost (trigger: 'wind'), fog_of_war (trigger: 'fog'), heatwave (trigger: 'sunny'/'clear'), drought_warning (trigger: 'sunny'/'clear'), lightning_strike (trigger: 'storm'/'thunder'), blizzard_gust (trigger: 'snow'/'blizzard').
- Only 'rain', 'storm', 'clear', 'blizzard' can potentially match. Combined with Bug 1, effectively zero events can fire.
- Fix: Either extend WeatherState with the missing types, or remap triggers to the actual server states (e.g., 'fog' → no match exists; 'thunder' → 'STORM'; 'snow' → 'BLIZZARD'; 'sunny' → 'CLEAR').

## Important

**BUG 3 — lightning_strike consequence dispatches 'weather-flood-start' (flood channel reuse)**
- File: `src/game/WeatherEventSystem.ts` line 283
- `_fireConsequences` for 'lightning_strike' dispatches `weather-flood-start` in addition to `lightning-resource-strike`. The comment says "reuse flood channel for XP hint" but this is semantically wrong — any flood listener will activate on a lightning strike. Should use a distinct event or remove the flood dispatch.

**BUG 4 — useWeatherStore import is dead code in WeatherEventSystem**
- File: `src/game/WeatherEventSystem.ts` line 6
- `useWeatherStore` is imported but never called. The system was apparently designed to poll it directly but was changed to use the event. Since the event is never dispatched (Bug 1), the store should be used directly in `tickWeatherEvents`: read `useWeatherStore.getState().getPlayerWeather()?.state.toLowerCase()` as the current weather. This would fix Bug 1 without requiring WorldSocket changes.

## Verified passing

- All 3 systems initialized in App.tsx (lines 85, 89, 90, 151, 158, 159) — PASS
- All 3 panels wired in SidebarShell PANEL_COMPONENTS — PASS
- All 3 panel IDs in uiStore PanelId union ('weatherevents', 'market', 'titleprogress') — PASS
- GameLoop ticks all 3 systems (checkTitles every 30s line 3279, tickWeatherEvents every 15s line 3580, tickMarketPrices every 20s line 3589) — PASS
- Timer refs declared correctly — PASS
- OfflineSaveManager serializes/deserializes titles (lines 156, 341-342) — PASS
- TitleProgressionSystem checkTitles() reads from usePlayerStatsStore — PASS
- All TITLE_DEFINITIONS stat names match PlayerStats interface (killCount, resourcesGathered, itemsCrafted, distanceTraveled, totalGoldEarned, potionsBrewed, animalsTamed, settlementsDiscovered, bossesKilled, goldenFishCaught) — PASS
- MarketPriceSystem mean-reversion formula: `price += (base - price) * 0.05 + noise` — valid, converges — PASS
- MarketPriceSystem min-price guard: `Math.max(item.minPrice, ...)` in tick and _shiftPrice — PASS, prices cannot go negative
- MarketPriceSystem: minPrice is always >= 1 for all items — PASS

**Why:** All M59 critical/important bugs documented for fix tracking.
**How to apply:** When reviewing M60 or M59 fixes, verify WorldSocket WEATHER_UPDATE dispatches weather-changed OR WeatherEventSystem reads weatherStore directly.
