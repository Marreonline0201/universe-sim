---
name: M52 Known Bugs
description: Bugs found in M52 (Faction War Events, Crafting Recipe Discovery, Day/Night Events) and M51 fix verification — precise file + line references
type: project
---

Audit completed 2026-03-26. Code-only audit. 9 issues total.

**Critical:**

1. `daynight-fadein` CSS keyframe is never defined — `src/ui/DayNightEventHUD.tsx` line 72.
   - `EventBadge` applies `animation: 'daynight-fadein 0.35s ease'` in inline style, but unlike `CraftingPanel` (which injects `@keyframes floatUp` via a `<style>` tag at line 774), `DayNightEventHUD` has no `<style>` tag and no `@keyframes daynight-fadein` definition anywhere in the codebase.
   - Result: badges appear but do not animate in. The browser silently ignores the unknown animation name.
   - Fix: Add `<style>{\`@keyframes daynight-fadein { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }\`}</style>` inside `DayNightEventHUD`, following the same pattern as `CraftingPanel.tsx` line 772-778.

**Important:**

2. `FactionWarSystem.tickFactionWars` victor assignment is one-sided — `src/game/FactionWarSystem.ts` line 91.
   - `const victor = Math.random() < 0.5 ? war.attackingFactionId : 'ceasefire'`
   - The defending faction can never be declared the victor; the two outcomes are always "attacker wins" or "ceasefire." This also makes `HistoryEntry` in `FactionWarPanel.tsx` line 165 (`isAttackerVictor`) effectively always true when a non-ceasefire victor exists.
   - Fix: Change line 91 to `Math.random() < 0.5 ? war.attackingFactionId : war.defendingFactionId` and add a separate 15% ceasefire path so all three outcomes are reachable.

3. W key opens Faction Wars panel even when `inputBlocked` is not yet propagated on first frame — `src/ui/SidebarShell.tsx` line 248.
   - `SidebarShell` registers `window.addEventListener('keydown', ...)` which fires before `GameLoop` sets `inputBlocked`. On session start, pressing W simultaneously triggers both `togglePanel('factionwars')` (SidebarShell) and `KeyW` movement (PlayerController, which reads `inputBlocked` from the game store). The store sets `inputBlocked = true` inside a React `useEffect`, which is asynchronous, so there is a one-frame window where both fire at the same time.
   - In practice this is a minor timing race rather than a hard conflict (PlayerController correctly stops movement when `inputBlocked` is true at line 406). No player-visible bug is guaranteed, but it is a structural fragility.
   - Fix: Note for designer awareness. Not urgent.

**Minor:**

4. `FactionWarPanel` — war history victor trophy logic works but defending victor name can never display — consequence of bug #2. `src/ui/panels/FactionWarPanel.tsx` line 165-171.

5. `CraftingPanel` — "Show Discovered Only" toggle label shows "Known" when active and "All" when inactive. The hint tooltip says "Show only discovered recipes" / "Show all recipes including undiscovered ???". The label "All" when inactive is slightly misleading because clicking it will activate the discovered-only filter (not show all). Low confusion risk but worth a label polish (e.g., "Known Only" / "All").

6. `CraftingPanel` — `setSelectedRecipe(r)` at line 454 correctly calls `setLastCraftedRarity(0)` (M51 fix #5 verified as done). No issue.

7. `DayNightEventHUD` — `refresh` callback only fires on `daynight-event` and `daynight-event-expired` window events. On first mount, `getActiveEvents()` returns `[]` because the initial call populates the state array. If a `daynight-event` fired before this component mounted (e.g., the tab was backgrounded during the day period transition), the badge will not appear until the next event. Low likelihood but architecturally consistent with other HUD panels.

8. `WorldEventLogger` — `daynight-event` for `dawn` period gets category `'exploration'`, and `day` period also gets `'exploration'`. Night and dusk are correctly `'combat'` and `'weather'`. This means dawn_chorus shows up in the World Events log under "Exploration" which is thematically odd (XP gain bonus feels more like a buff/world event). Cosmetic issue only.

9. `FactionWarSystem.playerJoinWar` — iterates `settlementStore.settlements` (a `Map<number, SettlementSnapshot>`) using `for (const [, settlement] of settlementStore.settlements)`. This is correct ES6 Map iteration syntax. No bug.

**M51 fix verification:**

- LUMINITE_DAGGER = 83: FIXED. `src/player/Inventory.ts` line 496 now reads `LUMINITE_DAGGER: 83` with comment `(81=MAT.BERRY, 79=MAT.MUSHROOM_SOUP)`. No ID collision.
- `combat-kill` dispatch: FIXED. `src/game/GameLoop.ts` line 1931 dispatches `window.dispatchEvent(new CustomEvent('combat-kill', ...))` on animal death.
- `skill-level-up` dispatch: FIXED. `src/game/SkillSystem.ts` line 253 dispatches `window.dispatchEvent(new CustomEvent('skill-level-up', ...))` in the `addXp` level-up branch.

**M52 integration points — confirmed working:**

- `tickFactionWars` called every 120 real seconds via `warTimerRef` in GameLoop.ts lines 3275-3280. `FACTION_IDS` is imported from FactionSystem.ts at line 140.
- `onTimeTransition` called on period change via `lastTimePeriodRef` guard in GameLoop.ts lines 3360-3363. Period detection uses `getDayAngle()` correctly.
- `tickDayNightEvents` called every frame in GameLoop.ts line 3347 to expire stale events.
- `initRecipeDiscovery` called in both `DevGame` and `GameWithSave` useEffects in App.tsx lines 62 and 115.
- `FactionWarPanel` registered in SidebarShell under `factionwars` PanelId; W/w key opens it (SidebarShell line 248). `factionwars` is in the PanelId union type in uiStore.ts.
- `DayNightEventHUD` is rendered inside HUD.tsx at line 2734, unconditionally.
- Recipe discovery UI: undiscovered recipes show `???` (line 472), "Undiscovered Recipe" subtitle (line 500), greyscale+opacity dimming (line 467). `showDiscoveredOnly` toggle at line 384. Experiment button at line 296 with 30s cooldown.
- First 5 auto-discovered recipes (IDs 1-5: Stone Tool, Knife, Spear, Stone Axe, Rope) confirmed in RecipeDiscoverySystem.ts lines 12 and 22-24.
