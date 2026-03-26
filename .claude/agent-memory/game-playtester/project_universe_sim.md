---
name: universe-sim project overview
description: Core architecture, tech stack, design intent, and key files for universe-sim
type: project
---

A browser-based 3D survival/civilization sim built with React, Three.js (via @react-three/fiber), Zustand, and Clerk auth. Deployed on Vercel (universe-sim-beryl.vercel.app). Multiplayer via a persistent Railway WebSocket server.

**Core loop:** Player spawns in a 3D open world, gathers resources (stone/flint/wood/clay/fiber), crafts tools, researches tech, evolves civilization from Stone Age to Simulation Age. Time scale runs at 1e13 by default so cosmological epochs advance visibly.

**Tech stack:**
- Frontend: Vite + React + TypeScript, @react-three/fiber, @react-three/drei
- State: Zustand (gameStore, playerStore, uiStore, multiplayerStore)
- Auth: Clerk (required in prod; VITE_DEV_BYPASS_AUTH=true bypasses in dev)
- Save/load: Neon (Postgres via Vercel API routes /api/save /api/load)
- Multiplayer: Railway WebSocket server (always-on Node.js)
- Physics: Rapier WASM (trimesh planet collider + KCC player capsule)
- ECS: bitECS (world.ts)
- ReactFlow used for TechTree and Evolution graph views

**Key files:**
- src/rendering/SceneRoot.tsx — 3D scene, engine init, resource nodes, player spawn, ghost mesh
- src/player/PlayerController.ts — WASD/mouse, pointer lock, popInteract() for F-key gather/place
- src/store/gameStore.ts — timeScale (default 1e13), epoch, simTime, gatherPrompt, placementMode, buildVersion
- src/ui/SidebarShell.tsx — all 9 panel hotkeys (I/C/B/T/E/J/Tab/M/Esc) — B=build is wired
- src/ui/panels/BuildPanel.tsx — build panel listing 30 building types by tier, material requirements, BUILD button, placement mode status, placed buildings list
- src/player/Inventory.ts — 40-slot grid, MAT/ITEM constants, 50 crafting recipes across tiers 0-9
- src/civilization/TechTree.ts — 150 tech nodes across 10 tiers
- src/player/EvolutionTree.ts — 50+ evolution nodes across 8 categories
- src/player/DiscoveryJournal.ts — 45 pre-defined discoveries
- src/civilization/BuildingSystem.ts — 30 building types tiers 0-9 (lean_to to simulation_node)
- src/world/SpherePlanet.ts — cube-sphere geometry (segs=160 render, segs=60 physics), FBM terrain, biome colors
- src/rendering/PlanetTerrain.tsx — terrain mesh, ocean shimmer, atmosphere glow, GLSL detail noise shader
- src/ui/WorldBootstrapScreen.tsx — cinematic 8-second timelapse shown while server bootstraps

**Resource nodes (world):**
- 20 stone, 10 flint, 20 wood, 12 clay, 15 fiber, 8 copper_ore, 8 iron_ore, 6 coal, 5 tin_ore, 8 sand, 4 sulfur, 15 bark
- Range: 12-172 units from spawn (north pole of sphere)
- Gathering: walk within 3m, [F] prompt appears, press F
- Nodes respawn after 60 real seconds

**Visual quality (from screenshots in repo):**
- Planet terrain has visible biome color variation: green forest mid-latitudes, brown desert, sandy beach strip, ocean blue
- GLSL detail noise shader adds sub-polygon variation (0.4 to 9.0 freq layers, +-22% brightness variation)
- Third-person camera default, player visible as humanoid figure
- HUD is monospace font, dark glassmorphism panels
- Epoch clock top-right, vitals bars top-left (5 bars: health/satiety/hydration/energy/stamina)

**Known issues as of 2026-03-25 (M18):**
- Click-to-play overlay says "E — Open Inventory" but E opens nothing visible (it triggers eat, not inventory). Inventory is I. IMPORTANT bug for new players.
- ChemistryHUD useEffect has events.length in dependency array — causes interval re-subscription on every events state change (stale closure pattern).
- Fermentation rewards MAT.COOKED_MEAT as placeholder (TODO: MAT.ALCOHOL). Misleading gameplay feedback.
- PostProcessing does two scene renders per frame (depth pass + RenderPass in composer). Potential perf concern on low-end hardware.
- Disabled BUILD button silently fails (no feedback on click) -- disabled HTML button does not fire onClick
- Tier 1 buildings shown at fresh start with lock icons (minor clutter)
- HUD connection dot shows red OFFLINE initially until WS handshake completes (normal but alarming)
- Crafting panel "No craftable recipes right now" on fresh start -- correct but confusing for new players

**What works (cumulative, as of 2026-03-20):**
- Movement (WASD + mouse look), third-person camera, sprint, jump, camera cycle (V)
- Gathering 12 resource types with F key and proximity prompt
- Inventory panel (40 slots, item detail, drop/equip/eat buttons, 200ms polling)
- Crafting panel with tech-unlock gating and craftable filter
- Build panel (B): listings, material counts, placement mode, ghost mesh, F-to-place, placed buildings list
- Tech Tree panel: list + ReactFlow graph, click to research, civTier advances on completion
- Evolution panel: list + ReactFlow graph, EP-gated unlock
- Map panel: 2D canvas, fog of war, player dot, remote players, NPCs, compass
- Character panel: genome heatmap, vitals, civ tier, stats
- Settings panel: keybinds, admin time controls, logout
- HUD: vitals bars, sim clock, epoch, EP, goal badge, connection dot
- Procedural planet terrain with biome colors and GLSL sub-pixel detail noise
- Ocean shimmer (animated opacity), atmosphere glow (additive backface sphere)
- Animated humanoid player + remote player figures
- Real chemistry fire simulation (Arrhenius combustion in 3D grid)
- Auto-save every 60s to Neon Postgres
- EP trickle 1/30s + ore gather bonus

**Why:** Designer (ddogroundonline) is building an ambitious evolution/civilization sim as a side project. Agentic test loop is standard workflow after every commit.
