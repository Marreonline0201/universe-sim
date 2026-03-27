---
name: M72 The Watcher — Observer Foundation
description: M72 milestone status — SimulationBootstrap, NaturalSelection, RPG deactivation, SimulationIntegration bridge, remaining spectator/dashboard/time tasks
type: project
---

M72 "The Watcher" — Observer Foundation + Sim Loop Connection

## Completed
- M72-2: SimulationBootstrap.ts — seeds 50-200 primordial autotrophs with 4 lineages
- M72-3: NaturalSelectionSystem.ts — fitness eval, differential death/reproduction, speciation at Hamming>32
- M72-6: RPG GameLoop deactivation — `const RPG_ENABLED = false` wraps ~2300 lines of RPG ticks in 2 blocks
- M72-INTEGRATION: SimulationIntegration.ts — bridges NaturalSelectionSystem organisms to ECS entities (Position+CreatureBody) so CreatureRenderer displays them. Called from SceneRoot init + GameLoop tick (every 10 frames).

**Why:** The sim systems (biology, chemistry, AI) were built but never wired into the app. Organisms existed only as data in NaturalSelectionSystem's Map, not as ECS entities. The integration bridge fixed this.

**How to apply:** SimulationIntegration.ts is the single entry point for all simulation lifecycle. Future systems (dashboard, spectator camera, god tools) should import from it for stats and organism data.

## Recently Completed (2026-03-27)
- M72-1: SpectatorCamera.tsx — God-mode free-fly camera, [G] toggle, WASD+QE+mouse, shift boost, scroll speed. Runs inside R3F Canvas. SpectatorBadge.tsx DOM overlay.
- M72-4: EcosystemDashboard.tsx — Live HUD (top-right) polling getSimulationStats() at 500ms. Shows epoch, simTime, organisms, species, births, deaths, net, speciations, tick count, tick ms. [B] toggle. Confirmed 43 organisms, 4 species, 0.1ms tick.
- M72-5: TimeControls.tsx already existed from prior work (pause + 13 speed presets from 0.1x to 1T).

## Remaining
- None — M72 fully complete

## Key Integration Points
- `initializeSimulation(seed)` called in SceneRoot after engine.init()
- `tickSimulation(simSeconds)` called in GameLoop every 10 frames
- `getSimulationStats()` available for dashboard HUD
- orgToEcs/ecsToOrg maps maintained for organism<->entity tracking
