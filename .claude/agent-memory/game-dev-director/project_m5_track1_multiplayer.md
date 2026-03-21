---
name: M5 Track 1 Multiplayer State Sync
description: Server-authoritative shared world state implementation — what was built, what patterns work, key pitfalls
type: project
---

M5 Track 1 shipped 2026-03-21. Production: https://universe-sim-beryl.vercel.app (commit dc4fcc4)

**Why:** World had WebSocket connections but all state was local-only. Trees chopped by Player A were invisible to Player B. Fire ignition was client-only. Ore depletion was not shared.

**Architecture decisions:**
- Server: new `NodeStateSync.js` class in Railway server — owns depleted node state in memory + Neon DB (`depleted_nodes` table), 60s respawn timers, fires `onRespawn` callback
- Server message protocol extensions (minimal, additive):
  - `NODE_DESTROYED {nodeId, nodeType, x, y, z}` — client sends on gather/fell; server records + `broadcastAll`
  - `NODE_RESPAWNED {nodeId, x, y, z, nodeType}` — server fires on timer expiry
  - `FIRE_STARTED {x, y, z}` — client sends on ignition; server relays to all others (not back to sender)
  - `WORLD_SNAPSHOT` now includes `depletedNodes: number[]` for joining players
- Client: `multiplayerStore.depletedNodes: Set<number>` with setDepletedNodes/addDepletedNode/removeDepletedNode
- `WorldSocket._dispatch()` handles the three new message types; `setSimManagerForSocket()` registers LocalSimManager for FIRE_STARTED replays
- `getWorldSocket()` exported from `useWorldSocket.ts` for non-hook callers (GameLoop)
- `setSimManagerForSocket()` exported from `WorldSocket.ts` — called from SceneRoot engine lifecycle
- SceneRoot: all 5 node visibility loops (proximity scan, fire prompt, fire action, weapon attack, ResourceNodes renderer) all check `gatheredNodeIds || serverDepleted`
- `NODE_DESTROYED` sent on both gather paths: F-key interact and weapon-strike hit system
- `FIRE_STARTED` sent on both ignition paths: node-based and inventory-based campfire

**How to apply:** When adding new world-state events, follow the same pattern: client sends event to server → server validates + records → server broadcastAll (for persistent state) or broadcast-to-others (for ephemeral events like fire).

**Key pitfalls discovered:**
1. `tsc -b` (project references incremental mode) causes Vercel build failures when build cache has stale `.d.ts` outputs — switched to `vite build` only
2. `.tsbuildinfo` files must NOT be committed to git — add `*.tsbuildinfo` to `.gitignore`
3. `@react-three/postprocessing` peer dep conflict with `@react-three/fiber` resolved with `legacy-peer-deps=true` in `.npmrc`
4. Untracked/unstaged local files break Vercel builds silently — always verify `git status` before deploying
5. Vercel build cache (`Restored build cache from deployment X`) can restore stale node_modules — `.npmrc` forces npm to add missing packages on top
6. `useMultiplayerStore.getState()` inside `useFrame()` is the correct pattern for reading store state in the hot render loop without subscribing (avoids re-render churn)
