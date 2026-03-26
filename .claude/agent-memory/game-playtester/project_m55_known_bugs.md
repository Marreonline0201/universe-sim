---
name: M55 Known Bugs
description: Bugs found in M55 (NPC Schedule Display, Resource Depletion, World Threat Tracker) and M54 fix verification — precise file + line references
type: project
---

Audit completed 2026-03-26. Code-only audit. 4 issues total (0 critical, 3 important, 1 minor).

**Important:**

1. `ResourceDepletionSystem.ts` — `harvestNode()` and `recordDepletedAt()` are never called anywhere in the codebase.
   - `harvestNode` is exported at line 93 and `recordDepletedAt` at line 116, but a codebase-wide search (`src/`) finds no callers outside the system file itself.
   - Consequence: resource nodes can never actually be depleted during gameplay. The entire depletion+respawn pipeline (`tickResourceRespawn`, charge countdown display, respawn timer) is wired in GameLoop and ResourceTrackerPanel correctly, but is permanently inert because no game action ever calls `harvestNode`.
   - The `ResourceTrackerPanel` will always show all 12 nodes at full charge with no depleted count. The "DEPLETED" filter tab will always be empty.
   - Fix: Identify where the player interacts with resource nodes (tree-chopping, mining, herb gathering actions) and call `harvestNode(nodeId)` + `recordDepletedAt(nodeId, simSeconds)` at those sites.

2. `WorldThreatSystem.ts` line 91 — `faction-war-resolved` ID lookup never matches; resolved wars are not cleanly removed.
   - The handler at line 91 tries: `_threats.find(t => t.type === 'faction-war' && t.id === \`threat_war_${war.id}\`)`
   - But threat IDs are generated in `addThreat()` (line 34) as `threat_${Date.now()}_${random4chars}` — the prefix `threat_war_` is never used.
   - Result: the `if (match)` branch is dead. Execution always falls to the fallback: `const recent = _threats.find(t => t.type === 'faction-war')` which then sets `expiresAt = Date.now() + 10_000`. This fallback is coincidentally correct for the single-war case, but breaks when multiple concurrent wars exist — it expires only the most recently added war threat, not the resolved one.
   - Fix: Change the ID lookup to match by faction IDs rather than by a fabricated ID string. E.g., `_threats.find(t => t.type === 'faction-war' && t.detail.includes(war.attackingFactionId) && t.detail.includes(war.defendingFactionId))`.

3. `SidebarShell.tsx` line 178 / line 280 — NPCSchedulePanel has no keyboard hotkey.
   - `ICON_BUTTONS` entry (line 178): `{ id: 'npcschedule', icon: '📅', hint: 'NPC Schedules' }` — hint has no `(X)` shortcut suffix, unlike other shortcut-enabled panels.
   - The key `'N'`/`'n'` (line 280) is mapped to `togglePanel('housing')`, not to `npcschedule`. No other key is assigned for this panel.
   - Low gameplay impact (panel is reachable via icon) but inconsistent with World Threats (`A`) and Bounty Board (`5`) which both have hotkeys.
   - Fix: Assign an available key (e.g. `'6'`) and update hint to `'NPC Schedules (6)'`.

**Minor:**

4. `ResourceTrackerPanel.tsx` line 183 — `TAB_STYLE` function defined inline in component body.
   - `TAB_STYLE` is a function `(active: boolean): React.CSSProperties => (...)` declared inside `ResourceTrackerPanel`. It recreates on every render.
   - No runtime impact (no child component receives it as a prop), but it is inconsistent with the rest of the codebase style.
   - Fix: Move `TAB_STYLE` above the component or memoize via `useCallback` if it referenced component state (it doesn't, so hoisting is correct).

---

**M54 fix verification:**

- `refreshContracts` guildTimerRef: FIXED. `GameLoop.ts` line 336 declares `const guildTimerRef = useRef(0)`. Lines 3139-3143 accumulate `dt` and call `refreshContracts(useGameStore.getState().simSeconds)` every 60 real-seconds. Matches the fix prescription exactly.

- Bounty Board hotkey `'5'`: FIXED. `SidebarShell.tsx` line 175: `{ id: 'bountboard', icon: '📋', hint: 'Bounties (5)' }`. Lines 293-294: `case '5': e.preventDefault(); togglePanel('bountboard'); break`. Hint suffix matches key.

- SeasonalPanel `seasonal-change` listener: FIXED. `SeasonalPanel.tsx` lines 47-52 now include `window.addEventListener('seasonal-change', handler)` inside a `useEffect`, with cleanup in the return. Both the 1s interval and the event listener are active, triggering immediate refresh on season transition.

---

**M55 integration points confirmed working:**

- `initResourceDepletion()` called in `App.tsx` lines 70 and 129 (DevGame and GameWithSave paths). `_initialized` guard prevents double-init.
- `initWorldThreatSystem()` called in `App.tsx` lines 71 and 130. `_initialized` guard present.
- `tickResourceRespawn(simSeconds)` called every ~5 real-seconds via `resourceRespawnTimerRef` in `GameLoop.ts` lines 3483-3487. Uses `simSeconds` from store — correct for respawn countdown math.
- `ResourceDepletionSystem`: 12 nodes defined in `INITIAL_NODES` (lines 43-56). All 6 node types represented (tree×2, ore_vein×2, herb_patch×2, berry_bush×2, stone_deposit×2, mushroom_ring×2). Node count matches spec.
- `serializeNodes` / `deserializeNodes` wired in `OfflineSaveManager.ts` lines 144 and 299-300. Depletion state persists across saves.
- `ResourceTrackerPanel`: imports `getNodes` correctly; 2-second polling interval (lines 155-163); sorts available-first by distance (lines 166-171); `simSeconds` from `useGameStore` for countdown math (line 146); `px/pz` from `usePlayerStore` for distance (lines 147-148). Panel mechanics all correct.
- `NPCSchedulePanel`: reads `dayAngle` from `useGameStore` (line 257); 5-second polling interval for time advances (lines 263-266); `getCurrentActivity` called with reconstructed angle `(currentHour / 24) * 2 * Math.PI` — mathematically round-trips to the same hour value, not a bug.
- `WorldThreatPanel`: registers listeners for all 6 threat events (lines 94-101, 112-113); 5-second `clearExpiredThreats` interval; cleanup on unmount. Correct.
- `WorldThreatSystem` siege and weather handlers: siege-started/resolved correctly add/remove by settlementId. Weather handler correctly filters only dangerous weather names. Seasonal-event handler correctly adds low-level threat with 2-minute expiry.
