# Director Plan -- Universe Sim

**Date**: 2026-03-26
**Sprint**: M19
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

## Immediate Next Actions

1. M19 shipped -- all quality gates met
2. Next sprint: M20 -- Code splitting, Tree LOD, performance pass
