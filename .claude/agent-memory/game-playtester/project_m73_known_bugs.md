---
name: M73 Known Bugs
description: M73 audit findings — RPG UI nearly clean, tutorial fixed, sim tick firing in real browser, organisms not visible, XP festival indicator persists
type: project
---

M73 is the post-RPG-cleanup build. RPG_ENABLED = false now gates most RPG UI correctly.
Previous M72 critical RPG UI bleed was substantially fixed — but one survivor remains.

**M72 Items Verified Fixed in M73**
- DUNGEON widget — CONFIRMED GONE (RPG_ENABLED gate works in DungeonFloorHUD)
- FLOOR 1 widget — CONFIRMED GONE
- ADVANCE FLOOR button — CONFIRMED GONE
- HP / Hunger / Stamina / Thirst / Warmth bars — CONFIRMED GONE (HUD.tsx vitals gated)
- Spring Festival banner (modal) — CONFIRMED GONE (FestivalHUD gated)
- Toolbar RPG buttons — CONFIRMED REDUCED (VISIBLE_ICON_BUTTONS filter works; only SIM_PANELS shown)
- Tutorial text — CONFIRMED FIXED: now says "[G] spectator mode, [B] Ecosystem Dashboard, [O] seed organism"

**Critical Bugs**

(none identified — major structural issues from M72 are resolved)

**Important Bugs**

1. **"XP x2.0 (Festival)" indicator still showing at top-right**
   - SeasonalEventsUI in SceneRoot.tsx renders unconditionally (no RPG_ENABLED gate)
   - xpMultiplier reads from gameStore where server-pushed state still has festival active
   - The `{xpMultiplier > 1.0 && (...)}` block inside SeasonalEventsUI fires because xpMultiplier=2.0 from server
   - Fix: wrap SeasonalEventsUI in SceneRoot.tsx with `{RPG_ENABLED && <SeasonalEventsUI />}` or add RPG_ENABLED guard inside SeasonalEventsUI itself
   - File: src/rendering/SceneRoot.tsx line ~713, src/rendering/SeasonalEventsSystem.tsx line 659

2. **CLICK TO PLAY overlay still shows RPG keybinds, not sim keybinds**
   - "CLICK TO PLAY" modal (SceneRoot.tsx lines 512-522) still shows: WASD=Move, Mouse=Look, Space=Jump, F=Gather, F near water=Fish, I=Inventory
   - None of these apply in simulation mode (RPG_ENABLED = false)
   - Should show: G=Spectator, B=Ecosystem Dashboard, O=Seed organism, etc.
   - TutorialOverlay.tsx correctly shows sim-mode text AFTER entry, but the entry overlay itself is wrong
   - Fix: Add RPG_ENABLED branch to the CLICK TO PLAY content block in SceneRoot.tsx ~lines 513-520

3. **Sim tick fires but EcosystemDashboard does not display (B key toggles it closed on open)**
   - Dashboard starts visible=true on mount (useState(true)), so first B press HIDES it
   - Player presses B expecting to OPEN the dashboard; it actually closes it
   - One more B press opens it — two-press pattern is non-obvious
   - When open, stats ARE rendered: Organisms, Species, Births, Deaths, Ticks labels visible in DOM
   - Ticks counter: single tick fired during session ("[SimTick] tick fired, simSeconds: 321000000000000000.0 births: 0 deaths: 0")
   - Births and Deaths remain 0 for the observed session — sim is running but no demographic events yet
   - Population history chart IS rendering (SVG with polylines visible — 8 SVG circles detected)
   - Dot map: 8 SVG circles found, suggesting some organism dots are rendering

4. **Organism glowing spheres not visible in 3D viewport**
   - SpectatorCamera mounts correctly (SPECTATOR badge confirmed visible)
   - Planet surface renders correctly (atmosphere/terrain visible)
   - No colored organism spheres visible in any screenshot
   - Root cause: Fragment shader compile error for MeshStandardMaterial
     - "ERROR: 0:1449: 'totalEmissiveRadiance' : undeclared identifier"
     - "ERROR: 0:1449: 'emissiveIntensity' : undeclared identifier"
     - WebGL: INVALID_OPERATION: useProgram: program not valid (200+ warnings)
   - Organisms likely exist in ECS (51 confirmed by bootstrap) but their mesh shader fails to compile
   - CreatureRenderer uses emissive coloring for species glow — shader bug silently fails, mesh invisible

5. **Clerk UI fails to load (cosmetic error, no gameplay impact)**
   - "ClerkRuntimeError: Clerk: Failed to load Clerk UI" on every load
   - Expected in local dev environment without proper Clerk network access
   - Does not block gameplay

**Minor Bugs**

6. **Tutorial overlay hidden by CLICK TO PLAY: player never sees it**
   - TutorialOverlay correctly renders sim-mode text (G/B/O keys) — code is correct
   - But it renders BEHIND the CLICK TO PLAY modal (both visible simultaneously based on DOM)
   - CLICK TO PLAY click handler has a Playwright automation issue (timeout when trying to click)
     - Pointer lock request fails in Playwright context, falls through to bypassPointerLock
   - In real browser this likely works fine, but timing of tutorial visibility vs entry overlay needs checking

7. **simNow timestamp still at 321 quadrillion seconds (carry-forward from M60/M72)**
   - Sim tick log: "simSeconds: 321000000000000000.0" — same astronomical value as M72
   - World display shows "871.88 Myr" (server-calculated, correct relative display)
   - Not a new regression

**Verified Working in M73**
- SimulationBootstrap: 51 organisms, 4 species, 0.7-1.1ms (fast, consistent)
- SpectatorCamera: G key toggles, SPECTATOR badge visible
- Tutorial text: correctly shows G/B/O sim-mode instructions (TutorialOverlay.tsx sim branch works)
- Sidebar toolbar: filtered to SIM_PANELS only (Map, Codex, WorldEvents, etc. — RPG buttons hidden)
- DungeonFloorHUD: GONE (RPG_ENABLED gate working)
- Vital bars (HP/Hunger etc.): GONE
- EcosystemDashboard panel: renders correctly when toggled open (stats, chart, dot map all present)
- Sim tick: fires in real browser (confirmed by console log — improvement over M72 headless limitation note)
- Population chart: SVG polylines rendering (data flowing from getPopulationHistory)
- Organism dot map: SVG circles rendering (data flowing from getOrganismDots)

**How to apply:** Priority fix order for M74: (1) Organism shader bug — emissive on MeshStandardMaterial is broken, organisms invisible; (2) CLICK TO PLAY overlay RPG keybind text needs sim-mode branch; (3) SeasonalEventsUI XP indicator needs RPG_ENABLED gate; (4) Dashboard B-key toggle starts closed (consider initializing visible=false so B=open).
