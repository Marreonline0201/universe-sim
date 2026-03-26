---
name: M54 Known Bugs
description: Bugs found in M54 (Merchant Guild, Bounty Board, Exploration Discoveries) and M53 fix verification — precise file + line references
type: project
---

Audit completed 2026-03-26. Code-only audit. 4 issues total.

**Important:**

1. `MerchantGuildSystem.ts` / `GameLoop.ts` — `refreshContracts` is NEVER called periodically — contracts expire and are never replaced during play.
   - `refreshContracts(0)` is called once on app init (App.tsx lines 67 and 124).
   - `GameLoop.ts` has no timer for `refreshContracts`. There is no `guildTimerRef`, no periodic call anywhere in the codebase.
   - `refreshContracts` filters expired contracts and pads back to 3, but it is only invoked at startup with `simSeconds=0`. After `CONTRACT_EXPIRY_SECS=600` sim-seconds pass, all three contracts expire and the panel shows "No active contracts. Check back soon." permanently.
   - Fix: Add a `guildTimerRef` in `GameLoop.ts` that calls `refreshContracts(useGameStore.getState().simSeconds)` every 60 sim-seconds (matching the bounty tick cadence).

2. `SidebarShell.tsx` — Bounty Board has no keyboard hotkey.
   - `ICON_BUTTONS` entry: `{ id: 'bountboard', icon: '📋', hint: 'Bounties' }` — no hotkey shown (line 172).
   - The hint string says only "Bounties", not "Bounties (X)" like all other shortcut-enabled panels.
   - The playtest brief says "Press B to open the Bounty Board panel." In the actual code, `case 'b': case 'B'` maps to `togglePanel('build')` (line 248) — Build panel, not Bounty Board.
   - All 26 other letter keys are taken. Available: none in standard alphabet. Could use a number key or a chord.
   - Fix: Assign a key (e.g. `'`/backtick or a number like `'8'`) and update the hint string.

**Minor:**

3. `SeasonalPanel.tsx` — `seasonal-change` event is still orphaned (M53 bug not fixed).
   - M53 audit noted that `seasonal-change` is dispatched by `SeasonalEventSystem.ts` line 143 but no component subscribes to it.
   - `SeasonalPanel.tsx` still uses only a 1s interval (lines 47-50). No `seasonal-change` listener was added.
   - Low impact: the 1s interval corrects bonus display within ~1 real second of season change.
   - Fix: Add `window.addEventListener('seasonal-change', handler)` in a `useEffect` in `SeasonalPanel` to force immediate refresh on season change.

4. `GameLoop.ts` line 3460 — discovery check fires every 2 **real** seconds, not 2 sim-seconds.
   - `discoveryTimerRef.current += dt` where `dt = Math.min(delta, 0.1)` is the raw Three.js frame delta (real seconds, capped at 0.1).
   - The timer threshold is `2` (line 3460), meaning it fires every ~2 real seconds.
   - The task brief says "every 2 sim-seconds." Sim-seconds advance faster than real-seconds (the game uses a speed multiplier via SimulationEngine). This means discoveries trigger less frequently than intended relative to game world time.
   - Impact: low. At normal sim speed, the check is frequent enough that the player won't notice. Only becomes noticeable at high sim-speed multipliers.
   - Fix: Either document that "2" refers to real seconds (acceptable), or accumulate `dt * SIM_SPEED_MULTIPLIER` to use sim-time. The simpler fix is to label the comment correctly: "every 2 real seconds."

**M53 fix verification:**

- ComboHUD stale-closure bug: FIXED. `src/ui/ComboHUD.tsx` line 17 now uses `useRef<ReturnType<typeof setTimeout> | null>(null)`. The interval callback reads `fadeTimerRef.current` directly, avoiding the stale state closure. The `useEffect` dependency array is `[]` (runs once), and cleanup at line 48-50 correctly clears both the interval and any pending timeout.
- `purchaseDecoration` home-customized dispatch: FIXED. `src/game/HomeCustomizationSystem.ts` line 82 now dispatches `window.dispatchEvent(new CustomEvent('home-customized', ...))` on successful purchase.
- `unequipDecoration` home-customized dispatch: FIXED. Line 119 now dispatches `window.dispatchEvent(new CustomEvent('home-customized', ...))` after unequip.

**M54 integration points confirmed working:**

- `initBountyBoard(0)` called in App.tsx lines 65 and 122 (DevGame and GameWithSave).
- `initMerchantGuildSystem()` called in App.tsx lines 66 and 123. The listener for `npc-trade` is installed inside `initMerchantGuildSystem` (MerchantGuildSystem.ts lines 235-238), calling `onTrade()` and `addGuildXp(5)`. `npc-trade` is dispatched from MerchantPanel.tsx lines 111 and 290. Wiring is correct.
- `bountyOnKill(killed.species)` called at GameLoop.ts line 1955, immediately after `questSystem.onKill` (line 1953). Ordering is correct — quest progress first, bounty progress second.
- `tickBountyBoard(simSecs)` called every 60 real-seconds via `bountyTimerRef` (GameLoop.ts lines 3131-3135). Note: this is also real-seconds, not sim-seconds. Acceptable for a "rotation timer."
- `checkDiscoveries(px, pz, simSeconds)` called every ~2 real-seconds via `discoveryTimerRef` (GameLoop.ts lines 3459-3463). Player world position used correctly.
- `ExplorationDiscoverySystem` serialize/deserialize wired in `OfflineSaveManager.ts`: `serializeDiscoveries()` at save (line 142), `deserializeDiscoveries(state.explorationDiscoveries)` at load (lines 292-294).
- Guild state and bounty state are NOT serialized — they reset on page reload. This appears intentional (session-only systems) but is undocumented.
- `WorldEventLogger`: all four M54 events have listeners — `location-discovered` (line 181), `bounty-claimed` (line 207), `guild-rank-up` (line 222), `contract-completed` (line 234). All log to correct categories.
- MerchantGuildPanel: E key hotkey confirmed (SidebarShell.tsx line 268). Pre-join view shows all 5 rank tiers with bonuses and JOIN GUILD button. Post-join view shows rank progress bar, bonuses list, and contract cards. Timer countdown updates every 1 second via `setInterval`. Event listeners for `guild-joined`, `guild-rank-up`, `contract-completed` all registered (lines 257-264).
- BountyBoardPanel: accessible via sidebar icon only (no hotkey). Shows WANTED cards with difficulty color-coding, kill progress bars, expiry countdown. CLAIM button disabled when `currentKills < targetCount`. Completed bounties section shows last 3 claims.
- DiscoveriesPanel: EXPLORATIONS header with N/total counter confirmed (lines 133-138). Progress bar (pct of total discovered). Empty state message "Explore the world to find hidden locations."
- `completeContract` material deduction: correctly uses `inventory.countMaterial()` for pre-check and iterates `itemId === 0` slots for deduction, matching Inventory API. No bug found.
