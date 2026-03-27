---
name: M71 Known Bugs
description: M71 audit findings — removeChild crash on pointer lock dismiss, frozen countdown timers, simNow timestamp corruption, Chronicle raw ID display bug
type: project
---

M71 introduces extracted sub-components (DungeonRoomInteractionSystem.ts, VitalBars.tsx, WeatherWidgets.tsx). The critical crash pre-dates M71 in pointer lock dismiss path.

**Critical Bugs**

1. **CLICK TO PLAY crashes entire React tree** — `NotFoundError: Failed to execute 'removeChild' on 'Node'`
   - Reproduced 100% of the time: clicking the CLICK TO PLAY overlay or the SET (Settings) button both trigger the same crash
   - Full React render tree crashes (black screen with error trace)
   - Root cause: R3F's custom fiber reconciler conflicts with DOM reconciler during `AnimatePresence` exit animation on `motion.div` panel unmount, possibly triggered by framer-motion v12 + React 18 concurrent mode interaction
   - Workaround: set `window.__POINTER_LOCK_FAILED__ = true` before clicking — this bypasses pointer lock and avoids the crash path
   - Stack: `removeChildFromContainer` → `commitDeletionEffectsOnFiber` (in R3F `chunk-5S4FUZ3X.js`)

2. **simNow starts at 0 — corrupted display timestamps** (carry-forward from M60, still unresolved)
   - `World Boss` panel shows: "Spawned T+5350000000000000:00"
   - `Player Stats Dashboard` shows: "Playtime: 89166666666666h 40m"
   - Symptom: `simNow` is `0` at panel render time, math produces astronomically large values

**Important Bugs**

3. **Countdown timers frozen** — Bounty Board and Quest Board both show frozen timers
   - Bounty Board: 3 active bounties all stuck at "14m 56s" (did not tick during 10s observation)
   - Quest Board: "REFRESH IN 5:00" did not tick during 5s observation
   - May be related to the sim time bug — timers may be comparing against simNow=0
   - Note: guildTimerRef fix was confirmed in M55 — this may be a new regression introduced post-M55

4. **Chronicle uses raw boss ID** — World Boss entry shows "iron_behemoth Rises" / "A powerful iron_behemoth has appeared" instead of display name "Iron Behemoth"
   - World Boss panel itself correctly shows "Iron Behemoth" — inconsistency in how Chronicle formats boss names

5. **NPC role mismatch** — Elara is listed as "MAGE" in NPC Schedule panel but "MERCHANT" in NPC Relationships panel (carry-forward from M58)

**Visual Layout Bugs (added 2026-03-27 screenshot audit)**

8. **CRITICAL: Sidebar toolbar 73% off-screen** — The toolbar uses `top:'50%', transform:'translateY(-50%)'` to center itself, but with 68 buttons at 34px each = 2314px height. On a 622px viewport it starts at y=-846 and ends at y=1468. Only 18 of 68 buttons are visible. 50 buttons (including INV, CRF, BLD, JRN, CHR, MAP, SKL, QST, SET, and 25 others from each end) are completely off-screen and unreachable via mouse click. File: `src/ui/SidebarShell.tsx` line ~510.

9. **CRITICAL: DiplomacyHUD (z:1200) renders above open panels (z:200)** — `DiplomacyHUD` is positioned `right:16, top:80, z-index:1200`. When a sidebar panel is open (480px wide, z:200), the DiplomacyHUD overlaps the panel at x=862-1242, y=80-398 and renders on top of it. The entire center-top portion of every open panel has diplomatic event notifications obscuring it. File: `src/ui/DiplomacyHUD.tsx` line 76-78.

10. **ADMIN button (z:9999) overlaps toolbar 👑 button** — ADMIN button is at (1170-1242, 580-606). The 👑 `titleprogress` toolbar button is at (1214-1258, 583-617). These overlap at x=1214-1242. ADMIN (z:9999) hides the 👑 button visually and blocks clicks.

11. **EcosystemDashboard visually clips over toolbar** — EcosystemDashboard at `right:12, top:48, z:200, width:196` occupies x=1050-1246. Toolbar occupies x=1214-1258. They overlap by 32px horizontally (x=1214-1246). EcosystemDashboard has `pointer-events:none` so no click blocking, but 32px of toolbar is visually obscured. File: `src/ui/EcosystemDashboard.tsx` line 76.

**Minor Bugs**

6. Bounty Board hotkey '5' does not work when any other panel is open (expected behavior — toggle requires panel to be closed first)
7. Player Stats "Distance" shows 27m even without actual movement (may be measurement from spawn position)

**Visual Screenshot Audit — 2026-03-27 (Current Build)**

Findings from Playwright CDP screenshot pass (vp-current/ directory):

- CLICK TO PLAY overlay shows Spring Festival banner, controls legend, tutorial panel, and ECOSYSTEM widget in top-right. The sidebar toolbar is visible as a narrow strip at far right but buttons are microscopic (rendered at ~13px tall instead of 34px).
- First toolbar click (INV) successfully opens INVENTORY panel — panel slides in from right at 480px wide. Contents show "0 Gold", SORT/STACK buttons, filter tabs (ALL/TOOLS/FOOD/MATS/MISC), and "Your inventory is empty." message.
- CLICK TO PLAY dismissal via JS dispatch (not pointer lock path) — does NOT crash when pointer lock is bypassed.
- Any subsequent keyboard panel open (I, J, M, C, Tab, etc.) immediately produces full black RENDER ERROR screen showing: "NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node." — entire React tree crashes permanently.
- After crash: the game is completely black and unrecoverable. Every further key press shows the same error screen. Page requires full reload.
- Toolbar buttons confirmed at x=1396, w=44 — BUT computed height is 13.2px not 34px (CSS height: 34px is not applying, likely due to a flex container constraint collapsing the height).
- 71 toolbar buttons total, all stacked from y=0 to y=889, filling the full 900px height. At 13px each they fit but are extremely small / hard to click on real mouse. The 44px width at x=1396 means each button is a 44×13px sliver at the very far right edge of the screen.
- ECOSYSTEM widget visible at top-right (x=1233, y=48, 195×327px) — overlaps toolbar at x=1214-1396. EcosystemDashboard renders before sidebar at z:200 but sidebar is also z:195 for icon strip — overlap is real.
- Mobile at 800px: immediately shows RENDER ERROR (crash carries over). At 600px: same.
- ADMIN button visible at bottom-right of screen.
- FLOOR 1 / ADVANCE FLOOR button visible top-center.
- Tutorial panel persists bottom-center with "Use WASD to move around. Explore your surroundings!" and "Skip Tutorial" button.
- Notification at bottom-right: "WORLD BOSS: Iron Behemoth has appeared (Randomly)"
- XP indicator top-right: "XP x2.0 (Festival)"
- Spring Festival event banner shown on initial load with controls legend overlaid.

**Current reproduction of removeChild crash:**
1. Load game → Spring Festival banner + CLICK TO PLAY overlay visible
2. Click CLICK TO PLAY → game world visible, INVENTORY panel opens if you click INV button (works once)
3. Close panel (X or Escape) → panel closes
4. Press ANY hotkey (I, J, M, C, Tab, etc.) → "NotFoundError: Failed to execute 'removeChild'" full-screen black crash
5. Game is dead — requires reload

**M71 Verifications**

- VitalBars.tsx import compiles without error (RustVitalBar, WarmthBar, StaminaBar, ShelterIndicator all present)
- WeatherWidgets.tsx renders correctly (WeatherIcon shows CLEAR state properly)
- DungeonRoomInteractionSystem.ts — untestable without entering a dungeon room
- HUD.tsx panels render without errors (confirmed by full panel sweep)

**Why:** M71 refactored HUD and GameLoop to extract components. The crash is in `SceneRoot.tsx` and `SidebarShell.tsx` animation system — not in the extracted components.

**How to apply:** The `removeChild` crash should be the top priority fix. It blocks all new players from entering the game. The toolbar button height collapse (13px actual vs 34px specified) is a secondary visual priority.
