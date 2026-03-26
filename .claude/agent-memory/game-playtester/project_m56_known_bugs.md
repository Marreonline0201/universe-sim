---
name: M56 Known Bugs
description: M56 audit findings — Trade Routes, Faction Standing, Recipe Scanner, plus M55 fix verification
type: project
---

# M56 Audit Findings

Audit date: 2026-03-26

## M55 Fix Verification (all confirmed)

- harvestNode/recordDepletedAt: CONFIRMED fixed. GameLoop line ~944-960 calls `depleteNode(closest.id)` and `recordDepletedAt(closest.id, simSeconds)` on final harvest hit. The import alias (`harvestNode as depleteNode`) is correct.
- faction-war-resolved ID match: CONFIRMED fixed. WorldThreatSystem.ts lines 87-100 now builds `expectedDetail` from `war.attackingFactionId` and `war.defendingFactionId`, matching the exact string format used when the threat was created (line 83).
- NPCSchedulePanel hotkey '8': CONFIRMED. SidebarShell.tsx line 311-312 has `case '8': togglePanel('npcschedule')`.

---

## Track A — Dynamic NPC Trade Routes

### initTradeRouteSystem() wiring
CONFIRMED. App.tsx line 18 imports it and lines 73 (DevGame) and 133 (GameWithSave) both call it in their `useEffect`.

### tickTradeRoutes() wiring
CONFIRMED. GameLoop.ts line 360 declares `tradeRouteTimerRef = useRef(0)`. Lines 3526-3532 tick it every 30 real seconds using `simSeconds`.

**Note:** The timer fires every 30 real-seconds, not 30 sim-seconds. If the sim clock runs faster than real time this is intentional (keeps routes from completing too quickly), but worth confirming with designer.

### Siege event handlers — IMPORTANT BUG

**siege-started** handler (lines 97-108) uses `.find()` which stops at the first matching active route. If a settlement has multiple active routes, only one gets disrupted. The besieged settlement is still "open for business" on all other routes.

**siege-resolved** handler (lines 110-122) correctly uses `for...of` to restore ALL disrupted routes for that settlement.

This is asymmetric: one route disrupted on siege start, all routes restored on siege end. If the intent is to disrupt all routes to/from a besieged settlement, the `siege-started` handler must use `filter` + `forEach` instead of `find`.

**Severity: Important**

### faction-war-started handler
CONFIRMED correct. Lines 124-131: random single active route gets disrupted. This is intentional (war disrupts trade unpredictably) and is balanced.

### Progress calculation
CONFIRMED correct. Lines 140-149: `progressPct = ((simSeconds - departedAt) / duration) * 100`, clamped to 100. Completed routes are removed from `_routes` and a `trade-route-completed` event is dispatched.

### Panel reactivity
CONFIRMED correct. TradeRoutesPanel uses `setInterval(refresh, 5_000)` and also listens to `trade-route-completed`. The 5-second poll covers progress bar updates that aren't event-driven.

**Minor note:** Panel uses the `traderoutes` PanelId, which now maps to `TradeRoutesPanel` (M56 NPC routes). See critical wiring bug below.

---

## Track A — Critical Panel ID Collision (M49 TradingRoutesPanel displaced)

**CRITICAL WIRING BUG**

In SidebarShell.tsx:
- Line 54: `TradingRoutesPanel` (M49, player-established routes) is still imported as a lazy component.
- Line 221: `traderoutes: TradeRoutesPanel` — the `traderoutes` PanelId has been reassigned to the M56 NPC panel.

The M49 `TradingRoutesPanel` component is now imported but never mounted anywhere. It is dead code. Players who previously used key or icon to open their trading routes panel now see the NPC routes panel instead. There is no panel ID for the M49 panel.

**Severity: Critical**

Remediation options:
1. Add a new PanelId (e.g. `npcroutes`) for the M56 panel and keep `traderoutes` for M49.
2. If M49 TradingRoutesPanel is intentionally retired, remove its import and comment.

---

## Track B — Faction Standing Panel

### Aggregation correctness
CONFIRMED. `buildFactionData()` calls `useReputationStore.getState()` and `useFactionStore.getState()` directly (not as hooks), which is correct for a function called from render. Iterates `repState.settlements`, calls `factionState.getSettlementFaction(settlement.settlementId)`, buckets by factionId, sums `settlement.points`.

### 6 tier thresholds
CONFIRMED. STANDING_TIERS defines 6 tiers: HOSTILE (<0), NEUTRAL (0-99), FRIENDLY (100-299), HONORED (300-599), REVERED (600-999), EXALTED (1000+). These are independent from reputationStore's own tier thresholds (which use different cutoffs for per-settlement display) — this is not a bug, the two systems are parallel.

### tierProgress NaN for HOSTILE — IMPORTANT BUG

`tierProgress()` lines 36-45: When `rep < 0`, the player is in HOSTILE tier with `min: -Infinity`.

```
rangeStart = tier.min  // = -Infinity
rangeEnd   = next.min  // = 0
pct = (rep - (-Infinity)) / (0 - (-Infinity))
    = Infinity / Infinity
    = NaN
```

`ProgressBar` renders `width: NaN%` which browsers silently treat as `width: 0%`, so the bar shows empty. The `needed` value also computes as `0 - rep`, which is correct (positive number). The visual bar is broken (always 0%) for any hostile faction, but the label "X rep to NEUTRAL" still displays correctly.

**Severity: Important**

Fix: Guard for `!isFinite(rangeStart)` and return `{ pct: 0, next, needed: rangeEnd - rep }`.

### Reactivity
CONFIRMED. Panel subscribes to both Zustand stores via `useReputationStore(s => s.settlements)` and `useFactionStore(s => s.settlementFactions)`. Also has a 3-second fallback interval and listens to `reputation-changed`, `reputation-tier-up`, `reputation-tier-down` events.

### Hotkey '6'
CONFIRMED. SidebarShell.tsx line 307-308: `case '6': togglePanel('factionstanding')`.

---

## Track C — Recipe Feasibility Scanner

### isRecipeDiscovered usage
CONFIRMED. RecipeFeasibilityPanel imports `isRecipeDiscovered` from `RecipeDiscoverySystem` (line 6). RecipeDiscoverySystem exports it as `isRecipeDiscovered` (not `isDiscovered`). Names match.

### inventory.countMaterial()
CONFIRMED. Panel imports `inventory` from `GameSingletons` (line 5). `Inventory.countMaterial(materialId: number): number` exists at line 245 of Inventory.ts. Usage is correct.

### 3 sections
CONFIRMED. READY = `missingCount === 0`, ALMOST = `missingCount === 1`, NEEDS WORK = `missingCount >= 2`. Sorting: READY by id asc, ALMOST by totalMissing asc, NEEDS WORK by missingCount asc. All correct.

### Reactivity
CONFIRMED. 2-second polling interval + `recipe-discovered` event listener. Sufficient given inventory has no event system.

### Hotkey '7'
CONFIRMED. SidebarShell.tsx line 309-310: `case '7': togglePanel('recipescan')`.

---

## Summary Table

| ID | Track | Severity | Description |
|----|-------|----------|-------------|
| M56-1 | A | Critical | `traderoutes` PanelId now maps to NPC panel (M56), silently displacing M49 TradingRoutesPanel which is now unreachable dead code |
| M56-2 | A | Important | `siege-started` handler uses `.find()` — only one route disrupted per siege; `siege-resolved` uses `for...of` and restores all (asymmetric) |
| M56-3 | B | Important | `tierProgress()` produces NaN progress for HOSTILE rep due to `-Infinity` rangeStart; progress bar renders as 0% width |
| M56-4 | A | Minor | `tickTradeRoutes` timer fires on real-seconds not sim-seconds; consistent with other M55 systems but worth confirming intent |

## All M55 Fixes Verified
- harvestNode/recordDepletedAt now called in GameLoop harvest action
- faction-war-resolved in WorldThreatSystem matches by faction ID detail string
- NPCSchedulePanel has hotkey '8'
