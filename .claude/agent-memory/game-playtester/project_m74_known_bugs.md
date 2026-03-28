---
name: M74 Post-RPG Clean Playtest — Known Bugs
description: Bugs found in the post-RPG deletion build (M74 milestone) — first clean simulation-only playtest
type: project
---

Post-RPG deletion playtest conducted 2026-03-27. RPG systems confirmed gone. Core sim/render loop is clean.

## Critical Bugs

### BUG-1: tickSimulation always receives 0.16 (day/night cycle permanently stuck)
- File: `src/game/GameLoop.ts` line 172
- `tickSimulation(0.16)` — hardcoded constant passed instead of accumulated sim time
- `tickSimulation` expects cumulative seconds to compute day/night (600s cycle): `dayPhase = (simTime % 600) / 600`
- At `simTime=0.16` always: organisms always experience exactly the same light level — day/night cycle in sim is effectively disabled
- Fix: pass `useGameStore.getState().simSeconds` instead of `0.16`

### BUG-2: TimeControls component has no position:fixed — will not be visible
- File: `src/ui/TimeControls.tsx` — renders `<div style={styles.container}>` with no position:fixed
- File: `src/ui/HUD.tsx` line 76 — mounted directly in fragment with no positioning wrapper
- The component floats in normal document flow — body is `overflow:hidden`, so it collapses to zero and is invisible
- The time scale buttons (0.1x through 1T×) and pause button are completely inaccessible from the game
- Fix: add `position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 200` to `styles.container` in TimeControls.tsx

## Important Bugs

### BUG-3: Spectator badge (SPECTATOR text indicator) referenced in SpectatorCamera.tsx comments but never implemented
- File: `src/rendering/SpectatorCamera.tsx` — comment says "Shows a small SPECTATOR badge in top-center" and references SpectatorBadge DOM component
- `SpectatorCamera` returns `null` — no badge rendered anywhere
- When player presses G, no visual confirmation that spectator mode is active beyond camera behavior change
- Fix: add a fixed-position "SPECTATOR MODE — [G] to exit" badge in HUD.tsx using subscribeSpectator

### BUG-4: simSeconds advances before gameActive (click-to-play) but organism tick is gated
- File: `src/game/GameLoop.ts` lines 88 vs 91/169-172
- `addSimSeconds(dt)` fires every frame (before `if (!gameActive) return`)
- Organism tick fires only after click-to-play
- Result: simTime/epoch/Sim Time in EcosystemDashboard advances from frame 1, but organisms don't tick until after click-to-play
- Minor inconsistency — could be intentional if the designer wants sim to "start from beginning" when player enters

## All M73 Issues Verified Status
- M73 BUG: organism shader broken (invisible) — NEED MANUAL VERIFICATION (code looks intact in CreatureRenderer, uses instanced mesh with proper material)
- M73 BUG: XP festival indicator persists — NOT PRESENT (SeasonalEventsUI not found in codebase; xpMultiplier is in gameStore but no SeasonalEventsUI component found)
- M73 BUG: CLICK TO PLAY still shows RPG keybinds — FIXED: SceneRoot now shows G/B/O/Mouse controls
- M73 BUG: B-key dashboard starts visible=true — FIXED: EcosystemDashboard correctly starts `useState(false)`

## Clean Items Verified
- CLICK TO PLAY overlay: shows correct simulation keybinds (G=Spectator, B=Ecosystem, O=Seed, Mouse=Look)
- EcosystemDashboard: starts hidden (B to reveal), shows organisms/species/births/deaths/ticks, population chart, dot map
- HUD is minimal and sim-appropriate: crosshair, player info corner, weather corner, sidebar (MAP/PLR/SET only)
- TutorialOverlay: sim-correct text ("WASD to move · Click to lock cursor · M for map · Esc for settings")
- SidebarShell: only 3 panels (map, players, settings) — no RPG panels
- GameSystemsBootstrap: fully empty (no RPG systems)
- GameLoopPeriodicTasks: minimal (weather update stub only)
- SpectatorCamera: G-key toggle works, O-key seeds organisms at planet surface via raycast
- OrganismLabels: renders species info labels in spectator mode when within 80 units
- Death screen remains (for survival gameplay) — not RPG
