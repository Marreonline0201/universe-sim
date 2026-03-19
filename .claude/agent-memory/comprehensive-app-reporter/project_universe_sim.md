---
name: Universe Sim project context
description: Key architectural facts, known bugs, and status of the Universe Simulation game as of 2026-03-19
type: project
---

The app is a multiplayer 3D browser game at https://universe-sim-beryl.vercel.app.

Architecture: Vite/React/Three.js frontend on Vercel, three Vercel serverless API routes (save, load, world-settings, admin), always-on Railway WebSocket server, Neon Postgres database, Clerk for auth.

**Why:** Game is in active development. Report v2 written 2026-03-19 after a bug-fix session.

**How to apply:** When asked to update the report, read the current report.md version number and increment it. Check these known issues first before writing new findings.

## Fixed in session 2026-03-19
- /api/save, /api/load, /api/world-settings converted from Web API style to Node.js req/res style (were crashing with 500 on all requests)
- Admin time-scale POST now sends Clerk JWT (was always 401)
- Pointer lock released when sidebar panels open (SidebarShell.tsx)
- Dead event listeners removed from SceneRoot.tsx
- Click-to-play overlay added to SceneRoot.tsx
- Camera distance increased
- _adminSocket assignment fixed in useWorldSocket.ts so ADMIN_SET_TIME reaches Railway

## Known remaining bugs as of 2026-03-19
- B-01: admin.ts still uses Web API style (Request/Response) — will 500 in production
- B-02: No save-failed toast notification
- B-03: Duplicate Clerk packages (@clerk/clerk-react v5 and @clerk/react v6)

## Key missing features as of 2026-03-19
- Gathering mechanic (blocks all progression)
- NPC interaction
- Terrain height variation
- Six of eight sidebar panels are empty placeholders (TechTree, Evolution, Journal, Character, Map, Settings)
- ADMIN_SET_TIME WebSocket command has no server-side auth check
