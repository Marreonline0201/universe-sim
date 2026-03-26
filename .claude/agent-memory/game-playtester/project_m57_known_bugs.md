---
name: M57 Known Bugs
description: M57 audit findings — Achievement Showcase, World Codex, Weather Effects HUD, and M56 fix verification
type: project
---

# M57 Audit Findings

**Date:** 2026-03-26
**Tracks audited:** Track A (Achievement Showcase), Track B (World Lore & Codex), Track C (Weather Effects HUD)
**M56 fix verification included.**

---

## CRITICAL BUGS (0)

None found.

---

## IMPORTANT BUGS (3)

### BUG-1: claimMilestone silently drops XP for skill-less milestones
**File:** `src/game/AchievementShowcaseSystem.ts`, lines 61–76
**Issue:** `claimMilestone` only calls `skillSystem.addXp()` when `m.reward.skill` is defined. For the 4 milestones without a skill (`first_blood`, `gatherer`, `explorer`, `diplomat`), the XP in `m.reward.xp` (50, 30, 80, 100 respectively) is stored in the reward definition but never awarded to the player. Gold IS awarded correctly. XP is silently discarded.
**Reproduction:** Claim any of the four skill-less milestones. Gold increases, XP does not.
**Impact:** Players lose advertised XP rewards. The panel displays `+50 XP`, `+30 XP`, etc., but nothing is granted — a trust-breaking mismatch between UI promise and actual reward.
**Fix:** After the `if (m.reward.skill)` block, add a fallback that awards XP to a general player XP pool (or to `playerStatsStore`, or to a default skill). Alternatively, if the design intent is "skill XP only", remove the `xp` field from skill-less milestones so the UI stops displaying it.

---

### BUG-2: LoreSystem `location-discovered` event is never dispatched — geography lore is permanently locked
**File:** `src/game/LoreSystem.ts`, line 232; search across `src/`
**Issue:** `initLoreSystem()` registers `window.addEventListener('location-discovered', ...)` to auto-unlock geography entries. A full codebase grep finds **zero** calls to `dispatchEvent(new CustomEvent('location-discovered', ...))` anywhere in `src/`. The event is consumed but never produced. The 3 Geography lore entries (`ashwastes`, `crystalmere`, `undercroft`) can never be auto-unlocked through gameplay.

Confirmed dispatched events (geography trigger is the only missing one):
- `bounty-claimed` — dispatched in `BountyBoardSystem.ts:152` ✓
- `faction-war-started` — dispatched in `FactionWarSystem.ts:67` ✓
- `recipe-discovered` — dispatched in `RecipeUnlockSystem.ts:157` ✓
- `seasonal-change` — dispatched in `SeasonalEventSystem.ts:143` ✓
- `trade-route-completed` — dispatched in `TradeRouteSystem.ts:158` ✓
- `location-discovered` — **NOT dispatched anywhere** ✗

**Impact:** Geography category stays at 0/3 entries forever for all players.
**Fix:** Dispatch `location-discovered` when the player discovers a new location (e.g., in `DiscoveriesSystem`, `ExplorationStore`, or whenever a new POI/settlement is first visited). Alternatively, rebind the geography trigger to `location-change` or `settlement-entered` if those events already exist.

---

### BUG-3: Codex panel has no keyboard hotkey
**File:** `src/ui/SidebarShell.tsx`, lines 279–348 (keydown handler)
**Issue:** The `showcase` (Achievement Showcase) panel is correctly bound to key `9` (line 327). The `codex` panel has no hotkey — the ICON_BUTTONS entry shows `hint: 'Codex'` with no key in parentheses (compare to `hint: 'Showcase (9)'`). The switch/case block has no entry for any key targeting `'codex'`. It is sidebar-click-only.
**Impact:** Minor UX inconsistency — every other panel in the sidebar has a hotkey, and the Codex hint tooltip omits one, which makes it look unfinished.
**Fix:** Assign a hotkey. No single-character keys remain unassigned, but digit keys `0` and numpad keys are free. `0` is a reasonable choice: `case '0': e.preventDefault(); togglePanel('codex'); break` — update the ICON_BUTTONS hint to `'Codex (0)'`.

---

## MINOR BUGS (2)

### MINOR-1: LoreSystem attaches event listeners on every call if `_initialized` guard fails silently
**File:** `src/game/LoreSystem.ts`, lines 224–238
**Issue:** `initLoreSystem()` is guarded by `_initialized = true` after the first call, so duplicate listeners are not a runtime problem under normal conditions. However, the listeners added inside `initLoreSystem()` are never cleaned up (no corresponding `removeEventListener`). This is consistent with other systems in the codebase (e.g., `WeatherEffectsSystem`) but worth noting as a pattern.
**Severity:** Low — no user-visible bug, but a memory/listener hygiene issue if the component ever hot-reloads in dev mode.

### MINOR-2: WeatherEffectsHUD `visibilityMult` threshold is inconsistent with `movementMult` and `damageMult`
**File:** `src/ui/WeatherEffectsHUD.tsx`, line 93
**Issue:** `movementMult` and `damageMult` lines render when `value !== 1.0`. `visibilityMult` renders only when `value < 0.9`. The `cloudy` weather entry has `visibilityMult: 0.9`, meaning cloudy's visibility reduction is silently not shown in the HUD (0.9 is not < 0.9). This is a one-off threshold inconsistency — `fog` (0.4), `storm` (0.5), `blizzard` (0.3), etc. all show correctly.
**Severity:** Low — cloudy is a mild condition and hiding the 10% visibility reduction there may be intentional. If not, change `< 0.9` to `!== 1.0` to be consistent.

---

## M56 FIX VERIFICATION

All three M56 fixes confirmed stable:

- **PanelId collision fixed:** `traderoutes` → `TradingRoutesPanel` (M49), `npcroutes` → `TradeRoutesPanel` (M56). Both IDs exist in uiStore's `PanelId` union, both are mapped in `PANEL_COMPONENTS` and `PANEL_LABEL`. Verified in `SidebarShell.tsx` lines 54–56, 136–137, 231–232.
- **siege-started for...of loop:** `TradeRouteSystem.ts` lines 97–110 use `for (const route of _routes)` — all matching routes are disrupted, not just the first. Verified.
- **tierProgress HOSTILE guard:** `FactionStandingPanel.tsx` line 42 — `if (!isFinite(tier.min)) return { pct: 0, next, needed: next.min - rep }` correctly short-circuits -Infinity math. Verified.

---

## M57 WIRING VERIFICATION

### Track A — Achievement Showcase
- 12 milestones defined ✓
- All `requirement.stat` names (`killCount`, `resourcesGathered`, `distanceTraveled`, `itemsCrafted`, `settlementsDiscovered`, `totalGoldEarned`) match `PlayerStats` interface in `playerStatsStore.ts` ✓
- All `reward.skill` values (`combat`, `gathering`, `exploration`, `crafting`, `survival`) are valid `SkillId` values ✓
- `checkAndUpdateMilestones()` called in GameLoop every 30 sim-seconds (`GameLoop.ts` lines 3247–3252) ✓
- `initAchievementShowcase()` + `checkAndUpdateMilestones()` called in App.tsx on init (both `GameWithSave` and `DevGame` components) ✓
- Hotkey `9` assigned in SidebarShell ✓
- Save/load: `serializeMilestones` and `deserializeMilestones` are implemented in `AchievementShowcaseSystem.ts` but are **NOT called in `saveStore.ts`** — milestone state is not persisted to the server save. This matches the pattern for other subsystem saves (e.g., journal, NPC relationships use their own singleton serialize paths). Milestone state survives only via module-level state in the current session.

### Track B — World Lore & Codex
- 18 entries defined, 3 per category, all have filled `summary` and `fullText` ✓
- Event listeners registered in `initLoreSystem()` ✓ (except `location-discovered` — see BUG-2)
- `initLoreSystem()` called in App.tsx ✓
- `CodexPanel` lazy-loaded and wired in SidebarShell, `codex` PanelId in uiStore ✓
- No hotkey assigned (see BUG-3)
- Save/load: `serializeLore`/`deserializeLore` are implemented but not called in `saveStore.ts`. Same pattern as milestones — session-only persistence.

### Track C — Weather Effects HUD
- `initWeatherEffectsSystem()` called in App.tsx (both `GameWithSave` and `DevGame`) ✓
- `getWeatherGatherMult()` applied in GameLoop gather qty calculation (`GameLoop.ts` line 938) ✓
- HUD hides for `clear` and `sunny` weather via `HIDE_IN` set ✓
- `WeatherEffectsHUD` imported and rendered in `HUD.tsx` (line 76 import, line 2743 render) ✓
