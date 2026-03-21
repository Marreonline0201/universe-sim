---
name: Universe Sim project context
description: Key architectural facts, known bugs, and status of the Universe Simulation game as of 2026-03-20 (report v5)
type: project
---

The app is a multiplayer 3D browser game at https://universe-sim-beryl.vercel.app.

Architecture: Vite/React/Three.js frontend on Vercel, Vercel serverless API routes (save, load, world-settings, admin), always-on Railway WebSocket server, Neon Postgres database, Clerk for auth.

**Why:** Game is in active development. Report v5 written 2026-03-20.

**How to apply:** When asked to update the report, read the current report.md version number and increment it. Check these known issues first before writing new findings. The Vite config has two named build entry points (main + status).

## Fixed in session 2026-03-19
- /api/save, /api/load, /api/world-settings converted from Web API style to Node.js req/res style
- Admin time-scale POST now sends Clerk JWT
- Pointer lock released when sidebar panels open (SidebarShell.tsx)
- Dead event listeners removed from SceneRoot.tsx
- Click-to-play overlay added to SceneRoot.tsx
- Camera distance increased
- _adminSocket assignment fixed in useWorldSocket.ts
- Rapier3D physics engine fully integrated (Fix 8)
- Terrain triangle winding fixed — player no longer falls through floor (Fix 9)
- DevUser ghost copy removed (Fix 10)

## Built in session 2026-03-20 (Simulation Grid Phase 1)
- MaterialRegistry, GridCoords, Arrhenius simulation math modules
- thermalWorker per-material heat diffusion fix
- chemWorker (Arrhenius combustion at 10 Hz)
- LocalSimManager + SimulationEngine updates
- playerStore ambientTemp field
- SceneRoot fire wiring (gather → equip flint → click → fire starts)
- FireRenderer (glowing spheres + point lights per hot cell)
- HUD ambient temperature display
- 18 Vitest unit tests — all passing

## Built in session 2026-03-20 (Status Website)
- src/status/ subtree: useStatusSocket, StatusApp, EpochBar, SatelliteMap, ServerStats, PlayerRoster, PlayerDetail
- status/index.html entry point
- vite.config.ts updated with dual entry points (main + status)
- Accessible at /status/ on the deployed site — no login required
- Connects to Railway WebSocket as "__status_viewer__" / "~observer" observer identity
- Receives WORLD_SNAPSHOT at 10 Hz: epoch, simTime, timeScale, paused, bootstrapPhase, bootstrapProgress, players (userId/username/x/y/z/health), npcs (id/x/y/z/state/hunger)
- SatelliteMap uses procedural fBm terrain texture (generated once on mount), draws NPC dots color-coded by state, player dots with pulsing rings and health arcs
- PlayerDetail modal shows health + coordinates only — full vitals are in-game only

## Known remaining bugs as of 2026-03-20
- B-01: admin.ts still uses Web API style — will 500 in production
- B-02: No save-failed toast notification
- B-03: Duplicate Clerk packages (@clerk/clerk-react v5 and @clerk/react v6)
- B-04: Simulation grid state not persisted (fires lost on disconnect)
- B-05: Status site canvas fixed at 800x600 internal resolution — click detection may be slightly off at extreme aspect ratios

## Key missing features as of 2026-03-20
- Fire spread (burns in place but does not propagate to adjacent cells)
- NPC interaction
- Terrain height variation
- Six of eight sidebar panels are empty placeholders
- ADMIN_SET_TIME WebSocket command has no server-side auth check
- Cooking (requires grid temperature integration with crafting)
- Player death and respawn
