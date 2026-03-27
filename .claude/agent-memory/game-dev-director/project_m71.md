---
name: M71 Monolith Decomposition
description: M71 DONE — DungeonRoomInteractionSystem extracted from GameLoop (3539->3196), HUD VitalBars+WeatherWidgets extracted (2783->2416), 710 lines total
type: project
---

M71 Tracks A+B shipped (commit 1a03d15).

**What was done:**
- Track A: `src/game/DungeonRoomInteractionSystem.ts` (463 lines) — all dungeon room interaction logic (guardian, puzzle, shrine, boss_lair, mini_boss, spike_trap) extracted from GameLoop. GameLoop reduced from 3539 to 3196 lines (-343).
- Track B: `src/ui/components/VitalBars.tsx` (204 lines) — RustVitalBar, WarmthBar, StaminaBar, ShelterIndicator extracted from HUD. `src/ui/components/WeatherWidgets.tsx` (186 lines) — WeatherIcon, WeatherWidget, StormWindIndicator, WEATHER_ICONS extracted. HUD reduced from 2783 to 2416 lines (-367).
- Dead imports cleaned: DungeonSystem imports (generateAllDungeonRooms, isDungeonRoomActive, etc.), shelterState import from HUD, puzzleResetCheckRef unused ref removed.

**What remains for future M72+:**
- GameLoop still 3196 lines — NPC dialogue proximity block (~50 lines at ~1085), combat tick, sailing tick are next candidates
- HUD still 2416 lines — SkillXpBar (230 lines), DisasterWarningOverlay (275 lines), SeasonWidgets (150 lines) are next extraction targets
- Index bundle still 4.1MB — code splitting for game systems not yet done (Track C deferred)
- 178 useStore.getState() calls per frame in GameLoop — caching optimization still deferred

**Why:** Monolith decomposition reduces merge conflict risk, improves maintainability, and enables targeted testing.

**How to apply:** When adding dungeon room types, modify DungeonRoomInteractionSystem.ts. When adding vital/status bars, add to components/VitalBars.tsx. Weather HUD additions go in components/WeatherWidgets.tsx.
