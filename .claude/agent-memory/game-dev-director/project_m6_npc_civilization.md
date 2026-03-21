---
name: M6 NPC Civilization
description: M6 NPC settlement system — architecture, message protocol, DB tables, key patterns, pitfalls
type: project
---

M6 NPC Civilization shipped 2026-03-21. Production: https://universe-sim-beryl.vercel.app (commit 892b046)

**Why:** The survival world needed living, persistent societies that players can trade with or become hostile to. NPCs needed to remember players across server restarts and advance their own civilization independently.

## Architecture

### Server-side (Railway)
- `NpcMemory.js` — trust/threat model. `(settlementId, playerId)` key. `trustScore -10..+10`, `threatLevel 0..10`. Persists to `npc_player_memory` Neon table. Real-time decay via `tick(dtRealSec)` called every 1s. Gates close when `threatLevel > THREAT_GATE_THRESHOLD (3)`.
- `SettlementManager.js` — 5 named settlements (Ashford, Ironhaven, Saltmere, Thornwall, Ridgepost), fixed world positions. Each has `civLevel 0-9`, `researchPts`, `resourceInv {matId: qty}`, `npcCount`. Research accumulates at `sqrt(npcCount) * (1 + civLevel * 0.3)` per real second. Level thresholds `[0, 500, 2000, 8000, 25000, 80000...]`. NPC crafting runs every 30s using 6 recipes with same MAT IDs as player client. Persists to `npc_settlements` Neon table.
- `index.js` — 1s `setInterval` ticks both `npcMemory` and `settlements`. Broadcasts `SETTLEMENT_UPDATE` on civ level-up.

### Message protocol (additive to M5)
- `PLAYER_NEAR_SETTLEMENT {settlementId}` — client → server, sent every 3s when player within 150m
- `TRADE_OFFER {settlementId, settlementName, civLevel, offerMats, wantMats, trustScore}` — server → client only
- `TRADE_ACCEPT {settlementId, playerGives, playerReceives}` — client → server
- `TRADE_RESULT {settlementId, result, playerGives, playerReceives}` — server → client
- `SETTLEMENT_UPDATE {settlementId, civLevel, name, resourceInv}` — server → all clients
- `GATES_CLOSED {settlementId}` — server → client only (when threatLevel > 3)
- `NPC_ATTACKED {settlementId}` — client → server (when weapon hits server NPC near settlement)

### Client-side
- `settlementStore.ts` — Zustand store. `settlements: Map<number, SettlementSnapshot>`, `pendingOffer: TradeOffer | null`, `closedGates: Set<number>`, `nearSettlementId: number | null`
- `WorldSocket.ts` — `WORLD_SNAPSHOT` seeds `settlements` via `useSettlementStore.getState().setSettlements()`; handles `SETTLEMENT_UPDATE`, `TRADE_OFFER`, `TRADE_RESULT`, `GATES_CLOSED`
- `SceneRoot.tsx` — `settlementCheckTimerRef` (useRef) accumulates dt, every 3s scans all settlements for proximity, sends `PLAYER_NEAR_SETTLEMENT`; weapon hit on `remoteNpcs` near settlement sends `NPC_ATTACKED`
- `SettlementRenderer.tsx` — 3D buildings (PBR, warm-stone MeshStandardMaterial, color shifts brown→grey with civLevel), emissive campfire sphere (emissiveIntensity 2.5, drives Bloom), Html nameplate via drei, `THREE.LineLoop` territory ring (not `<line>` JSX — that maps to SVG)
- `SettlementHUD.tsx` — trade offer panel with matList display, trust score, Accept/Decline; gates-closed red banner. Uses `getWorldSocket()` from `useWorldSocket.ts` to send TRADE_ACCEPT

### Database tables
- `npc_settlements(id SERIAL PK, name, center_x/y/z, civ_level, resource_inv TEXT, npc_count, research_pts, created_at, updated_at)`
- `npc_player_memory(settlement_id INT, player_id TEXT, trust_score REAL, threat_level INT, last_seen TIMESTAMPTZ, PK(settlement_id, player_id))`

## Key pitfalls discovered
1. `<line>` JSX in R3F is interpreted as SVG `<line>` element, not Three.js line. Use `THREE.LineLoop` + `<primitive object={...} />` instead.
2. Duplicate `case 'WORLD_SNAPSHOT'` in WorldSocket switch causes TypeScript error — M6 settlement seeding must go inside the existing WORLD_SNAPSHOT case block.
3. Module-level mutable counters inside `useFrame()` callbacks cause issues — always use `useRef()` inside the component for per-frame timers.
4. `_settlementCheckTimer` as a plain variable would be recreated every render — correctly stored as `settlementCheckTimerRef = useRef(0)` inside GameLoop component.

**How to apply:** When adding new world-state systems that need server-authority + persistent memory, follow the NpcMemory pattern: in-memory Map + Neon upsert on every mutation + load on boot. Settlement tick uses `setInterval(1000)` in real time, not the sim clock — civ simulation runs in wall-clock time so players can see progress without cranking the sim timescale.
