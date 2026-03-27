---
name: M72 Known Bugs
description: M72 audit findings — sim tick never fires in practice, RPG UI bleeds into sim mode, toolbar and spatial issues
type: project
---

M72 introduces organism simulation (SimulationBootstrap, NaturalSelectionSystem, SimulationIntegration, EcosystemDashboard, SpectatorCamera, SpectatorBadge). RPG systems wrapped in RPG_ENABLED = false.

**M71 Verified Fixed**
- removeChild crash on CLICK TO PLAY dismiss — CONFIRMED FIXED (zero errors across all test paths including without bypass flag, panel open/close, multi-key sequences)
- Toolbar button height — CONFIRMED FIXED (buttons render at 34px tall, 44px wide, 69 buttons from y=1 to y=889)

**Critical Bugs**

1. **tickSimulation never fires in practice — Ticks permanently 0 in Playwright**
   - Ecosystem Dashboard shows Ticks: 0, Births: 0, Deaths: 0 for the entire session
   - Bootstrap IS working: "51 organisms, 4 species, 1.7ms" logs on every load
   - Root cause: R3F useFrame does not tick at full rate in headless Playwright (GPU stall / no display), so GameLoop's simTickAccRef never reaches 10
   - NOTE: This may be a test environment limitation only. Real browser with display likely works. Verify on real browser before marking critical.
   - The tick code path itself (GameLoop.ts line 3197-3202) is logically correct
   - Evidence: weather changes, diplomatic events fire (server-pushed), day/night advances — server-driven features work. Only client-side useFrame-gated code is affected in headless.

**Important Bugs**

2. **RPG UI bleeds into organism simulation mode (RPG_ENABLED = false)**
   - DUNGEON / FLOOR 1 widget still visible at top-center on every screen
   - ADVANCE FLOOR button still works (advances Floor 1 → Floor 2) — RPG dungeon system fully active in UI
   - Sidebar toolbar has 69+ RPG buttons (INV, CRF, BLD, JRN, MAP, SKL, FSH, HME, PLR, FCT, STL, ALK, TRD, FRG, HSE, etc.) — all still showing with RPG disabled
   - Spring Festival banner / XP x2.0 boost still showing
   - Survival meters (HP/Hunger/Thirst/Energy/Warmth) still visible in HUD
   - Tutorial says "Use WASD to move around. Explore your surroundings!" — RPG-oriented text
   - NONE of these are hidden when RPG_ENABLED = false
   - DungeonFloorHUD.tsx renders unconditionally — no RPG_ENABLED gate
   - SidebarShell.tsx renders all buttons unconditionally
   - HUD.tsx vital bars render unconditionally
   - Root cause: RPG_ENABLED flag only gates GameLoop ticks, NOT UI visibility

3. **Inventory panel says "Loading panel..." indefinitely**
   - When I key opens INVENTORY panel, content shows "Loading panel..." and never loads actual items
   - Empty inventory (0 Gold, no items) is expected, but "Loading panel..." text suggests lazy import or data fetch is stuck
   - This may be related to RPG_ENABLED = false disabling the inventory system that the panel tries to read

4. **SPECTATOR camera movement undetectable in headless**
   - W/E/S keys in spectator mode produce no visible camera movement in screenshots
   - Planet view appears identical before/after WASD inputs
   - May be headless browser limitation (no GPU rendering changes captured)
   - Organism sprites not visible anywhere in planet screenshots — ECS entities may not be rendering as visible meshes

5. **Organism wander movement: unverifiable in headless**
   - CreatureRenderer expected to show organisms as colored dots/meshes on planet
   - No organisms visible in any planet screenshot even from spectator mode
   - Could be: organisms are too small at planet scale (8-20m on 4000m radius planet), or rendering behind atmosphere, or organisms all clustered at equator below horizon
   - EcosystemDashboard confirms 51 organisms exist in simulation data

6. **simNow timestamp still corrupted (carry-forward from M60)**
   - Server simTime = 321000000000000000 (321 quadrillion seconds = ~10 billion years)
   - This matches the "871.88 Myr" display (server controls sim time)
   - World Boss and Stats panels likely still show astronomically large timestamps
   - CONTEMPORARY epoch label correct, display math may still be broken for relative time

**Minor Bugs**

7. **SPECTATOR badge text overlaps FLOOR readout**
   - "SPECTATOR WASD+QE fly | Scroll Speed | Shift boost | [G] exit" bar renders at top-center
   - Overlaps or appears adjacent to "FLOOR 1 / ADVANCE FLOOR" widget
   - Both visible simultaneously; cluttered

8. **Weather widget shows STORM with -17C and no precipitation effect visible**
   - Weather changes correctly (CLOUDY → CLEAR → STORM) between sessions
   - No visual storm effect visible in 3D world (may be headless limitation)

9. **Spring Festival banner on initial load**
   - Shows "Spring Festival has begun! XP x2.0 (Festival)" on every cold load
   - With RPG_ENABLED = false, XP/festival bonuses do nothing — confusing message

10. **B key ecosystem toggle: Ticks row never > 0**
    - Dashboard visible and polling correctly every 500ms
    - But Ticks: 0, Births: 0, Deaths: 0 the entire session
    - Organisms: 51, Species: 4 — bootstrap data is correct

**Verified Working in M72**
- SimulationBootstrap runs: 51 organisms, 4 species, ~1.5ms (well under 100ms target)
- initializeSimulation called from SceneRoot after engine.init() — correct integration
- SpectatorCamera mounts and shows SPECTATOR badge on G key press
- B key toggles EcosystemDashboard off/on correctly
- Map panel opens with MAP key (M) — shows settlements with alliance events
- Journal panel opens with J key
- Crafting panel opens with C key
- removeChild crash FIXED — all panel open/close/hotkey combos work without error
- 69 toolbar buttons render at correct 34px height (M71 collapse bug fixed)
- WebSocket connects to Railway (117 messages observed, WORLD_SNAPSHOT received)
- Diplomatic events from server display in HUD
- Day/night cycle advances across sessions

**How to apply:** tickSimulation reliability in real browser should be spot-checked by opening browser DevTools and watching Ecosystem Dashboard tick counter. The RPG UI bleed is the most actionable issue — DungeonFloorHUD, SidebarShell, HUD vital bars all need RPG_ENABLED gating at render level, not just at tick level.
