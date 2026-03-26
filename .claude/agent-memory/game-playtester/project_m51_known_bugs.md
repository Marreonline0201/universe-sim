---
name: M51 Known Bugs
description: Bugs found in M51 (Journal System, NPC Relationships, Loot Rarity Visuals) and M50 regression check — precise file + line references
type: project
---

Audit completed 2026-03-26. Code-only audit. Eight issues total.

**Critical:**

1. MAT/ITEM enum ID collision still present after M50 "fix" — `src/player/Inventory.ts` lines 403 and 496.
   - M50 fix moved LUMINITE_DAGGER from 79 to 81, but MAT.BERRY is also 81 (line 403).
   - The comment on LUMINITE_DAGGER says "79 reserved for MAT.MUSHROOM_SOUP" — the author correctly avoided 79 but did not check that 81 was already taken by MAT.BERRY.
   - Inventory sell tab and loot tooltips that build a shared numeric reverse-lookup will conflate `berry` (material) and `luminite dagger` (item) on the same number 81.
   - Fix: Reassign LUMINITE_DAGGER to a free ID (e.g. 82 or higher). Verify no other MAT/ITEM share a value.

**Important:**

2. Journal auto-populates only for 3 of 5 registered event types — `src/game/JournalSystem.ts` lines 52–68.
   - `combat-kill` and `skill-level-up` events are listened for but are never dispatched anywhere in the codebase.
   - Grep confirms: no `dispatchEvent(new CustomEvent('combat-kill', ...))` and no `dispatchEvent(new CustomEvent('skill-level-up', ...))` exist in src/.
   - Result: "Enemy Slain" and "Skill Level Up" journal categories will never auto-populate during gameplay.
   - Working dispatches: `housing-upgrade` (HousingUpgradeSystem.ts:155), `restock-event` (MerchantRestockSystem.ts:71), `dungeon-floor-advanced` (DungeonFloorSystem.ts:68).
   - Fix: Add `window.dispatchEvent(new CustomEvent('combat-kill', ...))` in the enemy death path in GameLoop.ts, and `window.dispatchEvent(new CustomEvent('skill-level-up', ...))` in SkillSystem.ts addXp() level-up branch.

3. NPC relationship events are almost entirely unwired — `src/game/NPCRelationshipSystem.ts` lines 112–150.
   - Only `npc-attacked` has a dispatch site (`FactionWarSystem.ts:152`). `npc-trade`, `npc-gift`, and `npc-dialogue` are never dispatched anywhere.
   - The demo seed data in `initNPCRelationshipSystem` makes the panel look populated, but live relationships will not grow beyond that seed.
   - Fix: Dispatch `npc-trade` when a merchant sale completes (MerchantPanel), `npc-dialogue` when player starts a dialogue (DialoguePanel/NPCScheduleSystem), and `npc-gift` when a gift action occurs.

**Minor:**

4. Rarity badge 3-letter abbreviation for "common" reads "COM" but common items are never shown (rarity > 0 check guards it) — `src/ui/panels/InventoryPanel.tsx` line 98. Not a user-facing bug; no fix needed.

5. CraftingPanel rarity glow applies to the `Produces:` output box using `lastCraftedRarity` — this means the rarity highlight lingers from the *previous* craft when the player selects a new recipe. The glow should reset to 0 when a new recipe is selected. `src/ui/panels/CraftingPanel.tsx` line 79, 491-511.
   - `setLastCraftedRarity(0)` is never called when `setSelectedRecipe(r)` is called. After crafting a rare item, then clicking a different recipe, the output box glows rare even before crafting.
   - Fix: Call `setLastCraftedRarity(0)` inside the `setSelectedRecipe` call at line ~366.

6. RelationshipPanel `relativeTime` function does not handle >24h elapsed time (no days bucket) — `src/ui/panels/RelationshipPanel.tsx` line 23-31.
   - JournalPanel has a days bucket (`${days}d ago`), but RelationshipPanel's `relativeTime` tops out at hours. The demo NPC Varek has `ago: 45 * 60_000` (45 min) which is fine, but any NPC seen more than ~24 hours ago will show a large number like "1440h ago" instead of "2d ago".
   - Fix: Add days fallback identical to JournalPanel.relativeTime.

**M50 regression checks:**

7. WeatherForecastPanel auto-update: FIXED. Panel now has `setInterval(() => forceUpdate(n => n + 1), 5_000)` (line 99), replacing the broken `useEffect` dependency on `forecastState.lastUpdated`. Panel will refresh every 5 real-time seconds.

8. LUMINITE_DAGGER ID collision: PARTIALLY fixed. Was 79 (colliding with MUSHROOM_SOUP), now 81. But 81 collides with MAT.BERRY. The fix is incomplete (see bug 1 above).
