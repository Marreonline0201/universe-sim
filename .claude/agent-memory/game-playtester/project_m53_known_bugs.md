---
name: M53 Known Bugs
description: Bugs found in M53 (Seasonal Events, Home Customization, Combat Combo) and M52 fix verification — precise file + line references
type: project
---

Audit completed 2026-03-26. Code-only audit. 4 issues total.

**Important:**

1. `ComboHUD.tsx` — stale `fadeTimer` state in `useEffect` cleanup — `src/ui/ComboHUD.tsx` lines 19-47.
   - The `useEffect` dependency array is `[visible]`, but the interval callback and cleanup both read `fadeTimer` state. When `fadeTimer` changes (a new `setTimeout` is stored), the effect does NOT re-run, so the `if (fadeTimer) clearTimeout(fadeTimer)` inside the callback uses the stale value from the previous closure. This means if the combo becomes active again right as a fade-out timer fires, the old timeout may not be cleared and `setVisible(false)` can fire incorrectly, causing the HUD to disappear while the combo is still active.
   - The `// eslint-disable-next-line react-hooks/exhaustive-deps` comment explicitly suppresses the missing-dep warning, indicating the designer is aware of the dep omission but the stale-timer hazard is real.
   - Fix: Use a `useRef` to hold the fade timer instead of `useState`, so the ref value is always current without needing to add it to the dep array.

2. `HomeCustomizationSystem.ts` — `purchaseDecoration` and `unequipDecoration` do not dispatch `home-customized` — `src/game/HomeCustomizationSystem.ts` lines 74-83 and 113-118.
   - Only `equipDecoration` (line 108) dispatches `window.dispatchEvent(new CustomEvent('home-customized', ...))`.
   - `purchaseDecoration` and `unequipDecoration` both mutate module state but fire no event.
   - `HomeCustomizationPanel` listens for `home-customized` to call `refresh()` (line 244). It also calls `refresh()` manually in `handleBuy` and `handleUnequip` (lines 282, 294), so the UI does update correctly in practice.
   - However, if any other component or system ever subscribes to `home-customized` expecting it to fire on purchase or unequip, it will not receive those events. Architecturally inconsistent.
   - Fix: Add `window.dispatchEvent(new CustomEvent('home-customized', { detail: { decorationId: id } }))` at the end of both `purchaseDecoration` (on success) and `unequipDecoration`.

**Minor:**

3. `FactionWarPanel.tsx` — `isAttackerVictor` variable name is now semantically wrong after M52 fix — `src/ui/panels/FactionWarPanel.tsx` line 165.
   - Before M52 fix, defender could never win so the variable was accurate. Now `victor` can be `attackingFactionId`, `defendingFactionId`, or `'ceasefire'`. The variable is computed as `war.victor && war.victor !== 'ceasefire'`, which is now effectively "wasThereAVictor". The trophy icon `'🏆 '` shows for ANY victor including defender. No functional regression, but the variable name is misleading for future readers.
   - Fix: Rename to `hasVictor` or `hasWinner`.

4. `SeasonalPanel.tsx` — `getCurrentSeasonalBonus()` is not reactive to season changes — `src/ui/panels/SeasonalPanel.tsx` line 52.
   - `season` comes from `useSeasonStore` (reactive Zustand subscription). `bonus` comes from `getCurrentSeasonalBonus()` which reads from `SeasonalEventSystem.currentSeason` (module-level variable). This module variable is only updated when `onSeasonChange()` is called in `GameLoop`. There is a brief window (up to ~1 real second, since the panel re-renders on a 1s interval) where `season` from the store reflects the new season but `bonus` still shows the old season's data. In practice the 1s interval will correct it quickly.
   - Low impact but technically stale.
   - Fix: Listen for the `seasonal-change` custom event in `SeasonalPanel` and call `refresh` on it (same pattern as other panels that listen to system events).

**M52 fix verification:**

- `daynight-fadein` keyframe: FIXED. `src/ui/DayNightEventHUD.tsx` lines 32-37 now inject `<style>` with `@keyframes daynight-fadein { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }` inline, following the same pattern as CraftingPanel.
- FactionWar victor 3-way outcome: FIXED. `src/game/FactionWarSystem.ts` line 92 now reads `const victor = roll < 0.4 ? war.attackingFactionId : roll < 0.7 ? war.defendingFactionId : 'ceasefire'`. Defender can now win.
- `WorldEventLogger` dawn category: FIXED. Line 148 now assigns `'social'` to `dawn` period events.

**M53 integration points confirmed working:**

- `onSeasonChange` and `tickSeasonalEvents` called in `GameLoop.ts` lines 2922-2931. Change detection via `lastSeasonRef` (useRef). Season normalised from UPPER to lowercase via `normaliseSeasonName`.
- `tickCombo(dt * 1000)` called every frame at line 406. `getDamageMultiplier()` applied to damage calc at line 1784 (`streakMult`). `onHit()` called on creature hit (line 1816) and animal hit (line 1860).
- `combo-milestone` dispatched inside `ComboSystem.onHit()` at counts 5, 10, 20 (line 79-81). Listened to in `WorldEventLogger.ts` line 170 and logs as `'combat'` category.
- `seasonal-event` dispatched inside `SeasonalEventSystem.onSeasonChange()` line 148. Listened to in `WorldEventLogger.ts` line 159; logs as `'exploration'` category (thematically reasonable for seasonal content).
- `seasonal-change` dispatched at line 143 of `SeasonalEventSystem.ts`. Currently no listener subscribes to it (SeasonalPanel does not listen to it; it uses 1s interval instead). Orphaned event — low severity.
- `ComboHUD` rendered in `HUD.tsx` at line 2580, unconditionally.
- `SeasonalPanel` registered in `SidebarShell.tsx`: lazy-loaded (line 68), panel title (line 121), nav icon (line 156), component map (line 194), S/s key binding (line 254). `'seasonal'` is in `PanelId` union in `uiStore.ts`.
- `HomeCustomizationPanel` rendered inline inside `HousingPanel.tsx` in a collapsible "Customize" accordion section (line 300). Not a separate sidebar panel — it is embedded in the Housing panel.
- `serializeHome` / `deserializeHome` wired in `OfflineSaveManager.ts` lines 140 and 286. Save writes `homeCustomization: serializeHome()`. Load calls `deserializeHome(state.homeCustomization)` if field exists.
- `purchaseDecoration` calls `usePlayerStore.getState().spendGold(dec.cost.gold)` internally. The `_playerGold` parameter passed from UI is ignored inside the function (named with leading underscore). `spendGold` correctly checks `s.gold < amount` before deducting. Gold deduction is correct.
- Decoration grid shows 2-column layout. Buy button disabled (cursor not-allowed, grey border) when `gold < dec.cost.gold`. Owned decorations show EQUIP/UNEQUIP buttons. Theme filter buttons filter decoration grid to matching theme.
