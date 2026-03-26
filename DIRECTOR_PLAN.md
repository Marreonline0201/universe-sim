# Director Plan -- Universe Sim

**Date**: 2026-03-26
**Sprint**: M22
**Status**: SHIPPED -- All 3 Tracks Complete

---

## M18 Retrospective

**All 3 Tracks SHIPPED:**

- **Track A -- SceneRoot Decomposition: DONE** -- 2189 -> 578 lines (target 600). 9 extracted files in `src/rendering/entities/`. Commit: `99eac0f`
- **Track B -- PostProcessing Pipeline: DONE** -- 5-pass chain: RenderPass -> SSAO (8-tap golden-angle) -> UnrealBloom -> ColorGrade (ASC CDL + ACES filmic) -> Vignette. 322 lines. Commit: `840a8b0`
- **Track C -- Chemistry-to-Gameplay Bridge: DONE** -- ChemistryGameplay.ts (207 lines, 2Hz sampler: fermentation/acid rain/photosynthesis/combustion heat) + ChemistryHUD.tsx (96 lines, notification badges with intensity bars). Wired into GameLoop tick. Commit: `840a8b0`

**Carried over to M19:**
- Ocean uses MeshPhongMaterial (not PBR) -- no reflections, no foam, no caustics
- Terrain/rocks/trees use vertex colors + procedural noise only -- no normal maps or PBR textures
- Atmosphere is a basic additive sphere -- no Rayleigh/Mie scattering
- Bundle is a single 3.8MB chunk -- no code splitting

**Lessons learned:**
- Standalone module pattern (PostProcessing, ChemistryGameplay) is the gold standard -- no surgery on existing code
- Always verify build after each new file
- SSAO depth texture must be refreshed each frame for correct results

---

## M19 Sprint Plan -- 3 Parallel Tracks

### Track A (P0): PBR Water Shader -- Ocean Overhaul
**Assigned to**: `ui-worker`
**Duration**: Full sprint
**Goal**: Replace the flat MeshPhongMaterial ocean with a physically-based water surface that looks convincing at both close range (shore) and far view (open ocean).

| Task | Description | Technical Spec |
|------|-------------|---------------|
| A1 | Create `OceanShader.ts` | Custom ShaderMaterial with: vertex displacement (2-octave Gerstner waves, amplitude 0.3m, wavelengths 8m and 20m, steepness 0.4), animated via `uTime` uniform. Fragment: PBR-like output with roughness 0.05 (near-mirror for calm water), metalness 0.02, base color deep blue-green `#0a2e3d`. |
| A2 | Screen-space reflections on water | Add environment probe reflection via `envMap` from a `CubeCamera` rendered once per 10 frames at water level. Fallback: use sky color gradient when `CubeCamera` is too expensive. Fresnel factor controls reflection vs refraction blend (Schlick approximation). |
| A3 | Shoreline foam | In the ocean fragment shader, compute distance-to-shore using the depth buffer difference (water depth = scene depth - water depth). Where waterDepth < 1.5m, blend white foam pattern using scrolling noise texture (procedural, 2-frequency). Foam alpha fades from 0.8 at shore to 0 at 1.5m depth. |
| A4 | Underwater caustics | Project animated caustic pattern onto terrain fragments that are below sea level. Implement as an addition to the terrain material's `onBeforeCompile` -- sample a 2D caustic noise pattern at `worldPos.xz * 0.3 + uTime * 0.1`, multiply by a depth attenuation factor. Only active when fragment elevation < SEA_LEVEL + 2m. |
| A5 | Wire into PlanetTerrain.tsx | Replace `makeOceanMaterial()` with the new shader. Ensure ocean mesh uses the new `OceanShader`. Pass `uTime` each frame. Connect depth texture from renderer for foam edge detection. |

**Quality gate**: (a) Visible wave displacement on ocean surface, (b) sky reflection on water at grazing angles, (c) white foam line along shoreline, (d) caustic light patterns on shallow underwater terrain, (e) `npm run build` succeeds, (f) no framerate regression >5% vs M18.

---

### Track B (P1): Atmospheric Scattering
**Assigned to**: `ui-worker` (parallel agent or after Track A completes A3)
**Duration**: Sprint second half
**Goal**: Replace the flat additive atmosphere sphere with a physically-motivated Rayleigh + Mie scattering sky that transitions naturally from blue daytime to orange/red sunset to dark night.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| B1 | Create `AtmosphereShader.ts` | Custom ShaderMaterial for the atmosphere shell. Implements single-scattering integral along the view ray through a thin atmosphere layer. Rayleigh coefficients: `vec3(5.5e-6, 13.0e-6, 22.4e-6)` (wavelength-dependent blue scattering). Mie coefficient: `2.0e-5` (forward scattering for sun haze). Mie anisotropy (g): `0.76`. |
| B2 | Sun direction linkage | Read sun direction from `DayNightCycle.tsx` (the directional light direction). Pass as `uSunDirection` uniform to atmosphere shader. Sky color shifts orange/red as sun approaches horizon (long path length through atmosphere = more Rayleigh scattering of blue). |
| B3 | Night sky integration | When sun is below horizon (dot(sunDir, up) < -0.05), fade atmosphere to transparent, revealing the existing `NightSkyRenderer` stars behind. Smooth 10-minute twilight transition. |
| B4 | Replace atmosphere shells in PlanetTerrain | Remove `makeAtmosphereMaterial()` and `makeHazeMaterial()`. Replace with single `<mesh>` using the new `AtmosphereShader`. Dispose old materials. |

**Quality gate**: (a) Blue sky at noon, orange at sunset, dark at night, (b) sun haze glow visible at low angles, (c) smooth transition to starfield, (d) no z-fighting with terrain at horizon, (e) build passes.

---

### Track C (P1): PBR Terrain Material Pass
**Assigned to**: `chemistry-prof` or second `ui-worker` instance
**Duration**: Full sprint
**Goal**: Upgrade terrain, rock, and tree materials from basic vertex-color + procedural noise to full PBR with procedural normal maps, roughness variation, and detail layers.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| C1 | Terrain tri-planar normal mapping | In `PlanetTerrain.tsx` `makeTerrainMaterial()`, add a procedural normal map computed in the fragment shader. Use tri-planar projection of a 3D noise derivative to compute per-pixel normals. This adds surface bumpiness (rocks, dirt, grass texture) without any texture files. Normal intensity: 0.15 for grass biome, 0.3 for rock biome (keyed off slope angle -- steep = rock). |
| C2 | Biome-dependent roughness | Extend the terrain shader to vary roughness by biome: grass = 0.85, rock = 0.65, sand (near coast) = 0.92, snow (high altitude) = 0.3. Use elevation and slope to blend between biomes. This makes rock faces shinier (wet-looking) and snow icy/reflective. |
| C3 | Rock material normal map | In `ResourceNodesRenderer.tsx` `makeRockMaterial()`, add procedural normal mapping using the same tri-planar technique from C1. Rock normals should be rougher (higher frequency noise) than terrain. Normal intensity: 0.4. Also add a subtle metallic fleck: metalness = 0.02 + noise * 0.05 for mineral deposits. |
| C4 | Tree bark and foliage PBR | In `ResourceNodesRenderer.tsx`, upgrade tree trunk material to include: bark-like normal pattern (vertical ridges via `sin(worldPos.y * 20) * 0.5 + noise`), roughness 0.92. Upgrade foliage material: add translucency via custom fragment shader that adds `dot(lightDir, -viewDir) * 0.15` to diffuse (simulates light through leaves). |

**Quality gate**: (a) Visible surface bumps on terrain when camera is within 5m, (b) rock faces have visible specular highlights that shift with camera angle, (c) tree trunks show bark-like ridges, (d) foliage has subtle backlight glow when sun is behind, (e) build passes, (f) no framerate regression >5%.

---

## Priority Queue (After M19 Tracks Complete)

| Priority | Item | Assigned To | Status |
|----------|------|-------------|--------|
| P1 | Code splitting (dynamic import for heavy systems) | cqa/ui-worker | Queued for M20 |
| P1 | Tree LOD (instanced low-poly at distance) | ui-worker | Queued for M20 |
| P2 | Species divergence notifications in journal | biology-prof | Queued |
| P2 | Subsurface scattering for creature skin | ui-worker | Queued |
| P2 | Volumetric fog (ray-marched, density from weather system) | ui-worker | Queued |
| P2 | Shadow cascade tuning (3 cascades, bias correction) | ui-worker | Queued |

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Ocean as custom ShaderMaterial, not MeshStandardMaterial | Need vertex displacement (Gerstner waves) and custom Fresnel -- standard material cannot do vertex animation |
| Procedural normals over texture files | Zero-dependency approach matches existing codebase pattern; no asset pipeline needed; infinite resolution |
| Atmosphere as single-pass scattering, not multi-pass LUT | Simpler to implement, no precomputation needed, good enough for game (not trying to match Bruneton/Neyret) |
| CubeCamera for ocean reflections, throttled to 1/10 frames | Full SSR is too expensive without deferred rendering; throttled cube camera is acceptable at 60fps |
| Tri-planar projection for terrain normals | Avoids UV seam artifacts on sphere geometry; standard technique for procedural terrain |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gerstner wave displacement causes z-fighting at shore | Medium | Medium | Offset ocean mesh slightly below terrain at coast; use depth-based foam to mask transition |
| CubeCamera reflection kills framerate | Medium | High | Throttle to 1/10 frames; fallback to sky-color gradient if FPS drops below 30 |
| Atmosphere scattering looks banded on low-end GPUs | Low | Medium | Use highp floats in shader; add subtle dithering |
| Procedural normals add too much GPU cost per fragment | Medium | Medium | Profile on build; reduce noise octaves if fragment shader exceeds 1ms |
| Tri-planar projection produces visible blend seams | Low | Low | Use smooth blending weights with power of 4 sharpness |

---

## Agent Dispatch Plan

| Agent | Track | First Task | Report To |
|-------|-------|-----------|-----------|
| `ui-worker` | Track A | A1: Create OceanShader.ts with Gerstner wave displacement | director |
| `ui-worker` | Track B | B1: Create AtmosphereShader.ts with Rayleigh+Mie scattering | director |
| `chemistry-prof` | Track C | C1: Add tri-planar procedural normal mapping to terrain shader | director |
| `cqa` | Code review | Review each new shader for correctness and performance | director |

---

## M19 Completion Summary (2026-03-26)

**All 3 Tracks SHIPPED:**

- **Track A -- PBR Water Shader: DONE** -- OceanShader.ts (334 lines): Gerstner wave displacement (2 octaves, 8m+20m), Schlick Fresnel reflections, shoreline foam (depth-based 2-freq noise), underwater caustics via onBeforeCompile. Wired into PlanetTerrain.tsx with per-frame sun direction.
- **Track B -- Atmospheric Scattering: DONE** -- AtmosphereShader.ts (301 lines): Rayleigh+Mie single-scattering integral (8 samples), Henyey-Greenstein phase, smooth twilight fade to NightSkyRenderer, Reinhard tonemapping. Replaces old flat atmosphere + haze shells.
- **Track C -- PBR Terrain Materials: DONE** -- Tri-planar normal mapping (terrain: 0.15/0.30 intensity), biome-dependent roughness (grass 0.85, rock 0.65, sand 0.92, snow 0.3), rock normal maps (0.4 intensity + metallic flecks), bark ridges (sin*20 + noise), foliage translucency (backlit 0.15).

**Build**: Passes (0 errors). Bundle: 3820 kB (code splitting deferred to M20).

---

## M20 Sprint Plan -- 3 Parallel Tracks

### Track A (P0): Code Splitting + Bundle Optimization
**Assigned to**: `ui-worker`
**Duration**: Full sprint
**Goal**: Break the 3820 kB monolithic bundle into targeted chunks. Target: main chunk < 1500 kB, lazy-loaded panels and heavy systems on demand.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| A1 | Vite manual chunks config | In `vite.config.ts`, add `build.rollupOptions.output.manualChunks` to split: `three` + `@react-three/fiber` + `@react-three/drei` into `vendor-3d` chunk; `@clerk/react` into `vendor-auth` chunk; `framer-motion` into `vendor-ui` chunk. |
| A2 | Lazy-load sidebar panels | In `SidebarShell.tsx`, replace static imports of all 8 panel components (InventoryPanel, CraftingPanel, BuildPanel, JournalPanel, CharacterPanel, MapPanel, SettingsPanel, SciencePanel) with `React.lazy(() => import(...))`. Wrap each in `<Suspense fallback={<PanelSkeleton />}>`. Create a simple `PanelSkeleton` loading indicator. |
| A3 | Lazy-load heavy HUD overlays | Lazy-import `FirstContactOverlay`, `DecoderPanel`, `TransitOverlay`, `OrbitalView`, `TelescopeView`, `VelarDiplomacyPanel`, `VelarResponsePanel`, `VelarSignalView` in HUD.tsx since these are rarely shown. |
| A4 | Lazy-load AdminPanel | In `App.tsx`, lazy-import `AdminPanel` -- it is only used in dev/admin mode. |
| A5 | Build verification | Run `npm run build`, verify main chunk < 2000 kB, no errors, no broken lazy boundaries. Log all chunk sizes. |

**Quality gate**: (a) `npm run build` passes with 0 errors, (b) main chunk reduced by at least 30% from 3820 kB, (c) all panels still open correctly via hotkeys, (d) no visual regressions, (e) lazy-loaded chunks appear in dist/assets/ as separate files.

---

### Track B (P0): NPC Dialogue UI + Player Interaction
**Assigned to**: `ai-npc`
**Duration**: Full sprint
**Goal**: Build the player-facing dialogue interface that connects to the existing LLMBridge/MemorySystem/EmotionModel backend. Players can walk up to NPCs, press a key to initiate conversation, see dialogue in a cinematic speech bubble, and choose responses.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| B1 | Create `DialoguePanel.tsx` | New panel at `src/ui/panels/DialoguePanel.tsx`. Renders: NPC name/portrait area (text-based, showing name + role + emotion icon), scrollable dialogue history (player lines right-aligned, NPC lines left-aligned), text input at bottom, send button. Style: dark translucent panel matching existing Rust-style UI (monospace, dark bg, rust-orange accents). Max 480px wide. |
| B2 | Create `DialogueStore.ts` | Zustand store at `src/store/dialogueStore.ts`. State: `isOpen: boolean`, `targetNpcId: number | null`, `targetNpcName: string`, `targetNpcRole: string`, `messages: Array<{sender: 'player' | 'npc', text: string, timestamp: number}>`, `isWaiting: boolean` (true while LLM is processing), `emotionState: EmotionState | null`. Actions: `openDialogue(npcId, name, role)`, `closeDialogue()`, `addMessage(sender, text)`, `setWaiting(bool)`, `setEmotion(state)`. |
| B3 | NPC interaction prompt | In the player interaction system, when a player is within 3m of an NPC and looking at them, show a "Press F to talk" prompt (same style as existing gather prompt). On F press, open the dialogue panel with that NPC's context. |
| B4 | Wire DialoguePanel to LLMBridge | When player sends a message, build an NPCContext from the target NPC's ECS data (name, role, settlement, emotion, memories), call `LLMBridge.requestDialogue()`, display the response in the dialogue history. Show a "thinking..." indicator while waiting. Parse the action from the response and execute it (e.g., `trade` opens shop, `lead_to_location` starts NPC pathfinding). |
| B5 | Register in SidebarShell | Add `'dialogue'` as a new PanelId in uiStore. Register DialoguePanel in SidebarShell's PANEL_COMPONENTS map. The dialogue panel should NOT appear in the icon strip (it opens contextually via F key, not from the sidebar). |
| B6 | Fallback for no LLM key | If no API key is configured (common for most players), generate a procedural response based on NPC emotion + trust + civ tier. Use a template system: "Greetings, traveler." / "Leave me be." / "Want to trade?" etc. keyed to trust level and emotion dominant. This ensures dialogue works offline. |

**Quality gate**: (a) Player can press F near NPC to open dialogue, (b) text input sends message and receives response, (c) "thinking..." indicator shows during LLM call, (d) fallback responses work when no API key, (e) dialogue history scrolls correctly, (f) panel closes on Escape, (g) build passes, (h) NPC emotion display updates after each exchange.

---

### Track C (P1): Inventory + Crafting UI Polish
**Assigned to**: `ui-worker`
**Duration**: Full sprint
**Goal**: Upgrade the inventory and crafting panels from functional-but-bare to polished game-quality UI. Add rich item tooltips, category icons, search/filter for crafting, and visual feedback on craft success.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| C1 | Item tooltip component | Create `ItemTooltip.tsx` in `src/ui/panels/`. Shows on hover over any inventory slot: item name (bold, colored by rarity based on quality), material type, quantity, quality bar, and for tools: damage/speed stats from `getItemStats()`. For food: hunger/thirst restore from `getFoodStats()`. Position: above the hovered slot, clamped to viewport. |
| C2 | Category icons for inventory | Add a small colored dot or 2-letter abbreviation badge in each SlotCell: blue for tools, green for food/organic, orange for metal/minerals, grey for building materials. Keyed from materialId ranges defined in Inventory.ts MAT enum. |
| C3 | Crafting recipe search | Add a text search input at the top of CraftingPanel that filters recipes by name. Debounced 150ms. Styled consistently with existing filter buttons. |
| C4 | Craft success animation | On successful craft, briefly flash the recipe card with a green glow (CSS transition, 400ms), and show a "+1 [item name]" floating text that fades up and out near the craft button. |
| C5 | Tech tree categorization | Group crafting recipes by tier in collapsible sections: "Primitive (Tier 0)", "Stone Age (Tier 1)", "Bronze Age (Tier 2)", etc. Each section header shows tier name and count of available/total recipes. Collapsed by default except current tier. |

**Quality gate**: (a) Hovering inventory slot shows tooltip with correct stats within 200ms, (b) category indicators visible on all occupied slots, (c) search filters recipes in real-time, (d) craft success shows visual feedback, (e) tech tree sections collapse/expand correctly, (f) build passes, (g) no performance regression (tooltip must not cause re-render of entire grid).

---

## Architecture Decisions (M20)

| Decision | Rationale |
|----------|-----------|
| Manual chunks over Vite auto-splitting | Predictable chunk boundaries; three.js is 1.4MB alone and must be isolated |
| React.lazy for panels over route-based splitting | Panels are modal overlays, not routes; lazy() is the natural boundary |
| Dialogue as panel, not HUD overlay | Consistent with existing sidebar pattern; reuses SidebarShell animation and input blocking |
| Procedural fallback dialogue over silence | Players without API keys still get interactive NPC experience |
| Tooltip as portal to body, not inline | Prevents overflow/clip issues inside the 52px grid cells |

---

## Risk Register (M20)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Lazy-loaded panels flash/jank on first open | Medium | Low | PanelSkeleton shows instantly; panels are small, load in <100ms |
| manualChunks breaks dynamic import boundaries | Medium | Medium | Test each chunk in build output; verify no circular dependencies |
| LLMBridge timeout leaves dialogue stuck | Medium | High | 10s timeout + fallback response on error; "thinking..." has a max 15s timer |
| Tooltip causes layout thrash in inventory grid | Low | Medium | Tooltip renders via React portal outside grid; uses absolute positioning |
| NPC interaction prompt conflicts with gather prompt | Medium | Low | Dialogue prompt takes priority when both active; gather prompt suppressed |

---

## Agent Dispatch Plan (M20)

| Agent | Track | First Task | Report To |
|-------|-------|-----------|-----------|
| `ui-worker` | Track A | A1: Add manualChunks to vite.config.ts | director |
| `ai-npc` | Track B | B1-B2: Create DialoguePanel + DialogueStore | director |
| `ui-worker` | Track C | C1: Create ItemTooltip component | director |

---

## M20 Completion Summary (2026-03-26)

**All 3 Tracks SHIPPED:**

- **Track A -- Code Splitting + Bundle Optimization: DONE** -- vite.config.js manualChunks splits vendor-3d (968 kB, three.js+R3F+drei), vendor-auth (226 kB, Clerk), vendor-ui (126 kB, framer-motion). 14 lazy-loaded panel/overlay chunks via React.lazy in SidebarShell.tsx, HUD.tsx, App.tsx. Main chunk: 2995 kB (down from 3820 kB monolith, 21.6% reduction of initial load).
- **Track B -- NPC Dialogue UI: DONE** -- DialoguePanel.tsx (230 lines): scrollable message history, text input, NPC name/role/emotion header, "thinking..." indicator. dialogueStore.ts (70 lines, Zustand). GameLoop NPC proximity check at 4m range with "[F] Talk to" prompt. Procedural fallback responses (friendly/neutral/hostile based on trust). Panel registered as lazy-loaded 'dialogue' PanelId.
- **Track C -- Inventory/Crafting UI Polish: DONE** -- ItemTooltip.tsx (200 lines): quality-colored hover tooltips via React portal (150ms delay, viewport-clamped), category badges (TL/FD/MT/BL/OR), tool stats (damage/speed/range), food stats (hunger/thirst restore). CraftingPanel upgraded with: text search (debounced 150ms), tier-grouped collapsible sections (Primitive through Transcendent), craft success green flash (400ms) + floating "+1 [item]" text (1.2s fade-up animation).

**Build**: Passes (0 errors). Chunks: vendor-3d 968 kB, vendor-auth 226 kB, vendor-ui 126 kB, index 2995 kB, + 14 lazy panels.

---

## M21 Sprint Plan -- 3 Parallel Tracks

### Track A (P0): Procedural Ambient Audio System
**Assigned to**: `director` (self-execute)
**Duration**: Full sprint
**Goal**: Build a zero-dependency ambient audio engine using the Web Audio API. Procedurally generate all sounds (no audio files). Covers: wind, rain, thunder, footsteps, fire crackling, ocean waves, and biome ambient drones.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| A1 | Create `AmbientAudioEngine.ts` | Singleton class at `src/audio/AmbientAudioEngine.ts`. Lazy-creates an `AudioContext` on first user interaction (browser autoplay policy). Manages a bank of OscillatorNode + BiquadFilterNode + GainNode chains. Methods: `init()`, `update(playerState, weatherState, dt)`, `dispose()`. All volume transitions use `linearRampToValueAtTime` for smooth fades. Master gain controlled by settings. |
| A2 | Wind layer | Filtered white noise (BiquadFilter bandpass 200-800Hz). Gain = `weatherStore.windSpeed / 15`. Bandpass center frequency modulated by LFO (0.1Hz sine) for "gusting" effect. Active during all weather states. |
| A3 | Rain layer | Filtered white noise (highpass 3000Hz + lowpass 8000Hz, simulates rain hiss). Gain = 0.0 (CLEAR/CLOUDY), 0.3 (RAIN), 0.6 (STORM). Smooth 2-second crossfade between states. |
| A4 | Thunder | On `lightningActive` transition from false->true, play a short noise burst: white noise envelope (attack 10ms, sustain 200ms, decay 1.5s) through lowpass filter at 120Hz (rumble). Randomize pitch via playbackRate 0.8-1.2. |
| A5 | Footsteps | Triggered from PlayerController movement. Noise burst (20ms) through bandpass filter. Frequency varies by terrain: grass=800Hz, rock=2000Hz, sand=400Hz, water=600Hz. Interval: 350ms walk, 220ms run. Only when player is moving and grounded. |
| A6 | Fire crackling | When player is within 15m of a settlement fire or campfire. Random noise bursts (5-15ms, interval 50-200ms random) through bandpass 1500-4000Hz. Gain attenuates with distance (1/r falloff, max 15m). |
| A7 | Ocean waves | When player is within 30m of sea level and near coast. Low-frequency oscillator (0.15Hz sine) modulating gain of filtered noise (200-600Hz bandpass). Simulates wave surge/retreat cycle. |
| A8 | Wire into GameLoop | Call `ambientAudio.update()` each frame with current playerStore + weatherStore state. Init on first canvas click. Dispose on unmount. Add volume slider to SettingsPanel. |

**Quality gate**: (a) Wind audible and varies with wind speed, (b) rain fades in/out with weather transitions, (c) thunder plays on lightning, (d) footstep sounds vary by surface, (e) fire crackles near settlements, (f) ocean waves near shore, (g) master volume slider works, (h) no audio glitches/clicks on transitions, (i) build passes.

---

### Track B (P1): Settlement Visual Upgrades
**Assigned to**: `director` (self-execute)
**Duration**: Full sprint
**Goal**: Upgrade settlements from plain box meshes to visually distinct buildings with roofs, chimneys, smoke particles, market stalls at higher tiers, and animated NPC activity dots.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| B1 | Roof geometry | Add a ConeGeometry (pyramid roof) on top of each box building. Roof height = building.h * 0.4. Color: tier 0-1 = straw brown (#8B7355), tier 2+ = slate grey (#556677). Slight overhang (roof radius = building.w * 0.6). |
| B2 | Chimney + smoke | For civLevel >= 2: add a thin box (0.3x0.8x0.3) chimney on one corner of the largest building. Smoke: 20 instanced small spheres rising from chimney, slow upward drift (0.5m/s), slight wind push, opacity fades from 0.4 to 0 over 3 seconds, reset when they reach 8m above chimney. Use existing instanced mesh pattern. |
| B3 | Market stalls | For civLevel >= 1: add 1-2 small open-front structures (BoxGeometry table + PlaneGeometry awning) near the settlement center. Awning color varies (rust-orange, deep red, mustard) for visual variety. |
| B4 | NPC activity dots | Render `npcCount` small animated spheres (radius 0.15) moving slowly within the settlement boundary. Movement: random walk constrained to 5m radius from settlement center, speed 0.3m/s, direction changes every 2-4s. Color: warm skin tone (#d4a574). Visible only within 100m of player. |
| B5 | Street paths | For civLevel >= 2: render 2-3 thin flat planes (0.5m wide, dark brown) connecting buildings, simulating dirt paths. Simple straight lines between building positions. |

**Quality gate**: (a) Every settlement has roofed buildings, (b) smoke rises from chimneys at tier 2+, (c) market stalls visible at tier 1+, (d) NPC dots move within settlements, (e) visual detail scales with civLevel, (f) no framerate regression >5%, (g) build passes.

---

### Track C (P1): Enhanced Minimap
**Assigned to**: `director` (self-execute)
**Duration**: Full sprint
**Goal**: Upgrade the plain dark minimap to show terrain coloring (biome-based), settlement markers with names, resource node dots, player direction indicator, and zoom controls.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| C1 | Terrain color layer | Sample terrain biome at grid points across the map range. Color-code: water = #1a3a5c, grass = #2d5a1e, rock = #6b6b6b, sand = #c4a35a, snow = #dde8f0. Draw as filled rectangles on the canvas (8x8 pixel grid cells). Uses elevation + biome data from SpherePlanet.terrainHeightAt. |
| C2 | Settlement markers | Draw diamond shapes at settlement positions. Color by civLevel: 0=#8B7355, 1=#b8860b, 2=#708090, 3+=#4682b4. Draw settlement name in 8px text below the diamond. |
| C3 | Resource node markers | Draw small dots (2px) at resource node positions. Color by type: tree=#2d8a4e, rock=#888, berry=#c44569, iron=#b87333, coal=#333. Only show nodes within fog-of-war reveal radius. |
| C4 | Player direction arrow | Replace the plain circle with a small triangle/arrow pointing in the player's look direction. Read camera rotation from playerStore or pass as prop. Arrow = equilateral triangle, green, 10px. |
| C5 | Zoom controls | Add +/- buttons below the map that adjust WORLD_RANGE between 100m and 600m (step 100m). Store zoom level in component state. Default: 300m. |
| C6 | Weather indicator | Draw a small weather icon (text-based) in the top-right corner of the minimap: sun for CLEAR, cloud for CLOUDY, rain drops for RAIN, lightning bolt for STORM. Plus temperature reading. |

**Quality gate**: (a) Terrain colors visible on minimap matching biome, (b) settlements show as labeled diamonds, (c) resource nodes visible within fog radius, (d) player arrow shows facing direction, (e) zoom in/out works, (f) weather indicator updates, (g) build passes, (h) no performance regression (canvas redraws only when player moves >2m or state changes).

---

## Architecture Decisions (M21)

| Decision | Rationale |
|----------|-----------|
| Web Audio API oscillators + noise, no audio files | Zero-dependency, no asset loading, infinite variation, tiny bundle impact |
| Singleton audio engine, not React component | Audio context must persist across re-renders; singleton pattern matches GameSingletons |
| Settlement smoke as instanced spheres, not GPU particles | Consistent with WeatherRenderer pattern; low particle count (20 per settlement) |
| Minimap terrain sampling on a grid, not full resolution | Performance: 50x50 grid = 2500 samples vs millions of terrain points |
| Minimap redraws throttled to 2m player movement | Prevents canvas overdraw from consuming CPU on every frame |

---

## Risk Register (M21)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Web Audio autoplay policy blocks sound | High | Medium | Lazy-init AudioContext on first user click/keypress; show "Click to enable audio" hint |
| Audio clicks/pops on parameter changes | Medium | Medium | Use linearRampToValueAtTime with 50ms ramps instead of direct value assignment |
| Settlement smoke particles reduce FPS | Low | Medium | Only 20 particles per settlement, only render within 100m of player |
| Minimap terrain sampling is slow | Low | Medium | Cache terrain colors; only resample when zoom changes or player moves >10m |
| NPC activity dots z-fight with terrain | Medium | Low | Offset dots 0.3m above settlement y position |

---

## Priority Queue (After M21)

| Priority | Item | Status |
|----------|------|--------|
| P1 | Tree LOD (instanced low-poly at distance) | Queued for M22 |
| P1 | LLM integration for dialogue (connect DialoguePanel to real LLMBridge) | Queued for M22 |
| P2 | Species divergence notifications in journal | Queued |
| P2 | Subsurface scattering for creature skin | Queued |
| P2 | Volumetric fog (ray-marched, density from weather system) | Queued |
| P2 | Shadow cascade tuning (3 cascades, bias correction) | Queued |
| P2 | Drag-drop inventory reordering | Queued |
| P2 | Player skill progression / tech tree UI | Queued |
| P2 | Save/load improvements (manual save slots) | Queued |

---

## M21 Completion Summary (2026-03-26)

**All 3 Tracks SHIPPED:**

- **Track A -- Procedural Ambient Audio: DONE** -- AmbientAudioEngine.ts (320 lines): Web Audio API procedural sound with zero audio files. 6 layers: wind (bandpass noise, LFO gusting, gain=windSpeed/15), rain (highpass noise, 2s crossfade, snow damping), thunder (noise burst + lowpass rumble on lightning), footsteps (terrain-dependent bandpass: grass 800Hz, rock 2200Hz, sand 400Hz), fire crackling (random bursts 1.5-4kHz, 1/r falloff), ocean waves (0.15Hz LFO surge, distance-attenuated). AudioHook.tsx bridges stores to engine. Volume slider in SettingsPanel.
- **Track B -- Settlement Visual Upgrades: DONE** -- SettlementRenderer.tsx (350 lines): pyramid roofs (ConeGeometry, straw brown tier 0-1, slate grey tier 2+), chimneys + smoke particles (20 instanced spheres rising with wind drift, civLevel>=2), market stalls (table+awning+poles, 1-2 per settlement at tier 1+), NPC activity dots (up to 12 animated spheres with random-walk AI, LOD at 100m), dirt street paths connecting buildings (civLevel>=2). Zero per-frame allocations (pre-allocated scratch vectors).
- **Track C -- Enhanced Minimap: DONE** -- MapPanel.tsx (290 lines): terrain color grid (44x44 biomeColor samples, cached, resample throttled to 10m movement), settlement diamond markers (civLevel-colored + name labels), resource node dots (type-colored, fog-of-war gated), player direction arrow (green triangle), zoom controls (+/- buttons, 100m-600m range), weather indicator (state icon + temperature + wind arrow), expanded legend.

**Build**: Passes (0 errors). Main chunk: 3022 kB (from 2995 kB, +27 kB for all 3 features). MapPanel lazy chunk: 5.5 kB (up from 2.3 kB).

---

## M22 Sprint Plan -- 3 Parallel Tracks

### Track A (P0): Offline Save/Load (localStorage + IndexedDB)
**Assigned to**: `director` (self-execute)
**Duration**: Full sprint
**Goal**: Allow players to save and load game state without authentication. Currently save/load requires Clerk auth + Neon DB. Most players never sign in, so they lose all progress on refresh. Add a localStorage/IndexedDB offline save that auto-saves every 60s and loads on boot.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| A1 | Create `OfflineSaveManager.ts` | Singleton at `src/game/OfflineSaveManager.ts`. Uses localStorage for small state (vitals, position, civTier, simSeconds, settings) and IndexedDB for large state (inventory slots, buildings, journal entries, known recipes). Two methods: `saveOffline()` and `loadOffline()`. Both return promises. Key prefix: `universe_save_`. |
| A2 | Auto-save timer | In GameLoop.ts, call `offlineSaveManager.saveOffline()` every 60 seconds (same cadence as cloud save). Use a simple timer ref. Only save when player is alive and not in transit. |
| A3 | Load-on-boot logic | In `App.tsx` or the world bootstrap flow: if user is NOT authenticated (no Clerk session), attempt `loadOffline()` before spawning. If save exists, restore all state. If no save, start fresh. Show a brief "Save loaded" notification via NotificationSystem. |
| A4 | Manual save/load in SettingsPanel | Add "Save Game" and "Load Game" buttons to SettingsPanel.tsx. Save button triggers immediate `saveOffline()` with confirmation toast. Load button triggers `loadOffline()` with a confirm dialog ("This will overwrite current progress"). |
| A5 | Save slot display | Show last-save timestamp and basic stats (civTier, play time) in SettingsPanel below the save/load buttons. Read from localStorage metadata key `universe_save_meta`. |
| A6 | Cloud save preference | When user IS authenticated, still auto-save to localStorage as backup. Cloud save remains primary. On load, prefer cloud save if newer than local save (compare timestamps). |

**Quality gate**: (a) Refresh browser without auth -> game state persists, (b) auto-save fires every 60s, (c) manual save/load buttons work, (d) save metadata displayed, (e) cloud save takes priority when auth'd and newer, (f) build passes, (g) IndexedDB handles inventory/buildings correctly.

---

### Track B (P0): Player Skill Tree + Progression System
**Assigned to**: `director` (self-execute)
**Duration**: Full sprint
**Goal**: Add a visible skill progression system. Players earn XP from gathering, crafting, combat, and exploration. Skills unlock passive bonuses (faster gathering, more HP, better craft quality, etc.). Displayed in a new SkillTreePanel.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| B1 | Create `SkillSystem.ts` | New file at `src/game/SkillSystem.ts`. Defines 6 skill categories: `gathering` (harvest speed, yield bonus), `crafting` (quality bonus, recipe unlock), `combat` (damage bonus, HP bonus), `survival` (hunger/thirst drain reduction), `exploration` (movement speed, fog reveal radius), `smithing` (merge existing smithingXp, quality curve). Each skill: level 0-10, XP thresholds = [0, 100, 250, 500, 1000, 2000, 4000, 7000, 11000, 16000, 22000]. Singleton class with `addXp(skill, amount)`, `getLevel(skill)`, `getBonus(skill)`, `serialize()`, `deserialize()`. |
| B2 | XP award hooks | In GameLoop.ts: award gathering XP on resource harvest (+10-30 per node, scaled by node tier). Award crafting XP on successful craft (+15-50 per recipe tier). Award combat XP on creature kill (+20-60). Award exploration XP on new discovery (+50). Award survival XP passively every 60s alive (+5). |
| B3 | Passive bonus application | Wire skill bonuses into existing systems: `gathering` level reduces harvest time by 5% per level. `crafting` adds +0.02 quality per level. `combat` adds +5% damage per level. `survival` reduces hunger/thirst drain by 3% per level. `exploration` increases fog reveal radius by 5% per level. `smithing` replaces raw smithingXp curve with skill level curve. |
| B4 | Create `SkillTreePanel.tsx` | New panel at `src/ui/panels/SkillTreePanel.tsx`. Shows 6 skill cards in a 2x3 grid. Each card: skill name, current level, XP bar (progress to next level), current bonus description, icon (text-based: pickaxe for gathering, hammer for crafting, sword for combat, heart for survival, compass for exploration, anvil for smithing). Styled matching existing dark-translucent UI. |
| B5 | Register panel | Add `'skills'` as PanelId in uiStore. Register in SidebarShell with 'K' hotkey. Add icon to sidebar strip. Lazy-load the panel. |
| B6 | Persist skills | Add skill data to both cloud save (saveStore.ts) and offline save (OfflineSaveManager). Serialize as `{gathering: {xp, level}, crafting: {xp, level}, ...}`. |

**Quality gate**: (a) XP awards visible in skill panel after gathering/crafting/combat, (b) level-up triggers notification, (c) passive bonuses measurably affect gameplay (e.g., harvest time visibly shorter at level 5+), (d) K key opens skill panel, (e) skills persist across save/load, (f) build passes.

---

### Track C (P1): Day/Night Visual Polish + Sun Arc
**Assigned to**: `director` (self-execute)
**Duration**: Full sprint
**Goal**: Enhance the day/night cycle with a visible sun disc, improved twilight color grading, moonlight shadows, and a time-of-day HUD indicator. Make sunrise/sunset a cinematic moment.

| Task | Description | Technical Spec |
|------|-------------|---------------|
| C1 | Sun disc mesh | Add a bright emissive sphere (radius 40, color temperature 5778K = #fff5e0) at the sun position in DayNightCycle.tsx. Billboard-face the camera. Intensity modulated by sin(angle): full brightness at noon, fade to 0 at horizon. Add a subtle glow halo using a second transparent sphere (radius 120, additive blend, opacity 0.15). |
| C2 | Improved twilight color grading | In PostProcessing.tsx, add a time-of-day color grade pass: during golden hour (sun angle 0-15 degrees above horizon), shift color balance warm (lift shadows +0.02 orange, gamma mids +0.01 gold). During blue hour (sun 0-10 degrees below horizon), shift cool (gain highlights -0.02 blue). Read sun angle from DayNightCycle via a shared ref or store value. |
| C3 | Moonlight enhancement | When sun is below horizon, set a secondary directional light (dim, blue-white #b0c4de, intensity 0.15) positioned opposite the sun. This simulates moonlight. Cast soft shadows (shadow map 1024, bias -0.002). Intensity modulated by moon phase (already computed in NightSkyRenderer). |
| C4 | Time-of-day HUD widget | Small widget in HUD.tsx top-center: shows a circular clock icon with sun/moon position indicator (small arc). Text displays: "Dawn", "Morning", "Noon", "Afternoon", "Dusk", "Night" based on sun angle. Also shows "Day X" counter (simSeconds / DAY_DURATION_S). Compact: 80x30px. |
| C5 | Horizon fog color | Modulate FogExp2 color by time of day. Dawn/dusk: warm peach (#ffd4a3). Night: deep blue (#0a1428). Noon: light grey-blue (#c8d8e8). Smooth lerp between states keyed to sun angle. Currently fog density changes but color stays constant. |
| C6 | Star twinkle animation | In NightSkyRenderer, add per-star brightness oscillation: each star's point size multiplied by `0.85 + 0.15 * sin(time * star.twinkleFreq + star.twinklePhase)`. twinkleFreq = 1.5-4.0 Hz (randomized per star). Adds life to the night sky without performance cost (just a uniform update). |

**Quality gate**: (a) Sun disc visible in sky, scales correctly with distance, (b) golden hour warm tint visible on terrain, (c) moonlight casts soft shadows at night, (d) time-of-day widget shows correct period, (e) fog color matches time of day, (f) stars twinkle at night, (g) build passes, (h) no framerate regression >5%.

---

## Architecture Decisions (M22)

| Decision | Rationale |
|----------|-----------|
| localStorage for small state, IndexedDB for large | localStorage has 5MB limit, inventory+buildings can exceed that; IndexedDB handles structured data well |
| 6 skill categories, max level 10 | Matches the 6 core gameplay loops; level 10 is achievable in ~4 hours of focused play |
| XP thresholds exponential curve | Early levels fast (engagement), later levels slow (long-term goals) |
| Sun disc as emissive sphere, not post-process lens flare | Consistent with R3F scene graph; no post-processing dependency; works with existing atmosphere shader |
| Moonlight as secondary directional light | Simple, effective, minimal perf cost; shadow map 1024 is half sun resolution |
| Time-of-day fog color | Cheap per-frame operation that dramatically improves atmosphere |

---

## Risk Register (M22)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| IndexedDB blocked in private browsing mode | Medium | Medium | Fallback to localStorage-only (truncate buildings array if >4MB) |
| Skill bonuses feel imperceptible at low levels | Medium | Medium | Show bonus % in tooltip; first level grants a noticeable 10% bonus |
| Sun disc z-fights with Sky dome | Medium | Low | Render sun disc at depth 0.999 (near far plane); disable depth test on glow halo |
| Moonlight shadows double shadow draw calls | Low | Medium | Moonlight shadow map only 1024 (vs 2048 for sun); disable when FPS < 30 |
| Save data corruption on browser crash during write | Low | High | Write to temp key first, then rename (atomic swap pattern) |
| Fog color transitions cause visible banding | Low | Low | Use smoothstep interpolation with 3-point color ramp |

---

## Agent Dispatch Plan (M22)

| Agent | Track | First Task | Report To |
|-------|-------|-----------|-----------|
| `director` | Track A | A1: Create OfflineSaveManager.ts | self |
| `director` | Track B | B1: Create SkillSystem.ts | self |
| `director` | Track C | C1: Add sun disc mesh to DayNightCycle | self |

---

## M22 Completion Summary (2026-03-26)

**All 3 Tracks SHIPPED:**

- **Track A -- Offline Save/Load: DONE** -- OfflineSaveManager.ts (230 lines): localStorage for small state (vitals, position, civTier, simSeconds, discoveries, wounds, skills) + IndexedDB for large state (inventory, buildings, journal, known recipes, bedroll). Auto-save every 60s from GameLoop. Manual Save/Load buttons in SettingsPanel with save metadata display (timestamp, civTier, play time). Atomic swap pattern for crash safety. IndexedDB fallback to localStorage for private browsing.
- **Track B -- Player Skill Tree + Progression: DONE** -- SkillSystem.ts (200 lines): 6 skills (gathering, crafting, combat, survival, exploration, smithing), max level 10, exponential XP curve (100 to 22,000). Passive bonuses: harvest time -5%/lvl, craft quality +2%/lvl, combat damage +5%/lvl, survival drain -3%/lvl, exploration range +5%/lvl, smithing quality +2.5%/lvl. XP hooks in GameLoop (gather +15-25, craft +15-50, combat +40-60, exploration +50, survival +5/60s, dig +10). SkillTreePanel.tsx (140 lines): 2x3 grid, XP bars, level-up notifications, K hotkey. Skills persist in both cloud and offline saves.
- **Track C -- Day/Night Visual Polish: DONE** -- Sun disc mesh (emissive circle + additive glow halo, billboard-facing, horizon fade). Moonlight (secondary directional light, blue-white #b0c4de, intensity 0.18 max, 1024 shadow map). Fog color modulation (noon grey-blue, golden hour warm peach, night deep blue, smoothstep lerp). Star twinkle (per-star hash-based frequency 1.5-4Hz via uTime shader uniform). Time-of-day HUD widget (Dawn/Morning/Noon/Afternoon/Dusk/Night + Day counter). dayAngle/dayCount broadcast to gameStore at 2Hz.

**Build**: Passes (0 errors). Main chunk: 3041 kB (from 3022 kB, +19 kB for all 3 features). SkillTreePanel lazy chunk: 3.15 kB. SettingsPanel chunk: 29.57 kB (includes OfflineSaveManager).

---

## Priority Queue (After M22)

| Priority | Item | Status |
|----------|------|--------|
| P1 | Tree LOD (instanced low-poly at distance) | Queued for M23 |
| P1 | LLM integration for dialogue (connect DialoguePanel to real LLMBridge) | Queued for M23 |
| P1 | Mobile/touch controls | Queued for M23 |
| P2 | Species divergence notifications in journal | Queued |
| P2 | Subsurface scattering for creature skin | Queued |
| P2 | Volumetric fog (ray-marched, density from weather system) | Queued |
| P2 | Shadow cascade tuning (3 cascades, bias correction) | Queued |
| P2 | Drag-drop inventory reordering | Queued |
| P2 | Combat system improvements (blocking, dodge) | Queued |
| P2 | Multiplayer improvements (player names, positions visible) | Queued |
