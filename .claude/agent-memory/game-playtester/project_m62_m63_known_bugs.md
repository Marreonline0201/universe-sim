---
name: M62-M63 Known Bugs
description: M62-M63 audit findings: 1 important (saw_crime memory type defined but never recorded), 2 important (harvest-bonus/drought-active journal listeners dead), 1 minor (duplicate scroll icons for chronicle/worldevents), 1 minor (PlayerJournal not persisted across reload); all M60 fixes verified (WorldBossPanel simNow fixed, defeatBoss bossesKilled fixed, item-crafted dispatched); M62-M63 panel wiring all confirmed correct
type: project
---

M62-M63 audit completed 2026-03-26. Five new systems: AchievementTrophyPanel (M62 Track C), PlayerJournalPanel (M62 Track B), BlueprintTreePanel (M63 Track A), NPCMemoryPanel (M63 Track B), WorldChroniclePanel (M63 Track C).

Deployment at universe-sim-pioneer2026.vercel.app returns HTTP 401 (Vercel SSO auth wall); browser testing not possible. Full static code audit performed.

**ALL M60 FIXES VERIFIED:**
- WorldBossPanel: simNow now uses `useGameStore(s => s.simSeconds ?? 0)` — live store subscription. FIXED.
- defeatBoss: line 228 calls `usePlayerStatsStore.getState().incrementStat('bossesKilled')`. FIXED.
- CraftingPanel: line 201 dispatches `item-crafted` CustomEvent after successful craft. FIXED.
- Double initWorldBossSystem in App.tsx: still present (lines 101, 179) but harmless due to `_initialized` guard.

**BUG 1 (Important) — NPCMemorySystem: `saw_crime` memory type defined but never recorded**
- File: `src/game/NPCMemorySystem.ts` lines 10-17 (type def), `src/ui/panels/NPCMemoryPanel.tsx` lines 39, 51
- `MemoryType` includes `'saw_crime'` and NPCMemoryPanel renders a label/color for it, but no code in NPCMemorySystem or anywhere else ever calls `addMemory(npcId, { type: 'saw_crime', ... })`. The type is dead — it will never appear in the panel.
- Fix: Either add a crime-detection event listener in initNPCMemorySystem (e.g. listen for a `player-attacked-npc` or `player-stole` event and dispatch `saw_crime`) or remove the type from MemoryType and NPCMemoryPanel if the feature is cut.

**BUG 2 (Important) — PlayerJournalSystem: `harvest-bonus` and `drought-active` listeners never fire**
- File: `src/game/PlayerJournalSystem.ts` lines 231-238 (initPlayerJournal)
- `initPlayerJournal` registers `window.addEventListener('harvest-bonus', ...)` and `window.addEventListener('drought-active', ...)`. Neither event is dispatched anywhere in the codebase (confirmed by grep across all /src). These two journal categories will never generate entries.
- Fix: Either wire the events (add `dispatchEvent(new CustomEvent('harvest-bonus', ...))` in ResourceDepletionSystem and a drought event in WeatherEventSystem) or remove the dead listeners.

**BUG 3 (Minor) — SidebarShell: duplicate scroll emoji icon for `worldevents` and `chronicle`**
- File: `src/ui/SidebarShell.tsx` lines 223, 256
- Both `{ id: 'worldevents', icon: '📜' }` and `{ id: 'chronicle', icon: '📜' }` use the same emoji. In the long icon strip, the player cannot visually distinguish them without hovering for the hint tooltip.
- Fix: Give `chronicle` a distinct icon (e.g. `'🗒'` or `'📰'`).

**BUG 4 (Minor) — PlayerJournalSystem: entries not persisted across page reload**
- File: `src/game/PlayerJournalSystem.ts` — no serialize/deserialize functions
- PlayerJournalSystem has no serialize/deserialize and is not referenced in OfflineSaveManager. All 200 max journal entries are lost on reload. WorldChronicleSystem, NPCMemorySystem, and BlueprintUnlockSystem are all persisted; Journal is the odd one out.
- Fix: Add `serializeJournal()`/`deserializeJournal()` to PlayerJournalSystem and wire into OfflineSaveManager (save as JSON array, restore on load).

**SYSTEMS VERIFIED CLEAN (M62-M63):**
- AchievementTrophyPanel: all imports resolve, claimMilestone dispatches milestone-claimed, filter tabs correct, progress bar safe. TS cast `(stats as Record<string, number>)` is cosmetic-only (all requirement stat keys exist in PlayerStats). checkAndUpdateMilestones called on GameLoop tick (line 3277). PASS.
- BlueprintTreePanel: BP earned via item-crafted → _onItemCrafted → _addBp(1) every 5 crafts. Panel subscribes to blueprint-bp-changed. initBlueprintSystem in App.tsx (both init blocks). Serialized via serializeBlueprints/deserializeBlueprints in OfflineSaveManager. PASS.
- NPCMemoryPanel: getAllMemories, getContextualGreeting, getRelationship, getRelationshipTierColor all exist and are exported. Wall-clock seconds used consistently (Date.now()/1000) in both storage and relativeTime display. initNPCMemorySystem in App.tsx. Serialized in OfflineSaveManager. PASS.
- WorldChroniclePanel: getChronicleEntries imported correctly. Uses useGameStore.getState().simSeconds for timestamps. Listens to boss-spawned/boss-defeated/weather-event-started/faction-standing-changed/delve-completed. initWorldChronicle in App.tsx. Serialized in OfflineSaveManager. PASS.
- PlayerJournalPanel: re-exported as JournalPanel from JournalPanel.tsx (used by SidebarShell lazy import). initPlayerJournal called at GameLoop.ts module level (line 258). Listens to boss-spawned, boss-defeated, weather-event-started, item-crafted, npc-gift, npc-trade, pet-levelup, faction-standing-changed, location-discovered. PASS (minus dead harvest-bonus/drought-active listeners — Bug 2).
- All 4 new panels (trophies F2, blueprints F3, npcmemory F4, chronicle F5) registered in PanelId union, ICON_BUTTONS, PANEL_LABEL, PANEL_COMPONENTS, and hotkey switch. PASS.
- FactionPanel (G key): pre-existing M35 panel, confirmed still present and registered. PASS.
