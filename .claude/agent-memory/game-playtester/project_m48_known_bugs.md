---
name: M48 Known Bugs
description: Bugs found in M48 (Housing Upgrades, Merchant Restock, World Events Log) during code audit — includes precise file + line references
type: project
---

Audit completed 2026-03-26. Three critical bugs and six minor bugs confirmed with file/line precision.

**Critical:**
1. HousingUpgradeSystem.ts line 146 — slot field name mismatch: `applyUpgrade` checks `slot.itemId === 0 && slot.materialId === matId` but InventorySlot has `materialId`, not `matId` in the HousingUpgrade cost structure. The cost loop uses `matId` (from HousingUpgrade type) correctly; however the slot access uses `slot.materialId` which IS the correct InventorySlot field — this part is fine. The real critical bug is that the cost structure uses `matId: number` (HousingUpgrade.cost.materials) while `canAffordUpgrade` in the system file passes `matId` to `inv.items.filter(i => i.matId === matId)` — but `inv` is typed as `{ items: Array<{ matId: number; qty: number }> }`, a custom shape distinct from the real `Inventory` class. The exported `canAffordUpgrade` is never used by `applyUpgrade` — `applyUpgrade` uses `inventory.countMaterial(matId)` directly (correct). The exported `canAffordUpgrade` with its custom `inv` parameter type is a dead/inconsistent API but not a runtime crash.

2. WorldEventLogger.ts line 70 — `restock-event` detail field mismatch: `MerchantRestockSystem.ts` line 71 dispatches `new CustomEvent('restock-event', { detail: pendingRestockEvent })` where `pendingRestockEvent` has fields `merchantName` and `settlementId` (number). The logger at line 70–71 reads `detail.merchant ?? detail.merchantName` and `detail.settlement ?? detail.settlementName`. `detail.merchantName` resolves correctly. But `detail.settlementId` is a number — `detail.settlement` and `detail.settlementName` are both undefined, so the settlement always shows as "the settlement". CRITICAL — event log always says "A merchant in the settlement has new stock!" for every restock.

3. WorldEventLogger.ts line 83 — `housing-upgrade` detail field mismatch: `HousingUpgradeSystem.ts` line 155 dispatches `new CustomEvent('housing-upgrade', { detail: { upgradeId } })` — the detail only contains `upgradeId`, not `upgradeName` or `name`. The logger at line 83 reads `detail.upgradeName ?? detail.name ?? 'an upgrade'` — both are undefined, so every housing upgrade logs "You upgraded: an upgrade". CRITICAL — upgrade name is never shown.

**Minor:**
4. HousingUpgradeSystem.ts line 146 — `applyUpgrade` material deduction uses `slot.itemId === 0 && slot.materialId === matId`. The field `matId` here comes from the destructure `for (const { matId, qty } of upgrade.cost.materials)` and is used correctly to compare against `slot.materialId`. This is fine — no bug. (Previously flagged as suspicion; confirmed clean after reading InventorySlot.)

5. MerchantRestockSystem.ts line 97 — `claimRestockDeal` sets `pendingRestockEvent.claimed = true` for the entire event after a single item purchase. The banner shows per-item Buy buttons suggesting multiple items should be purchasable, but after the first purchase all buttons switch to "Claimed". Likely a design intent question but is inconsistent with the multi-item UI. MINOR.

6. HousingUpgradePanel.tsx line 156–158 — tab reset effect: when tier 3 becomes un-locked (edge case), the effect sets `activeTab` to 2, which may itself also be locked, leaving the user on a locked tab. Should fall back to 1. MINOR.

7. MerchantRestockSystem.ts line 104 — `tickRestockEvent(dtMs)` receives a `dtMs` parameter it never uses. The function checks `Date.now()` directly. The `dtMs` param is dead code (misleading signature). MINOR.

8. WorldEventsPanel.tsx line 29 — `relativeTime` uses `Math.floor((Date.now() - ts) / 1000)`. Because events are prepended newest-first and the panel re-renders only on store changes, timestamps shown are static (no live update). The relative timestamps freeze unless the store emits a new event. MINOR — no dedicated interval to refresh timestamps.

9. SiegeSystem.ts dispatch uses `{ settlementId, attackingFactionId }` — WorldEventLogger at line 42–43 reads `detail.settlement ?? detail.settlementName` and `detail.faction ?? detail.attackerFaction`. Both fallbacks miss: `settlementId` (number, not `settlement`) and `attackingFactionId` (not `faction` or `attackerFaction`). Both siege log entries always show "Unknown Settlement" and "Unknown Faction". CRITICAL (same class of bug as #2 and #3 above).

**Why:** These affect M48 which was added as Housing Upgrades (Track A), Merchant Restock (Track B), and World Events Log (Track C). The recurring pattern is CustomEvent detail field names diverging between the emitting system and WorldEventLogger.

**How to apply:** When reviewing future milestones, always cross-check CustomEvent detail field names between the system that dispatches and the logger/banner that listens. This has occurred in 3 of 3 event types in M48.
