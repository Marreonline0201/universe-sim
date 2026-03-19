---
name: universe-sim project overview
description: Core architecture, tech stack, design intent, and key files for universe-sim
type: project
---

A browser-based 3D survival/civilization sim built with React, Three.js (via @react-three/fiber), Zustand, and Clerk auth. Deployed on Vercel (universe-sim-beryl.vercel.app). Multiplayer via a persistent Railway WebSocket server.

**Core loop:** Player spawns in a 3D open world, gathers resources (stone/flint/wood/clay/fiber), crafts tools, researches tech, evolves civilization from Stone Age → Simulation Age. Time scale runs at 1,000,000× by default so cosmological epochs advance visibly.

**Tech stack:**
- Frontend: Vite + React + TypeScript, @react-three/fiber, @react-three/drei
- State: Zustand (gameStore, playerStore, uiStore, multiplayerStore)
- Auth: Clerk (required — game is behind login wall; VITE_DEV_BYPASS_AUTH=true bypasses it)
- Save/load: Neon (Postgres via Vercel API routes)
- Multiplayer: Railway WebSocket server (always-on Node.js)
- ECS: custom bitfield arrays (world.ts)
- ReactFlow used for TechTree and Evolution graph views

**Key files:**
- src/rendering/SceneRoot.tsx — 3D scene, GameLoop, ResourceNodes, PlayerMesh, BuildingGhost, PlacedBuildingsRenderer
- src/player/PlayerController.ts — WASD/mouse, pointer lock, popInteract() for F-key gather/place
- src/store/gameStore.ts — timeScale (default 1_000_000), epoch, simTime, gatherPrompt, placementMode, buildVersion
- src/ui/SidebarShell.tsx — all 9 panel hotkeys (I/C/B/T/E/J/Tab/M/Esc) — B=build is wired
- src/ui/panels/BuildPanel.tsx — NEW: build panel listing 30 building types by tier, material requirements, BUILD button, placement mode status, placed buildings list
- src/player/Inventory.ts — 40-slot grid, MAT/ITEM constants, 50 crafting recipes across tiers 0–9
- src/civilization/TechTree.ts — 150 tech nodes across 10 tiers
- src/player/EvolutionTree.ts — 50+ evolution nodes across 8 categories
- src/player/DiscoveryJournal.ts — 45 pre-defined discoveries
- src/civilization/BuildingSystem.ts — 30 building types tiers 0–9 (lean_to → simulation_node), place/demolish/damage/repair API
- src/civilization/CivilizationTracker.ts — NPC civ simulation (population, economy, diplomacy)
- src/game/GameSingletons.ts — module-level singletons (inventory, techTree, evolutionTree, buildingSystem, etc.)
- src/engine/SimClock.ts — wall-time × timeScale drives sim seconds

**Resource nodes (world) — updated:**
- 20 stone, 10 flint, 20 wood, 12 clay, 15 fiber, 8 copper_ore, 8 iron_ore, 6 coal, 5 tin_ore, 8 sand, 4 sulfur, 15 bark — seeded deterministically
- Range: 12–172 units from spawn
- Gathering: walk within 3m → [F] prompt appears → press F
- Nodes respawn after 60 real seconds (changed from permanent removal)
- First stone/flint gather auto-discovers recipe #1 (Stone Tool)
- Ore nodes (copper, iron, coal, tin, sulfur) award 2 EP each

**Build system — NEW (playtested 2026-03-19):**
- B key opens Build panel (wired in SidebarShell, bundled in deployed build)
- BuildPanel lists all 30 building types, grouped by tier (0=Stone Age through 9=Simulation)
- Tier 0 buildings always visible; higher tiers require specific techs to unlock
- Each building row shows: name, size footprint, provides[] capabilities, material requirements with have/need counts in real-time (300ms polling)
- BUILD button: green + enabled if affordable, gray + disabled if not, hidden if tier locked
- Clicking BUILD on affordable building: calls setPlacementMode(bt.id), closes panel
- Clicking BUILD when not affordable: fires "Not enough materials!" warning notification (from BuildPanel.handlePlace)
- placementMode state: string | null in gameStore
- When placementMode is active:
  - Blue banner appears at top of screen (SceneRoot): "Building: [Name] · Look at spot · [F] place · [Esc] cancel"
  - BuildingGhost component renders transparent blue box (opacity 0.25) + edge lines in 3D, 6m ahead of player, following camera direction each frame
  - GameLoop replaces gather prompt with "[F] Place [Name] · [B/Esc] Cancel"
  - F key (popInteract) triggers placement: consumes materials, calls buildingSystem.place(), bumpBuildVersion(), clears placementMode
  - Esc or B key cancels placement mode
  - If materials depleted between opening panel and pressing F: "Not enough materials to build!" warning, placement cancelled
- PlacedBuildingsRenderer: renders placed buildings as colored box+roof mesh in 3D scene
- Build panel also shows "X buildings placed" count and a list of placed buildings with health %

**Campfire Pit (the key test case):**
- id: 'campfire_pit', name: 'Campfire Pit', tier: 0
- Requires: 8× STONE (MAT.STONE = materialId 1)
- Size: 2×1×2m, provides: ['fire', 'cooking', 'warmth']
- Always visible (tier 0, no tech unlock required)
- Player starts with 0 stone; must gather from ~20 stone nodes within 12–172m of spawn
- After gathering 8+ stone (possible in ~2-3 minutes of play): BUILD button goes green

**Lean-To Shelter:**
- id: 'lean_to', tier: 0
- Requires: 8× WOOD + 4× BARK
- Bark nodes now exist in world (15 bark nodes); bark IS gatherable

**Pit House:**
- id: 'pit_house', tier: 0
- Requires: 20× WOOD + 10× CLAY
- Both wood and clay are gatherable; achievable in ~5-10 min

**Critical gap: BUILD button disabled state provides no feedback when clicked**
- In BuildPanel.handlePlace(): if !canAfford, fires addNotification('Not enough materials!', 'warning') but the button itself is disabled={!affordable}
- A disabled HTML button does NOT fire onClick events — so clicking the grayed-out BUILD button produces no toast notification at all
- The warning notification only fires if canAfford was true when BUILD was clicked but then race-conditions to false (practically impossible in normal play)
- Net result: player clicks grayed BUILD with no stone, nothing happens, no feedback

**visibleTiers filter bug in BuildPanel:**
- Line 89: filter(t => t <= civTier + 1 || isTierUnlocked(t))
- civTier starts at 0, so civTier + 1 = 1: shows tier 0 and tier 1 buildings immediately
- Tier 1 buildings (Mud Brick House, Pottery Kiln, Granary, Dock) appear at fresh start even though they require Bronze Age techs
- They show with 🔒 locked icon and 0.35 opacity, and have no BUILD button — so it's not a blocking bug, but the panel looks overpopulated at start

**Placement mode F-key conflict with Evolution panel:**
- 'e': 'E' togglePanel('evolution') and 'f'/'F' = popInteract in PlayerController
- popInteract checks 'KeyF', not 'KeyE' — no conflict
- However: if inputBlocked is true (panel open), GameLoop step 6 (placement mode) runs BEFORE the inputBlocked check in step 5 (gather)
- This means F-key placement works even while a panel is open (placement mode closes the panel via closePanel() in handlePlace)
- Actually: handlePlace calls closePanel() BEFORE setting placementMode, so panel is already closed when ghost/F-key logic runs — no conflict

**Previous critical gaps status (updated):**
1. civTier stuck at 0 — FIXED: TechTree completion now wires to setCivTier + awards EP (commit cded562)
2. Recipe knowledge gate — FIXED in cded562: knowledgeRequired strings now map to tech node IDs
3. Ore resources — FIXED: copper_ore, iron_ore, coal, tin_ore, sand, sulfur, bark nodes now in world
4. EP earning — FIXED: 1 EP/30s survival trickle + 2 EP per ore gather
5. Building UI — FIXED: BuildPanel + ghost mesh + placement mode + PlacedBuildingsRenderer all implemented
6. No shelter Construction via BuildPanel — WORKS now; lean_to/campfire/pit_house all tier 0, accessible fresh start

**Remaining gaps (as of 2026-03-19):**
- Disabled BUILD button silently fails (no feedback on click) — medium bug
- Tier 1 buildings shown at fresh start with lock icons (minor visual clutter)
- Click-to-play overlay says "ESC — Settings" and lists panels but does NOT mention B=Build (new feature not in hint text)
- Placement mode banner says "[F] place" but pointer lock must be active for F to register — if player opened Build panel (which exits pointer lock), they must click game canvas again before F works
- The "re-acquire pointer lock to use F" flow is not documented anywhere in the UI
- buildVersion is read by BuildPanel (line 62) but never actually used inside BuildPanel render logic — it's consumed from gameStore but not referenced in JSX or conditional renders (dead variable)
- PlacedBuildingsRenderer re-fetches buildingSystem.getAllBuildings() on every render but only re-renders when buildVersion changes — correct pattern
- Node respawn is 60 real seconds; with 8 stone needed for campfire and ~20 stone nodes available, player is unlikely to hit respawn timing as a barrier

**What DOES work (cumulative):**
- Movement (WASD + mouse look), third-person camera, sprint (Shift), jump (Space), camera cycle (V)
- Gathering 12 resource types with F key and proximity prompt
- Inventory panel (40 slots, item detail, drop button, 200ms polling)
- Crafting panel: filter/list/detail; Stone Tool craftable with stone+flint
- Build panel (B): lists buildings, material counts, placement mode, ghost mesh, F-to-place, Esc-to-cancel, placed buildings list
- Tech Tree panel: list + graph (ReactFlow); clicking nodes starts research; civTier advances on completion
- Evolution panel: list + graph views; unlock button (requires EP, which now accrues)
- Journal panel (empty until discoveries trigger)
- Map panel: 2D overhead map with fog of war, player dot, compass
- Character panel: genome, vitals, civ tier, goal, position
- Settings panel: keybinds, admin time controls, logout
- HUD: vitals bars, sim clock, epoch, connection status, EP counter, goal badge
- Notification system: toast for gather, craft, build events
- Procedural terrain (vertex displaced, height-colored)
- Animated humanoid player + animated NPC figures
- Multiplayer: remote players on map + in scene
- Auto-save every 60s via Neon Postgres
- EP trickle 1/30s + ore gather EP bonus

**Why:** Designer (Paul Kim / ddogroundonline) is building an ambitious evolution/civilization sim as a side project. Agentic test loop is standard workflow after every commit.
