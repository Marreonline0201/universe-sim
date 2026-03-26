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
- 6 synthetic offline NPCs spawned in a ring ~8-20m from spawn. NPC id%6 maps to roles: 0=villager, 1=guard, 2=elder, 3=trader(merchant), 4=artisan, 5=scout. Only trader opens merchant panel.

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
- I/C/B/J/K/Q/H/Tab/M/?/Esc: panel shortcuts (most work when NOT pointer-locked too via SidebarShell)
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

## Sidebar icon strip (confirmed sessions 3-6)

12 buttons: INV/CRF/BLD/JRN/CHR/MAP/SKL/QST/ACH/FSH/ ? /SET. Always visible at right edge. Slides left by PANEL_WIDTH when panel is open.

Hotkeys:
- I = Inventory, C = Crafting, B = Build, J = Journal, K = Skills
- Q = Quests, H = Achievements, Tab = Character, M = Map, ? or / = Science
- Esc = Settings (when nothing else is open)
- Merchant panel (no hotkey) — opened via F near NPC trader

## Click-to-play overlay (confirmed session 6)

Five lines: WASD/Mouse/Space/F/I. The previous bug (E — Open Inventory) has been FIXED. Now correctly shows I for Inventory.

## Combat HUD (session 6)

Three components: CombatIndicator (bottom-center attack cooldown bar + combo counter + dodge indicator), DamageNumbers (HTML overlay, float up at fixed left:50%/top:40%), EnemyHealthBars (stacked near top-center, fade 5s after last hit).

KNOWN ISSUE: DamageNumbers always appear at screen center (left:50%, top:40%) regardless of creature world position. All damage floats to the same fixed screen location. This is a known approximation.

## HUD vitals (bottom-left, confirmed session 4)

5 bars: Health(red heart), Food(orange, inverted hunger), Water(blue, inverted thirst), Energy(green), Stamina(purple). Plus wound indicators, cooking progress, sleep indicator, ambient temperature.

## Vitals system rates

- Hunger rate: ~0.00037/s = ~45 min to full starvation
- Thirst rate: ~0.00056/s = ~30 min to full dehydration
- Starvation damage: >95% hungry = -2 HP/s
- Dehydration damage: >98% thirsty = -5 HP/s

## Terrain

Domain-warped FBM + ridged noise (up to +200m mountains) + detail noise (+-15m). Visually confirmed hills/valleys in ss1.png.

## Day/Night cycle (session 6)

Full 20-minute real-time day/night. Sun orbits at 8000m radius, angular vel = 2pi/1200 rad/s. Start angle pi*0.6 (~10 o'clock). Directional light color shifts orange-red at dawn/dusk (Rayleigh scattering simulation). Fog density/color modulated (noon cool grey, dusk warm peach, night deep blue). Moon directional light (cool blue #c0d0ff, max 0.08 intensity) active when sun below horizon. Sun disc mesh billboard follows sun position. Sky uses drei/Sky with turbidity+rayleigh driven by time of day.

## Audio system (session 6)

AmbientAudioEngine.ts — procedural Web Audio API, zero external files. Systems: Wind (bandpass filtered noise), Rain (highpass noise), Thunder (burst on lightning), Footsteps (noise burst on movement, varies by terrain type: grass/rock/sand/snow/water/wood), Fire (crackle near settlements), Ocean (LFO-modulated near coastline). Initialized on first user interaction click (browser autoplay policy). AudioHook.tsx reads playerMoving/Running/Crouching/terrainType each frame and calls ambientAudio.update().

## Raft system (session 6)

RaftSystem.ts (M28 Track B). Raft is a Tier 0 building requiring 20x WOOD + 5x ROPE. ROPE (MAT.ROPE = 23) exists in Inventory.ts. Raft placed at sea level. E key within 2m mounts. WASD moves, Q/E rotate. Buoyancy bob simulation (BOB_AMP=0.15m, 0.8 rad/s). Shore collision. Mount/dismount lifecycle managed by RaftSystem singleton.

## Fishing system (session 6)

FishingPanel.tsx (M25 Track C). 7-state machine: idle > casting > waiting > biting > reeling > landed/escaped. F key casts when near water. FISH ON! prompt when biting. Hold F to reel. Fish resistance bar. Catch has rarity and rarityColor. ESC cancels. Panel open via FSH sidebar button. No F-key shortcut to directly open fishing panel (must use sidebar).

## Merchant system (session 6)

MerchantSystem.ts + MerchantPanel.tsx (M27 Track B). NPC with id%6==3 (trader role) triggers "[F] Trade with X 🛍" prompt when within range. F opens merchant panel with archetype set via window.__merchantArchetype (general/blacksmith/alchemist). Buy/Sell tabs. Gold balance displayed. Inventory full on buy: refund. Merchant not interested on sell: notification.

## Known bugs / issues (updated 2026-03-26 session 7 / M31 verification)

CRITICAL: None.

IMPORTANT:
- Q-KEY CONFLICT: Q opens Quests panel (SidebarShell line 121) AND is the attack key in-game. When not pointer-locked (panel mode), Q triggers quest panel. When pointer-locked, Q attacks. This is intentionally split by pointerLockElement check. No bug, but could confuse players who see Q in the hints and are in the wrong mode.
- CHEMISTRYHUD REACT HOOK BUG (session 5): ChemistryHUD.tsx useEffect at line 22 has `events.length` in its dependency array — stale closure + unnecessary re-subscriptions.
- DAMAGE NUMBERS FIXED (M31): CombatHUD.tsx DamageNumbers now calls worldToScreen(dn.x, dn.y, dn.z) and projects creature world position to screen coords. Falls back to screen center only if camera not initialized. FIXED in session 7.
- GATHER PROMPT PRIORITY: no priority system, first match wins.
- BONE/HIDE NODES RENDERED AS ROCKS: visually indistinguishable from stone. Status unverified.
- MapPanel compass labels inaccurate off spawn north pole. Status unverified.
- E KEY DUAL BINDING: E triggers both interact and popEat in same frame in-game.
- FOG OF WAR PERSISTENCE FIXED (M31): Previously visitedCellsRef was a useRef(new Set()) that reset on MapPanel unmount. Fixed: visitedCells is now stored in uiStore (Zustand) as a string[] array. MapPanel syncs the ref from the store on mount. Survives map open/close.
- WEATHER SPEED: STORM gives 0.6x speed penalty; RAIN gives NO speed penalty (setWeatherSpeedMult only triggers for STORM). May or may not be intentional.

NICE TO HAVE:
- Clay shows Eat button in inventory -- confusing
- Hotbar 1-6 keys non-functional (no assignment UI)
- Node respawn 60s -- fast for survival pacing
- BehaviorTree drink direction [0,-1,0] wrong on sphere
- DevGame (dev bypass) does not call loadSave/saveGame -- no persistence in dev mode
- Admin Give All Materials: 41 MAT entries into 40-slot inventory -- 41st silently dropped
- Fallback node placement uses -2.0m vs normal -0.8m (inconsistency)
- Smoke puff opacity lifecycle: NormalBlending overrides per-instance vertex color fade
- CHEMISTRYHUD ALCOHOL TODO (session 5): fermentation rewards MAT.COOKED_MEAT as placeholder. TODO comment in ChemistryGameplay.ts line 153.
- POSTPROCESSING TRIPLE RENDER RISK (session 5): PostProcessing.tsx renders scene twice per frame.
- FISHING DISCOVERY PROMPT FIXED (M31): '[F] Fish' shown when near water WITHOUT a rod (discovery path). '[F] Cast fishing rod' shown when player has a rod. Resolved session 7.
- MERCHANT ARCHETYPE VIA WINDOW GLOBAL: window.__merchantArchetype is set before openPanel('merchant'). Works but fragile -- if panel re-renders without a fresh interaction, stale archetype could show.
- ACHIEVEMENT PANEL FONT FIXED (M31): AchievementPanel.tsx root div now sets fontFamily: 'monospace'. Visual inconsistency resolved in session 7.
- [F] Fish prompt condition: fires when nearWater || nearRiver10 AND no FISHING_ROD. Correctly shows discovery hint.
- RAIN speed: only STORM gets 0.6x movement penalty, not RAIN. Test item 13 asks about both -- RAIN alone has no speed effect.

## M18 new systems (session 5)

- PostProcessing.tsx: SSAO, color grade (ACES filmic, ASC CDL), vignette.
- ChemistryGameplay.ts: bridges LocalSimManager chemistry grid to player health. 4 event types.
- ChemistryHUD.tsx: bottom-left notification badges. 600ms poll.

## M31 new systems (session 7)

- CombatHUD.tsx: Damage numbers now world-projected via worldToScreen() + setCombatCamera(). CRIT! prefix, 20px yellow font. Combo hits orange 15px. Normal hits white 14px.
- ItemTooltip.tsx: Durability bar added for weapon slots (M31 Track C). Reads weaponDurability[slotIndex] from playerStore. Green >60%, yellow 20-60%, red <20%.
- CraftingRecipes.ts: Bow (id=8): 3x WOOD + 2x FIBER → 1x BOW. Arrow (id=9): 1x WOOD + 1x STONE → 5x ARROW_AMMO (MAT). Both tier 0, knowledgeRequired=['tool_use'] or [].
- HUD.tsx: WarmthBar component added (M29 Track B). Snowflake icon, blue bar, pulses red when <20. Rendered below the 5 main vital bars. warmth starts at 80, drains via RAIN (1.5/s) and STORM (3.0/s * night mult).
- SettlementRenderer.tsx: Tier-based PointLight color — T0 campfire orange (#ff6a10) through T5 cool blue-white (#c0e0ff). Population label shows 👥 npcCount + Tx badge with tier color. Activity icons 💰🔨⚔.
- DialoguePanel.tsx: ROLE_DIALOGUE pools per role: elder/guard/scout/villager/artisan/trader. Each has greetings[], responses[], farewells[]. On panel open, greeting from role pool. On each send, response picked avoiding repeat. On close (if >1 exchange), farewell shown then 900ms delay.
- biomeColor() in SpherePlanet.ts: tundra (lat>0.70), desert (lat 0.25-0.40, h<80), polar snow (lat>0.82 or h>220), alpine/rock at h>120-220. No separate 'volcano' biome — no lava/magma terrain type exists.

## M28 new systems (session 6)

- DayNightCycle.tsx: 20-min real-time day. Moon light. Sun disc billboard. Fog color by time. Day counter in gameStore.
- AmbientAudioEngine.ts: procedural Web Audio API. 6 sound systems (wind/rain/thunder/footsteps/fire/ocean). Terrain-type footstep variation.
- RaftSystem.ts: raft building (20 wood + 5 rope), E-mount, WASD sail, buoyancy bob.
- FishingSystem + FishingPanel: 7-state fishing minigame. F to cast near water.
- MerchantSystem + MerchantPanel: NPC trader interaction. Buy/Sell tabs. Gold economy.
- SkillPanel.tsx (K key): 6 skills (gathering/crafting/combat/survival/exploration/smithing), XP bars, level indicators, live subscription to skillSystem.
- QuestPanel.tsx (Q key): quest log with objectives and progress bars.
- AchievementPanel.tsx (H key): 25 achievements, category filter tabs.
- MapPanel M28 upgrades: fog of war (visited cells), right-click waypoints (up to 5), animated NPC dots, settlement labels, zoom controls (3 levels).

## Agent-browser testing limitation

The agent-browser headless Chromium environment cannot render this game's UI. React mounts (one clickable element detected, no Vite error overlay) but #root innerHTML is empty -- likely Vite ES module top-level await does not execute in the headless context, so createRoot().render() never commits to DOM. Code analysis + designer-provided screenshots (ss1.png, ss_craft.png, ss_evo.png, ss_tech.png, ss_prod.png, ss_craft_all.png in project root) must be used instead of live browser screenshots.

**How to apply:** Use code analysis as primary evaluation method. Screenshots confirm visual appearance. Do not report blank screen as a bug -- it is a testing environment limitation.
