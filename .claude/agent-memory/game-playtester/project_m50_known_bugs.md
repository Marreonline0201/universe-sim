---
name: M50 Known Bugs
description: Bugs found in M50 (Reputation Titles, Weather Forecast, Cave Features) and M49 Specialization re-check — includes precise file + line references
type: project
---

Audit completed 2026-03-26. Code-only audit (no live browser, auth barrier). Six bugs total.

**Critical:**

1. MAT/ITEM enum ID collision — `src/player/Inventory.ts` line 401 vs 496.
   - `MAT.MUSHROOM_SOUP = 79` and `ITEM.LUMINITE_DAGGER = 79` share the same numeric value.
   - These are separate namespaces (`MAT` vs `ITEM`) so TypeScript does not error, but any code that dispatches on a raw number without knowing which enum it came from will misidentify one as the other.
   - Direct runtime risk: `CaveFeatureSystem.ts` loot `matName()` builds a reverse-lookup `Record<number, string>` from `MAT` only, so numeric 79 maps to `mushroom soup` correctly for material display. No immediate crash, but any future code using a raw `79` as an item could hit the wrong branch.
   - **Why critical:** Numeric collisions in enums are silent bugs that cause wrong-item-type dispatches as features grow. Pattern has been seen in this codebase before.

**Important:**

2. Faction-specific reputation titles will never unlock — `src/game/GameLoop.ts` lines 3129–3135.
   - The `factionReps` map passed to `checkAndUpdateTitles` only ever has one key (the player's current faction), and that key's value is set to the total of ALL settlement points, not the points for settlements actually belonging to that faction.
   - Faction-specific titles (`plains_ally`, `plains_hero`, `forest_ally`, `coastal_ally`, `mountain_ally`) check `factionReps[title.factionId]` in `ReputationTitleSystem.ts` line 72. Because no settlement is filtered by faction before summing, non-joined factions will always read 0 and never unlock, and the joined faction's value inflates above its true amount.
   - **Fix needed:** Sum only settlements whose faction assignment matches `title.factionId`, not all settlements.

3. `WeatherForecastPanel` does not react to automatic forecast updates — `src/ui/panels/WeatherForecastPanel.tsx` lines 98–100.
   - The `useEffect` dependency is `[forecastState.lastUpdated]`, but `forecastState` is a plain module-level object (not Zustand state). React has no mechanism to observe mutations to it. The effect therefore never re-fires when `GameLoop` calls `updateForecasts()` every 60 game-seconds.
   - The panel only shows fresh data when the player manually clicks "Check Forecast" (which calls `forceUpdate`), or when the panel first mounts.
   - **Fix needed:** Either store `forecastState` in Zustand/context so it triggers re-renders, or use a `setInterval` tick inside the panel (like `CaveFeaturesPanel` does with `useTick`).

4. `SciencePanel` Meteorology Research button does not cause `WeatherForecastPanel` to refresh — `src/ui/panels/SciencePanel.tsx` line 307–308.
   - `setForecastAccuracy()` mutates the module-level `forecastState` object, then `forceUpdate` re-renders `SciencePanel` only. Any open `WeatherForecastPanel` reads `forecastState.accuracy` on render but will not re-render after the mutation because its `useEffect` dependency on `forecastState.lastUpdated` will not fire (same root cause as bug 3).
   - In practice a player would need to close and reopen the forecast panel to see the new accuracy badge take effect.

**Minor:**

5. `CaveFeaturesPanel` mushroom patch loot preview displays only one mushroom entry (deduplication removes the bonus roll) — `src/ui/panels/CaveFeaturesPanel.tsx` line 104.
   - The loot display uses `.filter((row, i, arr) => arr.findIndex(r => r.matId === row.matId) === i)` to deduplicate. `CaveFeatureSystem.ts` mushroom_patch has two rows with `MAT.MUSHROOM` (one at 100%, one bonus at 60%). The dedup removes the second entry, so the UI shows `mushroom 100%` but never shows the bonus roll exists. The harvest logic correctly processes both rows (it merges qty into the same drop), so gameplay is unaffected but the UI under-reports the expected yield.

6. `ReputationTitlesPanel` faction rep display groups all settlement points under the player's current faction — `src/ui/panels/ReputationTitlesPanel.tsx` lines 61–65.
   - The panel-side `factionReps` calculation uses `playerFaction ?? 'plains'` for every settlement regardless of which faction that settlement actually belongs to. This causes the faction rep summary in the "Active Title" card to show an inflated number. Non-joined factions show 0. This mirrors the GameLoop bug (bug 2 above) and will cause misleading rep displays.

**M49 Specialization check (requested):**
- `SpecializationPanel.tsx` line 19: `SPEC_SKILL_IDS = ['combat', 'crafting', 'survival', 'smithing', 'gathering']` — correct, "Fishing" is NOT present. The comment in the file header still says "fishing" (line 7) which is stale but the actual array is correct.
- `SkillSpecializationSystem.ts` line 33: the "Angler" spec's `skillId` is `'gathering'`, not `'fishing'` — correctly scoped under Gathering.
- No crash risk when opening SpecializationPanel. M49 feature is stable.
