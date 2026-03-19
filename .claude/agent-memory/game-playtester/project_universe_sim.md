---
name: universe-sim project overview
description: Core architecture, tech stack, and design intent for the universe-sim game
type: project
---

A browser-based 3D survival/civilization sim built with React, Three.js (via @react-three/fiber), Zustand, and Clerk auth. Deployed on Vercel (universe-sim-beryl.vercel.app). Multiplayer via a persistent Railway WebSocket server.

**Core loop:** Player spawns in a 3D open world, gathers resources (stone/flint/wood/clay/fiber), crafts tools, researches tech, evolves civilization from Stone Age → Simulation Age. Time scale runs at 1,000,000× by default so cosmological epochs advance visibly.

**Tech stack:**
- Frontend: Vite + React + TypeScript, @react-three/fiber, @react-three/drei
- State: Zustand (gameStore, playerStore, uiStore, multiplayerStore)
- Auth: Clerk
- Save/load: Neon (Postgres via Vercel API routes)
- Multiplayer: Railway WebSocket server (always-on Node.js)
- ECS: custom bitfield arrays (world.ts)

**Key files:**
- src/rendering/SceneRoot.tsx — 3D scene, GameLoop, ResourceNodes, PlayerMesh
- src/player/PlayerController.ts — WASD/mouse, pointer lock, popInteract() for F-key gather
- src/store/gameStore.ts — timeScale (default 1_000_000), epoch, simTime, gatherPrompt
- src/ui/SidebarShell.tsx — all 8 panel hotkeys (I/C/T/E/J/Tab/M/Esc)
- src/player/Inventory.ts — 40-slot grid, MAT/ITEM constants, 50 crafting recipes across tiers 0–9
- src/engine/SimClock.ts — wall-time × timeScale drives sim seconds

**Why:** Designer (Paul Kim / ddogroundonline) is building an ambitious evolution/civilization sim as a side project. Agentic test loop is standard workflow after every commit.
