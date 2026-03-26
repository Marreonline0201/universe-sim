---
name: Planet Survival Game - Mechanics and Architecture
description: Detailed mechanics, resource nodes, NPC systems, key conflicts, and known design issues for the spherical planet survival game
type: project
---

The game is a 3D multiplayer survival game on a procedurally generated spherical planet (React Three Fiber + Rapier physics + bitECS).

**Why:** Designer is building a feature-rich open-world survival/civilization sim. Game is in active development with dev bypass auth enabled for local testing.

## Key architecture facts

- Planet radius: 4000m, cube-sphere geometry (6 faces, 160 segs render / 60 segs physics)
- Radial gravity: 9.81 m/s toward center, implemented in PlayerController (NOT Rapier world gravity)
- Physics: Rapier KinematicCharacterController for player, static trimesh for planet, capsule colliders for trees/rocks
- Auth: Clerk (bypassed in dev via VITE_DEV_BYPASS_AUTH=true), WebSocket multiplayer at localhost:8080
- Spawn: getSpawnPosition() does a scored sphere scan. Prefers |dir.y| < 0.68 and h in 30-100m. Returns surface position ~4000m from origin.
- SceneRoot.tsx is at src/rendering/SceneRoot.tsx (2748 lines as of session 4)

## Resource nodes (21 types as of 2026-03-21)

stone(20), flint(10), wood(20), clay(12), fiber(15), copper_ore(8), iron_ore(8), coal(6), tin_ore(5), sand(8), sulfur(4), bark(15), bone(12), hide(10), leaf(20), gold(3), silver(4), uranium(2), rubber(5), saltpeter(4), raw_meat(12).

Total ~213 nodes. Placed 15-515m from spawn. 60-second respawn. Multi-hit: wood=3, ores=2, others=1.

## Fixed bugs (confirmed session 4, commits 123c85f, 0777fa9)

- CREATURE GHOST MESH: Killing a creature only removed from creatureWander, leaving ECS entity alive so mesh persisted. Fixed: now calls removeEntity(world, nearestCreatureEid). Commit 123c85f.
- DEATH LOOT LABELS: Dropped items showed raw IDs like "mat3" or "item5". Fixed: reverse-lookup maps MAT_NAMES/ITEM_NAMES now resolve human-readable labels. Commit 0777fa9.
- DUPLICATE FUNCTION DECLARATIONS: Fixed session 3.
- DUPLICATE CROSSHAIR: Fixed session 3.
- E KEY CONFLICT (SidebarShell vs SceneRoot): SidebarShell guards E with if (!document.pointerLockElement). Fixed session 3.
- CRAFTING ID COLLISION: isMaterial flag per-recipe output. Fixed session 3.

## E Key / Interact subtle remaining issue (session 3 finding, still present session 4)

PlayerController maps input.interact = k.has('KeyE') || k.has('KeyF'). This means E triggers BOTH popInteract() AND popEat() in the same frame when pressed in-game. Low severity.

## Camera

Third-person: camera = player_pos - lookDir*d + up*d*0.35. Camera sits behind and slightly above player. Underground clamp present. lookAt targets player head (+0.9m up). CORRECT.

## NPCs / Creatures

- Local ECS Creatures: 10 spawned (microbes to large mammals), instanced sphere meshes, wander on sphere surface via creatureWander Map. Sizes 0.15-1.10m. Bite player if size >= 0.65m and within 1.5m (5% chance/s).
- Server NPCs (remoteNpcs): rendered with state dots. Attack triggers NPC_ATTACKED WebSocket message if near settlement.
- Local NPCs (humanoid): 12 figures 8-56m from spawn, purely visual, no dialogue.
- CreatureRenderer uses creatureQuery(world) so removeEntity() properly removes mesh from render.
- NO dialogue or interaction system for any NPC type -- purely visual/ambient

## Controls (confirmed from code sessions 3-4)

- WASD / Arrow keys: move
- Space: jump, Shift: sprint, Ctrl: crouch
- F OR E: interact / gather / place building (input.interact = KeyE || KeyF)
- G: dig (yields Stone/Clay/Sand randomly, 1-3 qty)
- Q or LMB: attack / harvest with equipped item
- E: eat cooked food (also triggers interact due to dual binding)
- H: apply herb to wound
- Z: sleep / wake
- V: cycle camera mode (third_person / first_person / orbit)
- I/C/B/T/E/J/Tab/M/?: panel shortcuts (E and ? only work when NOT pointer-locked)
- Esc: close panels / cancel placement / open settings

## Attack system (Q key / LMB)

Attack range by item:
- HAND: range=2.0m, harvest=['wood','fiber','bark','bone','hide','leaf','rubber','saltpeter'], damage=1
- STONE_TOOL: range=2.5m, harvests most materials including ores
- KNIFE: range=1.5m, harvests fiber/bark/hide/bone
- SPEAR: range=3.5m, fiber/bark only
- AXE: range=2.5m, broad harvest
- BOW: range=20.0m, no harvest types (combat only)

canHarvest(itemId, nodeType) returns false for mismatched tool/node combos. HAND cannot harvest stone/flint/ore.
Priority: flint-fire-start > creature hit > server NPC hit > resource node.
"Nothing to hit" fires when hitCreature=false AND nearest=null.
Node hit message: "Hit {label} -- N more hits to fell"
Node fell message: "Felled 3x {label}" or "Harvested Nx {label}"
Creature hit message: "Hit creature for X dmg (HP/HP remaining)"

## Gather system (F key)

F-key gather (popInteract): proximity check uses d^2 < 9 (= 3m radius). Ores require stone tool. First gather auto-opens inventory.
Message format: "[F] Gather {label}" or "[Need Stone Tool] {label}"

## Sidebar icon strip (confirmed sessions 3-4)

10 buttons: INV/CRF/BLD/TEC/EVO/JRN/CHR/MAP/ ? /SET. Always visible at right edge. Slides left by PANEL_WIDTH when panel is open.

## Click-to-play overlay (confirmed sessions 3-4)

Three lines of hint text: WASD/Mouse/Space/F/G, E/H/Z/Q, ESC/I/C/B/T/J/Tab/M/?. E key context included.

## HUD vitals (bottom-left, confirmed session 4)

5 bars: Health(red heart), Food(orange, inverted hunger), Water(blue, inverted thirst), Energy(green), Stamina(purple). Plus wound indicators, cooking progress, sleep indicator, ambient temperature.

## Vitals system rates

- Hunger rate: ~0.00037/s = ~45 min to full starvation
- Thirst rate: ~0.00056/s = ~30 min to full dehydration
- Starvation damage: >95% hungry = -2 HP/s
- Dehydration damage: >98% thirsty = -5 HP/s

## Terrain

Domain-warped FBM + ridged noise (up to +200m mountains) + detail noise (+-15m). Visually confirmed hills/valleys in ss1.png.

## Known bugs / issues (updated 2026-03-25 session 5 / M18)

CRITICAL: None.

IMPORTANT:
- CLICK-TO-PLAY OVERLAY KEYBIND LIE (session 5): Overlay shows "E — Open Inventory" but E does NOT open inventory. Inventory is I. E triggers tryEatFood when not pointer-locked. This is confirmed from SidebarShell.tsx line 84-92 where case 'e'/'E' calls tryEatFood, not togglePanel('inventory'). New players will press E expecting inventory and nothing visible will happen (or their food will be consumed silently).
- CHEMISTRYHUD REACT HOOK BUG (session 5): ChemistryHUD.tsx useEffect at line 22 has `events.length` in its dependency array. Since `events` is state that setInterval mutates, this creates a new interval whenever events.length changes -- stale closure and unnecessary re-subscriptions. Should use an empty dependency array [] with the setInterval callback using a functional state update or a ref.
- GATHER PROMPT PRIORITY: no priority system, first match wins.
- BONE/HIDE NODES RENDERED AS ROCKS: visually indistinguishable from stone. Status unverified session 4.
- MapPanel compass labels inaccurate off spawn north pole. Status unverified session 4.
- E KEY DUAL BINDING: E triggers both interact and popEat in same frame in-game.

NICE TO HAVE:
- Clay shows Eat button in inventory -- confusing
- Hotbar 1-6 keys non-functional (no assignment UI)
- Node respawn 60s -- fast for survival pacing
- BehaviorTree drink direction [0,-1,0] wrong on sphere
- DevGame (dev bypass) does not call loadSave/saveGame -- no persistence in dev mode
- Admin Give All Materials: 41 MAT entries into 40-slot inventory -- 41st silently dropped
- Fallback node placement uses -2.0m vs normal -0.8m (inconsistency)
- Smoke puff opacity lifecycle: NormalBlending overrides per-instance vertex color fade
- CHEMISTRYHUD ALCOHOL TODO (session 5): fermentation rewards MAT.COOKED_MEAT as placeholder because MAT.ALCOHOL doesn't exist yet. Comment in ChemistryGameplay.ts line 153: "TODO: add MAT.ALCOHOL when available". Fermentation grants cooked meat which is misleading.
- POSTPROCESSING TRIPLE RENDER RISK (session 5): PostProcessing.tsx renders the scene twice per frame -- once for depth target (line 312-314) and once via EffectComposer's RenderPass. This is intentional but doubles GPU scene traversal. Monitor for performance on low-end devices.

## M18 new systems (session 5)

- PostProcessing.tsx: SSAO (8-tap golden-angle spiral), color grade (ACES filmic, ASC CDL lift/gamma/gain, saturation, temperature), vignette. Wired as last Canvas child.
- ChemistryGameplay.ts: bridges LocalSimManager chemistry grid to player health. 4 event types: fermentation/acid_rain/photosynthesis/combustion_heat. Sampled at 2Hz via accumulator. tickChemistryGameplay() called from GameLoop.ts line 552.
- ChemistryHUD.tsx: bottom-left notification badges. Renders only when events.length > 0 (returns null otherwise). 600ms poll interval.

## Agent-browser testing limitation

The agent-browser headless Chromium environment cannot render this game's UI. React mounts (one clickable element detected, no Vite error overlay) but #root innerHTML is empty -- likely Vite ES module top-level await does not execute in the headless context, so createRoot().render() never commits to DOM. Code analysis + designer-provided screenshots (ss1.png, ss_craft.png, ss_evo.png, ss_tech.png, ss_prod.png, ss_craft_all.png in project root) must be used instead of live browser screenshots.

**How to apply:** Use code analysis as primary evaluation method. Screenshots confirm visual appearance. Do not report blank screen as a bug -- it is a testing environment limitation.
