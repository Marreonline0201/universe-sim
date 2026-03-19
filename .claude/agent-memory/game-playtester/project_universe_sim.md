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
- Auth: Clerk (required — game is behind login wall)
- Save/load: Neon (Postgres via Vercel API routes)
- Multiplayer: Railway WebSocket server (always-on Node.js)
- ECS: custom bitfield arrays (world.ts)
- ReactFlow used for TechTree and Evolution graph views

**Key files:**
- src/rendering/SceneRoot.tsx — 3D scene, GameLoop, ResourceNodes, PlayerMesh
- src/player/PlayerController.ts — WASD/mouse, pointer lock, popInteract() for F-key gather
- src/store/gameStore.ts — timeScale (default 1_000_000), epoch, simTime, gatherPrompt
- src/ui/SidebarShell.tsx — all 8 panel hotkeys (I/C/T/E/J/Tab/M/Esc)
- src/player/Inventory.ts — 40-slot grid, MAT/ITEM constants, 50 crafting recipes across tiers 0–9
- src/civilization/TechTree.ts — 150 tech nodes across 10 tiers
- src/player/EvolutionTree.ts — 50+ evolution nodes across 8 categories
- src/player/DiscoveryJournal.ts — 45 pre-defined discoveries
- src/civilization/CivilizationTracker.ts — NPC civ simulation (population, economy, diplomacy)
- src/game/GameSingletons.ts — module-level singletons (inventory, techTree, evolutionTree, etc.)
- src/engine/SimClock.ts — wall-time × timeScale drives sim seconds

**Resource nodes (world):**
- 15 stone, 8 flint, 15 wood, 8 clay, 12 fiber nodes — seeded deterministically
- Range: 12–172 units from spawn
- Gathering: walk within 3m → [F] prompt appears → press F
- Each node gathered ONCE per session (gatheredNodeIds set, no respawn)
- First stone/flint gather auto-discovers recipe #1 (Stone Tool)

**Crafting recipe progression to CAR (recipe #36):**
- Tier 0 (Stone Age): Stone Tool, Knife, Spear, Axe, Rope, Fire, Torch, Bow, Arrow, Clay Pot
- Tier 1 (Bronze Age): Kiln, Brick, Bronze, Bronze Sword, Bronze Armor, Plow, Boat
- Tier 2 (Iron Age): Furnace, Iron Sword, Wheel, Cart
- Tier 3 (Classical): Forge, Steel Sword, Glass, Windmill, Watermill
- Tier 4 (Medieval): Printing Press
- Tier 5 (Industrial): Steam Engine, Locomotive, Steamship, Dynamo, Telegraph, Lightbulb, Gunpowder
- Tier 6 (Modern): Internal Combustion Engine, **AUTOMOBILE (CAR)**, Airplane, Radio, Nuclear Reactor
- Car recipe: 150× STEEL + 40× RUBBER + 10× GLASS → CAR (1) — requires internal_combustion + engineering knowledge, tier 6

**Materials needed for CAR chain (not exhaustive, key ones):**
- STEEL (MAT.STEEL=16): needed for car — not gatherable in world, no recipe to make it yet
- RUBBER (MAT.RUBBER=36): needed for car — not gatherable in world, no recipe to make it
- GLASS (MAT.GLASS=18): recipe exists (SAND+CHARCOAL, tier 3) — SAND not gatherable

**Critical gaps found (car-build blockers):**
1. civTier stuck at 0 (Stone Age) — no mechanism to advance it in-game; setCivTier() never called from gameplay code
2. Recipe knowledge gate broken: canCraft() checks inventory.getKnownRecipes() which returns recipe IDs, but knowledgeRequired stores strings like 'metallurgy', 'smelting' — type mismatch means knowledge-gated recipes are always locked
3. Resource nodes are finite (one-gather-only, ~58 total nodes) — COPPER_ORE, TIN_ORE, IRON_ORE, COAL, RUBBER, SAND, SULFUR, SALTPETER, SILICON etc. are NOT present as world nodes
4. Only 5 material types are gatherable: STONE, FLINT, WOOD, CLAY, FIBER — everything for tier 1+ requires materials that don't exist in the world
5. No EP (Evolution Points) earning mechanism — EP starts at 0 and nothing awards it during gameplay
6. Journal is empty at start — no discoveries get recorded automatically
7. TechTree research fires but civTier never updates from techTree.getCurrentTier() — the two are disconnected
8. No agents/NPCs to converse with — ServerNpcsRenderer shows remoteNpcs from multiplayer store (server-spawned), no dialogue system exists

**What DOES work:**
- Movement (WASD + mouse look), third-person camera, sprint (Shift), jump (Space), camera cycle (V)
- Gathering 5 resource types with F key and proximity prompt
- Inventory panel (40 slots, item detail, drop button, 200ms polling)
- Crafting panel: filter/list/detail UI renders correctly; Stone Tool (tier 0, no knowledge gate) is craftable if player has stone+flint
- Tech Tree panel: list + graph (ReactFlow) views render; clicking available nodes starts research; tickResearch() advances based on simSeconds
- Evolution panel: list + graph views render; category filter works; unlock button functional (but requires EP which never accrues)
- Journal panel: renders correctly, empty until discoveries recorded
- Map panel: canvas 2D overhead map with fog of war, player dot, compass, remote players
- Character panel: genome heatmap, vitals, civ tier, goal, position
- Settings panel: keybinds list, admin time controls (if admin userId matches env var), logout
- HUD: vitals bars, sim clock, epoch label, connection status, goal badge
- Notification system: toast notifications for gather, craft events
- Procedural terrain with height-based vertex colors (nice visuals)
- Animated humanoid player mesh with walk cycle using refs (no re-render)
- Multiplayer: remote players rendered as humanoid figures, map dots
- Auto-save every 60 seconds via Neon Postgres

**Why:** Designer (Paul Kim / ddogroundonline) is building an ambitious evolution/civilization sim as a side project. Agentic test loop is standard workflow after every commit.
