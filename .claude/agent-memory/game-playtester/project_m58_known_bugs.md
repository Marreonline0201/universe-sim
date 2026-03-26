---
name: M58 Known Bugs
description: M58 audit findings: 1 critical double-affinity bug (NPCGiftSystem + NPCRelationshipSystem listener both call addAffinity), 1 important missing material cost check in canPurchase, 1 important PetState schema migration risk, 2 minor; M57 fixes verified
type: project
---

M58 audit complete. All three M57 fixes verified (claimMilestone XP fallback, Codex key '0').

**Why:** Audit run on 2026-03-26 for HousingUpgradeSystem (Track A), NPCGiftSystem (Track B), PetAdvancementSystem (Track C).

**How to apply:** Use this as baseline for M59 regression checks.

## Bugs found

### Critical
1. **Double affinity on gift** (`src/game/NPCGiftSystem.ts:132` + `src/game/NPCRelationshipSystem.ts:128`)
   `giveGift()` calls `addAffinity(npcId, affectionGained, ...)` directly, then dispatches `npc-gift`. The NPCRelationshipSystem listener for `npc-gift` calls `addAffinity(npcId, 15, 'Received a gift')` again. Every gift awards affinity twice: once at the computed role-weighted amount, once at a hardcoded +15.
   Fix: remove the `addAffinity` direct call from `giveGift` in NPCGiftSystem (let the event listener in NPCRelationshipSystem be the sole writer), OR remove the `npc-gift` listener from NPCRelationshipSystem and keep only the direct call. The direct call is preferred since it carries the role-weighted amount; the listener should be removed.

### Important
2. **canPurchase ignores material costs** (`src/game/HousingUpgradeSystem.ts:216-229`)
   The `HousingUpgrade.cost` type includes an optional `materials` array, but `canPurchase` only checks gold. If any future upgrade defines `cost.materials`, players can purchase it without having the required materials.
   Fix: add a materials check loop to `canPurchase` (and consume materials in `purchaseUpgrade`). Currently latent — no existing upgrade defines material costs.

3. **PetState deserialization no schema migration** (`src/game/PetAdvancementSystem.ts:261-271`)
   `deserializePet` does a raw cast `parsed as PetState` with no field validation. Saves from before M58 won't have `skills`, `skillPoints`, or `bond` fields. `SkillTreeSection` calls `skills.filter(...)` at line 310 which will throw a TypeError if `skills` is undefined.
   Fix: merge parsed state with `makeDefaultPetState()` so missing fields get defaults, e.g.: `_petState = { ...makeDefaultPetState(), ...parsed }`.

### Minor
4. **NPCGiftSystem cooldowns not serialized** — The `_cooldowns` Map in NPCGiftSystem is never saved to or restored from OfflineSaveManager. On reload, all per-NPC gift cooldowns reset to zero. Players can bypass the 5-minute cooldown by saving and reloading.
   Fix: serialize/deserialize `_cooldowns` in OfflineSaveManager (store as `{ [npcId]: timestamp }` object).

5. **HousingUpgradePanel buy button uses stale local `upgrades` for flash message** (`src/ui/panels/HousingUpgradePanel.tsx:163`)
   In `handleBuy`, `upgrades.find(u => u.id === id)` reads the state snapshot from before the purchase. `purchaseUpgrade` mutates module state and `setUpgrades(getUpgrades())` is called on the same line, but the flash message reads from the pre-update `upgrades`. This always works because the upgrade data (name/icon) doesn't change on purchase, so this is cosmetically safe but architecturally fragile.
   Fix: minor — read from the freshly fetched upgrades or store the name before calling purchaseUpgrade.

## M57 fixes verified
- claimMilestone: fallback to 'survival' skill confirmed at AchievementShowcaseSystem.ts:69
- Codex hotkey '0': confirmed in SidebarShell.tsx:328-329

## Architecture notes
- HousingUpgradePanel is embedded inside HousingPanel (no separate PanelId needed) — correct design
- NPCGiftSystem UI is embedded inside RelationshipPanel (no separate PanelId needed) — correct design
- PetAdvancementSystem is integrated into existing PetPanel (correct)
- Both HousingUpgradeSystem and PetAdvancementSystem are serialized in OfflineSaveManager
- GameLoop awards pet XP every 30s (petXpTimerRef) — correctly wired
