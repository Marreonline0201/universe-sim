---
name: M60 Known Bugs
description: M60 audit findings: 1 critical (item-crafted never dispatched so CraftingMastery is permanently inert), 1 important (WorldBossPanel simNow starts at 0), 1 important (defeatBoss never increments bossesKilled stat), 1 minor (initWorldBossSystem called twice in App.tsx)
type: project
---

M60 audit completed 2026-03-26. Three systems: CraftingMasterySystem (Track A), WorldBossSystem (Track B), PlayerStatsDashboard (Track C).

All M59 known bugs are out of scope here; this covers M60 only.

**BUG 1 (Critical) — CraftingMasterySystem: `item-crafted` event never dispatched**
- File: `src/ui/panels/CraftingPanel.tsx` line 145–224 (`handleCraft`)
- The `CraftingMasterySystem` registers a listener for `window` event `item-crafted` (CraftingMasterySystem.ts line 75), but `handleCraft` in CraftingPanel never dispatches that event. The `CraftingRecipe` interface has no `category` field either (src/player/Inventory.ts line 40–50). Result: `recordCraft` is never called, all mastery XP stays at 0 forever. The system is completely inert.
- Fix: In `handleCraft` (after the successful craft branch), dispatch `window.dispatchEvent(new CustomEvent('item-crafted', { detail: { recipeId: String(selectedRecipe.id), category: selectedRecipe.category ?? 'materials' } }))`. Also requires adding an optional `category?: string` field to `CraftingRecipe` and tagging recipes in CraftingRecipes.ts.

**BUG 2 (Important) — WorldBossPanel: `simNow` starts at 0, not real sim time**
- File: `src/ui/panels/WorldBossPanel.tsx` line 214
- `const [simNow, setSimNow] = useState<number>(0)` — starts at zero and increments +5 every 5 seconds via setInterval. `boss.spawnedAt` is stored in `totalSimSecondsRef.current` (GameLoop.ts line 344), which is the cumulative sim time since game start. On first render after a boss spawns (e.g. at simSecond 300), `elapsed = 0 - 300 = -300`, so `remaining = max(0, 600 - (-300)) = 900s`. The countdown display shows 15 minutes instead of the correct ~10 minutes, and takes 5 real-time minutes to catch up.
- Fix: Initialize `simNow` from `useGameStore(s => s.simSeconds)` or from `getActiveBoss()?.spawnedAt` context. The panel should subscribe to `useGameStore` for `simSeconds` rather than tracking its own counter.

**BUG 3 (Important) — WorldBossSystem: `defeatBoss` never increments `bossesKilled` stat**
- File: `src/game/WorldBossSystem.ts` line 192–231 (`defeatBoss`)
- `defeatBoss` awards gold and skill XP but never calls `usePlayerStatsStore.getState().incrementStat('bossesKilled')`. The `PlayerStatsDashboard` shows `stats.bossesKilled` (PlayerStatsDashboard.tsx line 288), but world boss defeats via the panel button never register there. (The only path that does increment it is the dungeon boss kill in GameLoop.ts line 2014, which is a separate system.)
- Fix: Add `usePlayerStatsStore.getState().incrementStat('bossesKilled')` inside `defeatBoss` after status is set to defeated (around line 221).

**BUG 4 (Minor) — `initWorldBossSystem` called twice in App.tsx**
- File: `src/App.tsx` lines 94 and 165
- `initWorldBossSystem()` is guarded by `if (_initialized) return` so the second call is a no-op, but it indicates duplicate initialization blocks that may cause confusion during future maintenance.
- Fix: Consolidate into a single init call.

**Systems verified clean:**
- PlayerStatsDashboard: all store reads are safe (`?? 0` fallbacks on loose stats). `skillSystem.getSkill()`, `getXpProgress()`, `SkillSystem.getAllSkillIds()`, `getSkillColor()`, `getSkillName()`, `getSkillIcon()` all confirmed to exist in SkillSystem.ts. `getEquippedTitle()`, `getUnlockedTitles()`, `getMilestones()` all exist. No null crash paths found.
- CraftingMasterySystem serialization: `serializeMastery`/`deserializeMastery` wired in OfflineSaveManager.ts lines 158/349. Guards against corrupted JSON. PASS.
- WorldBossSystem tick: `tickWorldBoss(totalSimSecondsRef.current)` called every 30s in GameLoop.ts line 3291. Source is correct cumulative ref. PASS.
- WorldBossSystem `defeatBoss` active-check guard: correctly checks `_activeBoss.status === 'active'` before awarding (line 193). PASS.
- All three panels registered in SidebarShell (lines 222–224, 277–279) and PanelId union type (uiStore.ts line 3). PASS.
- `initCraftingMastery` called in App.tsx lines 93 and 164 (double-call safe due to `_initialized` guard).
